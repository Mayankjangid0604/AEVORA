'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';

export type QualityTier = 'CINEMATIC_ULTRA' | 'BALANCED' | 'PERFORMANCE' | 'BATTERY_SAVER';

export interface QualitySettings {
  tier: QualityTier;
  label: string;
  dpr: number;
  shadows: boolean;
  shadowMapSize: number;
  softShadows: boolean;
  avatarArticulation: boolean;
  ambientParticles: boolean;
  reflectionPasses: boolean;
  updateFrequency: number; // 1 = every frame, 2 = every 2nd frame
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  CINEMATIC_ULTRA: {
    tier: 'CINEMATIC_ULTRA',
    label: 'Cinematic Ultra (60+ FPS)',
    dpr: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    avatarArticulation: true,
    ambientParticles: true,
    reflectionPasses: true,
    updateFrequency: 1,
  },
  BALANCED: {
    tier: 'BALANCED',
    label: 'Balanced (High Fidelity)',
    dpr: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    softShadows: false,
    avatarArticulation: true,
    ambientParticles: false,
    reflectionPasses: false,
    updateFrequency: 1,
  },
  PERFORMANCE: {
    tier: 'PERFORMANCE',
    label: 'Performance (Adaptive)',
    dpr: 0.9,
    shadows: true,
    shadowMapSize: 512,
    softShadows: false,
    avatarArticulation: false,
    ambientParticles: false,
    reflectionPasses: false,
    updateFrequency: 2,
  },
  BATTERY_SAVER: {
    tier: 'BATTERY_SAVER',
    label: 'Battery Saver / Low Power',
    dpr: 0.75,
    shadows: false,
    shadowMapSize: 256,
    softShadows: false,
    avatarArticulation: false,
    ambientParticles: false,
    reflectionPasses: false,
    updateFrequency: 2,
  },
};

export interface PerformanceMetrics {
  fps: number;
  frameDeltaMs: number;
  activeTier: QualityTier;
  isAuto: boolean;
  contextLost: boolean;
}

interface PerformanceContextValue {
  metrics: PerformanceMetrics;
  settings: QualitySettings;
  setManualTier: (tier: QualityTier | 'AUTO') => void;
  selectedTierMode: QualityTier | 'AUTO';
  reportFrameTime: (deltaMs: number) => void;
  notifyContextLost: () => void;
  notifyContextRestored: () => void;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export function useAdaptivePerformance() {
  const ctx = useContext(PerformanceContext);
  if (!ctx) {
    // Graceful fallback if used outside provider
    return {
      metrics: {
        fps: 60,
        frameDeltaMs: 16.6,
        activeTier: 'BALANCED' as QualityTier,
        isAuto: true,
        contextLost: false,
      },
      settings: QUALITY_PRESETS.BALANCED,
      setManualTier: () => {},
      selectedTierMode: 'AUTO' as const,
      reportFrameTime: () => {},
      notifyContextLost: () => {},
      notifyContextRestored: () => {},
    };
  }
  return ctx;
}

export interface AdaptivePerformanceProviderProps {
  children: React.ReactNode;
  initialTierMode?: QualityTier | 'AUTO';
}

export function AdaptivePerformanceProvider({
  children,
  initialTierMode = 'AUTO',
}: AdaptivePerformanceProviderProps) {
  const [selectedTierMode, setSelectedTierMode] = useState<QualityTier | 'AUTO'>(initialTierMode);
  const [activeTier, setActiveTier] = useState<QualityTier>('BALANCED');
  const [fps, setFps] = useState<number>(60);
  const [frameDeltaMs, setFrameDeltaMs] = useState<number>(16.6);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Hysteresis counters to prevent flickering between tiers
  const slowFrameCount = useRef<number>(0);
  const fastFrameCount = useRef<number>(0);
  const lastSampleTime = useRef<number>(0);
  const frameCounter = useRef<number>(0);

  // WebGL context loss listener
  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
      console.warn('[AEVORA SPATIAL] WebGL Context lost. Entering recovery mode.');
    };

    const handleContextRestored = () => {
      setContextLost(false);
      console.info('[AEVORA SPATIAL] WebGL Context restored.');
    };

