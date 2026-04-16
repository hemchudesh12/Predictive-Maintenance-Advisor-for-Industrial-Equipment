import React from 'react';
import { useApexStore } from '../store/apexStore';

export interface MachineProfileData {
  type: string;
  power: string;
  expectedLifespan: string;
  currentAge: string;
  agePercent: number;
  operatingHours: number;
  lastMaintenance: string;
  previousFailures: string[];
  fleetAverageRul: number;
}

const MACHINE_PROFILES: Record<string, MachineProfileData> = {
  'engine_1': { type: 'Centrifugal pump', power: '50 HP', expectedLifespan: '15', currentAge: '5.2', agePercent: 34.7, operatingHours: 38400, lastMaintenance: '847 cycles ago', previousFailures: ['Bearing replacement (Year 2)', 'Seal replacement (Year 4)'], fleetAverageRul: 94 },
  'engine_2': { type: 'Centrifugal pump', power: '30 HP', expectedLifespan: '15', currentAge: '3.8', agePercent: 25.3, operatingHours: 28000, lastMaintenance: '320 cycles ago', previousFailures: ['None'], fleetAverageRul: 108 },
  'engine_3': { type: 'Centrifugal pump', power: '75 HP', expectedLifespan: '12', currentAge: '8.4', agePercent: 70.0, operatingHours: 62000, lastMaintenance: '12 cycles ago', previousFailures: ['Impeller balancing (Year 5)'], fleetAverageRul: 45 },
  'engine_4': { type: 'Centrifugal pump', power: '100 HP', expectedLifespan: '20', currentAge: '14.1', agePercent: 70.5, operatingHours: 104000, lastMaintenance: '950 cycles ago', previousFailures: ['Full overhaul (Year 10)'], fleetAverageRul: 30 },
  'engine_5': { type: 'Centrifugal pump', power: '50 HP', expectedLifespan: '15', currentAge: '12.8', agePercent: 85.3, operatingHours: 94500, lastMaintenance: '400 cycles ago', previousFailures: ['Seal leak (Year 11)', 'Bearing wear (Year 8)'], fleetAverageRul: 10 },
};

// Fallback profile if more engines are added dynamically
const FALLBACK_PROFILE: MachineProfileData = {
  type: 'Centrifugal pump', power: '50 HP', expectedLifespan: '15', currentAge: '7.5', agePercent: 50.0, operatingHours: 50000, lastMaintenance: '500 cycles ago', previousFailures: ['None'], fleetAverageRul: 75
};

export function getMachineProfile(machineId: string) {
  return MACHINE_PROFILES[machineId] || FALLBACK_PROFILE;
}

export const MachineProfile: React.FC<{ machineId: string }> = ({ machineId }) => {
  const machine = useApexStore(s => s.machines[machineId]);
  const profile = getMachineProfile(machineId);

  if (!machine) return null;

  const delta = Math.round(machine.rul_mean - profile.fleetAverageRul);
  const isUnderperforming = delta < 0;

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="section-title">MACHINE PROFILE</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
        <div className="muted">Type:</div>
        <div style={{ wordBreak: 'break-word' }}>{profile.type} ({profile.power})</div>

        <div className="muted">Expected lifespan:</div>
        <div>{profile.expectedLifespan} years</div>

        <div className="muted">Current age:</div>
        <div>{profile.currentAge} years 
          <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>({profile.agePercent.toFixed(1)}%)</span>
        </div>

        <div className="muted">Operating hours:</div>
        <div>{profile.operatingHours.toLocaleString()} hrs</div>

        <div className="muted">Last maintenance:</div>
        <div>{profile.lastMaintenance}</div>

        <div className="muted">Total failures:</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{profile.previousFailures.length}</span>
          <span className="muted" style={{ fontSize: 11 }}>{profile.previousFailures.join(', ')}</span>
        </div>
        
        <div style={{ gridColumn: 'span 2', height: 1, backgroundColor: 'var(--apex-border)', margin: '4px 0' }} />

        <div className="muted">Fleet avg RUL (this age):</div>
        <div>{profile.fleetAverageRul} cycles</div>

        <div className="muted">This machine vs fleet:</div>
        <div>
          <span style={{ fontWeight: 'bold', color: isUnderperforming ? 'var(--alert-critical)' : '#34C759' }}>
            {delta > 0 ? '+' : ''}{delta} cycles
          </span>
          <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 'bold', color: isUnderperforming ? 'var(--alert-critical)' : '#34C759' }}>
            ({isUnderperforming ? 'UNDERPERFORMING' : 'ABOVE AVERAGE'})
          </span>
        </div>
      </div>
    </div>
  );
};
