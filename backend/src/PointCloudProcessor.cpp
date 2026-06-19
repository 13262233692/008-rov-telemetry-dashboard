#include "PointCloudProcessor.h"
#include "NMEAParser.h"
#include <sstream>
#include <iomanip>
#include <cmath>
#include <random>
#include <algorithm>

bool PointCloudProcessor::permInitialized_ = false;
int PointCloudProcessor::perm_[512];

static const int p_perm[] = {
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
    250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
    189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
    172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
    228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
    107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
};

void PointCloudProcessor::initPerm() {
    if (permInitialized_) return;
    for (int i = 0; i < 256; ++i) {
        perm_[i] = p_perm[i];
        perm_[i + 256] = p_perm[i];
    }
    permInitialized_ = true;
}

double PointCloudProcessor::fade(double t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

double PointCloudProcessor::lerp(double a, double b, double t) {
    return a + t * (b - a);
}

double PointCloudProcessor::grad(int hash, double x, double y) {
    int h = hash & 3;
    double u = h < 2 ? x : y;
    double v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

double PointCloudProcessor::noise2D(double x, double y) {
    if (!permInitialized_) initPerm();

    int X = static_cast<int>(std::floor(x)) & 255;
    int Y = static_cast<int>(std::floor(y)) & 255;
    x -= std::floor(x);
    y -= std::floor(y);
    double u = fade(x);
    double v = fade(y);

    int A = perm_[X] + Y;
    int B = perm_[X + 1] + Y;

    return lerp(
        lerp(grad(perm_[A], x, y), grad(perm_[B], x - 1, y), u),
        lerp(grad(perm_[A + 1], x, y - 1), grad(perm_[B + 1], x - 1, y - 1), u),
        v
    );
}

float PointCloudProcessor::seafloorHeight(double x, double y, double baseDepth) {
    double scale = 0.015;
    double h = 0.0;
    double amp = 1.0;
    double freq = 1.0;
    double maxAmp = 0.0;

    for (int oct = 0; oct < 4; ++oct) {
        h += noise2D(x * scale * freq, y * scale * freq) * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }

    h = h / maxAmp * 12.0;

    double ridge = std::abs(noise2D(x * 0.008, y * 0.008)) * 25.0;
    h += ridge;

    double valley = std::abs(noise2D(x * 0.003 + 100, y * 0.003 + 100));
    valley = std::pow(valley, 2.0) * 40.0;
    h += valley;

    return static_cast<float>(baseDepth + h);
}

std::vector<Point3D> PointCloudProcessor::generateSeafloorPoints(
    double centerX, double centerY, double baseDepth,
    int beamCount, double swathWidth, double headingRad,
    std::mt19937& rng
) {
    std::vector<Point3D> points;
    points.reserve(beamCount);

    std::normal_distribution<float> depthNoise(0.0f, 0.3f);
    std::normal_distribution<float> intensityNoise(0.0f, 0.08f);

    double halfSwath = swathWidth / 2.0;
    double cosH = std::cos(headingRad);
    double sinH = std::sin(headingRad);

    for (int i = 0; i < beamCount; ++i) {
        double t = (i * 2.0 / (beamCount - 1)) - 1.0;
        double beamAngle = t * 60.0 * 3.14159265358979323846 / 180.0;
        double acrossDist = std::tan(beamAngle) * baseDepth;
        acrossDist = std::max(-halfSwath, std::min(halfSwath, acrossDist));

        double localX = acrossDist;
        double localY = 0.0;

        double worldX = centerX + localX * cosH - localY * sinH;
        double worldY = centerY + localX * sinH + localY * cosH;

        float depth = seafloorHeight(worldX, worldY, baseDepth);
        depth += depthNoise(rng);

        float alongOffset = static_cast<float>(depthNoise(rng) * 0.5);

        Point3D p{};
        p.x = static_cast<float>(worldX - centerX);
        p.y = static_cast<float>(worldY - centerY);
        p.z = -depth;
        float inten = 0.7f - std::abs(t) * 0.4f + intensityNoise(rng);
        if (inten < 0.0f) inten = 0.0f;
        if (inten > 1.0f) inten = 1.0f;
        p.intensity = inten;
        points.push_back(p);
    }
    return points;
}

std::optional<PointCloudBatch> PointCloudProcessor::parseMBM(const std::vector<std::string>& fields) {
    if (fields.size() < 5) return std::nullopt;

    PointCloudBatch batch{};
    batch.timestamp = NMEAParser::getCurrentTimestamp();

    try {
        batch.beamCount = static_cast<uint32_t>(std::stoi(fields[1]));
        double heading = NMEAParser::safeStod(fields[2], 0.0);
        double headingRad = heading * 3.14159265358979323846 / 180.0;
        double centerDepth = NMEAParser::safeStod(fields[3], 10.0);
        double swathWidth = NMEAParser::safeStod(fields[4], 30.0);

        batch.points.reserve(batch.beamCount);
        size_t baseIdx = 5;
        for (uint32_t i = 0; i < batch.beamCount && baseIdx + i * 3 < fields.size(); ++i) {
            Point3D p{};
            p.x = static_cast<float>(NMEAParser::safeStod(fields[baseIdx + i * 3], 0.0));
            p.y = static_cast<float>(NMEAParser::safeStod(fields[baseIdx + i * 3 + 1], 0.0));
            p.z = static_cast<float>(-NMEAParser::safeStod(fields[baseIdx + i * 3 + 2], centerDepth));
            p.intensity = static_cast<float>(NMEAParser::safeStod(fields[baseIdx + i * 3 + 3], 0.5));
            (void)headingRad;
            batch.points.push_back(p);
        }
    } catch (...) {
        return std::nullopt;
    }
    return batch;
}

std::optional<PointCloudBatch> PointCloudProcessor::parseMBES(const std::string& sentence) {
    if (sentence.empty() || sentence[0] != '$') return std::nullopt;

    auto fields = NMEAParser::splitFields(sentence);
    if (fields.empty()) return std::nullopt;

    std::string talkerSentence = fields[0].substr(1);
    if (talkerSentence.size() >= 3) {
        std::string type = talkerSentence.substr(talkerSentence.size() - 3);
        if (type == "MBM") return parseMBM(fields);
    }
    if (talkerSentence == "SDMBM") return parseMBM(fields);
    if (talkerSentence == "MBMBM") return parseMBM(fields);

    return std::nullopt;
}
