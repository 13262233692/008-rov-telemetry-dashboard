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
import type { PointCloudPoint, GridData } from '../components/TerrainExplorer';

const DEFAULT_URL = 'ws://localhost:8080';
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];
const STALE_TIMEOUT_MS = 5000;
const MAX_POINT_BUFFER = 2000;

function safeParseGrid(raw: unknown): GridData | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const size = typeof obj.size === 'number' && Number.isFinite(obj.size)
    ? Math.floor(obj.size) : null;
  const spacing = typeof obj.spacing === 'number' && Number.isFinite(obj.spacing)
    ? obj.spacing : null;
  if (!size || !spacing || size < 2 || size > 512) return null;

  const heightsRaw = obj.heights;
  if (!Array.isArray(heightsRaw) || heightsRaw.length !== size) return null;

  const heights: (number | null)[][] = [];
  for (let i = 0; i < size; i++) {
    const row = heightsRaw[i];
    if (!Array.isArray(row) || row.length !== size) return null;
    const parsedRow: (number | null)[] = [];
    for (let j = 0; j < size; j++) {
      const v = row[j];
      if (v === null || v === undefined) parsedRow.push(null);
      else if (typeof v === 'number' && Number.isFinite(v)) parsedRow.push(v);
      else parsedRow.push(null);
    }
    heights.push(parsedRow);
  }

  return { size, spacing, heights };
}

function safeParsePoints(raw: unknown): PointCloudPoint[] | null {
  if (raw === null || !Array.isArray(raw)) return null;
  const result: PointCloudPoint[] = [];
  const len = Math.min(raw.length, MAX_POINT_BUFFER);
  for (let i = 0; i < len; i++) {
    const p = raw[i];
    if (!Array.isArray(p) || p.length < 3) continue;
    const [x, y, z, intensity = 0.5] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    result.push({
      x: x as number,
      y: y as number,
      z: z as number,
      intensity: Number.isFinite(intensity) ? (intensity as number) : 0.5,
    });
  }
  return result;
}

export interface TelemetryState {
  data: TelemetryData;
  status: ConnectionStatus;
  errorStats: ErrorStats;
  isStale: boolean;
  pointCloud: PointCloudPoint[];
  gridData: GridData | null;
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
  const [pointCloud, setPointCloud] = useState<PointCloudPoint[]>([]);
  const [gridData, setGridData] = useState<GridData | null>(null);

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
    const msgType = payload.type;

    if (msgType === 'pong' && typeof payload.ts === 'number') {
      const latency = Date.now() - payload.ts;
      if (Number.isFinite(latency)) {
        setStatus(s => ({ ...s, latencyMs: latency }));
      }
      return;
    }

    if (msgType === 'pointcloud') {
      const pts = safeParsePoints(payload.points);
      if (pts && pts.length > 0) {
        setPointCloud(prev => {
          const combined = [...pts, ...prev];
          return combined.slice(0, MAX_POINT_BUFFER);
        });
        resetStaleTimer();
      }
      return;
    }

    if (msgType === 'grid') {
      const grid = safeParseGrid(payload);
      if (grid) {
        setGridData(grid);
        resetStaleTimer();
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

  return { data, status, errorStats, isStale, pointCloud, gridData };
}
