#include "WebSocketServer.h"
#include <iostream>
#include <sstream>
#include <string>
#include <chrono>
#include <thread>
#include <atomic>
#include <iomanip>
#include <mutex>
#include <random>
#include <cmath>

#include "SerialPort.h"
#include "NMEAParser.h"
#include "KalmanFilter.h"

std::mutex dataMutex;
TelemetryData currentData{};
KalmanFilter headingFilter(0.001, 0.5, 1.0, 0.0);
KalmanFilter depthFilter(0.001, 0.3, 1.0, 0.0);
KalmanFilter rollFilter(0.001, 0.4, 1.0, 0.0);
KalmanFilter pitchFilter(0.001, 0.4, 1.0, 0.0);
KalmanFilter speedNFilter(0.001, 0.2, 1.0, 0.0);
KalmanFilter speedEFilter(0.001, 0.2, 1.0, 0.0);

std::string telemetryToJson(const TelemetryData& d) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    oss << "{";
    oss << "\"heading\":" << d.heading << ",";
    oss << "\"roll\":" << d.roll << ",";
    oss << "\"pitch\":" << d.pitch << ",";
    oss << "\"depth\":" << d.depth << ",";
    oss << "\"depthFeet\":" << d.depthFeet << ",";
    oss << "\"speedNorth\":" << d.speedNorth << ",";
    oss << "\"speedEast\":" << d.speedEast << ",";
    oss << "\"speedDown\":" << d.speedDown << ",";
    oss << "\"speedGroundNorth\":" << d.speedGroundNorth << ",";
    oss << "\"speedGroundEast\":" << d.speedGroundEast << ",";
    oss << "\"speedGroundDown\":" << d.speedGroundDown << ",";
    oss << "\"waterTemp\":" << d.waterTemp << ",";
    oss << "\"timestamp\":\"" << d.timestamp << "\"";
    oss << "}";
    return oss.str();
}

void updateTelemetry(const TelemetryData& newData, WebSocketServer& ws) {
    std::lock_guard<std::mutex> lock(dataMutex);
    if (newData.heading > 0 || currentData.heading == 0) {
        currentData.heading = headingFilter.update(newData.heading);
    }
    if (newData.depth > 0 || currentData.depth == 0) {
        currentData.depth = depthFilter.update(newData.depth);
        if (newData.depth > 0) {
            currentData.depthFeet = newData.depth * 3.28084;
        }
    }
    if (newData.depthFeet > 0 && currentData.depthFeet == 0) {
        currentData.depthFeet = newData.depthFeet;
    }
    if (std::abs(newData.roll) > 0.001 || currentData.roll != 0) {
        currentData.roll = rollFilter.update(newData.roll);
    }
    if (std::abs(newData.pitch) > 0.001 || currentData.pitch != 0) {
        currentData.pitch = pitchFilter.update(newData.pitch);
    }
    if (std::abs(newData.speedNorth) > 0.001 || currentData.speedNorth != 0) {
        currentData.speedNorth = speedNFilter.update(newData.speedNorth);
    }
    if (std::abs(newData.speedEast) > 0.001 || currentData.speedEast != 0) {
        currentData.speedEast = speedEFilter.update(newData.speedEast);
    }
    currentData.speedDown = newData.speedDown;
    currentData.speedGroundNorth = newData.speedGroundNorth;
    currentData.speedGroundEast = newData.speedGroundEast;
    currentData.speedGroundDown = newData.speedGroundDown;
    if (newData.waterTemp > 0) currentData.waterTemp = newData.waterTemp;
    if (!newData.timestamp.empty()) currentData.timestamp = newData.timestamp;
    ws.broadcast(telemetryToJson(currentData));
}

