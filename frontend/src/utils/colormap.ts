export function depthToColor(depth: number, minDepth: number, maxDepth: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (depth - minDepth) / (maxDepth - minDepth + 0.001)));

  if (t < 0.2) {
    const k = t / 0.2;
    return lerpColor([0.0, 0.28, 0.55], [0.0, 0.5, 0.75], k);
  } else if (t < 0.4) {
    const k = (t - 0.2) / 0.2;
    return lerpColor([0.0, 0.5, 0.75], [0.1, 0.75, 0.65], k);
  } else if (t < 0.6) {
    const k = (t - 0.4) / 0.2;
    return lerpColor([0.1, 0.75, 0.65], [0.65, 0.85, 0.3], k);
  } else if (t < 0.8) {
    const k = (t - 0.6) / 0.2;
    return lerpColor([0.65, 0.85, 0.3], [1.0, 0.85, 0.2], k);
  } else {
    const k = (t - 0.8) / 0.2;
    return lerpColor([1.0, 0.85, 0.2], [0.95, 0.35, 0.2], k);
  }
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function depthToHex(depth: number, minDepth: number, maxDepth: number): string {
  const [r, g, b] = depthToColor(depth, minDepth, maxDepth);
  const toHex = (v: number) => Math.floor(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const COLORMAP_STOPS = [
  { depth: 0, color: '#00478c', label: '浅' },
  { depth: 0.25, color: '#0077bf' },
  { depth: 0.5, color: '#1ab3a1' },
  { depth: 0.75, color: '#e6b800' },
  { depth: 1, color: '#f25a33', label: '深' },
];
