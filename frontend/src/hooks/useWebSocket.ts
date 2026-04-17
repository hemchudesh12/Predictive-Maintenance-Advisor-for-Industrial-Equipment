// src/hooks/useWebSocket.ts
// Rock-solid WebSocket: single mount, store via getState refs (no dep-array teardown),
// reconnect banner debounced 1.5s, exponential backoff up to 16s.
//
// SIMULATION GATE: frames are only applied to the store when simRunning === true.
// When stopped, incoming frames are silently discarded so all values freeze.

import { useEffect, useRef } from 'react';
import { useApexStore } from '../store/apexStore';
import type { StreamFrame } from '../types/apex';
import { getPumpName, getMachineConfig, getComponentCost } from '../constants/machines';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const WS_URL = API_BASE
  ? API_BASE.replace(/^http/, 'ws') + '/stream'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`;

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 16000];

// localStorage key for persisting last-known machine frames
const LS_MACHINES_KEY = 'apex_machines_snapshot';

/** Persist current machine map to localStorage whenever a frame arrives. */
function persistMachines(machines: Record<string, unknown>) {
  try {
    localStorage.setItem(LS_MACHINES_KEY, JSON.stringify(machines));
  } catch { /* quota exceeded — skip */ }
}

/** Restore persisted machines into the store on page load. */
export function restorePersistedMachines() {
  try {
    const raw = localStorage.getItem(LS_MACHINES_KEY);
    if (!raw) return;
    const machines = JSON.parse(raw);
    if (machines && typeof machines === 'object' && Object.keys(machines).length > 0) {
      // Inject as a synthetic frame so applyFrame handles history + selection
      const machineList = Object.values(machines) as StreamFrame['machines'];
      const frame: StreamFrame = {
        timestamp: new Date().toISOString(),
        sequence_id: 0,
        machines: machineList,
        fleet_stats: { critical: 0, warning: 0, monitor: 0, healthy: machineList.length, total: machineList.length },
        backend_health: { p99_latency_ms: 0, uptime_sec: 0, machine_count: machineList.length },
      };
      // Apply WITHOUT gating (this is a restore, not live data)
      useApexStore.getState().applyFrame(frame);
    }
  } catch { /* corrupt storage — ignore */ }
}

export function useWebSocket() {
  const wsRef          = useRef<WebSocket | null>(null);
  const retryRef       = useRef(0);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);
  const voiceRef       = useRef<Record<string, string>>({});

  useEffect(() => {
    mountedRef.current = true;

    // ── Voice alert (pure function, no closure deps) ───────────────────────
    // FIX 4: Voice is now handled by useVoiceAlert hook (repeating every 15s).
    // Single fire here is kept as immediate feedback for non-CRITICAL transitions.
    function fireVoice(machineId: string, level: string) {
      if (level !== 'CRITICAL') return;
      // The repeating voice is managed by useVoiceAlert.
      // This single-shot fires only if somehow useVoiceAlert hasn't started yet.
      if (!('speechSynthesis' in window)) return;
      if (useApexStore.getState().voiceAlertMuted) return;
      const cfg = getMachineConfig(machineId);
      const utt = new SpeechSynthesisUtterance(
        `Critical alert. ${cfg.displayName} requires immediate attention.`
      );
      utt.rate = 0.9;
      utt.pitch = 0.8;
      window.speechSynthesis.speak(utt);
    }

    // ── Schedule next reconnect attempt ────────────────────────────────────
    function scheduleReconnect() {
      if (!mountedRef.current) return;
      const delay = BACKOFF_MS[Math.min(retryRef.current, BACKOFF_MS.length - 1)];
      retryRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);

      // Show banner only after 1.5 s of being disconnected (hides brief blips)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          useApexStore.getState().setConnectionState('reconnecting');
        }
      }, 1500);
    }

    // ── Hydrate state from /snapshot after (re)connect ────────────────────
    // GATE: only apply if simulation is running — otherwise the snapshot
    // would overwrite the frozen "last known" values.
    function fetchSnapshot() {
      fetch(`${API_BASE}/snapshot`)
        .then(r => r.json())
        .then(snap => {
          if (!mountedRef.current) return;
          // BUG 1 FIX: Accept snapshot if:
          //   a) simulation is running according to store, OR
          //   b) machines state is empty (page reload — need to repopulate display)
          const state = useApexStore.getState();
          const shouldApply = state.simRunning || Object.keys(state.machines).length === 0;
          if (shouldApply && snap.machines?.length > 0) {
            const frame: StreamFrame = {
              timestamp: snap.timestamp ?? new Date().toISOString(),
              sequence_id: 0,
              machines: snap.machines,
              fleet_stats: snap.fleet_stats ?? { critical: 0, warning: 0, monitor: 0, healthy: 0, total: 0 },
              backend_health: snap.backend_health ?? { p99_latency_ms: 0, uptime_sec: 0, machine_count: 0 },
            };
            useApexStore.getState().applyFrame(frame);
            // If we got machines from snapshot and simRunning is false, set it true
            // (means sim was running before page reload)
            if (!state.simRunning) {
              useApexStore.getState().setSimRunning(true);
            }
            persistMachines(useApexStore.getState().machines);
          }
          useApexStore.getState().setFallbackMode(snap.fallback_mode ?? false);
        })
        .catch(() => { /* snapshot is best-effort */ });
    }

    // ── Main connect function ──────────────────────────────────────────────
    function connect() {
      if (!mountedRef.current) return;

      // Show 'connecting' only on first attempt; subsequent attempts wait for banner debounce
      if (retryRef.current === 0) {
        useApexStore.getState().setConnectionState('connecting');
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }

        // Clear pending banner timer — we're connected
        if (bannerTimerRef.current) {
          clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = null;
        }

        const wasReconnecting = retryRef.current > 0;
        retryRef.current = 0;
        useApexStore.getState().setConnectionState('connected');

        // Only toast on reconnect (not initial page load)
        if (wasReconnecting) {
          useApexStore.getState().addToast({ type: 'success', message: '✅ Reconnected to APEX backend' });
        }

        fetchSnapshot();
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;

        // BUG 1 FIX: Only gate when sim was explicitly stopped AND we already
        // have machine data (freeze-values behavior). Never gate during warmup
        // (machines empty) or initial page load (simRunning not yet synced).
        const currentState = useApexStore.getState();
        const hasData = Object.keys(currentState.machines).length > 0;
        if (!currentState.simRunning && hasData) return;  // freeze: sim stopped, keep last values

        try {
          const data = JSON.parse(ev.data as string);

          // Handle backend keepalive ping
          if (data.type === 'ping') {
            ws.send('pong');
            return;
          }

          const frame = data as StreamFrame;
          const prevVoice = { ...voiceRef.current };

          useApexStore.getState().applyFrame(frame);

          // Persist updated machine values to localStorage
          persistMachines(useApexStore.getState().machines);

          // Voice alert on urgency transitions
          for (const machine of frame.machines) {
            const prev = prevVoice[machine.machine_id] ?? 'HEALTHY';
            const curr = machine.urgency.level;
            if (curr !== prev) fireVoice(machine.machine_id, curr);
            voiceRef.current[machine.machine_id] = curr;

            // Feature 5: Compute savings on CRITICAL transition
            if (curr === 'CRITICAL' && prev !== 'CRITICAL') {
              const cfg = getMachineConfig(machine.machine_id);
              const unplannedCost = cfg.costPerCycle * 40;
              const plannedCost = getComponentCost(cfg.component);
              const netSavings = unplannedCost - plannedCost;
              useApexStore.getState().addSavingsEvent({
                machineId: machine.machine_id,
                machineName: cfg.displayName,
                component: cfg.component,
                costAvoided: unplannedCost,
                costOfIntervention: plannedCost,
                netSavings,
                timestamp: Date.now(),
              });
            }
          }
        } catch {
          // Malformed frame — silently ignore
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onerror always followed by onclose — handled there
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current)  clearTimeout(retryTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      wsRef.current?.close();
    };
  }, []); // ← empty: mounted exactly once, never recreated
}
