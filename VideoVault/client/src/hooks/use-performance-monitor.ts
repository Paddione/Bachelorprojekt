import { useEffect, useRef, useState, useCallback } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage?: number;
  frameRate: number;
  scrollPerformance: number;
  componentCount: number;
  longTasks: number; // Count of long tasks (>50ms)
  scrollJank: number; // Frame drops during scroll
}

interface PerformanceThresholds {
  renderTime: number; // ms
  frameRate: number; // fps
  memoryUsage: number; // MB
}

const IS_TEST_ENV =
  typeof process !== 'undefined' && (process.env.VITEST || process.env.NODE_ENV === 'test');

export function usePerformanceMonitor(
  componentName: string,
  thresholds: Partial<PerformanceThresholds> = {},
) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    frameRate: 60,
    scrollPerformance: 0,
    componentCount: 0,
    longTasks: 0,
    scrollJank: 0,
  });

  const [warnings, setWarnings] = useState<string[]>([]);
  const renderStartTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const scrollStartTime = useRef<number>(0);
  const componentCountRef = useRef<number>(0);
  const longTaskCount = useRef<number>(0);
  const scrollJankCount = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);
  const lastScrollFrameTime = useRef<number>(0);

  const defaultThresholds: PerformanceThresholds = {
    renderTime: 16, // 16ms = 60fps
    frameRate: 30, // minimum acceptable frame rate
    memoryUsage: 100, // 100MB warning threshold
  };

  const finalThresholds = useRef({ ...defaultThresholds, ...thresholds });

  // Update thresholds when they change
  useEffect(() => {
    finalThresholds.current = { ...defaultThresholds, ...thresholds };
  }, [thresholds]);

  // Measure render performance
  const startRenderMeasure = useCallback(() => {
    renderStartTime.current = performance.now();
  }, []);

  const endRenderMeasure = useCallback(() => {
    const renderTime = performance.now() - renderStartTime.current;
    setMetrics((prev) => ({ ...prev, renderTime }));

    // Check for performance warnings
    if (renderTime > finalThresholds.current.renderTime) {
      const warning = `Render time (${renderTime.toFixed(2)}ms) exceeds threshold (${finalThresholds.current.renderTime}ms)`;
      setWarnings((prev) => Array.from(new Set([...prev, warning])));
    }
  }, []);

  // Measure frame rate with scroll jank detection
  const measureFrameRate = useCallback(() => {
    const now = performance.now();
    frameCount.current++;

    // Detect scroll jank (frame drops during scrolling)
    if (isScrollingRef.current) {
      const frameDelta = now - lastScrollFrameTime.current;
      if (lastScrollFrameTime.current > 0 && frameDelta > 32) {
        // >32ms = dropped frame at 60fps
        scrollJankCount.current++;
        setMetrics((prev) => ({ ...prev, scrollJank: scrollJankCount.current }));
      }
      lastScrollFrameTime.current = now;
    }

    if (now - lastFrameTime.current >= 1000) {
      // Measure every second
      const frameRate = Math.round((frameCount.current * 1000) / (now - lastFrameTime.current));
      setMetrics((prev) => ({ ...prev, frameRate }));

      if (frameRate < finalThresholds.current.frameRate) {
        const warning = `Frame rate (${frameRate}fps) below threshold (${finalThresholds.current.frameRate}fps)`;
        setWarnings((prev) => Array.from(new Set([...prev, warning])));
      }

      frameCount.current = 0;
      lastFrameTime.current = now;
    }
  }, []);

  // Measure memory usage (if available)
  const measureMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const memoryUsageMB = Math.round(memory.usedJSHeapSize / (1024 * 1024));
      setMetrics((prev) => ({ ...prev, memoryUsage: memoryUsageMB }));

      if (memoryUsageMB > finalThresholds.current.memoryUsage) {
        const warning = `Memory usage (${memoryUsageMB}MB) exceeds threshold (${finalThresholds.current.memoryUsage}MB)`;
        setWarnings((prev) => Array.from(new Set([...prev, warning])));
      }
    }
  }, []);

  // Measure scroll performance
  const startScrollMeasure = useCallback(() => {
    scrollStartTime.current = performance.now();
    isScrollingRef.current = true;
    lastScrollFrameTime.current = performance.now();
    scrollJankCount.current = 0; // Reset jank counter for this scroll session
  }, []);

  const endScrollMeasure = useCallback(() => {
    const scrollTime = performance.now() - scrollStartTime.current;
    setMetrics((prev) => ({ ...prev, scrollPerformance: scrollTime }));
    isScrollingRef.current = false;
  }, []);

  // Update component count
  const updateComponentCount = useCallback((count: number) => {
    componentCountRef.current = count;
    setMetrics((prev) => ({ ...prev, componentCount: count }));
  }, []);

  // Performance monitoring loop
  useEffect(() => {
    if (IS_TEST_ENV) {
      // In test/coverage runs, avoid starting RAF loops and intervals to prevent hangs
      return () => {};
    }
    let animationFrameId: number;
    let memoryIntervalId: NodeJS.Timeout;
    let performanceObserver: PerformanceObserver | null = null;

    const measureLoop = () => {
      measureFrameRate();
      animationFrameId = requestAnimationFrame(measureLoop);
    };

    // Start frame rate monitoring
    measureLoop();

    // Monitor memory usage every 5 seconds
    memoryIntervalId = setInterval(measureMemoryUsage, 5000);

    // Monitor long tasks for layout thrash detection
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              // Long task threshold
              longTaskCount.current++;
              setMetrics((prev) => ({ ...prev, longTasks: longTaskCount.current }));

              const warning = `Long task detected: ${entry.duration.toFixed(2)}ms (${entry.name})`;
              setWarnings((prev) => Array.from(new Set([...prev, warning])));
            }
          }
        });
        performanceObserver.observe({ entryTypes: ['longtask', 'measure'] });
      } catch (e) {
        // PerformanceObserver not supported or longtask not available
      }
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (memoryIntervalId) {
        clearInterval(memoryIntervalId);
      }
      if (performanceObserver) {
        performanceObserver.disconnect();
      }
    };
  }, [measureFrameRate, measureMemoryUsage]);

  // Auto-clear warnings after 10 seconds
  useEffect(() => {
    if (IS_TEST_ENV) return;
    if (warnings.length > 0) {
      const timeoutId = setTimeout(() => {
        setWarnings([]);
      }, 10000);

      return () => clearTimeout(timeoutId);
    }
  }, [warnings]);

  // Performance optimization suggestions
  const getOptimizationSuggestions = useCallback(() => {
    const suggestions: string[] = [];

    if (metrics.renderTime > finalThresholds.current.renderTime) {
      suggestions.push('Consider using React.memo() for expensive components');
      suggestions.push('Implement virtualization for large lists');
      suggestions.push('Use useCallback and useMemo for expensive calculations');
    }

    if (metrics.frameRate < finalThresholds.current.frameRate) {
      suggestions.push('Reduce DOM manipulation during animations');
      suggestions.push('Use CSS transforms instead of layout properties');
      suggestions.push('Implement debouncing for scroll events');
    }

    if (metrics.memoryUsage && metrics.memoryUsage > finalThresholds.current.memoryUsage) {
      suggestions.push('Check for memory leaks in useEffect cleanup');
      suggestions.push('Implement lazy loading for images and components');
      suggestions.push('Consider pagination for large datasets');
    }

    if (metrics.componentCount > 1000) {
      suggestions.push('Implement virtualization for large component trees');
      suggestions.push('Consider using React.lazy() for code splitting');
    }

    if (metrics.longTasks > 10) {
      suggestions.push('Break up long-running tasks into smaller chunks');
      suggestions.push('Use requestIdleCallback for non-critical work');
      suggestions.push('Profile with Chrome DevTools to identify bottlenecks');
    }

    if (metrics.scrollJank > 5) {
      suggestions.push('Reduce work during scroll events');
      suggestions.push('Use passive event listeners for scroll');
      suggestions.push('Defer non-critical updates until scroll ends');
    }

    return suggestions;
  }, [metrics]);

  // Performance report
  const getPerformanceReport = useCallback(() => {
    return {
      componentName,
      metrics,
      warnings,
      suggestions: getOptimizationSuggestions(),
      timestamp: new Date().toISOString(),
      thresholds: finalThresholds.current,
    };
  }, [componentName, metrics, warnings, getOptimizationSuggestions]);

  // Clear all warnings
  const clearWarnings = useCallback(() => {
    setWarnings([]);
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setMetrics({
      renderTime: 0,
      memoryUsage: 0,
      frameRate: 60,
      scrollPerformance: 0,
      componentCount: 0,
      longTasks: 0,
      scrollJank: 0,
    });
    setWarnings([]);
    longTaskCount.current = 0;
    scrollJankCount.current = 0;
  }, []);

  return {
    metrics,
    warnings,
    startRenderMeasure,
    endRenderMeasure,
    startScrollMeasure,
    endScrollMeasure,
    updateComponentCount,
    getOptimizationSuggestions,
    getPerformanceReport,
    clearWarnings,
    resetMetrics,
  };
}
