// src/components/Header.tsx
// App header: connection dot, uptime (rAF), last-update pill, latency, fallback badge

import { useEffect, useRef, useState } from 'react';
import { useApexStore } from '../store/apexStore';


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
    voiceAlertMuted, setVoiceAlertMuted, machines,
  } = useApexStore();

  // Is any machine currently CRITICAL?
  const hasCritical = Object.values(machines).some(m => m.urgency.level === 'CRITICAL');

  function stopVoiceAlert() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setVoiceAlertMuted(true);
  }

  function unmuteVoiceAlert() {
    setVoiceAlertMuted(false);
  }

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
        flexDirection: 'column',
        padding: 0,
        borderBottom: '1px solid var(--apex-border)',
        borderRadius: 0,
        background: 'rgba(8,12,22,0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 50,
      }}
    >
      {/* ── CRITICAL voice alert banner ──────────────────────────────────── */}
      {hasCritical && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 20px',
            background: 'rgba(255, 45, 45, 0.15)',
            borderBottom: '1px solid rgba(255, 45, 45, 0.35)',
            animation: 'critical-pulse-bg 1.5s ease-in-out infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🚨</span>
            <span style={{ fontSize: 12, color: '#FF6B6B', fontWeight: 700 }}>
              CRITICAL ALERT —&nbsp;
              {Object.values(machines)
                .filter(m => m.urgency.level === 'CRITICAL')
                .map(m => m.machine_id.replace('engine_', 'Engine '))
                .join(', ')}
              &nbsp;require immediate attention
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!voiceAlertMuted ? (
              <button
                onClick={stopVoiceAlert}
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(255,45,45,0.25)',
                  border: '1px solid rgba(255,45,45,0.5)',
                  color: '#FF6B6B',
                  borderRadius: 6,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                title="Stop voice alert and mute further CRITICAL announcements"
              >
                🔇 Stop Alert
              </button>
            ) : (
              <button
                onClick={unmuteVoiceAlert}
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(100,100,100,0.2)',
                  border: '1px solid #555',
                  color: '#aaa',
                  borderRadius: 6,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                title="Re-enable voice alerts"
              >
                🔊 Unmute
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main header row ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56 }}>
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
      </div>  {/* end main header row */}
    </header>
  );
}
