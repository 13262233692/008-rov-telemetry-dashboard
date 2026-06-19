import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { depthToColor } from '../utils/colormap';

export interface PointCloudPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export interface GridData {
  size: number;
  spacing: number;
  heights: (number | null)[][];
}

interface TerrainExplorerProps {
  gridData: GridData | null;
  points: PointCloudPoint[];
  heading: number;
  pitch: number;
  roll: number;
  width?: number;
  height?: number;
  showPoints?: boolean;
  showWireframe?: boolean;
}

export default function TerrainExplorer({
  gridData,
  points,
  heading,
  pitch,
  roll,
  width = 520,
  height = 420,
  showPoints = false,
  showWireframe = true,
}: TerrainExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const wireframeRef = useRef<THREE.LineSegments | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const rovMarkerRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const minMaxRef = useRef({ min: 5, max: 80 });

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1628);
    scene.fog = new THREE.FogExp2(0x0a1628, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 55, 75);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 15;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI / 2.1;
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0x405060, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(50, 80, 40);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x3388ff, 0.6, 200);
    pointLight.position.set(0, 40, 0);
    scene.add(pointLight);

    const gridHelper = new THREE.GridHelper(200, 40, 0x1a3a5c, 0x0d2030);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    const geomSize = 90;
    const geomSegs = 60;
    const geometry = new THREE.PlaneGeometry(geomSize, geomSize, geomSegs, geomSegs);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      metalness: 0.05,
      roughness: 0.85,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;

    const wireGeom = new THREE.WireframeGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x58a6ff, opacity: 0.25, transparent: true });
    const wireframe = new THREE.LineSegments(wireGeom, wireMat);
    wireframe.visible = showWireframe;
    scene.add(wireframe);
    wireframeRef.current = wireframe;

    const pointsGeom = new THREE.BufferGeometry();
    const pointsMat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });
    const pointsMesh = new THREE.Points(pointsGeom, pointsMat);
    pointsMesh.visible = showPoints;
    scene.add(pointsMesh);
    pointsRef.current = pointsMesh;

    const rovGroup = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(4, 1.2, 2.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, metalness: 0.3, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    rovGroup.add(body);
    const propGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 16);
    const propMat = new THREE.MeshStandardMaterial({ color: 0xffd43b });
    const prop1 = new THREE.Mesh(propGeom, propMat);
    prop1.position.set(-2.2, 0, 0);
    prop1.rotation.z = Math.PI / 2;
    rovGroup.add(prop1);
    const prop2 = new THREE.Mesh(propGeom, propMat);
    prop2.position.set(2.2, 0, 0);
    prop2.rotation.z = Math.PI / 2;
    rovGroup.add(prop2);
    const lightGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x69db7c });
    const statusLight = new THREE.Mesh(lightGeom, lightMat);
    statusLight.position.set(0, 1, 0);
    rovGroup.add(statusLight);
    rovGroup.position.y = 3;
    scene.add(rovGroup);
    rovMarkerRef.current = rovGroup;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      controls.dispose();
      geometry.dispose();
      material.dispose();
      wireGeom.dispose();
      wireMat.dispose();
      pointsGeom.dispose();
      pointsMat.dispose();
      bodyGeom.dispose();
      bodyMat.dispose();
      propGeom.dispose();
      propMat.dispose();
      lightGeom.dispose();
      lightMat.dispose();
      renderer.dispose();
    };
  }, [width, height, showPoints, showWireframe]);

  useEffect(() => {
    if (!gridData || !meshRef.current) return;

    const mesh = meshRef.current;
    const geometry = mesh.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const seg = geometry.parameters.widthSegments;
    const size = gridData.size;

    let minD = Infinity, maxD = -Infinity;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const d = gridData.heights[i][j];
        if (d !== null && Number.isFinite(d)) {
          if (d < minD) minD = d;
          if (d > maxD) maxD = d;
        }
      }
    }
    if (!Number.isFinite(minD) || !Number.isFinite(maxD)) return;
    minMaxRef.current = { min: minD, max: maxD };

    const colors = new Float32Array(positions.count * 3);

    for (let i = 0; i <= seg; i++) {
      for (let j = 0; j <= seg; j++) {
        const idx = i * (seg + 1) + j;
        const gi = Math.floor((i / seg) * (size - 1));
        const gj = Math.floor((j / seg) * (size - 1));
        const gi2 = Math.min(gi + 1, size - 1);
        const gj2 = Math.min(gj + 1, size - 1);
        const fi = (i / seg) * (size - 1) - gi;
        const fj = (j / seg) * (size - 1) - gj;

        const d00 = gridData.heights[gi]?.[gj] ?? null;
        const d10 = gridData.heights[gi2]?.[gj] ?? null;
        const d01 = gridData.heights[gi]?.[gj2] ?? null;
        const d11 = gridData.heights[gi2]?.[gj2] ?? null;

        let depth: number;
        if (d00 !== null && d10 !== null && d01 !== null && d11 !== null) {
          const dTop = d00 * (1 - fj) + d01 * fj;
          const dBot = d10 * (1 - fj) + d11 * fj;
          depth = dTop * (1 - fi) + dBot * fi;
        } else if (d00 !== null) {
          depth = d00;
        } else {
          depth = (minD + maxD) / 2;
        }

        positions.setY(idx, -depth);

        const [r, g, b] = depthToColor(depth, minD, maxD);
        colors[idx * 3] = r;
        colors[idx * 3 + 1] = g;
        colors[idx * 3 + 2] = b;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    if (wireframeRef.current) {
      const wireGeom = new THREE.WireframeGeometry(geometry);
      wireframeRef.current.geometry.dispose();
      wireframeRef.current.geometry = wireGeom;
    }
  }, [gridData]);

  useEffect(() => {
    if (!pointsRef.current || points.length === 0) return;

    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].z;
      positions[i * 3 + 2] = points[i].y;

      const depth = -points[i].z;
      const { min, max } = minMaxRef.current;
      const [r, g, b] = depthToColor(depth, min, max);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const geom = pointsRef.current.geometry;
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
  }, [points]);

  useEffect(() => {
    if (!rovMarkerRef.current) return;
    rovMarkerRef.current.rotation.y = -heading * Math.PI / 180;
    rovMarkerRef.current.rotation.z = -roll * Math.PI / 180;
    rovMarkerRef.current.rotation.x = pitch * Math.PI / 180;
  }, [heading, pitch, roll]);

  useEffect(() => {
    if (pointsRef.current) {
      pointsRef.current.visible = showPoints;
    }
  }, [showPoints]);

  useEffect(() => {
    if (wireframeRef.current) {
      wireframeRef.current.visible = showWireframe;
    }
  }, [showWireframe]);

  return (
    <div ref={containerRef} style={{ width, height, position: 'relative' }} />
  );
}
