import React from 'react';
import { useApexStore } from '../store/apexStore';
import { getMachineConfig } from '../constants/machines';

export const MachineProfile: React.FC = () => {
  const { machines, selectedMachineId } = useApexStore();
  const machineId = selectedMachineId || Object.keys(machines)[0];
  const machine = machines[machineId];
  
  if (!machine) return null;
  const config = getMachineConfig(machineId);

  const delta = Math.round(machine.rul_mean - config.fleetAverageRul);
  const deltaColor = delta > 0 ? 'var(--healthy)' : delta < -10 ? 'var(--critical)' : 'var(--warning)';
  const urgencyLvl = machine.urgency.level;
  const compColor = urgencyLvl === 'CRITICAL' ? 'var(--critical)' : urgencyLvl === 'WARNING' ? 'var(--warning)' : urgencyLvl === 'MONITOR' ? 'var(--monitor)' : 'var(--text-primary)';

  return (
    <div className="card flex-col" style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div className="text-h2" style={{ marginBottom: 16 }}>Machine Profile</div>

      {/* Two column grid (40/60) */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(120px, 40%) minmax(0, 60%)', 
          rowGap: 14, 
          columnGap: 16,
          alignItems: 'baseline'
        }}
      >
        <div className="text-label text-secondary">Type</div>
        <div className="text-body text-primary">{config.type}</div>

        <div className="text-label text-secondary">Subtype</div>
        <div className="text-body text-primary">{config.subtype}</div>

        <div className="text-label text-secondary">Location</div>
        <div className="text-body text-primary">{config.location}</div>

        <div className="text-label text-secondary">Failing component</div>
        <div className="text-body" style={{ color: compColor, fontWeight: 600 }}>{config.component}</div>

        <div className="text-label text-secondary">Expected lifespan</div>
        <div className="text-body text-primary">{config.expectedLifespan} years</div>

        <div className="text-label text-secondary">Current age</div>
        <div className="text-body text-primary">
          <span className="mono">{config.currentAge.toFixed(1)}</span> years
          <span className="text-tertiary" style={{ marginLeft: 6 }}>({config.agePercent.toFixed(1)}%)</span>
        </div>

        <div className="text-label text-secondary">Operating hours</div>
        <div className="text-body text-primary mono">{config.operatingHours.toLocaleString()} hrs</div>

        <div className="text-label text-secondary">Cost per cycle</div>
        <div className="text-body text-primary mono">₹{config.costPerCycle.toLocaleString()}</div>

        <div className="text-label text-secondary">Last maintenance</div>
        <div className="text-body text-primary">{config.lastMaintenance}</div>

        <div className="text-label text-secondary">Previous failures</div>
        <div className="flex-col gap-1">
          <span className="text-body text-primary mono">
            {config.previousFailures.length === 0 ? '0' : config.previousFailures.length} 
            <span style={{ fontFamily: 'var(--font-sans)' }}> total failures</span>
          </span>
          {config.previousFailures.length > 0 && (
            <span className="text-micro text-tertiary" style={{ opacity: 0.8, textTransform: 'none' }}>
              {config.previousFailures.join(', ')}
            </span>
          )}
        </div>
      </div>

      <div style={{ margin: '16px 0', height: 1, background: 'var(--border-default)' }} />

      <div className="flex justify-between items-center bg-surface-2" style={{ padding: '4px 0' }}>
        <span className="text-label text-secondary">Fleet comparative RUL</span>
        <div className="text-right">
          <span className="mono-body" style={{ color: deltaColor }}>
            {delta > 0 ? '+' : ''}{delta} cy
          </span>
          <span className="text-label text-tertiary" style={{ marginLeft: 6 }}>vs avg</span>
        </div>
      </div>

    </div>
  );
};
