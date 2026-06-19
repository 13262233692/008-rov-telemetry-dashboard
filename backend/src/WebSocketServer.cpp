#include "WebSocketServer.h"
#include <iostream>
#include <cstring>

namespace {

constexpr uint32_t SHA1_BLOCK_SIZE = 64;
constexpr uint32_t SHA1_DIGEST_SIZE = 20;

struct SHA1_CTX {
    uint32_t state[5];
    uint64_t count;
    uint8_t buffer[SHA1_BLOCK_SIZE];
};

inline uint32_t leftRotate(uint32_t x, uint32_t n) {
    return (x << n) | (x >> (32 - n));
}

void sha1Transform(uint32_t state[5], const uint8_t block[SHA1_BLOCK_SIZE]) {
    uint32_t w[80];
    for (int i = 0; i < 16; ++i) {
        w[i] = (static_cast<uint32_t>(block[i * 4]) << 24)
             | (static_cast<uint32_t>(block[i * 4 + 1]) << 16)
             | (static_cast<uint32_t>(block[i * 4 + 2]) << 8)
             | (static_cast<uint32_t>(block[i * 4 + 3]));
    }
    for (int i = 16; i < 80; ++i) {
        w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    uint32_t a = state[0], b = state[1], c = state[2], d = state[3], e = state[4];

    for (int i = 0; i < 20; ++i) {
        uint32_t temp = leftRotate(a, 5) + ((b & c) | ((~b) & d)) + e + w[i] + 0x5A827999;
        e = d; d = c; c = leftRotate(b, 30); b = a; a = temp;
    }
    for (int i = 20; i < 40; ++i) {
        uint32_t temp = leftRotate(a, 5) + (b ^ c ^ d) + e + w[i] + 0x6ED9EBA1;
        e = d; d = c; c = leftRotate(b, 30); b = a; a = temp;
    }
    for (int i = 40; i < 60; ++i) {
        uint32_t temp = leftRotate(a, 5) + ((b & c) | (b & d) | (c & d)) + e + w[i] + 0x8F1BBCDC;
        e = d; d = c; c = leftRotate(b, 30); b = a; a = temp;
    }
    for (int i = 60; i < 80; ++i) {
        uint32_t temp = leftRotate(a, 5) + (b ^ c ^ d) + e + w[i] + 0xCA62C1D6;
        e = d; d = c; c = leftRotate(b, 30); b = a; a = temp;
    }

    state[0] += a; state[1] += b; state[2] += c; state[3] += d; state[4] += e;
}

void sha1Init(SHA1_CTX* ctx) {
    ctx->state[0] = 0x67452301;
    ctx->state[1] = 0xEFCDAB89;
    ctx->state[2] = 0x98BADCFE;
    ctx->state[3] = 0x10325476;
    ctx->state[4] = 0xC3D2E1F0;
    ctx->count = 0;
}

void sha1Update(SHA1_CTX* ctx, const uint8_t* data, size_t len) {
    size_t idx = static_cast<size_t>(ctx->count % SHA1_BLOCK_SIZE);
    ctx->count += len;
    size_t fill = SHA1_BLOCK_SIZE - idx;

    if (len >= fill) {
        std::memcpy(ctx->buffer + idx, data, fill);
        sha1Transform(ctx->state, ctx->buffer);
        data += fill;
        len -= fill;
        while (len >= SHA1_BLOCK_SIZE) {
            sha1Transform(ctx->state, data);
            data += SHA1_BLOCK_SIZE;
            len -= SHA1_BLOCK_SIZE;
        }
        idx = 0;
    }
    if (len > 0) {
        std::memcpy(ctx->buffer + idx, data, len);
    }
}

void sha1Final(SHA1_CTX* ctx, uint8_t digest[SHA1_DIGEST_SIZE]) {
    uint64_t bits = ctx->count * 8;
    size_t idx = static_cast<size_t>(ctx->count % SHA1_BLOCK_SIZE);
    ctx->buffer[idx++] = 0x80;

    if (idx > 56) {
        while (idx < SHA1_BLOCK_SIZE) ctx->buffer[idx++] = 0;
        sha1Transform(ctx->state, ctx->buffer);
        idx = 0;
    }
    while (idx < 56) ctx->buffer[idx++] = 0;
    for (int i = 7; i >= 0; --i) {
        ctx->buffer[idx++] = static_cast<uint8_t>(bits >> (i * 8));
    }
    sha1Transform(ctx->state, ctx->buffer);

    for (int i = 0; i < 5; ++i) {
        digest[i * 4] = static_cast<uint8_t>(ctx->state[i] >> 24);
        digest[i * 4 + 1] = static_cast<uint8_t>(ctx->state[i] >> 16);
        digest[i * 4 + 2] = static_cast<uint8_t>(ctx->state[i] >> 8);
        digest[i * 4 + 3] = static_cast<uint8_t>(ctx->state[i]);
    }
}

void sha1(const uint8_t* input, size_t length, uint8_t digest[SHA1_DIGEST_SIZE]) {
    SHA1_CTX ctx;
    sha1Init(&ctx);
    sha1Update(&ctx, input, length);
    sha1Final(&ctx, digest);
}

} // anonymous namespace

static const std::string base64_chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

WebSocketServer::WebSocketServer(int port)
    : port_(port)
    , serverSocket_(InvalidSocket)
    , running_(false)
{
#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif
}

WebSocketServer::~WebSocketServer() {
    stop();
#ifdef _WIN32
    WSACleanup();
#endif
}

std::string WebSocketServer::base64Encode(const unsigned char* input, size_t length) {
    std::string result;
    int i = 0;
    unsigned char char_array_3[3];
    unsigned char char_array_4[4];

    while (length--) {
        char_array_3[i++] = *(input++);
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;
            for (i = 0; i < 4; i++) result += base64_chars[char_array_4[i]];
            i = 0;
        }
    }

