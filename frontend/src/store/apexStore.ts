// src/store/apexStore.ts
// Zustand global state store for APEX dashboard
// Added: activeAlerts (FIX 4), savingsEvents / totalSavings (Feature 5)

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
import { getMachineConfig } from '../constants/machines';

const MAX_HISTORY = 120; // 2-minute rolling window at 1 Hz

// ── FIX 4: Active alert shape ─────────────────────────────────────────────────
export interface ActiveAlert {
  machineId: string;
  machineName: string;
  component: string;
  startedAt: number;
  acknowledged: boolean;
}

// ── Feature 5: Savings event shape ────────────────────────────────────────────
export interface SavingsEvent {
  machineId: string;
  machineName: string;
  component: string;
  costAvoided: number;
  costOfIntervention: number;
  netSavings: number;
  timestamp: number;
}

interface ApexState {
  // Live data
  machines: Record<string, MachineFrame>;
  history: Record<string, HistoryPoint[]>;
  fleetStats: FleetStats;
  backendHealth: BackendHealth;
  lastFrameTime: number;
  sequenceId: number;
  speedFactor: number;

  // UI state
  selectedMachineId: string | null;
  connectionState: ConnectionState;
  fallbackMode: boolean;
  viewMode: 'fleet' | 'detail';
  simRunning: boolean;
  voiceAlertMuted: boolean;

  // Modals
  emailModalOpen: boolean;
  shortcutsModalOpen: boolean;

  // Cost config
  costConfig: CostConfig | null;

  // Toasts
  toasts: Toast[];

  // Voice alert guard: track last urgency level per machine
  lastUrgencyLevel: Record<string, string>;

  // Counterfactual: cycle + rul_mean when machine first entered WARNING/CRITICAL
  warningFirstSeen: Record<string, { cycle: number; rul: number }>;

  // FIX 4: Active critical alerts (per-machine, with acknowledge)
  activeAlerts: Record<string, ActiveAlert>;

  // Feature 5: Fleet savings tracker
  savingsEvents: SavingsEvent[];
  totalSavings: number;

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
  resetStore: () => void;

  // FIX 4: Alert actions
  addAlert: (machineId: string, machineName: string, component: string) => void;
  acknowledgeAlert: (machineId: string) => void;

  // Feature 5: Savings actions
  addSavingsEvent: (event: SavingsEvent) => void;
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

  // FIX 4
  activeAlerts: {},

  // Feature 5
  savingsEvents: [],
  totalSavings: 0,

  applyFrame: (frame: StreamFrame) => {
    const state = get();
    const now = Date.now();

    const nextMachines: Record<string, MachineFrame> = {};
    const nextHistory = { ...state.history };
    const nextUrgencyLevels = { ...state.lastUrgencyLevel };
    const nextWarningFirstSeen = { ...state.warningFirstSeen };
    let nextActiveAlerts = { ...state.activeAlerts };

    for (const machine of frame.machines) {
      nextMachines[machine.machine_id] = machine;

      // Append to history ring
      const prev = nextHistory[machine.machine_id] ?? [];

      // FIX 1 (frontend layer): Also apply monotonic floor here so chart history
      // never shows an increase even if backend hasn't been updated yet.
      const prevRulInHistory = prev.length > 0 ? prev[prev.length - 1].rul_mean : Infinity;
      const clampedRulMean = Math.min(machine.rul_mean, prevRulInHistory);

      const point: HistoryPoint = {
        cycle: machine.current_cycle,
        rul_mean: clampedRulMean,
        rul_lower_95: machine.rul_lower_95,
        rul_upper_95: machine.rul_upper_95,
        timestamp: now,
      };
      const next = [...prev, point];
      nextHistory[machine.machine_id] = next.length > MAX_HISTORY
        ? next.slice(next.length - MAX_HISTORY)
        : next;

      // Track urgency transitions
      const prevLevel = nextUrgencyLevels[machine.machine_id] ?? 'HEALTHY';
      const currLevel = machine.urgency.level;
      nextUrgencyLevels[machine.machine_id] = currLevel;

      // Track when machine first enters WARNING/CRITICAL
      if ((currLevel === 'WARNING' || currLevel === 'CRITICAL') && !nextWarningFirstSeen[machine.machine_id]) {
        nextWarningFirstSeen[machine.machine_id] = {
          cycle: machine.current_cycle,
          rul: machine.rul_mean,
        };
      }

      // FIX 4: Detect CRITICAL transitions → add alert
      if (currLevel === 'CRITICAL' && prevLevel !== 'CRITICAL') {
        // Only add if not already acknowledged (or if this is a new CRITICAL event after recovery)
        const existing = nextActiveAlerts[machine.machine_id];
        if (!existing || existing.acknowledged) {
          const cfg = getMachineConfig(machine.machine_id);
          nextActiveAlerts = {
            ...nextActiveAlerts,
            [machine.machine_id]: {
              machineId: machine.machine_id,
              machineName: cfg.displayName,
              component: cfg.component,
              startedAt: now,
              acknowledged: false,
            },
          };
        }
      }

      // If machine recovered from CRITICAL, clear its alert tracking
      if (currLevel !== 'CRITICAL' && prevLevel === 'CRITICAL') {
        const { [machine.machine_id]: _removed, ...rest } = nextActiveAlerts;
        nextActiveAlerts = rest;
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
      activeAlerts: nextActiveAlerts,
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
      activeAlerts: {},
      savingsEvents: [],
      totalSavings: 0,
    }),

  // FIX 4: Alert management
  addAlert: (machineId, machineName, component) =>
    set((s) => ({
      activeAlerts: {
        ...s.activeAlerts,
        [machineId]: {
          machineId,
          machineName,
          component,
          startedAt: Date.now(),
          acknowledged: false,
        },
      },
    })),

  acknowledgeAlert: (machineId) => {
    console.log(`[ALERT ACK] ${machineId} acknowledged at ${new Date().toISOString()}`);
    set((s) => ({
      activeAlerts: {
        ...s.activeAlerts,
        [machineId]: s.activeAlerts[machineId]
          ? { ...s.activeAlerts[machineId], acknowledged: true }
          : s.activeAlerts[machineId],
      },
    }));
  },

  // Feature 5: Savings tracking
  addSavingsEvent: (event) =>
    set((s) => ({
      savingsEvents: [...s.savingsEvents, event],
      totalSavings: s.totalSavings + event.netSavings,
    })),
}));
