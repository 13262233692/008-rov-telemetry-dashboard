import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    this.props.onError?.(error, info);
    console.error('[ErrorBoundary] Caught render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: 24, background: '#1a1a2e', color: '#ff6b6b',
          borderRadius: 12, textAlign: 'center', border: '1px solid #ff4757',
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>仪表盘渲染异常</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#8b949e' }}>
            数据流中检测到异常值，系统已自动降级保护
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: 12, padding: '8px 20px', background: '#58a6ff',
              color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            恢复渲染
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
