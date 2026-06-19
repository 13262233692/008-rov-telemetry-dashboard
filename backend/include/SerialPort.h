#pragma once

#include <string>
#include <vector>
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>

#ifdef _WIN32
#include <windows.h>
#else
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/select.h>
#endif

class SerialPort {
public:
    using DataCallback = std::function<void(const std::string&)>;

    SerialPort();
    ~SerialPort();

    bool open(const std::string& port, int baudRate = 9600);
    void close();
    bool isOpen() const;
    void setDataCallback(DataCallback callback);
    void startReading();
    void stopReading();

private:
    void readLoop();
    std::string readBuffer_;
    std::mutex bufferMutex_;
    DataCallback dataCallback_;
    std::atomic<bool> running_;
    std::thread readThread_;

#ifdef _WIN32
    HANDLE hSerial_;
#else
    int fd_;
#endif
};
