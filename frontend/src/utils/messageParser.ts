import type { TelemetryData, ConnectionStatus } from './types';

const TELEMETRY_NUMERIC_FIELDS: (keyof TelemetryData)[] = [
  'heading', 'roll', 'pitch', 'depth', 'depthFeet',
  'speedNorth', 'speedEast', 'speedDown',
  'speedGroundNorth', 'speedGroundEast', 'speedGroundDown',
  'waterTemp',
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateJsonIntegrity(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length < 2) return false;

  const first = raw.charAt(0);
  const last = raw.charAt(raw.length - 1);
  if ((first === '{' && last !== '}') || (first === '[' && last !== ']')) return false;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;

  return true;
}

export interface ParseResult {
  success: boolean;
  payload: Record<string, unknown> | null;
  errorType: 'integrity' | 'syntax' | 'validation' | null;
}

export function safeJsonParse(raw: string): ParseResult {
  if (!validateJsonIntegrity(raw)) {
    return { success: false, payload: null, errorType: 'integrity' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, payload: null, errorType: 'syntax' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, payload: null, errorType: 'validation' };
  }
  return { success: true, payload: parsed as Record<string, unknown>, errorType: null };
}

export function sanitizeTelemetryField(
  raw: Record<string, unknown>,
  field: keyof TelemetryData
): number | string | undefined {
  const value = raw[field];
  if (field === 'timestamp') {
    return typeof value === 'string' ? value : undefined;
  }
  if (isFiniteNumber(value)) return value;
  return undefined;
}

export function mergeTelemetryData(
  prev: TelemetryData,
  raw: Record<string, unknown>
): TelemetryData {
  const next = { ...prev };
  let dirty = false;
  for (const field of TELEMETRY_NUMERIC_FIELDS) {
    const sanitized = sanitizeTelemetryField(raw, field);
    if (sanitized !== undefined) {
      (next[field] as number) = sanitized;
      dirty = true;
    }
  }
  const ts = sanitizeTelemetryField(raw, 'timestamp');
  if (ts !== undefined) {
    next.timestamp = ts as string;
    dirty = true;
  }
  return dirty ? next : prev;
}

export const DEFAULT_TELEMETRY: TelemetryData = {
  heading: 0, roll: 0, pitch: 0, depth: 0, depthFeet: 0,
  speedNorth: 0, speedEast: 0, speedDown: 0,
  speedGroundNorth: 0, speedGroundEast: 0, speedGroundDown: 0,
  waterTemp: 0, timestamp: '',
};

export const DEFAULT_STATUS: ConnectionStatus = {
  isConnected: false, latencyMs: 0, lastUpdate: null,
};

export interface ErrorStats {
  integrityErrors: number;
  syntaxErrors: number;
  validationErrors: number;
  totalErrors: number;
  consecutiveErrors: number;
  lastErrorType: string | null;
  isDegraded: boolean;
}

export const INITIAL_ERROR_STATS: ErrorStats = {
  integrityErrors: 0, syntaxErrors: 0, validationErrors: 0,
  totalErrors: 0, consecutiveErrors: 0,
  lastErrorType: null, isDegraded: false,
};

const DEGRADATION_THRESHOLD = 5;

export function updateErrorStats(
  prev: ErrorStats,
  errorType: 'integrity' | 'syntax' | 'validation'
): ErrorStats {
  const totalErrors = prev.totalErrors + 1;
  const consecutiveErrors = prev.consecutiveErrors + 1;
  return {
    integrityErrors: prev.integrityErrors + (errorType === 'integrity' ? 1 : 0),
    syntaxErrors: prev.syntaxErrors + (errorType === 'syntax' ? 1 : 0),
    validationErrors: prev.validationErrors + (errorType === 'validation' ? 1 : 0),
    totalErrors,
    consecutiveErrors,
    lastErrorType: errorType,
    isDegraded: consecutiveErrors >= DEGRADATION_THRESHOLD,
  };
}

export function resetConsecutiveErrors(prev: ErrorStats): ErrorStats {
  return { ...prev, consecutiveErrors: 0, isDegraded: false };
}
