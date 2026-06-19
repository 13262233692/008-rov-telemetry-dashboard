interface DepthGaugeProps {
  depth: number;
  maxDepth?: number;
  width?: number;
  height?: number;
}

export default function DepthGauge({
  depth,
  maxDepth = 100,
  width = 140,
  height = 480,
}: DepthGaugeProps) {
  const safeDepthVal = Number.isFinite(depth) ? Math.max(0, Math.min(maxDepth, depth)) : 0;
  const fillRatio = safeDepthVal / maxDepth;
  const padding = { top: 60, bottom: 50, left: 44, right: 30 };
  const barTop = padding.top;
  const barBottom = height - padding.bottom;
  const barHeight = barBottom - barTop;
  const barWidth = width - padding.left - padding.right;
  const barX = padding.left;
  const fillHeight = fillRatio * barHeight;
  const fillTop = barTop + (barHeight - fillHeight);

  const tickCount = 21;
  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const val = (maxDepth / (tickCount - 1)) * i;
    const y = barTop + (i / (tickCount - 1)) * barHeight;
    const major = i % 5 === 0;
    ticks.push({ val, y, major });
  }

  const waterColor = safeDepthVal / maxDepth;

  return (
    <div className="gauge depth-gauge" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="depthWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4dabf7" stopOpacity="0.15" />
            <stop offset={`${waterColor * 40}%`} stopColor="#339af0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#1864ab" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="depthBgGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#111827" />
            <stop offset="50%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
          <clipPath id="barClip">
            <rect x={barX} y={barTop} width={barWidth} height={barHeight} rx="4" />
          </clipPath>
          <filter id="depthGlow">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect x={4} y={4} width={width - 8} height={height - 8}
          rx="10" fill="#0d1117" stroke="#30363d" strokeWidth="2" />

        <text x={width / 2} y={28} fill="#8b949e" fontSize="12"
          textAnchor="middle" fontWeight="600" letterSpacing="1.5">深度 DEPTH</text>

        <rect x={barX - 4} y={barTop - 4} width={barWidth + 8} height={barHeight + 8}
          rx="6" fill="url(#depthBgGrad)" stroke="#4b5563" strokeWidth="1.5" />

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.major ? barX - 12 : barX - 7}
              y1={t.y}
              x2={barX + barWidth + (t.major ? 12 : 7)}
              y2={t.y}
              stroke={t.major ? '#9ca3af' : '#4b5563'}
              strokeWidth={t.major ? 1.5 : 1}
            />
            {t.major && (
              <>
                <text x={barX - 16} y={t.y + 4}
                  fill="#d1d5db" fontSize="10"
                  textAnchor="end" fontFamily="monospace" fontWeight="500">
                  {t.val.toFixed(0)}
                </text>
                <text x={barX + barWidth + 16} y={t.y + 4}
                  fill="#d1d5db" fontSize="10"
                  textAnchor="start" fontFamily="monospace" fontWeight="500">
                  {t.val.toFixed(0)}
                </text>
              </>
            )}
          </g>
        ))}

        <g clipPath="url(#barClip)">
          <rect x={barX} y={barTop} width={barWidth} height={barHeight}
            fill="url(#depthWater)" />
          {Array.from({ length: Math.floor(fillHeight / 10) }).map((_, i) => (
            <line key={i}
              x1={barX} y1={barBottom - i * 10}
              x2={barX + barWidth} y2={barBottom - i * 10}
              stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
          ))}
          <rect
            x={barX} y={fillTop - 2} width={barWidth} height="4"
            fill="#69db7c" filter="url(#depthGlow)"
            style={{ transition: 'y 80ms ease-out' }} />
        </g>

        <g style={{
          transform: `translateY(${fillTop - (barTop + barHeight / 2)}px)`,
          transformOrigin: `${width / 2}px ${barTop + barHeight / 2}px`,
          transition: 'transform 80ms ease-out',
        }}>
          <polygon
            points={`${barX - 22},${barTop + barHeight / 2 - 12} ${barX - 2},${barTop + barHeight / 2} ${barX - 22},${barTop + barHeight / 2 + 12}`}
            fill="#69db7c" stroke="#40c057" strokeWidth="1.5"
            filter="url(#depthGlow)" />
          <polygon
            points={`${barX + barWidth + 22},${barTop + barHeight / 2 - 12} ${barX + barWidth + 2},${barTop + barHeight / 2} ${barX + barWidth + 22},${barTop + barHeight / 2 + 12}`}
            fill="#69db7c" stroke="#40c057" strokeWidth="1.5"
            filter="url(#depthGlow)" />
        </g>

        <g>
          <rect x={width / 2 - 56} y={height - 46} width="112" height="36"
            rx="7" fill="#0d1117" stroke="#69db7c" strokeWidth="1.5" />
          <text x={width / 2} y={height - 22}
            fill="#69db7c" fontSize="18" fontWeight="700"
            textAnchor="middle" fontFamily="monospace" filter="url(#depthGlow)">
            {safeDepthVal.toFixed(2)} m
          </text>
        </g>
      </svg>
    </div>
  );
}
