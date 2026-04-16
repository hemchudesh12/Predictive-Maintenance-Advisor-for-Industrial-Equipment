// src/hooks/useWebSocket.ts
// Rock-solid WebSocket: single mount, store via getState refs (no dep-array teardown),
// reconnect banner debounced 1.5s, exponential backoff up to 16s.

import { useEffect, useRef } from 'react';
import { useApexStore } from '../store/apexStore';
import type { StreamFrame } from '../types/apex';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const WS_URL = API_BASE
  ? API_BASE.replace(/^http/, 'ws') + '/stream'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`;

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 16000];

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
    function fireVoice(machineId: string, level: string) {
      if (level !== 'CRITICAL' && level !== 'WARNING') return;
      if (!('speechSynthesis' in window)) return;
      const msg = level === 'CRITICAL'
        ? `Alert! ${machineId} is critical. Immediate action required.`
        : `Warning! ${machineId} entering warning zone. Schedule maintenance.`;
      const utt = new SpeechSynthesisUtterance(msg);
      utt.rate = 1.0;
      utt.pitch = level === 'CRITICAL' ? 1.2 : 1.0;
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
    function fetchSnapshot() {
      fetch(`${API_BASE}/snapshot`)
        .then(r => r.json())
        .then(snap => {
          if (!mountedRef.current) return;
          if (snap.machines?.length > 0) {
            const frame: StreamFrame = {
              timestamp: snap.timestamp ?? new Date().toISOString(),
              sequence_id: 0,
              machines: snap.machines,
              fleet_stats: snap.fleet_stats ?? { critical: 0, warning: 0, monitor: 0, healthy: 0, total: 0 },
              backend_health: snap.backend_health ?? { p99_latency_ms: 0, uptime_sec: 0, machine_count: 0 },
            };
            useApexStore.getState().applyFrame(frame);
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

          // Voice alert on urgency transitions
          for (const machine of frame.machines) {
            const prev = prevVoice[machine.machine_id] ?? 'HEALTHY';
            const curr = machine.urgency.level;
            if (curr !== prev) fireVoice(machine.machine_id, curr);
            voiceRef.current[machine.machine_id] = curr;
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
