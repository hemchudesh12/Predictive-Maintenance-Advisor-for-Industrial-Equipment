// src/hooks/useVoiceAlert.ts
// FIX 4 — Persistent voice alert that repeats every 15s until acknowledged.
// Fires SpeechSynthesisUtterance; respects voiceAlertMuted flag.

import { useEffect, useRef } from 'react';
import { useApexStore } from '../store/apexStore';

export function useVoiceAlert() {
  const intervalRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const unsubscribe = useApexStore.subscribe((state) => {
      const { activeAlerts, voiceAlertMuted } = state;

      // Start intervals for new unacknowledged alerts
      Object.entries(activeAlerts).forEach(([machineId, alert]) => {
        if (alert.acknowledged) {
          // Clear interval when acknowledged
          if (intervalRef.current[machineId]) {
            clearInterval(intervalRef.current[machineId]);
            delete intervalRef.current[machineId];
            // Cancel any ongoing speech
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
          }
          return;
        }

        // Already running — don't create a duplicate
        if (intervalRef.current[machineId]) return;

        if (voiceAlertMuted || !('speechSynthesis' in window)) return;

        const speak = () => {
          if (useApexStore.getState().voiceAlertMuted) return;
          if (useApexStore.getState().activeAlerts[machineId]?.acknowledged) return;
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(
            `Critical alert. ${alert.machineName}. ${alert.component} failure imminent. Immediate attention required.`
          );
          utt.rate = 0.85;
          utt.pitch = 0.7;
          utt.volume = 1.0;
          window.speechSynthesis.speak(utt);
        };

        speak(); // Speak immediately
        intervalRef.current[machineId] = setInterval(speak, 15000);
      });

      // Cleanup intervals for alerts no longer in state
      Object.keys(intervalRef.current).forEach(machineId => {
        if (!activeAlerts[machineId]) {
          clearInterval(intervalRef.current[machineId]);
          delete intervalRef.current[machineId];
        }
      });
    });

    return () => {
      unsubscribe();
      Object.values(intervalRef.current).forEach(clearInterval);
      intervalRef.current = {};
    };
  }, []);
}
