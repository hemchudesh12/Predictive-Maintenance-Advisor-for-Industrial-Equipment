// src/store/apexStore.ts
// Zustand global state store for APEX dashboard

import { create } from 'zustand';
import type {
  BackendHealth,
  ConnectionState,
  CostConfig,
  FleetStats,
  HistoryPoint,
  MachineFrame,
  StreamFrame,
  Toast,
} from '../types/apex';

const MAX_HISTORY = 120; // 2-minute rolling window at 1 Hz

interface ApexState {
  // Live data
  machines: Record<string, MachineFrame>;
  history: Record<string, HistoryPoint[]>;
  fleetStats: FleetStats;
  backendHealth: BackendHealth;
  lastFrameTime: number; // Date.now() of last received frame
  sequenceId: number;
  speedFactor: number;

  // UI state
  selectedMachineId: string | null;
  connectionState: ConnectionState;
  fallbackMode: boolean;
  viewMode: 'fleet' | 'detail';
  simRunning: boolean;          // is the simulator subprocess alive?
  voiceAlertMuted: boolean;     // user manually silenced the CRITICAL voice

  // Modals
  emailModalOpen: boolean;
  shortcutsModalOpen: boolean;

  // Cost config (loaded once from /config/costs)
  costConfig: CostConfig | null;

  // Toasts
  toasts: Toast[];

  // Voice alert guard: track last urgency level per machine to prevent duplicate alerts
  lastUrgencyLevel: Record<string, string>;

  // Counterfactual: cycle + rul_mean when a machine first entered WARNING or CRITICAL
  warningFirstSeen: Record<string, { cycle: number; rul: number }>;

  // Actions
  applyFrame: (frame: StreamFrame) => void;
  setSelectedMachine: (id: string | null) => void;
  setViewMode: (mode: 'fleet' | 'detail') => void;
  setSimRunning: (v: boolean) => void;
  setVoiceAlertMuted: (v: boolean) => void;
  setConnectionState: (state: ConnectionState) => void;
  setFallbackMode: (v: boolean) => void;
  setSpeedFactor: (f: number) => void;
  setCostConfig: (c: CostConfig) => void;
  setEmailModal: (open: boolean) => void;
  setShortcutsModal: (open: boolean) => void;
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  resetStore: () => void; // called on simulator restart
}

const defaultFleetStats: FleetStats = { critical: 0, warning: 0, monitor: 0, healthy: 0, total: 0 };
const defaultHealth: BackendHealth = { p99_latency_ms: 0, uptime_sec: 0, machine_count: 0 };

export const useApexStore = create<ApexState>((set, get) => ({
  machines: {},
  history: {},
  fleetStats: defaultFleetStats,
  backendHealth: defaultHealth,
  lastFrameTime: 0,
  sequenceId: 0,
  speedFactor: 1,

  selectedMachineId: null,
  connectionState: 'connecting',
  fallbackMode: false,
  viewMode: 'fleet',
  simRunning: false,
  voiceAlertMuted: false,

  emailModalOpen: false,
  shortcutsModalOpen: false,
  costConfig: null,
  toasts: [],
  lastUrgencyLevel: {},
  warningFirstSeen: {},

  applyFrame: (frame: StreamFrame) => {
    const state = get();
    const now = Date.now();

    // Build updated machines map
    const nextMachines: Record<string, MachineFrame> = {};
    const nextHistory = { ...state.history };
    const nextUrgencyLevels = { ...state.lastUrgencyLevel };
    const nextWarningFirstSeen = { ...state.warningFirstSeen };

    for (const machine of frame.machines) {
      nextMachines[machine.machine_id] = machine;

      // Append to history ring — use actual engine cycle for time-aware X-axis
      const prev = nextHistory[machine.machine_id] ?? [];
      const point: HistoryPoint = {
        cycle: machine.current_cycle,   // real engine cycle (advances faster at higher speeds)
        rul_mean: machine.rul_mean,
        rul_lower_95: machine.rul_lower_95,
        rul_upper_95: machine.rul_upper_95,
        timestamp: now,
      };
      const next = [...prev, point];
      nextHistory[machine.machine_id] = next.length > MAX_HISTORY
        ? next.slice(next.length - MAX_HISTORY)
        : next;

      // Track urgency transitions for voice alert guard
      nextUrgencyLevels[machine.machine_id] = machine.urgency.level;

      // Track when machine first enters WARNING or CRITICAL (even if it starts there)
      const level = machine.urgency.level;
      if ((level === 'WARNING' || level === 'CRITICAL') && !nextWarningFirstSeen[machine.machine_id]) {
        nextWarningFirstSeen[machine.machine_id] = {
          cycle: machine.current_cycle,
          rul: machine.rul_mean,
        };
      }
    }

    // Auto-select first machine if none selected
    const ids = Object.keys(nextMachines);
    const currentSel = state.selectedMachineId;
    const nextSel = currentSel && nextMachines[currentSel]
      ? currentSel
      : (ids.length > 0 ? ids[0] : null);

    set({
      machines: nextMachines,
      history: nextHistory,
      fleetStats: frame.fleet_stats,
      backendHealth: frame.backend_health,
      lastFrameTime: now,
      sequenceId: frame.sequence_id,
      selectedMachineId: nextSel,
      lastUrgencyLevel: nextUrgencyLevels,
      warningFirstSeen: nextWarningFirstSeen,
    });

    return nextUrgencyLevels;
  },

  setSelectedMachine: (id) => set({ selectedMachineId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSimRunning: (v) => set({ simRunning: v }),
  setVoiceAlertMuted: (v) => set({ voiceAlertMuted: v }),
  setConnectionState: (state) => set({ connectionState: state }),
  setFallbackMode: (v) => set({ fallbackMode: v }),
  setSpeedFactor: (f) => set({ speedFactor: f }),
  setCostConfig: (c) => set({ costConfig: c }),
  setEmailModal: (open) => set({ emailModalOpen: open }),
  setShortcutsModal: (open) => set({ shortcutsModalOpen: open }),

  addToast: (t) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Auto-dismiss after 4s
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  resetStore: () =>
    set({
      machines: {},
      history: {},
      fleetStats: defaultFleetStats,
      backendHealth: defaultHealth,
      lastFrameTime: 0,
      sequenceId: 0,
      selectedMachineId: null,
      viewMode: 'fleet',
      lastUrgencyLevel: {},
      warningFirstSeen: {},
    }),
}));
