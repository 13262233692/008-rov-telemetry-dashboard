import AttitudeIndicator from './components/AttitudeIndicator';
import DepthGauge from './components/DepthGauge';
import SpeedVector from './components/SpeedVector';
import TerrainExplorer from './components/TerrainExplorer';
import ErrorBoundary from './components/ErrorBoundary';
import type { TelemetryData, ConnectionStatus } from '../types';
import type { PointCloudPoint, GridData } from './TerrainExplorer';

function safeToFixed(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '---';
  return v.toFixed(digits);
}

interface DashboardProps {
  data: TelemetryData;
  status: ConnectionStatus;
  isStale: boolean;
  isDegraded: boolean;
  pointCloud: PointCloudPoint[];
  gridData: GridData | null;
}

export default function Dashboard({
  data,
  status,
  isStale,
  isDegraded,
  pointCloud,
  gridData,
}: DashboardProps) {
  const totalSpeedMs = Math.sqrt(
    data.speedNorth * data.speedNorth +
    data.speedEast * data.speedEast
  );
  const totalSpeedKn = Number.isFinite(totalSpeedMs) ? totalSpeedMs * 1.94384 : NaN;

  return (
    <main className="dashboard full-view">
      {isDegraded && (
        <div className="degradation-banner">
          ⚠ 通信链路不稳定 — 连续报文异常，仪表盘数据可能滞后
        </div>
      )}

      <section className="panel panel-left">
        <div className="panel-title">深度</div>
        <DepthGauge depth={data.depth} />
      </section>

      <section className="panel panel-center">
        <div className="panel-row">
          <div className="panel-title">姿态与航向</div>
          <AttitudeIndicator
            heading={data.heading}
            pitch={data.pitch}
            roll={data.roll}
            size={320}
          />
        </div>

        <div className={`data-panel${isStale ? ' stale' : ''}`}>
          <div className="data-card">
            <div className="data-label">艏向 HEADING</div>
            <div className="data-value">
              {safeToFixed(data.heading, 1)}<span className="data-unit">°</span>
            </div>
            <div className="data-sub">陀螺仪 · Gyro Compass</div>
          </div>
          <div className="data-card">
            <div className="data-label">深度 DEPTH</div>
            <div className="data-value">
              {safeToFixed(data.depth, 2)}<span className="data-unit">m</span>
            </div>
            <div className="data-sub">{safeToFixed(data.depthFeet, 1)} ft</div>
          </div>
          <div className="data-card">
            <div className="data-label">对水速 SPEED</div>
            <div className="data-value">
              {safeToFixed(totalSpeedKn, 2)}<span className="data-unit">kn</span>
            </div>
            <div className="data-sub">{safeToFixed(totalSpeedMs, 2)} m/s</div>
          </div>
          <div className="data-card">
            <div className="data-label">水温 TEMP</div>
            <div className="data-value">
              {safeToFixed(data.waterTemp, 1)}<span className="data-unit">°C</span>
            </div>
            <div className="data-sub">CTD · {safeToFixed(data.waterTemp * 9 / 5 + 32, 1)} °F</div>
          </div>
          <div className="data-card">
            <div className="data-label">横摇 ROLL</div>
            <div className="data-value">
              {safeToFixed(data.roll, 1)}<span className="data-unit">°</span>
            </div>
            <div className="data-sub">俯仰 {safeToFixed(data.pitch, 1)}° Pitch</div>
          </div>
          <div className="data-card">
            <div className="data-label">下降率 VD</div>
            <div className="data-value">
              {safeToFixed(data.speedDown * 60, 2)}<span className="data-unit">m/min</span>
            </div>
            <div className="data-sub">{safeToFixed(data.speedDown, 3)} m/s</div>
          </div>
        </div>
      </section>

      <section className="panel panel-right">
        <div className="panel-title">速度矢量</div>
        <SpeedVector
          speedNorth={data.speedNorth}
          speedEast={data.speedEast}
          speedDown={data.speedDown}
          size={320}
        />
      </section>

      <section className="panel panel-bottom">
        <div className="panel-title">
          <span>🌊 海底地形实时探查</span>
          <span className="panel-sub">多波束测深 · 实时网格重建</span>
        </div>
        <ErrorBoundary>
          <TerrainExplorer
            gridData={gridData}
            points={pointCloud}
            heading={data.heading}
            pitch={data.pitch}
            roll={data.roll}
            width={640}
            height={440}
            showWireframe
          />
        </ErrorBoundary>
        <div className="terrain-legend">
          <div className="legend-label">浅</div>
          <div className="legend-bar">
            <div className="legend-gradient" />
          </div>
          <div className="legend-label">深</div>
        </div>
      </section>
    </main>
  );
}

export type { DashboardProps };
