#pragma once

class KalmanFilter {
public:
    KalmanFilter(double processNoise = 0.001, double measurementNoise = 0.1, double estimationError = 1.0, double initialEstimate = 0.0);

    void reset(double initialEstimate = 0.0);
    double update(double measurement);
    double getEstimate() const;

private:
    double q_;
    double r_;
    double p_;
    double x_;
    double k_;
};
