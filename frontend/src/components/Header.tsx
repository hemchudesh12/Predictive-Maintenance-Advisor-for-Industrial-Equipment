import { useEffect, useRef, useState } from 'react';
import { useApexStore } from '../store/apexStore';
import { Settings } from 'lucide-react';

export function Header() {
  const {
    connectionState, backendHealth, lastFrameTime, machines,
  } = useApexStore();

  const dynamicFleetStats = Object.values(machines).reduce(
    (acc, m) => {
      const lvl = m.urgency.level.toLowerCase();
      if (lvl in acc) acc[lvl as keyof typeof acc] += 1;
      return acc;
    },
    { critical: 0, warning: 0, monitor: 0, healthy: 0 } as Record<string, number>
  );

  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  const elapsedMs = lastFrameTime > 0 ? Math.max(0, now - lastFrameTime) : null;
  const elapsedSec = elapsedMs != null ? elapsedMs / 1000 : null;

  const isLive = connectionState === 'connected' && elapsedSec !== null && elapsedSec < 2;
  const latencyStr = backendHealth.p99_latency_ms ? `${(backendHealth.p99_latency_ms / 1000).toFixed(1)}s` : '0.1s';
  const machineCount = Object.keys(machines).length;

  return (
    <header
      style={{
        height: 56,
        background: 'var(--bg-surface-1)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        justifyContent: 'space-between',
        zIndex: 50,
      }}
    >
      {/* ── Left: Logo ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-h2" style={{ color: 'var(--text-primary)' }}>⚡ APEX</span>
        <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>
          Predictive Maintenance
        </span>
      </div>

      {/* ── Center: Live Status ─────────────────────────────────────────────── */}
      <div 
        className="flex items-center gap-2"
        style={{
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-default)',
          padding: '4px 12px',
          borderRadius: 16,
        }}
      >
        <div className={`dot ${isLive ? 'dot-healthy' : 'dot-critical'}`} />
        <span className="text-label">
          {connectionState === 'connected' ? `Live · ${machineCount} machines · latency ${latencyStr}` : 'Connecting...'}
        </span>
      </div>

      {/* ── Right: Fleet Summary & Settings ─────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-label">
          <span style={{ color: 'var(--healthy)' }}>
            {dynamicFleetStats.healthy} healthy
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>·</span>
          <span style={{ color: 'var(--monitor)' }}>
            {dynamicFleetStats.monitor} monitor
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>·</span>
          <span style={{ color: 'var(--warning)' }}>
            {dynamicFleetStats.warning} warning
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>·</span>
          <span style={{ color: 'var(--critical)' }}>
            {dynamicFleetStats.critical} critical
          </span>
        </div>
        
        <div style={{ width: 1, height: 16, background: 'var(--border-default)' }} />
        
        <button 
          className="btn" 
          style={{ padding: '6px', background: 'transparent', border: 'transparent' }}
          title="Settings"
        >
          <Settings size={16} stroke="var(--text-secondary)" />
        </button>
      </div>
    </header>
  );
}
