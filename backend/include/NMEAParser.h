#pragma once

#include <string>
#include <vector>
#include <optional>

struct TelemetryData {
    double heading;
    double roll;
    double pitch;
    double depth;
    double depthFeet;
    double speedNorth;
    double speedEast;
    double speedDown;
    double speedGroundNorth;
    double speedGroundEast;
    double speedGroundDown;
    double waterTemp;
    std::string timestamp;
};

class NMEAParser {
public:
    static std::optional<TelemetryData> parseSentence(const std::string& sentence);
    static std::string getCurrentTimestamp();

private:
    static std::optional<TelemetryData> parseHDG(const std::vector<std::string>& fields);
    static std::optional<TelemetryData> parseDBT(const std::vector<std::string>& fields);
    static std::optional<TelemetryData> parseVLW(const std::vector<std::string>& fields);
    static std::optional<TelemetryData> parseVTG(const std::vector<std::string>& fields);

    static std::vector<std::string> splitFields(const std::string& sentence);
    static uint8_t calculateChecksum(const std::string& sentence);
    static bool validateChecksum(const std::string& sentence);
    static double safeStod(const std::string& s, double def = 0.0);
};