    if (i) {
        for (int j = i; j < 3; j++) char_array_3[j] = '\0';
        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
        char_array_4[3] = char_array_3[2] & 0x3f;
        for (int j = 0; j < i + 1; j++) result += base64_chars[char_array_4[j]];
        while (i++ < 3) result += '=';
    }
    return result;
}

std::string WebSocketServer::computeAcceptKey(const std::string& key) {
    std::string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    unsigned char hash[20];
    sha1(reinterpret_cast<const unsigned char*>(magic.c_str()), magic.size(), hash);
    return base64Encode(hash, 20);
}

std::string WebSocketServer::handleHandshake(const std::string& request) {
    size_t keyPos = request.find("Sec-WebSocket-Key: ");
    if (keyPos == std::string::npos) return "";
    keyPos += 19;
    size_t keyEnd = request.find("\r\n", keyPos);
    std::string clientKey = request.substr(keyPos, keyEnd - keyPos);
    std::string acceptKey = computeAcceptKey(clientKey);
    return "HTTP/1.1 101 Switching Protocols\r\n"
           "Upgrade: websocket\r\n"
           "Connection: Upgrade\r\n"
           "Sec-WebSocket-Accept: " + acceptKey + "\r\n"
           "Access-Control-Allow-Origin: *\r\n\r\n";
}

std::string WebSocketServer::encodeFrame(const std::string& message) {
    std::string frame;
    frame += static_cast<char>(0x81);

    size_t len = message.size();
    if (len < 126) {
        frame += static_cast<char>(len);
    } else if (len < 65536) {
        frame += static_cast<char>(126);
        frame += static_cast<char>((len >> 8) & 0xFF);
        frame += static_cast<char>(len & 0xFF);
    } else {
        frame += static_cast<char>(127);
        for (int i = 7; i >= 0; --i) {
            frame += static_cast<char>((len >> (i * 8)) & 0xFF);
        }
    }
    frame += message;
    return frame;
}

std::string WebSocketServer::decodeFrame(const std::vector<uint8_t>& buffer, size_t length) {
    if (length < 2) return "";
    bool masked = (buffer[1] & 0x80) != 0;
    uint64_t payloadLen = buffer[1] & 0x7F;
    size_t headerLen = 2;
    if (payloadLen == 126) {
        if (length < 4) return "";
        payloadLen = (buffer[2] << 8) | buffer[3];
        headerLen = 4;
    } else if (payloadLen == 127) {
        if (length < 10) return "";
        payloadLen = 0;
        for (int i = 0; i < 8; ++i) {
            payloadLen = (payloadLen << 8) | buffer[2 + i];
        }
        headerLen = 10;
    }
    std::vector<uint8_t> mask;
    if (masked) {
        if (length < headerLen + 4) return "";
        mask = {buffer[headerLen], buffer[headerLen + 1], buffer[headerLen + 2], buffer[headerLen + 3]};
        headerLen += 4;
    }
    if (length < headerLen + payloadLen) return "";
    std::string payload;
    payload.resize(payloadLen);
    for (uint64_t i = 0; i < payloadLen; ++i) {
        payload[i] = masked ? (buffer[headerLen + i] ^ mask[i % 4]) : buffer[headerLen + i];
    }
    return payload;
}

