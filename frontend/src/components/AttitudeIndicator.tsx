import { useMemo } from 'react';

interface AttitudeIndicatorProps {
  heading: number;
  pitch: number;
  roll: number;
  size?: number;
}

export default function AttitudeIndicator({
  heading,
  pitch,
  roll,
  size = 320,
}: AttitudeIndicatorProps) {
  const center = size / 2;
  const radius = center - 10;

  const pitchTicks = useMemo(() => {
    const ticks = [];
    for (let deg = -60; deg <= 60; deg += 10) {
      const width = deg % 30 === 0 ? 0.55 : deg % 20 === 0 ? 0.4 : 0.25;
      ticks.push({ deg, width, label: deg % 30 === 0 ? `${deg > 0 ? '+' : ''}${deg}` : '' });
    }
    return ticks;
  }, []);

  const compassTicks = useMemo(() => {
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const len = deg % 30 === 0 ? 0.14 : deg % 10 === 0 ? 0.1 : 0.05;
      const label = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90]
        : deg % 30 === 0 ? `${deg}` : '';
      ticks.push({ deg, len, label });
    }
    return ticks;
  }, []);

  const clampedPitch = Math.max(-60, Math.min(60, pitch));
  const pitchTranslate = (clampedPitch / 90) * (radius * 0.75);

  return (
    <div className="gauge attitude-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="skyGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e5a9c" />
            <stop offset="100%" stopColor="#0a2a4a" />
          </radialGradient>
          <radialGradient id="earthGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b6b3e" />
            <stop offset="100%" stopColor="#4a3a20" />
          </radialGradient>
          <clipPath id="ballClip">
            <circle cx={center} cy={center} r={radius * 0.9} />
          </clipPath>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={center} cy={center} r={radius + 4}
          fill="none" stroke="#1a1a2e" strokeWidth="8" />
        <circle cx={center} cy={center} r={radius}
          fill="#0d1117" stroke="#30363d" strokeWidth="2" />

        <g clipPath="url(#ballClip)">
          <g style={{
            transform: `rotate(${roll}deg)`,
            transformOrigin: `${center}px ${center}px`,
            transition: 'transform 80ms linear',
          }}>
            <g style={{
              transform: `translateY(${pitchTranslate}px)`,
              transition: 'transform 80ms linear',
            }}>
              <rect x={center - radius} y={center - radius * 2}
                width={radius * 2} height={radius * 2} fill="url(#skyGradient)" />
              <rect x={center - radius} y={center}
                width={radius * 2} height={radius * 2} fill="url(#earthGradient)" />
              <line x1={center - radius} y1={center}
                x2={center + radius} y2={center}
                stroke="#ffffff" strokeWidth="2.5" />
              {pitchTicks.map(t => {
                const y = center + (t.deg / 90) * (radius * 0.75);
                const w = t.width * radius;
                return (
                  <g key={t.deg}>
                    <line
                      x1={center - w} y1={y} x2={center + w} y2={y}
                      stroke="#ffffff" strokeWidth="1.5" opacity="0.85" />
                    {t.label && (
                      <>
                        <text x={center - w - 10} y={y + 4}
                          fill="#fff" fontSize="11" textAnchor="end"
                          fontFamily="monospace">{t.label}</text>
                        <text x={center + w + 10} y={y + 4}
                          fill="#fff" fontSize="11" textAnchor="start"
                          fontFamily="monospace">{t.label}</text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </g>

        <g filter="url(#glow)">
          <polygon
            points={`${center - radius * 0.55},${center - 6} ${center - 14},${center - 6} ${center - 14},${center + 6} ${center - radius * 0.55},${center + 6}`}
            fill="none" stroke="#ff4757" strokeWidth="3" />
          <polygon
            points={`${center + radius * 0.55},${center - 6} ${center + 14},${center - 6} ${center + 14},${center + 6} ${center + radius * 0.55},${center + 6}`}
            fill="none" stroke="#ff4757" strokeWidth="3" />
          <polygon
            points={`${center - 12},${center - 14} ${center},${center} ${center + 12},${center - 14}`}
            fill="#ffd43b" stroke="#ff4757" strokeWidth="2.5" />
          <circle cx={center} cy={center} r="5" fill="#ffd43b" stroke="#ff4757" strokeWidth="2" />
        </g>

        <g>
          {compassTicks.map((t, i) => {
            const rad = (t.deg - 90) * Math.PI / 180;
            const outer = radius - 3;
            const inner = radius * (1 - t.len);
            const lx1 = center + Math.cos(rad) * inner;
            const ly1 = center + Math.sin(rad) * inner;
            const lx2 = center + Math.cos(rad) * outer;
            const ly2 = center + Math.sin(rad) * outer;
            const tx = center + Math.cos(rad) * (radius * (1 - t.len - 0.07));
            const ty = center + Math.sin(rad) * (radius * (1 - t.len - 0.07));
            return (
              <g key={i}>
                <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                  stroke={t.deg % 30 === 0 ? '#58a6ff' : '#8b949e'} strokeWidth="1.5" />
                {t.label && (
                  <text x={tx} y={ty + 4}
                    fill={t.deg % 90 === 0 ? '#58a6ff' : '#c9d1d9'}
                    fontSize="12" fontWeight="600" textAnchor="middle"
                    fontFamily="monospace">{t.label}</text>
                )}
              </g>
            );
          })}
        </g>

        <polygon
          points={`${center},${center - radius - 4} ${center - 10},${center - radius - 20} ${center + 10},${center - radius - 20}`}
          fill="#ff6b6b" stroke="#ff4757" strokeWidth="2" />
        <g style={{
          transform: `rotate(${heading}deg)`,
          transformOrigin: `${center}px ${center}px`,
          transition: 'transform 60ms linear',
        }}>
          <polygon
            points={`${center},${center - radius * 0.78} ${center - 7},${center - radius * 0.85} ${center + 7},${center - radius * 0.85}`}
            fill="#58a6ff" />
        </g>

        <g>
          <rect x={center - 52} y={center + radius * 0.55} width="104" height="34"
            rx="6" fill="#0d1117" stroke="#30363d" strokeWidth="1.5" />
          <text x={center} y={center + radius * 0.55 + 22}
            fill="#58a6ff" fontSize="18" fontWeight="700" textAnchor="middle"
            fontFamily="monospace" filter="url(#glow)">
            {heading.toFixed(1).padStart(6, '0')}°
          </text>
        </g>

        <text x={center} y={26} fill="#8b949e" fontSize="13" textAnchor="middle"
          fontWeight="600" letterSpacing="2">姿态 ATTITUDE</text>
        <text x={center - radius * 0.85} y={center + radius * 0.95}
          fill="#8b949e" fontSize="11" fontFamily="monospace">
          P {pitch.toFixed(1)}°
        </text>
        <text x={center + radius * 0.85} y={center + radius * 0.95}
          fill="#8b949e" fontSize="11" fontFamily="monospace" textAnchor="end">
          R {roll.toFixed(1)}°
        </text>
      </svg>
    </div>
  );
}
