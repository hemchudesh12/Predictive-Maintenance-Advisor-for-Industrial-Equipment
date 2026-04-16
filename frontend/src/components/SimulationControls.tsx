// src/components/SimulationControls.tsx
// Start / Stop the simulator subprocess via the backend API.
//
// Behavior:
//   • Engines do NOT start on page load — only on button click
//   • Stopping immediately freezes all values (WebSocket gate in useWebSocket.ts)
//   • localStorage remembers the last button state across refreshes
//   • Speed-scaled health jitter: when running, a frontend interval fires synthetic
//     RUL noise that scales with the current replay speed (faster = more erratic)

import { useEffect, useRef, useState } from 'react';
import { useApexStore } from '../store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const LS_KEY   = 'apex_sim_running';

// ── Speed-scaled jitter ───────────────────────────────────────────────────────
// Adds realistic noise to HEALTHY machine RUL values in the frontend so the
// user can see clear variation between 1x (tiny drift) and 100x (wide swings).
// The backend simulator also advances dataset rows faster at high speed, giving
// model-level variation in addition to this display-level jitter.

function applySpeedJitter(speedFactor: number) {
  const store    = useApexStore.getState();
  const machines = store.machines;
  if (!store.simRunning || Object.keys(machines).length === 0) return;

  // Jitter amplitude scales with speed: 1x → ±0.5 RUL, 100x → ±8 RUL
  const amplitude = Math.min(8, 0.5 + (speedFactor - 1) * 0.075);

  const patched: typeof machines = {};
  for (const [id, m] of Object.entries(machines)) {
    // Only jitter HEALTHY and MONITOR machines — don't touch WARNING/CRITICAL scores
    if (m.urgency.level !== 'HEALTHY' && m.urgency.level !== 'MONITOR') {
      patched[id] = m;
      continue;
    }
    const noise = (Math.random() * 2 - 1) * amplitude;
    patched[id] = {
      ...m,
      rul_mean:      Math.max(0, m.rul_mean + noise),
      rul_lower_95:  Math.max(0, m.rul_lower_95 + noise * 0.8),
      rul_upper_95:  Math.max(0, m.rul_upper_95 + noise * 1.1),
    };
  }

  // Direct store patch — bypasses applyFrame so it doesn't affect history
  useApexStore.setState({ machines: patched });
}

export function SimulationControls() {
  const { simRunning, setSimRunning, speedFactor, addToast } = useApexStore();
  const [pending, setPending] = useState(false);
  const jitterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore persisted state on mount ────────────────────────────────────
  // Check the backend to confirm whether the sim process is actually alive.
  // Never auto-start — only read and reflect state.
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === 'true') {
      fetch(`${API_BASE}/simulation/status`)
        .then(r => r.json())
        .then(data => {
          if (data.sim_running) {
            setSimRunning(true);   // process survived — mark as running
          } else {
            // Process died (server restart etc.) — clear stale flag
            setSimRunning(false);
            localStorage.setItem(LS_KEY, 'false');
          }
        })
        .catch(() => { /* backend starting up — ignore */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speed-scaled jitter interval ─────────────────────────────────────────
  // Runs only while simulation is active. Re-created whenever speedFactor changes.
  // Interval frequency also scales: 1x = every 2s, 100x = every 200ms
  useEffect(() => {
    // Clear any previous interval first (avoids leaks on speed change or stop)
    if (jitterRef.current) {
      clearInterval(jitterRef.current);
      jitterRef.current = null;
    }

    if (!simRunning) return; // stopped — do nothing

    // Interval fires more frequently at higher speeds
    const intervalMs = Math.max(150, 2000 / speedFactor);
    jitterRef.current = setInterval(() => {
      applySpeedJitter(speedFactor);
    }, intervalMs);

    return () => {
      if (jitterRef.current) {
        clearInterval(jitterRef.current);
        jitterRef.current = null;
      }
    };
  }, [simRunning, speedFactor]);

  // ── Start simulation ──────────────────────────────────────────────────────
  async function startSimulator() {
    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/start`, { method: 'POST' });
      if (res.ok) {
        setSimRunning(true);
        localStorage.setItem(LS_KEY, 'true');
        addToast({ type: 'success', message: '▶ Simulation started — engines 1-5 streaming' });
      } else {
        addToast({ type: 'error', message: `Failed to start simulation (${res.status})` });
      }
    } catch {
      addToast({ type: 'error', message: 'Could not reach backend to start simulation' });
    } finally {
      setPending(false);
    }
  }

  // ── Stop simulation ───────────────────────────────────────────────────────
  // Values are frozen in useWebSocket.ts (gate on simRunning).
  async function stopSimulator() {
    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/stop`, { method: 'POST' });
      if (res.ok) {
        setSimRunning(false);                   // gate closes immediately
        localStorage.setItem(LS_KEY, 'false');
        addToast({ type: 'warn', message: '⏹ Simulation stopped — values frozen' });
      } else {
        addToast({ type: 'error', message: `Failed to stop simulation (${res.status})` });
      }
    } catch {
      addToast({ type: 'error', message: 'Could not reach backend to stop simulation' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
        <span className="sidebar-label">SIMULATION</span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: simRunning ? 'var(--color-healthy)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: simRunning ? 'var(--color-healthy)' : '#444',
              display: 'inline-block',
              boxShadow: simRunning ? '0 0 6px var(--color-healthy)' : 'none',
              animation: simRunning ? 'pulse-ring 1.5s ease-in-out infinite' : 'none',
            }}
          />
          {simRunning ? 'LIVE' : 'STOPPED'}
        </span>
      </div>

      <button
        onClick={simRunning ? stopSimulator : startSimulator}
        disabled={pending}
        style={{
          width: '100%',
          padding: '10px 0',
          borderRadius: 8,
          border: `1.5px solid ${simRunning ? 'var(--color-warning)' : 'var(--accent)'}`,
          background: simRunning
            ? 'rgba(255,149,0,0.12)'
            : 'rgba(0,122,255,0.15)',
          color: simRunning ? '#FF9500' : 'var(--accent)',
          fontWeight: 700,
          fontSize: 13,
          cursor: pending ? 'wait' : 'pointer',
          letterSpacing: '0.04em',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
        aria-label={simRunning ? 'Stop simulation' : 'Start simulation'}
      >
        {pending ? (
          '⏳ Working…'
        ) : simRunning ? (
          <>⏹ Stop Simulation</>
        ) : (
          <>▶ Start Simulation</>
        )}
      </button>

      <div className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: 'center' }}>
        {simRunning
          ? `Engines 1-5 streaming · jitter ${speedFactor}x`
          : 'Values frozen — click to resume'}
      </div>
    </div>
  );
}
