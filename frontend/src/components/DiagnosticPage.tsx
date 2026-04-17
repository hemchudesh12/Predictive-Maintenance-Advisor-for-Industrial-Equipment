import React, { useState } from 'react';
import { useApexStore } from '../store/apexStore';
import { MachineAnimation } from './MachineAnimation';
import { HeroChart } from './HeroChart';
import { RootCauseAnalysis } from './RootCauseAnalysis';
import { MachineProfile } from './MachineProfile';
import { RepairOptions } from './RepairOptions';
import { SimilarFailures } from './SimilarFailures';
import { getPumpName, getMachineConfig, MACHINE_ICON_LABELS } from '../constants/machines';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Per-machine email recipient configurator (FIX 3 frontend) */
function AlertConfig({ machineId }: { machineId: string }) {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveRecipient = async () => {
    if (!email) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/alert/set-recipient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machineId, email }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Alert recipient:</span>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="factory-manager@company.com"
        style={{
          flex: 1, minWidth: 180,
          padding: '5px 10px', fontSize: 12, borderRadius: 6,
          border: '1px solid var(--apex-border)', background: 'var(--apex-surface-2)', color: 'var(--text-primary)',
        }}
      />
      <button
        onClick={saveRecipient}
        disabled={saving || !email}
        style={{
          padding: '5px 14px', fontSize: 12, borderRadius: 6,
          background: saved ? '#064e3b' : 'var(--accent)', color: 'white',
          border: 'none', cursor: 'pointer', opacity: (!email || saving) ? 0.5 : 1,
        }}
      >
        {saved ? '✓ Saved' : saving ? '...' : 'Set'}
      </button>
    </div>
  );
}

export const DiagnosticPage: React.FC = () => {
  const { selectedMachineId, setViewMode, machines } = useApexStore();
  
  if (!selectedMachineId) {
    return (
      <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => setViewMode('fleet')}>Return to Fleet</button>
      </div>
    );
  }

  const machine = machines[selectedMachineId];
  if (!machine) return null;

  const machineConfig = getMachineConfig(selectedMachineId);
  const iconLabel = MACHINE_ICON_LABELS[machineConfig.icon];

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
          <span style={{ fontSize: 20, fontWeight: 'bold' }}>
            {iconLabel} {getPumpName(selectedMachineId)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {machineConfig.type} · {machineConfig.subtype}
          </span>
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

      {/* Top section: Machine SVG (Left) + RUL Chart (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: 'var(--gap-section)', alignItems: 'stretch' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <div className="section-title" style={{ alignSelf: 'flex-start', width: '100%' }}>REAL-TIME TELEMETRY</div>
          <MachineAnimation machine={machine} config={machineConfig} />
          {/* Email alert config per machine (FIX 3) */}
          <AlertConfig machineId={selectedMachineId} />
        </div>
        
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
