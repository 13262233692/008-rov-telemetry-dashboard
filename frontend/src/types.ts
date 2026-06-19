export interface TelemetryData {
  heading: number;
  roll: number;
  pitch: number;
  depth: number;
  depthFeet: number;
  speedNorth: number;
  speedEast: number;
  speedDown: number;
  speedGroundNorth: number;
  speedGroundEast: number;
  speedGroundDown: number;
  waterTemp: number;
  timestamp: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  latencyMs: number;
  lastUpdate: string | null;
}
