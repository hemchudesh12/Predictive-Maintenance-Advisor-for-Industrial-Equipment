// src/types/apex.ts
// Mirrors src/schemas.py exactly — these are the canonical frontend types

export interface UrgencyInfo {
  level: 'CRITICAL' | 'WARNING' | 'MONITOR' | 'HEALTHY';
  score: number;
  color_token: string;
  bg_color: string;
  fail_prob_30: number;
  lower_bound: number;
}

export interface ComponentAttribution {
  component: string;
  confidence: number;
  triggered_rule: string;
  recommendation: string;
  driver_sensors: string[];
}

export interface SimilarFailure {
  case_id: string;
  component: string;
  rul_at_detection: number;
  outcome: string;
  sparkline: number[];
}

export interface MachineFrame {
  machine_id: string;
  current_cycle: number;        // actual engine cycle from FD001 dataset
  rul_mean: number;
  rul_std: number;
  rul_lower_95: number;
  rul_upper_95: number;
  fail_prob_30: number;
  urgency: UrgencyInfo;
  component_attribution: ComponentAttribution;
  sensor_snapshot: Record<string, number>;
  lifecycle_position: number;
  last_update_ms: number;
  buffer_length: number;
  mode: 'live' | 'fallback' | 'warming_up' | 'degraded';
  similar_failures: SimilarFailure[];
}

export interface FleetStats {
  critical: number;
  warning: number;
  monitor: number;
  healthy: number;
  total: number;
}

export interface BackendHealth {
  p99_latency_ms: number;
  uptime_sec: number;
  machine_count: number;
}

export interface StreamFrame {
  timestamp: string;
  sequence_id: number;
  machines: MachineFrame[];
  fleet_stats: FleetStats;
  backend_health: BackendHealth;
}

export interface CostConfig {
  cost_per_failure: number;
  cost_per_maintenance: number;
  savings_per_prevention: number;
}

export interface EmailAlertResponse {
  success: boolean;
  message_id?: string;
  error?: string;
  rate_limited: boolean;
  retry_after_sec?: number;
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface HistoryPoint {
  cycle: number;
  rul_mean: number;
  rul_lower_95: number;
  rul_upper_95: number;
  timestamp: number; // Date.now()
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warn';
  message: string;
}