bool WebSocketServer::start() {
#ifdef _WIN32
    serverSocket_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
#else
    serverSocket_ = ::socket(AF_INET, SOCK_STREAM, 0);
#endif
    if (serverSocket_ == InvalidSocket) return false;

    int opt = 1;
#ifdef _WIN32
    setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
    setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

    struct sockaddr_in serverAddr{};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    serverAddr.sin_port = htons(static_cast<uint16_t>(port_));

    if (bind(serverSocket_, reinterpret_cast<struct sockaddr*>(&serverAddr), sizeof(serverAddr)) != 0) {
        return false;
    }

    if (listen(serverSocket_, SOMAXCONN) != 0) {
        return false;
    }

    running_ = true;
    acceptThread_ = std::thread(&WebSocketServer::acceptLoop, this);
    std::cout << "[WebSocketServer] Listening on port " << port_ << std::endl;
    return true;
}

void WebSocketServer::acceptLoop() {
    while (running_) {
        struct sockaddr_in clientAddr{};
#ifdef _WIN32
        int clientLen = sizeof(clientAddr);
#else
        socklen_t clientLen = sizeof(clientAddr);
#endif
        SocketType clientSocket = accept(serverSocket_, reinterpret_cast<struct sockaddr*>(&clientAddr), &clientLen);
        if (clientSocket == InvalidSocket) continue;
        {
            std::lock_guard<std::mutex> lock(clientsMutex_);
            clients_.insert(clientSocket);
        }
        std::thread t(&WebSocketServer::clientHandler, this, clientSocket);
        t.detach();
    }
}

void WebSocketServer::clientHandler(SocketType clientSocket) {
    std::vector<uint8_t> buffer(8192);
    bool upgraded = false;
    std::string handshakeBuffer;

    while (running_) {
#ifdef _WIN32
        int bytesRecv = recv(clientSocket, reinterpret_cast<char*>(buffer.data()), static_cast<int>(buffer.size()), 0);
#else
        int bytesRecv = ::recv(clientSocket, buffer.data(), static_cast<int>(buffer.size()), 0);
#endif
        if (bytesRecv <= 0) break;

        if (!upgraded) {
            handshakeBuffer.append(reinterpret_cast<char*>(buffer.data()), bytesRecv);
            if (handshakeBuffer.find("\r\n\r\n") != std::string::npos) {
                std::string response = handleHandshake(handshakeBuffer);
                if (response.empty()) break;
#ifdef _WIN32
                send(clientSocket, response.c_str(), static_cast<int>(response.size()), 0);
#else
                ::send(clientSocket, response.c_str(), response.size(), 0);
#endif
                upgraded = true;
                handshakeBuffer.clear();
                std::cout << "[WebSocketServer] Client connected" << std::endl;
            }
        }
    }

    {
        std::lock_guard<std::mutex> lock(clientsMutex_);
        clients_.erase(clientSocket);
    }
#ifdef _WIN32
    closesocket(clientSocket);
#else
    ::close(clientSocket);
#endif
    std::cout << "[WebSocketServer] Client disconnected" << std::endl;
}

void WebSocketServer::broadcast(const std::string& message) {
    std::string frame = encodeFrame(message);
    std::lock_guard<std::mutex> lock(clientsMutex_);
    for (SocketType client : clients_) {
#ifdef _WIN32
        send(client, frame.c_str(), static_cast<int>(frame.size()), 0);
#else
        ::send(client, frame.c_str(), frame.size(), 0);
#endif
    }
}

void WebSocketServer::stop() {
    running_ = false;
    if (serverSocket_ != InvalidSocket) {
#ifdef _WIN32
        closesocket(serverSocket_);
#else
        ::shutdown(serverSocket_, SHUT_RDWR);
        ::close(serverSocket_);
#endif
        serverSocket_ = InvalidSocket;
    }
    if (acceptThread_.joinable()) acceptThread_.join();
    {
        std::lock_guard<std::mutex> lock(clientsMutex_);
        for (SocketType client : clients_) {
#ifdef _WIN32
            closesocket(client);
#else
            ::close(client);
#endif
        }
        clients_.clear();
    }
}

bool WebSocketServer::isRunning() const {
    return running_;
}
