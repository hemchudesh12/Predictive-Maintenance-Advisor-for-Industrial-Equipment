// src/components/Header.tsx
// App header: connection dot, uptime (rAF), last-update pill, latency, fallback badge

import { useEffect, useRef, useState } from 'react';
import { useApexStore } from '../store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function Header() {
  const {
    connectionState, backendHealth, lastFrameTime,
    fallbackMode, fleetStats, setEmailModal, setShortcutsModal,
  } = useApexStore();

  const [now, setNow] = useState(Date.now());
  const [uptimeOffset, setUptimeOffset] = useState(0); // seconds elapsed since last frame
  const rafRef = useRef<number>(0);
  const baseTimeRef = useRef<number>(Date.now());
  const baseUptimeRef = useRef<number>(0);

  // Sync uptime base whenever backend reports a new value
  useEffect(() => {
    baseUptimeRef.current = backendHealth.uptime_sec;
    baseTimeRef.current = Date.now();
  }, [backendHealth.uptime_sec]);

  // requestAnimationFrame ticker — smooth clock, no setState thrashing
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const t = Date.now();
      setNow(t);
      setUptimeOffset((t - baseTimeRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  const elapsedMs   = lastFrameTime > 0 ? Math.max(0, now - lastFrameTime) : null;
  const elapsedSec  = elapsedMs != null ? elapsedMs / 1000 : null;
  const liveUptime  = baseUptimeRef.current + uptimeOffset;

  const pillClass = elapsedSec === null     ? 'pill pill-stale'
    : elapsedSec < 2  ? 'pill pill-fresh'
    : elapsedSec < 6  ? 'pill pill-stale'
    : 'pill pill-dead';

  const pillLabel = elapsedSec === null       ? 'waiting…'
    : elapsedSec < 60   ? `${elapsedSec.toFixed(1)}s ago`
    : elapsedSec < 3600 ? `${Math.floor(elapsedSec / 60)}m ago`
    : `${(elapsedSec / 3600).toFixed(1)}h ago`;

  const dotClass = connectionState === 'connected'    ? 'dot dot-green'
    : connectionState === 'reconnecting' || connectionState === 'connecting'
      ? 'dot dot-amber'
    : 'dot dot-red';

  const dotLabel = connectionState === 'connected'    ? 'Live'
    : connectionState === 'reconnecting' ? 'Reconnecting…'
    : connectionState === 'connecting'   ? 'Connecting…'
    : 'Disconnected';

  const levelColors: Record<string, string> = {
    critical: 'var(--color-critical)',
    warning:  'var(--color-warning)',
    monitor:  'var(--color-monitor)',
    healthy:  'var(--color-healthy)',
  };

  return (
    <header
      className="app-header card--glass"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid var(--apex-border)',
        borderRadius: 0,
        background: 'rgba(8,12,22,0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 50,
      }}
    >
      {/* ── Left: brand ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span style={{
          fontSize: 18, fontWeight: 700,
          color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          letterSpacing: '-0.02em',
          textShadow: 'var(--accent-glow)',
        }}>
          ⚡ APEX
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          Predictive Maintenance
        </span>
        {fallbackMode && (
          <span className="badge badge-WARNING" style={{ marginLeft: 8, fontSize: 10 }}>
            FALLBACK MODE
          </span>
        )}
      </div>

      {/* ── Center: fleet stats ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4" style={{ fontSize: 12 }}>
        {(['critical', 'warning', 'monitor', 'healthy'] as const).map(level => (
          <span
            key={level}
            style={{ fontFamily: 'var(--font-mono)', color: levelColors[level] }}
            title={`${fleetStats[level]} ${level} machines`}
          >
            <span style={{ opacity: 0.5 }}>●</span>
            {' '}
            {fleetStats[level]} {level.charAt(0).toUpperCase() + level.slice(1)}
          </span>
        ))}
      </div>

      {/* ── Right: status indicators ───────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Last update pill */}
        {lastFrameTime > 0 && (
          <span className={pillClass}>{pillLabel}</span>
        )}

        {/* P99 latency */}
        {backendHealth.p99_latency_ms > 0 && (
          <span className="muted mono" style={{ fontSize: 11 }}>
            p99 {backendHealth.p99_latency_ms.toFixed(0)}ms
          </span>
        )}

        {/* Live uptime counter (increments every frame via rAF) */}
        {backendHealth.uptime_sec > 0 && (
          <span className="muted" style={{ fontSize: 11 }}>
            up {formatUptime(liveUptime)}
          </span>
        )}

        {/* Email alert button */}
        <button
          className="btn btn-danger"
          style={{ padding: '3px 10px', fontSize: 11 }}
          onClick={() => setEmailModal(true)}
          title="Send email alert"
          aria-label="Send email alert"
        >
          📧
        </button>

        {/* Connection dot */}
        <div className="flex items-center gap-1">
          <div className={dotClass} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dotLabel}</span>
        </div>

        {/* Shortcuts */}
        <button
          className="btn"
          style={{ padding: '3px 8px', fontSize: 11 }}
          onClick={() => setShortcutsModal(true)}
          title="Keyboard shortcuts (?)"
          aria-label="Open keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </header>
  );
}
