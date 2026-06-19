cmake_minimum_required(VERSION 3.15)
project(ROV_Telemetry_Gateway VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/W4 /permissive- /wd4996 /wd4100 /wd4101 /wd4456 /wd4458)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Wno-unused-parameter -Wno-unused-variable -Wno-sign-compare)
endif()

include_directories(${CMAKE_SOURCE_DIR}/include)

set(SOURCES
    src/main.cpp
    src/SerialPort.cpp
    src/NMEAParser.cpp
    src/KalmanFilter.cpp
    src/WebSocketServer.cpp
    src/PointCloudProcessor.cpp
)

add_executable(rov_gateway ${SOURCES})

if(WIN32)
    target_link_libraries(rov_gateway PRIVATE ws2_32)
endif()

find_package(Threads REQUIRED)
target_link_libraries(rov_gateway PRIVATE Threads::Threads)
