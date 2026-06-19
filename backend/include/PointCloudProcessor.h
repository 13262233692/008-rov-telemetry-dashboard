#pragma once

#include <string>
#include <vector>
#include <optional>

struct Point3D {
    float x;
    float y;
    float z;
    float intensity;
};

struct PointCloudBatch {
    uint32_t beamCount;
    std::vector<Point3D> points;
    std::string timestamp;
};

struct DepthGridCell {
    float depth;
    bool valid;
};

class PointCloudProcessor {
public:
    static std::optional<PointCloudBatch> parseMBES(const std::string& sentence);
    static std::optional<PointCloudBatch> parseMBM(const std::vector<std::string>& fields);

    static std::vector<Point3D> generateSeafloorPoints(
        double centerX, double centerY, double baseDepth,
        int beamCount, double swathWidth, double headingRad,
        std::mt19937& rng
    );

    static float seafloorHeight(double x, double y, double baseDepth);

private:
    static double noise2D(double x, double y);
    static double fade(double t);
    static double lerp(double a, double b, double t);
    static double grad(int hash, double x, double y);
    static int perm_[512];
    static bool permInitialized_;
    static void initPerm();
};
