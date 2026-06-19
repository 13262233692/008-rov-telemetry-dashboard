#include "NMEAParser.h"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <ctime>
#include <cmath>

std::vector<std::string> NMEAParser::splitFields(const std::string& sentence) {
    std::vector<std::string> fields;
    std::string current;
    for (char c : sentence) {
        if (c == ',' || c == '*') {
            fields.push_back(current);
            current.clear();
        } else {
            current += c;
        }
    }
    if (!current.empty()) {
        fields.push_back(current);
    }
    return fields;
}

uint8_t NMEAParser::calculateChecksum(const std::string& sentence) {
    uint8_t checksum = 0;
    size_t start = sentence.find('$');
    size_t end = sentence.find('*');
    if (start == std::string::npos || end == std::string::npos) return 0;
    for (size_t i = start + 1; i < end; ++i) {
        checksum ^= static_cast<uint8_t>(sentence[i]);
    }
    return checksum;
}

bool NMEAParser::validateChecksum(const std::string& sentence) {
    size_t starPos = sentence.find('*');
    if (starPos == std::string::npos || starPos + 2 >= sentence.size()) return true;
    try {
        uint8_t expected = std::stoi(sentence.substr(starPos + 1, 2), nullptr, 16);
        return calculateChecksum(sentence) == expected;
    } catch (...) {
        return true;
    }
}

std::string NMEAParser::getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    auto timeT = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::gmtime(&timeT);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S")
        << '.' << std::setw(3) << std::setfill('0') << ms.count() << 'Z';
    return oss.str();
}

double NMEAParser::safeStod(const std::string& s, double def) {
    if (s.empty()) return def;
    try { return std::stod(s); } catch (...) { return def; }
}

std::optional<TelemetryData> NMEAParser::parseHDG(const std::vector<std::string>& fields) {
    TelemetryData data{};
    if (fields.size() < 2) return std::nullopt;
    data.heading = safeStod(fields[1]);
    if (fields.size() >= 3) {
        double deviation = safeStod(fields[2]);
        if (fields.size() >= 4 && fields[3] == "W") deviation = -deviation;
        data.heading += deviation;
    }
    if (fields.size() >= 5) {
        double variation = safeStod(fields[4]);
        if (fields.size() >= 6 && fields[5] == "W") variation = -variation;
        data.heading += variation;
    }
    data.timestamp = getCurrentTimestamp();
    return data;
}

std::optional<TelemetryData> NMEAParser::parseDBT(const std::vector<std::string>& fields) {
    TelemetryData data{};
    if (fields.size() >= 2) data.depthFeet = safeStod(fields[1]);
    if (fields.size() >= 4) data.depth = safeStod(fields[3]);
    if (fields.size() >= 6) data.waterTemp = safeStod(fields[5]);
    data.timestamp = getCurrentTimestamp();
    return data;
}

std::optional<TelemetryData> NMEAParser::parseVLW(const std::vector<std::string>& fields) {
    TelemetryData data{};
    data.timestamp = getCurrentTimestamp();
    return data;
}

std::optional<TelemetryData> NMEAParser::parseVTG(const std::vector<std::string>& fields) {
    TelemetryData data{};
    if (fields.size() >= 2) data.heading = safeStod(fields[1]);
    double knots = 0.0;
    if (fields.size() >= 6) knots = safeStod(fields[5]);
    double mps = knots * 0.514444;
    double headingRad = data.heading * 3.14159265358979323846 / 180.0;
    data.speedNorth = mps * std::cos(headingRad);
    data.speedEast = mps * std::sin(headingRad);
    data.speedGroundNorth = data.speedNorth;
    data.speedGroundEast = data.speedEast;
    data.timestamp = getCurrentTimestamp();
    return data;
}

std::optional<TelemetryData> NMEAParser::parseSentence(const std::string& sentence) {
    if (sentence.empty() || sentence[0] != '$') return std::nullopt;
    if (!validateChecksum(sentence)) return std::nullopt;

    std::vector<std::string> fields = splitFields(sentence);
    if (fields.size() < 2) return std::nullopt;

    std::string talkerSentence = fields[0].substr(1);
    std::string type;
    if (talkerSentence.size() >= 3) {
        type = talkerSentence.substr(talkerSentence.size() - 3);
    } else {
        type = talkerSentence;
    }

    if (type == "HDG") return parseHDG(fields);
    if (type == "DBT") return parseDBT(fields);
    if (type == "VLW") return parseVLW(fields);
    if (type == "VTG") return parseVTG(fields);
    if (talkerSentence == "IIHDG") return parseHDG(fields);
    if (talkerSentence == "SDDBT") return parseDBT(fields);

    return std::nullopt;
}
