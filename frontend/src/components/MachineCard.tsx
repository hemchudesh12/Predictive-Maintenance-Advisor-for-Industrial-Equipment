import { useApexStore } from '../store/apexStore';
import type { MachineFrame } from '../types/apex';
import { getPumpName, getComponentName, getMachineConfig } from '../constants/machines';
import { Activity, Fan, Zap, Droplet, Box } from 'lucide-react';

interface Props {
  machine: MachineFrame;
  index: number;
}

// Format actual cycle as compact engine time label
function cycleLabel(cycle: number): string {
  if (cycle <= 0) return '0 hrs';
  if (cycle < 48) return `${cycle.toFixed(1)} hrs`;
  if (cycle < 24 * 14) return `${(cycle/24).toFixed(1)} days`;
  if (cycle < 24 * 90) return `${(cycle/168).toFixed(1)} wks`;
  return `${(cycle/720).toFixed(1)} mo`;
}

function getIconForConfig(config: any) {
  if (!config) return <Box size={14} stroke="var(--text-tertiary)" />;
  switch (config.icon) {
    case '🌊': return <Droplet size={14} stroke="var(--text-tertiary)" />;
    case '⚙️': return <Activity size={14} stroke="var(--text-tertiary)" />;
    case '⚡': return <Zap size={14} stroke="var(--text-tertiary)" />;
    case '🌀': return <Fan size={14} stroke="var(--text-tertiary)" />;
    default: return <Box size={14} stroke="var(--text-tertiary)" />;
  }
}

export function MachineCard({ machine, index }: Props) {
  const { selectedMachineId, setSelectedMachine, setViewMode } = useApexStore();
  const isSelected = selectedMachineId === machine.machine_id;
  const { urgency, rul_mean, rul_std, buffer_length, mode, current_cycle } = machine;
  const warming = buffer_length < 30;
  const config = getMachineConfig(machine.machine_id);

  // Position is 0 (healthy, start) to ~1 (critical, fail line)
  // Re-map RUL from our 160 max line to progress bar visually.
  const position = Math.max(0, Math.min(1, 1 - (rul_mean / 160)));

  return (
    <div
      id={`machine-card-${index}`}
      className={`card machine-card ${isSelected ? 'selected' : ''}`}
      onClick={() => { setSelectedMachine(machine.machine_id); setViewMode('detail'); }}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          setSelectedMachine(machine.machine_id);
          setViewMode('detail');
        }
      }}
    >
      {/* Fallback "degraded" tag wrapper */}
      {mode === 'degraded' && (
        <div style={{ position: 'absolute', top: -6, right: 10, background: 'var(--critical)', color: 'white', padding: '1px 6px', fontSize: 9, borderRadius: 4, fontWeight: 'bold' }}>
          DEGRADED
        </div>
      )}

      {/* Row 1: Name + Badge */}
      <div className="flex justify-between items-center" style={{ marginBottom: 2 }}>
        <div className="flex items-center gap-2">
          {getIconForConfig(config)}
          <span className="text-body" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {getPumpName(machine.machine_id)}
          </span>
        </div>
        <div className={`badge badge-${urgency.level}`}>
          {warming ? 'Warming' : urgency.level.toLowerCase()}
        </div>
      </div>

      {/* Row 2: Type + Component */}
      <div className="text-label text-secondary" style={{ paddingLeft: 22 }}>
        {config?.type} · {getComponentName(machine.machine_id)}
      </div>

      {/* Row 3: Main RUL metric */}
      <div className="flex items-baseline gap-2" style={{ marginTop: 10, marginBottom: 8 }}>
        <span className="mono-hero" style={{ fontSize: 28, color: 'var(--text-primary)' }}>
          {warming ? '...' : rul_mean.toFixed(1)}
        </span>
        {!warming && (
          <span className="mono text-micro text-tertiary">
            ±{rul_std.toFixed(1)} cy
          </span>
        )}
      </div>

      {/* Row 4: Progress Bar */}
      <div 
        style={{ 
          width: '100%', 
          height: 2, 
          background: 'var(--bg-surface-3)', 
          borderRadius: 2, 
          overflow: 'hidden',
          marginBottom: 6 
        }}
      >
        <div 
          style={{ 
            height: '100%', 
            width: `${Math.min(100, Math.max(0, position * 100))}%`, 
            background: `var(--${warming ? 'text-disabled' : urgency.level.toLowerCase()})`,
            transition: 'width var(--transition-chart)'
          }}
        />
      </div>

      {/* Row 5: Time metrics */}
      <div className="mono text-micro text-tertiary flex justify-between">
        <span>{cycleLabel(current_cycle)}</span>
        <span>{Math.round(current_cycle * 100).toLocaleString()} hrs</span>
      </div>
    </div>
  );
}