    window.addEventListener('webglcontextlost', handleContextLost);
    window.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      window.removeEventListener('webglcontextlost', handleContextLost);
      window.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  const reportFrameTime = (deltaMs: number) => {
    frameCounter.current++;
    const now = performance.now();
    if (lastSampleTime.current === 0) {
      lastSampleTime.current = now;
      return;
    }

    // Sample every 500ms
    if (now - lastSampleTime.current >= 500) {
      const elapsed = (now - lastSampleTime.current) / 1000;
      const currentFps = Math.round(frameCounter.current / elapsed);
      setFps(currentFps);
      setFrameDeltaMs(Math.round(deltaMs * 10) / 10);
      frameCounter.current = 0;
      lastSampleTime.current = now;

      // Only perform adaptive scaling if in AUTO mode
      if (selectedTierMode === 'AUTO') {
        if (currentFps < 32) {
          slowFrameCount.current++;
          fastFrameCount.current = 0;
          // Step down after 3 consecutive degraded samples (~1.5s)
          if (slowFrameCount.current >= 3) {
            setActiveTier((prev) => {
              if (prev === 'CINEMATIC_ULTRA') return 'BALANCED';
              if (prev === 'BALANCED') return 'PERFORMANCE';
              if (prev === 'PERFORMANCE') return 'BATTERY_SAVER';
              return prev;
            });
            slowFrameCount.current = 0;
          }
        } else if (currentFps >= 55) {
          fastFrameCount.current++;
          slowFrameCount.current = 0;
          // Step up cautiously after 8 consecutive stable fast samples (~4.0s)
          if (fastFrameCount.current >= 8) {
            setActiveTier((prev) => {
              if (prev === 'BATTERY_SAVER') return 'PERFORMANCE';
              if (prev === 'PERFORMANCE') return 'BALANCED';
              if (prev === 'BALANCED') return 'CINEMATIC_ULTRA';
              return prev;
            });
            fastFrameCount.current = 0;
          }
        } else {
          slowFrameCount.current = 0;
          fastFrameCount.current = 0;
        }
      }
    }
  };

  const effectiveTier = selectedTierMode === 'AUTO' ? activeTier : selectedTierMode;
  const settings = useMemo(() => QUALITY_PRESETS[effectiveTier], [effectiveTier]);

  const notifyContextLost = () => {
    setContextLost(true);
    console.warn('[AEVORA SPATIAL] WebGL Context lost detected on canvas. Entering recovery mode.');
  };

  const notifyContextRestored = () => {
    setContextLost(false);
    console.info('[AEVORA SPATIAL] WebGL Context restored on canvas.');
  };

  const value: PerformanceContextValue = {
    metrics: {
      fps,
      frameDeltaMs,
      activeTier: effectiveTier,
      isAuto: selectedTierMode === 'AUTO',
      contextLost,
    },
    settings,
    setManualTier: (mode) => {
      setSelectedTierMode(mode);
      if (mode !== 'AUTO') {
        setActiveTier(mode);
      }
    },
    selectedTierMode,
    reportFrameTime,
    notifyContextLost,
    notifyContextRestored,
  };

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
}

/**
 * Inside-Canvas hook monitoring actual R3F render frame times and canvas context loss
 */
export function PerformanceMonitor() {
  const { reportFrameTime, notifyContextLost, notifyContextRestored } = useAdaptivePerformance();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCanvasContextLost = (e: Event) => {
      e.preventDefault(); // Standard WebGL requirement to allow context restoration
      notifyContextLost();
    };

    const handleCanvasContextRestored = () => {
      notifyContextRestored();
    };

    window.addEventListener('webglcontextlost', handleCanvasContextLost, true);
    window.addEventListener('webglcontextrestored', handleCanvasContextRestored, true);

    return () => {
      window.removeEventListener('webglcontextlost', handleCanvasContextLost, true);
      window.removeEventListener('webglcontextrestored', handleCanvasContextRestored, true);
    };
  }, [notifyContextLost, notifyContextRestored]);

  useFrame((_, delta) => {
    reportFrameTime(delta * 1000);
  });

  return null;
}
