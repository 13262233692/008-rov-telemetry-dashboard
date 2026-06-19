import { useEffect, useRef, useState, useCallback } from 'react';
import type { TelemetryData, ConnectionStatus } from '../types';
import {
  safeJsonParse,
  mergeTelemetryData,
  DEFAULT_TELEMETRY,
  DEFAULT_STATUS,
  updateErrorStats,
  resetConsecutiveErrors,
  INITIAL_ERROR_STATS,
} from '../utils/messageParser';
import type { ErrorStats } from '../utils/messageParser';

const DEFAULT_URL = 'ws://localhost:8080';
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];
const STALE_TIMEOUT_MS = 5000;

export interface TelemetryState {
  data: TelemetryData;
  status: ConnectionStatus;
  errorStats: ErrorStats;
  isStale: boolean;
}

export function useTelemetry(url: string = DEFAULT_URL) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const staleTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  const [data, setData] = useState<TelemetryData>(DEFAULT_TELEMETRY);
  const [status, setStatus] = useState<ConnectionStatus>(DEFAULT_STATUS);
  const [errorStats, setErrorStats] = useState<ErrorStats>(INITIAL_ERROR_STATS);
  const [isStale, setIsStale] = useState(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (staleTimerRef.current !== null) {
      window.clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const resetStaleTimer = useCallback(() => {
    setIsStale(false);
    if (staleTimerRef.current !== null) {
      window.clearTimeout(staleTimerRef.current);
    }
    staleTimerRef.current = window.setTimeout(() => {
      setIsStale(true);
    }, STALE_TIMEOUT_MS);
  }, []);

  const handleMessage = useCallback((raw: string) => {
    const result = safeJsonParse(raw);

    if (!result.success) {
      setErrorStats(prev => updateErrorStats(prev, result.errorType!));
      return;
    }

    const payload = result.payload!;

    if (payload.type === 'pong' && typeof payload.ts === 'number') {
      const latency = Date.now() - payload.ts;
      if (Number.isFinite(latency)) {
        setStatus(s => ({ ...s, latencyMs: latency }));
      }
      return;
    }

    setData(prev => mergeTelemetryData(prev, payload));

    setErrorStats(prev => resetConsecutiveErrors(prev));

    const now = Date.now();
    setStatus(s => ({
      ...s,
      lastUpdate: new Date(now).toISOString(),
    }));

    resetStaleTimer();
  }, [resetStaleTimer]);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        setStatus(s => ({ ...s, isConnected: true }));
        resetStaleTimer();
        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            } catch { /* send failure - connection likely closing */ }
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') return;
          handleMessage(event.data);
        } catch {
          setErrorStats(prev => updateErrorStats(prev, 'syntax'));
        }
      };

      ws.onerror = () => {
        setStatus(s => ({ ...s, isConnected: false }));
      };

      ws.onclose = () => {
        setStatus(s => ({ ...s, isConnected: false }));
        setIsStale(true);
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
  }, [url, clearTimers, handleMessage, resetStaleTimer]);

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

  return { data, status, errorStats, isStale };
}
