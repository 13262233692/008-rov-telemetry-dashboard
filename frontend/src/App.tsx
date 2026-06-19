import { useTelemetry } from './hooks/useTelemetry';
import Dashboard from './components/Dashboard';

export default function App() {
  const { data, status } = useTelemetry('ws://localhost:8080');

  const timeStr = status.lastUpdate ?? '';
  const timeDisplay = timeStr ? timeStr.slice(11, 19) : '--:--:--';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"
                stroke="#ffffff" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="11" r="2.5" fill="#69db7c" />
              <line x1="12" y1="6" x2="12" y2="8.5" stroke="#ffffff" strokeWidth="1.8" />
            </svg>
          </div>
          <div className="brand-title">
            <h1>ROV 岸基监控系统</h1>
            <span>Deep-Sea Telemetry Dashboard</span>
          </div>
        </div>
        <div className="status-bar">
          <div className="status-item">
            <span className={`status-dot ${status.isConnected ? 'connected' : ''}`} />
            <span>连接状态</span>
            <span className="status-value">
              {status.isConnected ? '在线' : '重连中...'}
            </span>
          </div>
          <div className="status-item">
            <span>延迟</span>
            <span className="status-value">{status.latencyMs} ms</span>
          </div>
          <div className="status-item">
            <span>最后更新</span>
            <span className="status-value">{timeDisplay} UTC</span>
          </div>
          <div className="status-item">
            <span>模式</span>
            <span className="status-value">实时 RT</span>
          </div>
        </div>
      </header>
      <Dashboard data={data} status={status} />
    </div>
  );
}
