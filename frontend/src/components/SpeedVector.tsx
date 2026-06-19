import { useMemo } from 'react';

function safeNum(v: number, fallback: number = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

interface SpeedVectorProps {
  speedNorth: number;
  speedEast: number;
  speedDown?: number;
  size?: number;
}

export default function SpeedVector({
  speedNorth,
  speedEast,
  speedDown = 0,
  size = 300,
}: SpeedVectorProps) {
  const sn = safeNum(speedNorth);
  const se = safeNum(speedEast);
  const sd = safeNum(speedDown);
  const center = size / 2;
  const radius = center - 40;

  const { magnitude, angleDeg, knots, mps } = useMemo(() => {
    const mag = Math.sqrt(sn * sn + se * se);
    const ang = Math.atan2(se, sn) * 180 / Math.PI;
    return {
      magnitude: Number.isFinite(mag) ? mag : 0,
      angleDeg: Number.isFinite(ang) ? ang : 0,
      knots: Number.isFinite(mag) ? mag * 1.94384 : 0,
      mps: Number.isFinite(mag) ? mag : 0,
    };
  }, [sn, se]);

  const arrowLen = Math.min(magnitude * 35, radius - 14);
  const arrowRad = (angleDeg - 90) * Math.PI / 180;
  const tipX = center + Math.cos(arrowRad) * arrowLen;
  const tipY = center + Math.sin(arrowRad) * arrowLen;

  const rings = useMemo(() => [0.25, 0.5, 0.75, 1].map(f => f * radius), []);
  const maxSpeedKnots = Math.ceil(radius / 35 * 1.94384);

  const ringSpeeds = [0.25, 0.5, 0.75, 1].map(f => ({
    r: f * radius,
    label: `${(f * maxSpeedKnots).toFixed(1)}`,
  }));

  const dirTicks = useMemo(() => {
    const arr = [];
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 8; i++) {
      const deg = i * 45;
      const rad = (deg - 90) * Math.PI / 180;
      arr.push({ deg, rad, label: dirs[i] });
    }
    return arr;
  }, []);

  const speedColor = magnitude < 0.3 ? '#868e96'
    : magnitude < 0.8 ? '#51cf66'
    : magnitude < 1.5 ? '#fcc419'
    : '#ff6b6b';

  const headLen = 16;
  const headWidth = 10;
  const perpRad = arrowRad + Math.PI / 2;
  const backX = tipX - Math.cos(arrowRad) * headLen;
  const backY = tipY - Math.sin(arrowRad) * headLen;
  const headP1X = backX + Math.cos(perpRad) * headWidth;
  const headP1Y = backY + Math.sin(perpRad) * headWidth;
  const headP2X = backX - Math.cos(perpRad) * headWidth;
  const headP2Y = backY - Math.sin(perpRad) * headWidth;

  const tailX = center - Math.cos(arrowRad) * 8;
  const tailY = center - Math.sin(arrowRad) * 8;

  return (
    <div className="gauge speed-vector" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="speedBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1f2428" />
            <stop offset="100%" stopColor="#0d1117" />
          </radialGradient>
          <filter id="vectorGlow">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arrowMarker" markerWidth="10" markerHeight="10"
            refX="5" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill={speedColor} />
          </marker>
        </defs>

        <rect x={4} y={4} width={size - 8} height={size - 8}
          rx="14" fill="url(#speedBg)" stroke="#30363d" strokeWidth="2" />

        <text x={size / 2} y={28} fill="#8b949e" fontSize="12"
          textAnchor="middle" fontWeight="600" letterSpacing="1.5">速度矢量 VELOCITY</text>

        {rings.map((r, i) => (
          <circle key={i} cx={center} cy={center} r={r}
            fill="none" stroke={i === rings.length - 1 ? '#4b5563' : '#2d333b'}
            strokeWidth={i === rings.length - 1 ? 2 : 1}
            strokeDasharray={i < rings.length - 1 ? '4 3' : undefined} />
        ))}

        <line x1={center - radius} y1={center} x2={center + radius} y2={center}
          stroke="#3a3f47" strokeWidth="1" strokeDasharray="2 3" />
        <line x1={center} y1={center - radius} x2={center} y2={center + radius}
          stroke="#3a3f47" strokeWidth="1" strokeDasharray="2 3" />

        {ringSpeeds.slice(0, -1).map((rs, i) => (
          <text key={i}
            x={center + 4} y={center - rs.r + 10}
            fill="#6c757d" fontSize="9" fontFamily="monospace">
            {rs.label} kn
          </text>
        ))}

        {dirTicks.map(d => {
          const lx = center + Math.cos(d.rad) * (radius + 4);
          const ly = center + Math.sin(d.rad) * (radius + 4);
          const tx = center + Math.cos(d.rad) * (radius + 18);
          const ty = center + Math.sin(d.rad) * (radius + 18);
          const isCardinal = d.deg % 90 === 0;
          return (
            <g key={d.deg}>
              <line x1={center + Math.cos(d.rad) * radius}
                y1={center + Math.sin(d.rad) * radius}
                x2={lx} y2={ly}
                stroke={isCardinal ? '#58a6ff' : '#495057'}
                strokeWidth={isCardinal ? 2 : 1.5} />
              <text x={tx} y={ty + 4}
                fill={isCardinal ? '#58a6ff' : '#adb5bd'}
                fontSize={isCardinal ? 13 : 10}
                fontWeight={isCardinal ? 700 : 500}
                textAnchor="middle" fontFamily="monospace">
                {d.label}
              </text>
            </g>
          );
        })}

        <circle cx={center} cy={center} r="4" fill="#8b949e" />

        {magnitude > 0.02 && (
          <g filter="url(#vectorGlow)">
            <line x1={tailX} y1={tailY} x2={tipX} y2={tipY}
              stroke={speedColor} strokeWidth="4" strokeLinecap="round" />
            <polygon
              points={`${tipX},${tipY} ${headP1X},${headP1Y} ${headP2X},${headP2Y}`}
              fill={speedColor} />
          </g>
        )}

        <g>
          <rect x={size / 2 - 78} y={size - 82} width="156" height="58"
            rx="8" fill="#0d1117" stroke="#30363d" strokeWidth="1.5" />
          <text x={size / 2} y={size - 58}
            fill={speedColor} fontSize="20" fontWeight="800"
            textAnchor="middle" fontFamily="monospace" filter="url(#vectorGlow)">
            {knots.toFixed(2)} kn
          </text>
          <text x={size / 2 - 68} y={size - 36}
            fill="#9ca3af" fontSize="10" fontFamily="monospace">
            {mps.toFixed(2)} m/s
          </text>
          <text x={size / 2 + 68} y={size - 36}
            fill="#9ca3af" fontSize="10" fontFamily="monospace" textAnchor="end">
            {angleDeg.toFixed(0)}°
          </text>
          <text x={size / 2 - 68} y={size - 22}
            fill="#9ca3af" fontSize="10" fontFamily="monospace">
            Vd {sd.toFixed(3)} m/s
          </text>
        </g>
      </svg>
    </div>
  );
}
