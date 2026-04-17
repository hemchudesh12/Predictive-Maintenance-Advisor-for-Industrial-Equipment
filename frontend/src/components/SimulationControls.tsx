import { useEffect, useState, useRef } from 'react';
import { useApexStore } from '../store/apexStore';
import { Play } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const LS_KEY = 'apex_simulation_running';

export function SimulationControls() {
  const { simRunning, setSimRunning, speedFactor, addToast, resetStore } = useApexStore();
  const [pending, setPending] = useState(false);
  const jitterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === 'true') {
      fetch(`${API_BASE}/simulation/status`)
        .then(r => r.json())
        .then(data => {
          if (data.sim_running) {
            setSimRunning(true);
          } else {
            setSimRunning(false);
            localStorage.setItem(LS_KEY, 'false');
          }
        })
        .catch(() => {});
    }
  }, [setSimRunning]);

  useEffect(() => {
    if (jitterRef.current) {
      clearInterval(jitterRef.current);
      jitterRef.current = null;
    }
    if (!simRunning) return;
    const intervalMs = Math.max(80, 1000 / speedFactor);
    jitterRef.current = setInterval(() => {
      // Stub to avoid applySpeedDecay import
    }, intervalMs);
    return () => {
      if (jitterRef.current) {
        clearInterval(jitterRef.current);
        jitterRef.current = null;
      }
    };
  }, [simRunning, speedFactor]);

  async function startSimulator() {
    setPending(true);
    resetStore();
    try {
      const res = await fetch(`${API_BASE}/simulation/start`, { method: 'POST' });
      if (res.ok) {
        setSimRunning(true);
        localStorage.setItem(LS_KEY, 'true');
        addToast({ type: 'success', message: '▶ Simulation started — engines streaming' });
      } else {
        addToast({ type: 'error', message: `Failed to start simulation (${res.status})` });
      }
    } catch {
      addToast({ type: 'error', message: 'Could not reach backend to start simulation' });
    } finally {
      setPending(false);
    }
  }

  async function stopSimulator() {
    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/simulation/stop`, { method: 'POST' });
      if (res.ok) {
        setSimRunning(false);
        localStorage.setItem(LS_KEY, 'false');
        addToast({ type: 'warn', message: '⏹ Simulation paused' });
      } else {
        addToast({ type: 'error', message: `Failed to pause simulation (${res.status})` });
      }
    } catch {
      addToast({ type: 'error', message: 'Could not reach backend' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <button
        onClick={simRunning ? stopSimulator : startSimulator}
        disabled={pending}
        className={`btn-cta ${simRunning ? 'active' : ''}`}
        aria-label={simRunning ? 'Pause simulation' : 'Start simulation'}
      >
        {pending ? (
          '⏳ Working…'
        ) : simRunning ? (
          <>
            <div className={`dot dot-healthy`} />
            Pause Simulation
          </>
        ) : (
          <>
            <Play size={16} fill="currentColor" />
            Start Simulation
          </>
        )}
      </button>
    </div>
  );
}
