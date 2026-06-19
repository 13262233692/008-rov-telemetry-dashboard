#include "SerialPort.h"
#include <algorithm>
#include <iostream>

SerialPort::SerialPort()
    : running_(false)
#ifdef _WIN32
    , hSerial_(INVALID_HANDLE_VALUE)
#else
    , fd_(-1)
#endif
{
}

SerialPort::~SerialPort() {
    stopReading();
    close();
}

#ifdef _WIN32
bool SerialPort::open(const std::string& port, int baudRate) {
    hSerial_ = CreateFileA(port.c_str(), GENERIC_READ, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hSerial_ == INVALID_HANDLE_VALUE) {
        return false;
    }

    DCB dcbSerialParams = {0};
    dcbSerialParams.DCBlength = sizeof(dcbSerialParams);
    if (!GetCommState(hSerial_, &dcbSerialParams)) {
        CloseHandle(hSerial_);
        hSerial_ = INVALID_HANDLE_VALUE;
        return false;
    }

    dcbSerialParams.BaudRate = baudRate;
    dcbSerialParams.ByteSize = 8;
    dcbSerialParams.StopBits = ONESTOPBIT;
    dcbSerialParams.Parity = NOPARITY;
    dcbSerialParams.fOutxCtsFlow = FALSE;
    dcbSerialParams.fOutxDsrFlow = FALSE;
    dcbSerialParams.fDtrControl = DTR_CONTROL_ENABLE;
    dcbSerialParams.fRtsControl = RTS_CONTROL_ENABLE;
    dcbSerialParams.fBinary = TRUE;
    dcbSerialParams.fParity = FALSE;

    if (!SetCommState(hSerial_, &dcbSerialParams)) {
        CloseHandle(hSerial_);
        hSerial_ = INVALID_HANDLE_VALUE;
        return false;
    }

    COMMTIMEOUTS timeouts = {0};
    timeouts.ReadIntervalTimeout = 50;
    timeouts.ReadTotalTimeoutConstant = 50;
    timeouts.ReadTotalTimeoutMultiplier = 10;
    SetCommTimeouts(hSerial_, &timeouts);

    return true;
}

void SerialPort::close() {
    if (hSerial_ != INVALID_HANDLE_VALUE) {
        CloseHandle(hSerial_);
        hSerial_ = INVALID_HANDLE_VALUE;
    }
}

bool SerialPort::isOpen() const {
    return hSerial_ != INVALID_HANDLE_VALUE;
}

void SerialPort::readLoop() {
    char buffer[4096];
    DWORD bytesRead = 0;

    while (running_) {
        if (!ReadFile(hSerial_, buffer, sizeof(buffer) - 1, &bytesRead, NULL) || bytesRead == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }
        buffer[bytesRead] = '\0';

        {
            std::lock_guard<std::mutex> lock(bufferMutex_);
            readBuffer_ += std::string(buffer, bytesRead);
        }

        size_t pos;
        while (true) {
            std::lock_guard<std::mutex> lock(bufferMutex_);
            pos = readBuffer_.find('\n');
            if (pos == std::string::npos) break;
            std::string line = readBuffer_.substr(0, pos);
            readBuffer_ = readBuffer_.substr(pos + 1);
            line.erase(std::remove(line.begin(), line.end(), '\r'), line.end());
            if (!line.empty() && dataCallback_) {
                dataCallback_(line);
            }
        }
    }
}

#else

bool SerialPort::open(const std::string& port, int baudRate) {
    fd_ = ::open(port.c_str(), O_RDWR | O_NOCTTY | O_NDELAY);
    if (fd_ == -1) return false;

    struct termios options;
    tcgetattr(fd_, &options);

    speed_t speed;
    switch (baudRate) {
        case 9600: speed = B9600; break;
        case 19200: speed = B19200; break;
        case 38400: speed = B38400; break;
        case 57600: speed = B57600; break;
        case 115200: speed = B115200; break;
        default: speed = B9600;
    }
    cfsetispeed(&options, speed);
    cfsetospeed(&options, speed);

    options.c_cflag |= (CLOCAL | CREAD);
    options.c_cflag &= ~PARENB;
    options.c_cflag &= ~CSTOPB;
    options.c_cflag &= ~CSIZE;
    options.c_cflag |= CS8;
    options.c_cflag &= ~CRTSCTS;

    options.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
    options.c_iflag &= ~(IXON | IXOFF | IXANY);
    options.c_oflag &= ~OPOST;

    tcsetattr(fd_, TCSANOW, &options);
    fcntl(fd_, F_SETFL, 0);
    return true;
}

void SerialPort::close() {
    if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
    }
}

bool SerialPort::isOpen() const {
    return fd_ != -1;
}

void SerialPort::readLoop() {
    char buffer[4096];
    fd_set set;
    struct timeval timeout;

    while (running_) {
        FD_ZERO(&set);
        FD_SET(fd_, &set);
        timeout.tv_sec = 0;
        timeout.tv_usec = 100000;

        int ret = select(fd_ + 1, &set, NULL, NULL, &timeout);
        if (ret <= 0) continue;

        int bytesRead = ::read(fd_, buffer, sizeof(buffer) - 1);
        if (bytesRead <= 0) continue;
        buffer[bytesRead] = '\0';

        {
            std::lock_guard<std::mutex> lock(bufferMutex_);
            readBuffer_ += std::string(buffer, bytesRead);
        }

        size_t pos;
        while (true) {
            std::lock_guard<std::mutex> lock(bufferMutex_);
            pos = readBuffer_.find('\n');
            if (pos == std::string::npos) break;
            std::string line = readBuffer_.substr(0, pos);
            readBuffer_ = readBuffer_.substr(pos + 1);
            line.erase(std::remove(line.begin(), line.end(), '\r'), line.end());
            if (!line.empty() && dataCallback_) {
                dataCallback_(line);
            }
        }
    }
}
#endif

void SerialPort::setDataCallback(DataCallback callback) {
    dataCallback_ = callback;
}

void SerialPort::startReading() {
    if (!isOpen() || running_) return;
    running_ = true;
    readThread_ = std::thread(&SerialPort::readLoop, this);
}

void SerialPort::stopReading() {
    running_ = false;
    if (readThread_.joinable()) {
        readThread_.join();
    }
}
