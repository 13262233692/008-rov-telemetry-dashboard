#include "KalmanFilter.h"

KalmanFilter::KalmanFilter(double processNoise, double measurementNoise,
                           double estimationError, double initialEstimate)
    : q_(processNoise)
    , r_(measurementNoise)
    , p_(estimationError)
    , x_(initialEstimate)
    , k_(0.0)
{
}

void KalmanFilter::reset(double initialEstimate) {
    x_ = initialEstimate;
    p_ = 1.0;
    k_ = 0.0;
}

double KalmanFilter::update(double measurement) {
    p_ = p_ + q_;
    k_ = p_ / (p_ + r_);
    x_ = x_ + k_ * (measurement - x_);
    p_ = (1.0 - k_) * p_;
    return x_;
}

double KalmanFilter::getEstimate() const {
    return x_;
}
