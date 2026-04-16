// src/components/HeroChart.tsx
// Main RUL time-series chart. X-axis shows engine operating time (hours → days → months).
// At higher replay speeds the time axis advances faster showing days/months per real second.

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApexStore } from '../store/apexStore';
import { getPumpName, getComponentName } from '../constants/machines';
import { LifecycleTimeline } from './LifecycleTimeline';
import { CounterfactualCard } from './CounterfactualCard';

const CHART_HEIGHT = 240;

// ── Time conversion: 1 CMAPSS cycle ≈ 1 hour of engine operation ──────────────
function cycleToEngineTime(cycle: number): string {
  if (cycle <= 0) return '0h';
  if (cycle < 48)   return `${cycle}h`;
  if (cycle < 24 * 14) {
    const days = Math.round(cycle / 24);
    return `${days}d`;
  }
  if (cycle < 24 * 90) {
    const weeks = Math.round(cycle / 168);
    return `${weeks}w`;
  }
  const months = (cycle / 720).toFixed(1);
  return `${months}mo`;
}

function cycleToFullLabel(cycle: number): string {
  if (cycle <= 0) return '0 hours';
  if (cycle < 48)   return `${cycle} hours`;
  const days = cycle / 24;
  if (days < 14)    return `${days.toFixed(1)} days`;
  const weeks = cycle / 168;
  if (weeks < 13)   return `${weeks.toFixed(1)} weeks`;
  const months = cycle / 720;
  return `${months.toFixed(1)} months`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 180, fontSize: 12 }}>
      <div className="muted">Cycle {d.cycle} · {cycleToFullLabel(d.cycle)}</div>
      <div className="flex justify-between gap-3" style={{ marginTop: 4 }}>
        <span>RUL</span>
        <span className="mono" style={{ color: 'var(--accent)' }}>{d.rul_mean?.toFixed(1)} cy</span>
      </div>
      <div className="flex justify-between gap-3">
        <span>95% CI</span>
        <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          {d.rul_lower_95?.toFixed(1)} – {d.rul_upper_95?.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function HeroChart() {
  const { selectedMachineId, machines, history, speedFactor } = useApexStore();
  const machine = selectedMachineId ? machines[selectedMachineId] : null;
  const hist = selectedMachineId ? (history[selectedMachineId] ?? []) : [];

  // Disable animation at high speeds so chart feels real-time not lagged
  const animDuration = speedFactor >= 5 ? 0 : 300;

  if (!machine) {
    return (
      <div id="hero-chart-section" className="card" style={{ height: CHART_HEIGHT + 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="muted">Select a machine to view RUL chart</span>
      </div>
    );
  }

  const warming = machine.buffer_length < 30;

  const strokeColor = machine.urgency.level === 'CRITICAL' ? 'var(--color-critical)'
    : machine.urgency.level === 'WARNING'  ? 'var(--color-warning)'
    : machine.urgency.level === 'MONITOR'  ? 'var(--color-monitor)'
    : 'var(--color-healthy)';

  const data = hist.map(p => ({ ...p }));

  // ── Dynamic Y-axis: tight to data, capped sensibly ────────────────────────
  let yMax = 140;
  if (hist.length > 0) {
    const maxUpper = Math.max(...hist.map(p => p.rul_upper_95));
    yMax = Math.max(40, Math.min(140, Math.ceil(maxUpper / 10) * 10 + 10));
  } else {
    // Use current machine's upper bound as initial scale
    yMax = Math.max(40, Math.min(140, Math.ceil(machine.rul_upper_95 / 10) * 10 + 20));
  }

  // ── Display names ─────────────────────────────────────────────────────────
  const pumpName = getPumpName(machine.machine_id);
  const componentName = getComponentName(machine.machine_id, machine.component_attribution.component);

  return (
    <div id="hero-chart-section" className="card" style={{ padding: '16px 18px', marginBottom: 'var(--gap-section)' }}>
      {/* Chart header */}
      <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
        <div>
          <div className="section-title">
            {pumpName}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
              · {componentName}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {machine.component_attribution.recommendation}
          </div>
        </div>
        <div className="text-right">
          <div className="metric-value" style={{ color: strokeColor }}>
            {machine.rul_mean.toFixed(1)} cy
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ±{machine.rul_std.toFixed(1)} · p(fail30)={Math.round(machine.fail_prob_30 * 100)}%
          </div>
        </div>
      </div>

      {/* Lifecycle timeline — between header and chart */}
      {!warming && (
        <LifecycleTimeline machine={machine} speedFactor={speedFactor} />
      )}

      {/* Engine time axis label */}
      {hist.length > 1 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
          Cycle {machine.current_cycle} ·&nbsp;
          <span style={{ color: 'var(--text-secondary)' }}>{cycleToFullLabel(machine.current_cycle)} of engine operation</span>
        </div>
      )}

      {/* Warmup state */}
      {warming ? (
        <div style={{ height: CHART_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ⏳ Warming up — {machine.buffer_length}/30 samples collected
          </div>
          <div className="progress-bar" style={{ width: '60%' }}>
            <div className="progress-fill" style={{ width: `${(machine.buffer_length / 30) * 100}%` }} />
          </div>
        </div>
      ) : hist.length < 2 ? (
        <div style={{ height: CHART_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="muted">Collecting chart data…</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: -10 }}>
            <defs>
              <linearGradient id="rulGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.08} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />

            <XAxis
              dataKey="cycle"
              stroke="var(--text-muted)"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickFormatter={cycleToEngineTime}
              label={{
                value: 'Engine operating time  (1 cycle ≈ 1 h)',
                position: 'insideBottomRight',
                offset: -5,
                style: { fontSize: 9, fill: 'var(--text-muted)' },
              }}
            />
            <YAxis
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              domain={[0, yMax]}
              label={{ value: 'RUL (cy)', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 9, fill: 'var(--text-muted)' } }}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* 30-cycle fail zone line */}
            <ReferenceLine y={30} stroke="var(--color-critical)" strokeDasharray="4 3" strokeOpacity={0.65}
              label={{ value: 'FAIL ZONE', position: 'insideTopLeft', style: { fontSize: 9, fill: 'var(--color-critical)', opacity: 0.8 } }}
            />

            {/* CI band */}
            <Area dataKey="rul_upper_95" stroke="none" fill="url(#ciGrad)" animationDuration={animDuration} />
            <Area dataKey="rul_lower_95" stroke="none" fill="var(--apex-bg)" animationDuration={animDuration} />

            {/* Main RUL line */}
            <Area
              dataKey="rul_mean"
              stroke={strokeColor}
              strokeWidth={2}
              fill="url(#rulGrad)"
              dot={false}
              activeDot={{ r: 4, fill: strokeColor, stroke: 'var(--apex-bg)', strokeWidth: 2 }}
              animationDuration={animDuration}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* CRITICAL counterfactual cost card */}
      <CounterfactualCard />
    </div>
  );
}
