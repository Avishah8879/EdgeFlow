import { useEffect, useRef, useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Halvorsen attractor parameters
const A = 1.4;
const DT = 0.005;
const SCALE = 2.8;
const STEPS_PER_FRAME = 8;

// Performance-based particle count
function getParticleCount(): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency < 4 ? 40000 : 80000;
  }
  return 80000;
}

// Halvorsen derivative for RK4 integration
function halvorsenDerivative(x: number, y: number, z: number) {
  return {
    dx: -A * x - 4 * y - 4 * z - y * y,
    dy: -A * y - 4 * z - 4 * x - z * z,
    dz: -A * z - 4 * x - 4 * y - x * x,
  };
}

// Theme-specific configuration
interface ThemeConfig {
  fogColor: number;
  fogDensity: number;
  particleOpacity: number;
  gradientStart: string;
  gradientEnd: string;
}

const themeConfigs: Record<string, ThemeConfig> = {
  dark: {
    fogColor: 0x1b1b1b,
    fogDensity: 0.008,
    particleOpacity: 0.9,
    gradientStart: 'rgba(255, 163, 26, 1)',    // #ffa31a
    gradientEnd: 'rgba(255, 120, 0, 0.6)',     // brighter orange
  },
  light: {
    fogColor: 0xffffff,
    fogDensity: 0.012,
    particleOpacity: 0.5,
    gradientStart: 'rgba(255, 163, 26, 1)',    // #ffa31a
    gradientEnd: 'rgba(255, 140, 0, 0.6)',     // slightly brighter
  },
};

// Create particle texture with gradient
function createParticleTexture(config: ThemeConfig): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;

  const gradient = context.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, config.gradientStart);
  gradient.addColorStop(0.2, config.gradientEnd);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

export function HalvorsenAttractor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    positions: Float32Array;
    material: THREE.PointsMaterial;
    animationRef: { id: number };
    state: { x: number; y: number; z: number; pointIndex: number };
  } | null>(null);

  // RK4 step function
  const rk4Step = useCallback((state: { x: number; y: number; z: number }) => {
    const { x, y, z } = state;

    const f1 = halvorsenDerivative(x, y, z);
    const k1x = DT * f1.dx, k1y = DT * f1.dy, k1z = DT * f1.dz;

    const f2 = halvorsenDerivative(x + k1x / 2, y + k1y / 2, z + k1z / 2);
    const k2x = DT * f2.dx, k2y = DT * f2.dy, k2z = DT * f2.dz;

    const f3 = halvorsenDerivative(x + k2x / 2, y + k2y / 2, z + k2z / 2);
    const k3x = DT * f3.dx, k3y = DT * f3.dy, k3z = DT * f3.dz;

    const f4 = halvorsenDerivative(x + k3x, y + k3y, z + k3z);
    const k4x = DT * f4.dx, k4y = DT * f4.dy, k4z = DT * f4.dz;

    state.x += (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
    state.y += (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
    state.z += (k1z + 2 * k2z + 2 * k3z + k4z) / 6;

    // Reset if NaN (numerical instability)
    if (isNaN(state.x) || isNaN(state.y) || isNaN(state.z)) {
      state.x = 1.0;
      state.y = 0.0;
      state.z = 0.0;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Check for WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const container = containerRef.current;
    const theme = resolvedTheme || 'dark';
    const config = themeConfigs[theme] || themeConfigs.dark;
    const NUM_POINTS = getParticleCount();

    // Initialize or update scene
    if (!sceneRef.current) {
      // Create new scene
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(config.fogColor, config.fogDensity);

      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(20, 15, 40);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
      renderer.setClearColor(0x000000, 0); // Transparent background
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.update();

      // Create geometry and positions
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(NUM_POINTS * 3);

      // Initialize state
      const state = { x: 1.0, y: 0.0, z: 0.0, pointIndex: 0 };

      // Warm up the attractor
      for (let i = 0; i < 100; i++) {
        rk4Step(state);
      }

      // Initialize positions by running the attractor to fill the trail
      for (let i = 0; i < NUM_POINTS; i++) {
        rk4Step(state);
        positions[i * 3 + 0] = state.x * SCALE;
        positions[i * 3 + 1] = state.y * SCALE;
        positions[i * 3 + 2] = state.z * SCALE;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const texture = createParticleTexture(config);
      const material = new THREE.PointsMaterial({
        size: 0.25,
        map: texture,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true,
        opacity: config.particleOpacity,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      // Animation loop
      const animationRef = { id: 0 };
      const animate = () => {
        animationRef.id = requestAnimationFrame(animate);

        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          rk4Step(state);
          const i3 = state.pointIndex * 3;
          positions[i3 + 0] = state.x * SCALE;
          positions[i3 + 1] = state.y * SCALE;
          positions[i3 + 2] = state.z * SCALE;
          state.pointIndex = (state.pointIndex + 1) % NUM_POINTS;
        }

        geometry.attributes.position.needsUpdate = true;
        controls.update();
        renderer.render(scene, camera);
      };

      animate();

      // Store references
      sceneRef.current = {
        scene,
        camera,
        renderer,
        controls,
        points,
        geometry,
        positions,
        material,
        animationRef,
        state,
      };

      // Handle resize
      const handleResize = () => {
        if (!sceneRef.current) return;
        const { camera, renderer } = sceneRef.current;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize);

      // Cleanup function
      return () => {
        window.removeEventListener('resize', handleResize);
        if (sceneRef.current) {
          cancelAnimationFrame(sceneRef.current.animationRef.id);
          sceneRef.current.geometry.dispose();
          sceneRef.current.material.dispose();
          sceneRef.current.renderer.dispose();
          container.removeChild(sceneRef.current.renderer.domElement);
          sceneRef.current = null;
        }
      };
    } else {
      // Update existing scene for theme change
      const { scene, material } = sceneRef.current;

      // Update fog
      scene.fog = new THREE.FogExp2(config.fogColor, config.fogDensity);

      // Update material
      material.opacity = config.particleOpacity;

      // Update texture
      const newTexture = createParticleTexture(config);
      material.map?.dispose();
      material.map = newTexture;
      material.needsUpdate = true;
    }
  }, [resolvedTheme, rk4Step]);

  // Check for reduced motion and WebGL support for fallback
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    setShowFallback(prefersReducedMotion || !gl);
  }, []);

  if (showFallback) {
    return <div className="fixed inset-0 z-0 attractor-fallback" />;
  }

  return <div ref={containerRef} className="fixed inset-0 z-0" />;
}

