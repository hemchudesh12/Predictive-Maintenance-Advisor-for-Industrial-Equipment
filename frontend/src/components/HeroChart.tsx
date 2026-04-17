import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApexStore } from '../store/apexStore';
import { getPumpName, getComponentName } from '../constants/machines';
import { CounterfactualCard } from './CounterfactualCard';



function cycleToEngineTime(cycle: number): string {
  if (cycle <= 0) return '0h';
  if (cycle < 48)   return `${cycle}h`;
  if (cycle < 24 * 14) return `${Math.round(cycle / 24)}d`;
  if (cycle < 24 * 90) return `${Math.round(cycle / 168)}w`;
  return `${(cycle / 720).toFixed(1)}mo`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', minWidth: 160 }}>
      <div className="text-micro text-tertiary">Cycle {d.cycle}</div>
      <div className="flex justify-between" style={{ marginTop: 4 }}>
        <span className="text-label text-secondary">RUL</span>
        <span className="mono-body" style={{ color: 'var(--accent)' }}>{d.rul_mean?.toFixed(1)} cy</span>
      </div>
      <div className="flex justify-between">
        <span className="text-label text-tertiary">95% CI</span>
        <span className="mono text-label text-tertiary">±{((d.rul_upper_95 - d.rul_mean) || 0).toFixed(1)}</span>
      </div>
    </div>
  );
}

export function HeroChart() {
  const { machines, history, selectedMachineId } = useApexStore();

  const machineId = selectedMachineId || Object.keys(machines)[0];
  const machine = machines[machineId];
  const hist = history[machineId] || [];

  const data = useMemo(() => {
    if (!machine || hist.length === 0) return [];
    return hist.map(h => ({
      ...h,
      ci_band: [h.rul_lower_95, h.rul_upper_95],
    }));
  }, [machine, hist]);

  if (!machine) {
    return (
      <div className="card" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-tertiary text-body text-center">Select an engine</span>
      </div>
    );
  }

  const urgencyLvl = machine.urgency.level;
  const warming = machine.buffer_length < 30;
  
  const strokeColor = urgencyLvl === 'CRITICAL' ? 'var(--critical)' : urgencyLvl === 'WARNING' ? 'var(--warning)' : urgencyLvl === 'MONITOR' ? 'var(--monitor)' : 'var(--healthy)';
  
  const pumpName = getPumpName(machineId);
  const componentName = getComponentName(machineId, machine.component_attribution.component);
  const yMax = Math.max(160, Math.ceil((data[0]?.rul_upper_95 || 160) / 20) * 20);

  return (
    <div className="card flex-col gap-2" style={{ padding: '16px 16px 20px', height: '100%', position: 'relative' }}>
      
      {/* ── Chart Header ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
        <div>
          <div className="text-h2 text-primary">
            {pumpName}
            <span className="text-body text-tertiary" style={{ marginLeft: 6 }}>
              · {componentName}
            </span>
          </div>
          <div className="text-label text-secondary">RUL Trajectory Analysis</div>
        </div>
        <div className="text-right">
          <div className="mono-hero" style={{ color: strokeColor, fontSize: 32 }}>
            {machine.rul_mean.toFixed(1)} <span style={{ fontSize: 14 }}>cy</span>
          </div>
        </div>
      </div>

      {warming ? (
        <div className="flex-col items-center justify-center" style={{ flex: 1, gap: 12 }}>
          <div className="text-secondary text-body text-center">
            ⏳ Warming up — {machine.buffer_length}/30 samples collected
          </div>
        </div>
      ) : hist.length < 2 ? (
        <div className="flex items-center justify-center" style={{ flex: 1 }}>
          <span className="text-secondary text-body text-center">Collecting chart data…</span>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
              <defs>
                <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="failGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="rgba(239,68,68,0.12)" />
                  <stop offset="100%" stopColor="rgba(239,68,68,0.0)" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="4 4" vertical={false} />

              <XAxis dataKey="cycle" stroke="var(--border-strong)" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={cycleToEngineTime} />
              <YAxis domain={[0, yMax]} stroke="none" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
              
              <Tooltip content={<CustomTooltip />} />

              {/* Fail zone shading */}
              <ReferenceArea y1={0} y2={30} fill="url(#failGrad)" />
              <ReferenceLine y={30} stroke="var(--critical)" strokeDasharray="3 3" strokeOpacity={0.3} 
                label={{ value: 'FAIL ZONE', position: 'insideBottomLeft', style: { fontSize: 10, fill: 'var(--critical)', opacity: 0.6 } }} />

              {/* Confidence interval band */}
              <Area dataKey="ci_band" stroke="none" fill="url(#ciGrad)" isAnimationActive={false} />

              {/* Main RUL Line */}
              <Area 
                type="monotone" 
                dataKey="rul_mean" 
                stroke={strokeColor} 
                strokeWidth={2} 
                fill="none" 
                isAnimationActive={false}
                style={{ filter: 'url(#glow)' }}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--bg-surface-1)', stroke: strokeColor, strokeWidth: 2 }}
              />

              {/* "Now" Indicator at the end of the line */}
              <ReferenceLine 
                x={data[data.length - 1].cycle} 
                stroke="var(--accent)" 
                strokeDasharray="2 4" 
                strokeOpacity={0.5} 
              />
            </AreaChart>
          </ResponsiveContainer>
          
          {/* Animated intersection dot */}
          {data.length > 0 && (
            <div 
              style={{
                position: 'absolute',
                top: 0, bottom: 0, right: 0, left: 0,
                pointerEvents: 'none'
              }}
            >
              <div 
                className="dot"
                style={{
                  position: 'absolute',
                  right: 9, // roughly the chart margin right padding
                  top: `calc(100% - ${(data[data.length-1].rul_mean / yMax) * 100}%)`,
                  width: 8, height: 8,
                  marginTop: -16, // offset baseline adjust
                  background: 'var(--accent)',
                  boxShadow: 'var(--accent-glow)',
                  animation: 'pulse-live 1.5s ease-in-out infinite'
                }}
              />
            </div>
          )}
        </div>
      )}
      <CounterfactualCard />
    </div>
  );
}
