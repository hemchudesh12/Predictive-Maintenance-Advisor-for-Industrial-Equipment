import React from 'react';
import { useApexStore } from '../store/apexStore';
import { AnimatedPump } from './AnimatedPump';
import { HeroChart } from './HeroChart';
import { RootCauseAnalysis } from './RootCauseAnalysis';
import { MachineProfile } from './MachineProfile';
import { RepairOptions } from './RepairOptions';
import { SimilarFailures } from './SimilarFailures';
import { getPumpName } from '../constants/machines';

export const DiagnosticPage: React.FC = () => {
  const { selectedMachineId, setViewMode, machines } = useApexStore();
  
  if (!selectedMachineId) {
    // Failsafe 
    return (
      <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => setViewMode('fleet')}>Return to Fleet</button>
      </div>
    );
  }

  const machine = machines[selectedMachineId];
  if (!machine) return null; // Wait for frame

  // Normalize sensors for pump SVG
  // If sensor_snapshot is missing, fallback to approximations based on rul
  const degradation = Math.max(0, 1 - (machine.rul_mean / 125));
  
  const pumpProps = {
    urgency: machine.urgency.level,
    rpm: machine.sensor_snapshot?.['s8'] ? (machine.sensor_snapshot['s8'] - 2000) / 500 : 1.0 - degradation,
    vibration: machine.sensor_snapshot?.['s7'] ? (machine.sensor_snapshot['s7'] - 300) / 200 : degradation * 1.5,
    bearingTemp: degradation * 1.2,
    motorTemp: degradation * 0.9,
    flowRate: 1.0 - (degradation * 0.5),
    isRunning: (machine.urgency.level as string) !== 'STOPPED', // Assumption 
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-section)' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--apex-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            className="btn icon-btn" 
            onClick={() => setViewMode('fleet')}
            style={{ padding: '6px 12px', background: 'var(--apex-surface-2)', border: '1px solid var(--apex-border)', borderRadius: 6, cursor: 'pointer', color: '#ccc' }}
          >
            ← Back to fleet
          </button>
          <span style={{ fontSize: 20, fontWeight: 'bold' }}>{getPumpName(selectedMachineId)}</span>
        </div>
        <div style={{ 
          background: machine.urgency.bg_color, 
          color: machine.urgency.color_token, 
          padding: '6px 12px', 
          borderRadius: 20,
          fontWeight: 'bold',
          fontSize: 14,
          border: `1px solid ${machine.urgency.color_token}40`
        }}>
          {machine.urgency.level}
        </div>
      </div>

      {/* Top section: Pump SVG (Left) + RUL Chart (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: 'var(--gap-section)', alignItems: 'stretch' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <div className="section-title" style={{ alignSelf: 'flex-start', width: '100%' }}>REAL-TIME TELEMETRY</div>
          <AnimatedPump {...pumpProps} />
        </div>
        
        {/* We reuse the HeroChart logic, simply by letting it render the currently selected machine */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <HeroChart />
        </div>
      </div>

      {/* Middle section: Root Cause & Profiling */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-section)' }}>
        <RootCauseAnalysis machineId={selectedMachineId} />
        <MachineProfile machineId={selectedMachineId} />
      </div>

      {/* Bottom section: Repair Options & Similar Failures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-section)' }}>
        <RepairOptions machineId={selectedMachineId} />
        <SimilarFailures />
      </div>
    </div>
  );
};
