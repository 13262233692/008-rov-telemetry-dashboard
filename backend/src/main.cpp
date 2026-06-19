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
#include <vector>

#include "SerialPort.h"
#include "NMEAParser.h"
#include "KalmanFilter.h"
#include "PointCloudProcessor.h"

static const int GRID_SIZE = 64;
static const float GRID_SPACING = 1.5f;

struct DepthGrid {
    std::vector<std::vector<float>> depths;
    std::vector<std::vector<bool>> valid;
    int size;
    float spacing;
    DepthGrid() : size(GRID_SIZE), spacing(GRID_SPACING) {
        depths.resize(size, std::vector<float>(size, 0.0f));
        valid.resize(size, std::vector<bool>(size, false));
    }
};

std::mutex dataMutex;
TelemetryData currentData{};
DepthGrid depthGrid;

KalmanFilter headingFilter(0.001, 0.5, 1.0, 0.0);
KalmanFilter depthFilter(0.001, 0.3, 1.0, 0.0);
KalmanFilter rollFilter(0.001, 0.4, 1.0, 0.0);
KalmanFilter pitchFilter(0.001, 0.4, 1.0, 0.0);
KalmanFilter speedNFilter(0.001, 0.2, 1.0, 0.0);
KalmanFilter speedEFilter(0.001, 0.2, 1.0, 0.0);

static double safeDouble(double v) {
    if (!std::isfinite(v)) return 0.0;
    return v;
}

std::string telemetryToJson(const TelemetryData& d) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    oss << "{";
    oss << "\"heading\":" << safeDouble(d.heading) << ",";
    oss << "\"roll\":" << safeDouble(d.roll) << ",";
    oss << "\"pitch\":" << safeDouble(d.pitch) << ",";
    oss << "\"depth\":" << safeDouble(d.depth) << ",";
    oss << "\"depthFeet\":" << safeDouble(d.depthFeet) << ",";
    oss << "\"speedNorth\":" << safeDouble(d.speedNorth) << ",";
    oss << "\"speedEast\":" << safeDouble(d.speedEast) << ",";
    oss << "\"speedDown\":" << safeDouble(d.speedDown) << ",";
    oss << "\"speedGroundNorth\":" << safeDouble(d.speedGroundNorth) << ",";
    oss << "\"speedGroundEast\":" << safeDouble(d.speedGroundEast) << ",";
    oss << "\"speedGroundDown\":" << safeDouble(d.speedGroundDown) << ",";
    oss << "\"waterTemp\":" << safeDouble(d.waterTemp) << ",";
    oss << "\"timestamp\":\"" << d.timestamp << "\"";
    oss << "}";
    std::string json = oss.str();
    size_t braceDepth = 0;
    for (char c : json) {
        if (c == '{') braceDepth++;
        else if (c == '}') braceDepth--;
    }
    if (braceDepth != 0) {
        json += "}";
    }
    return json;
}

std::string pointCloudToJson(const PointCloudBatch& batch) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    oss << "{\"type\":\"pointcloud\",\"beamCount\":" << batch.beamCount
        << ",\"timestamp\":\"" << batch.timestamp << "\",\"points\":[";
    for (size_t i = 0; i < batch.points.size(); ++i) {
        if (i > 0) oss << ",";
        const auto& p = batch.points[i];
        oss << "[" << safeDouble(p.x) << "," << safeDouble(p.y)
            << "," << safeDouble(p.z) << "," << safeDouble(p.intensity) << "]";
    }
    oss << "]}";
    return oss.str();
}

std::string gridToJson(const DepthGrid& grid) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    oss << "{\"type\":\"grid\",\"size\":" << grid.size
        << ",\"spacing\":" << grid.spacing << ",\"heights\":[";
    for (int i = 0; i < grid.size; ++i) {
        if (i > 0) oss << ",";
        oss << "[";
        for (int j = 0; j < grid.size; ++j) {
            if (j > 0) oss << ",";
            if (grid.valid[i][j]) {
                oss << safeDouble(grid.depths[i][j]);
            } else {
                oss << "null";
            }
        }
        oss << "]";
    }
    oss << "]}";
    return oss.str();
}

void updateDepthGrid(const std::vector<Point3D>& points, DepthGrid& grid) {
    int half = grid.size / 2;
    for (const auto& p : points) {
        int gi = half + static_cast<int>(std::round(p.y / grid.spacing));
        int gj = half + static_cast<int>(std::round(p.x / grid.spacing));
        if (gi >= 0 && gi < grid.size && gj >= 0 && gj < grid.size) {
            float z = -p.z;
            if (!grid.valid[gi][gj] || std::abs(z - grid.depths[gi][gj]) > 0.1f) {
                grid.depths[gi][gj] = z;
            } else {
                grid.depths[gi][gj] = grid.depths[gi][gj] * 0.8f + z * 0.2f;
            }
            grid.valid[gi][gj] = true;
        }
    }
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
    double posX = 0.0;
    double posY = 0.0;
    int tick = 0;

    {
        std::lock_guard<std::mutex> lock(dataMutex);
        for (int i = 0; i < GRID_SIZE; ++i) {
            for (int j = 0; j < GRID_SIZE; ++j) {
                double wx = (j - GRID_SIZE / 2) * GRID_SPACING;
                double wy = (i - GRID_SIZE / 2) * GRID_SPACING;
                depthGrid.depths[i][j] = PointCloudProcessor::seafloorHeight(wx, wy, 25.0);
                depthGrid.valid[i][j] = true;
            }
        }
    }

    int pcTick = 0;
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
        posX += simSpeed * 0.1 * std::cos(hdgRad);
        posY += simSpeed * 0.1 * std::sin(hdgRad);

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

        if (tick % 2 == 0) {
            pcTick++;
            int beamCount = 128;
            double swathWidth = 40.0;
            auto points = PointCloudProcessor::generateSeafloorPoints(
                posX, posY, simDepth, beamCount, swathWidth, hdgRad, rng
            );

            {
                std::lock_guard<std::mutex> lock(dataMutex);
                updateDepthGrid(points, depthGrid);
            }

            PointCloudBatch batch{};
            batch.beamCount = beamCount;
            batch.points = points;
            batch.timestamp = NMEAParser::getCurrentTimestamp();
            ws.broadcast(pointCloudToJson(batch));
        }

        if (tick % 10 == 0) {
            std::lock_guard<std::mutex> lock(dataMutex);
            ws.broadcast(gridToJson(depthGrid));
        }

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