void runSimulator(WebSocketServer& ws, std::atomic<bool>& running) {
    std::cout << "[Simulator] Running in simulation mode..." << std::endl;
    std::mt19937 rng(static_cast<unsigned>(std::time(nullptr)));
    std::normal_distribution<double> headingNoise(0, 1.5);
    std::normal_distribution<double> depthNoise(0, 0.08);
    std::normal_distribution<double> speedNoise(0, 0.02);
    std::normal_distribution<double> rollNoise(0, 0.8);
    std::normal_distribution<double> pitchNoise(0, 0.8);

    double simHeading = 45.0;
    double simDepth = 10.0;
    double simSpeed = 0.5;
    double simRoll = 0.0;
    double simPitch = 0.0;
    int tick = 0;

    while (running) {
        tick++;
        simHeading += 0.05 + headingNoise(rng) * 0.02;
        if (simHeading >= 360) simHeading -= 360;
        if (simHeading < 0) simHeading += 360;

        simDepth += 0.01 + depthNoise(rng) * 0.02;
        if (simDepth > 80) simDepth = 10.0;

        simSpeed = 0.8 + 0.4 * std::sin(tick * 0.02) + speedNoise(rng);
        simRoll = 5.0 * std::sin(tick * 0.03) + rollNoise(rng);
        simPitch = 3.0 * std::cos(tick * 0.025) + pitchNoise(rng);

        double hdgRad = simHeading * 3.14159265358979323846 / 180.0;

        TelemetryData d{};
        d.heading = simHeading + headingNoise(rng);
        d.depth = simDepth + depthNoise(rng);
        d.depthFeet = d.depth * 3.28084;
        d.roll = simRoll;
        d.pitch = simPitch;
        d.speedNorth = simSpeed * std::cos(hdgRad);
        d.speedEast = simSpeed * std::sin(hdgRad);
        d.speedGroundNorth = d.speedNorth;
        d.speedGroundEast = d.speedEast;
        d.speedDown = 0.05 * std::sin(tick * 0.015);
        d.waterTemp = 14.5 + 0.2 * std::sin(tick * 0.005);
        d.timestamp = NMEAParser::getCurrentTimestamp();

        updateTelemetry(d, ws);
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void runSerialMode(WebSocketServer& ws, const std::string& port, int baud) {
    SerialPort serial;
    if (!serial.open(port, baud)) {
        std::cerr << "[Error] Failed to open serial port: " << port << std::endl;
        return;
    }
    std::cout << "[Serial] Connected to " << port << " @ " << baud << " baud" << std::endl;

    serial.setDataCallback([&ws](const std::string& line) {
        auto parsed = NMEAParser::parseSentence(line);
        if (parsed) {
            updateTelemetry(*parsed, ws);
        }
    });

    serial.startReading();
    std::cout << "[Serial] Reading... (Ctrl+C to exit)" << std::endl;
    while (true) std::this_thread::sleep_for(std::chrono::seconds(1));
}

void printUsage(const char* prog) {
    std::cout << "ROV Telemetry Gateway v1.0\n"
              << "Usage:\n"
              << "  " << prog << " --simulate                 : Run with simulated data\n"
              << "  " << prog << " --serial <port> [baud]     : Use real serial port\n"
              << "Examples:\n"
              << "  " << prog << " --simulate\n"
              << "  " << prog << " --serial COM3 115200\n"
              << "  " << prog << " --serial /dev/ttyUSB0 9600\n";
}

int main(int argc, char* argv[]) {
    std::cout << "============================================\n"
              << "   ROV Telemetry Gateway (C++ Backend)\n"
              << "============================================\n\n";

    WebSocketServer ws(8080);
    if (!ws.start()) {
        std::cerr << "[Error] Failed to start WebSocket server on port 8080" << std::endl;
        return 1;
    }

    if (argc < 2) {
        printUsage(argv[0]);
        std::atomic<bool> simRunning(true);
        runSimulator(ws, simRunning);
        return 0;
    }

    std::string mode = argv[1];
    if (mode == "--simulate" || mode == "-s") {
        std::atomic<bool> simRunning(true);
        runSimulator(ws, simRunning);
    } else if (mode == "--serial" || mode == "-p") {
        if (argc < 3) {
            std::cerr << "[Error] Missing serial port name\n";
            printUsage(argv[0]);
            return 1;
        }
        std::string port = argv[2];
        int baud = (argc >= 4) ? std::stoi(argv[3]) : 9600;
        runSerialMode(ws, port, baud);
    } else {
        printUsage(argv[0]);
        return 1;
    }

    ws.stop();
    return 0;
}
