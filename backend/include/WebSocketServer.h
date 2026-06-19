#pragma once

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef _WINSOCK_DEPRECATED_NO_WARNINGS
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#endif
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")
using SocketType = SOCKET;
constexpr SocketType InvalidSocket = INVALID_SOCKET;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
using SocketType = int;
constexpr SocketType InvalidSocket = -1;
#endif

#include <string>
#include <vector>
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>
#include <set>

class WebSocketServer {
public:
    WebSocketServer(int port = 8080);
    ~WebSocketServer();

    bool start();
    void stop();
    void broadcast(const std::string& message);
    bool isRunning() const;

private:
    void acceptLoop();
    void clientHandler(SocketType clientSocket);
    std::string handleHandshake(const std::string& request);
    std::string encodeFrame(const std::string& message);
    std::string decodeFrame(const std::vector<uint8_t>& buffer, size_t length);
    std::string computeAcceptKey(const std::string& key);
    std::string base64Encode(const unsigned char* input, size_t length);

    int port_;
    SocketType serverSocket_;
    std::atomic<bool> running_;
    std::thread acceptThread_;
    std::mutex clientsMutex_;
    std::set<SocketType> clients_;
    std::vector<std::thread> clientThreads_;
};
