import AttitudeIndicator from './components/AttitudeIndicator';
import DepthGauge from './components/DepthGauge';
import SpeedVector from './components/SpeedVector';
import type { TelemetryData, ConnectionStatus } from '../types';

interface DashboardProps {
  data: TelemetryData;
  status: ConnectionStatus;
}

export default function Dashboard({ data, status }: DashboardProps) {
  const formatTime = (iso?: string | null) => {
    if (!iso) return '--:--:--';
    return iso.slice(11, 19);
  };

  const totalSpeedMs = Math.sqrt(
    data.speedNorth * data.speedNorth +
    data.speedEast * data.speedEast
  );
  const totalSpeedKn = totalSpeedMs * 1.94384;

  return (
    <main className="dashboard">
      <div className="dashboard-col-left">
        <DepthGauge depth={data.depth} />
      </div>

      <div className="dashboard-center">
        <AttitudeIndicator
          heading={data.heading}
          pitch={data.pitch}
          roll={data.roll}
          size={380}
        />
        <div className="data-panel">
          <div className="data-card">
            <div className="data-label">艏向 HEADING</div>
            <div className="data-value">
              {data.heading.toFixed(1)}<span className="data-unit">°</span>
            </div>
            <div className="data-sub">陀螺仪 · Gyro Compass</div>
          </div>
          <div className="data-card">
            <div className="data-label">深度 DEPTH</div>
            <div className="data-value">
              {data.depth.toFixed(2)}<span className="data-unit">m</span>
            </div>
            <div className="data-sub">{data.depthFeet.toFixed(1)} ft</div>
          </div>
          <div className="data-card">
            <div className="data-label">对水速 SPEED</div>
            <div className="data-value">
              {totalSpeedKn.toFixed(2)}<span className="data-unit">kn</span>
            </div>
            <div className="data-sub">{totalSpeedMs.toFixed(2)} m/s</div>
          </div>
          <div className="data-card">
            <div className="data-label">水温 TEMP</div>
            <div className="data-value">
              {data.waterTemp.toFixed(1)}<span className="data-unit">°C</span>
            </div>
            <div className="data-sub">CTD · {(data.waterTemp * 9 / 5 + 32).toFixed(1)} °F</div>
          </div>
          <div className="data-card">
            <div className="data-label">横摇 ROLL</div>
            <div className="data-value">
              {data.roll.toFixed(1)}<span className="data-unit">°</span>
            </div>
            <div className="data-sub">俯仰 {data.pitch.toFixed(1)}° Pitch</div>
          </div>
          <div className="data-card">
            <div className="data-label">下降率 VD</div>
            <div className="data-value">
              {(data.speedDown * 60).toFixed(2)}<span className="data-unit">m/min</span>
            </div>
            <div className="data-sub">{data.speedDown.toFixed(3)} m/s</div>
          </div>
        </div>
      </div>

      <div className="dashboard-col-right">
        <SpeedVector
          speedNorth={data.speedNorth}
          speedEast={data.speedEast}
          speedDown={data.speedDown}
          size={380}
        />
      </div>
    </main>
  );
}

export type { DashboardProps };
