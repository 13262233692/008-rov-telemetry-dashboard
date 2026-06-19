import { useEffect, useRef, useState, useCallback } from 'react';
import type { TelemetryData, ConnectionStatus } from '../types';

const DEFAULT_URL = 'ws://localhost:8080';
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];

export function useTelemetry(url: string = DEFAULT_URL) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const lastSendRef = useRef<number>(0);

  const [data, setData] = useState<TelemetryData>({
    heading: 0,
    roll: 0,
    pitch: 0,
    depth: 0,
    depthFeet: 0,
    speedNorth: 0,
    speedEast: 0,
    speedDown: 0,
    speedGroundNorth: 0,
    speedGroundEast: 0,
    speedGroundDown: 0,
    waterTemp: 0,
    timestamp: '',
  });

  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    latencyMs: 0,
    lastUpdate: null,
  });

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        setStatus(s => ({ ...s, isConnected: true }));
        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingMsg = JSON.stringify({ type: 'ping', ts: Date.now() });
            ws.send(pingMsg);
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'pong') {
            const latency = Date.now() - payload.ts;
            setStatus(s => ({ ...s, latencyMs: latency }));
            return;
          }
          const now = Date.now();
          setData(prev => ({ ...prev, ...payload }));
          setStatus(s => ({
            ...s,
            lastUpdate: new Date().toISOString(),
            latencyMs: s.latencyMs || (now - lastSendRef.current),
          }));
          lastSendRef.current = now;
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setStatus(s => ({ ...s, isConnected: false }));
      };

      ws.onclose = () => {
        setStatus(s => ({ ...s, isConnected: false }));
        clearTimers();
        const delay = RECONNECT_DELAYS[Math.min(retryCountRef.current, RECONNECT_DELAYS.length - 1)];
        retryCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    } catch {
      clearTimers();
      const delay = RECONNECT_DELAYS[Math.min(retryCountRef.current, RECONNECT_DELAYS.length - 1)];
      retryCountRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    }
  }, [url, clearTimers]);

  useEffect(() => {
    connect();
    return () => {
      clearTimers();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [connect, clearTimers]);

  return { data, status };
}
