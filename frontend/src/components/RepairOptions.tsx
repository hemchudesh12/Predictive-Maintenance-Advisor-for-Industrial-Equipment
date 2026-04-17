import React, { useMemo } from 'react';
import { useApexStore } from '../store/apexStore';
import { getMachineProfile } from './MachineProfile';
import { getMachineConfig, getComponentCost } from '../constants/machines';

interface RepairOption {
  id: string;
  rank: number;
  title: string;
  description: string;
  cost: number;
  costDisplay: string;
  lifeExtension: number;
  newExpectedLife: number;
  costPerYear: number;
  riskIfIgnored: string;
  recommendation: 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT RECOMMENDED';
  timeToImplement: string;
  requiresShutdown: boolean;
}


function getComponentLifeExtension(component: string): number {
  const extensions: Record<string, number> = {
    'Bearing': 4,
    'Seal': 3,
    'Impeller': 5,
    'Motor': 6,
    'Gearbox': 5,
  };
  return extensions[component] || 4;
}

function getOverhaulCost(power: string): number {
  const hp = parseInt(power) || 50;
  return hp * 4000 + 50000;
}

function getReplacementCost(power: string): number {
  const hp = parseInt(power) || 50;
  return hp * 8000 + 100000;
}

function formatINR(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

export const RepairOptions: React.FC<{ machineId: string }> = ({ machineId }) => {
  const machine = useApexStore(s => s.machines[machineId]);
  
  const options = useMemo(() => {
    if (!machine) return [];
    
    const profile = getMachineProfile(machineId);
    if (!profile) return [];

    // Use machine-specific component from config
    const machineConfig = getMachineConfig(machineId);
    const component = machineConfig.component;
    const currentAge = parseFloat(profile.currentAge);
    const expectedLifespan = parseFloat(profile.expectedLifespan);
    const remainingLifeYears = expectedLifespan - currentAge;

    const opts: RepairOption[] = [];

    opts.push({
      id: 'targeted',
      rank: 1,
      title: `Replace ${component.toLowerCase()} assembly`,
      description: `Remove and replace the degraded ${component.toLowerCase()} with OEM-spec part. Restores subsystem to near-new condition.`,
      cost: getComponentCost(component),
      costDisplay: formatINR(getComponentCost(component)),
      lifeExtension: getComponentLifeExtension(component),
      newExpectedLife: remainingLifeYears + getComponentLifeExtension(component),
      costPerYear: getComponentCost(component) / getComponentLifeExtension(component),
      riskIfIgnored: `${component} failure within ${machine.rul_mean.toFixed(0)} cycles. Unplanned downtime cost: ₹${(12 + Math.random() * 8).toFixed(1)}L`,
      recommendation: 'BEST',
      timeToImplement: '4-6 hours',
      requiresShutdown: true,
    });

    opts.push({
      id: 'overhaul',
      rank: 2,
      title: 'Full pump overhaul',
      description: `Complete disassembly, inspection, and replacement of all wear parts. Resets all components to baseline.`,
      cost: getOverhaulCost(profile.power),
      costDisplay: formatINR(getOverhaulCost(profile.power)),
      lifeExtension: expectedLifespan * 0.7,
      newExpectedLife: expectedLifespan * 0.7,
      costPerYear: getOverhaulCost(profile.power) / (expectedLifespan * 0.7),
      riskIfIgnored: 'Multiple component failures likely within 1-2 years. Cascading damage risk.',
      recommendation: currentAge > expectedLifespan * 0.5 ? 'GOOD' : 'ACCEPTABLE',
      timeToImplement: '2-3 days',
      requiresShutdown: true,
    });

    opts.push({
      id: 'replace',
      rank: 3,
      title: 'Replace entire pump unit',
      description: `Install new pump of same specification. Old unit decommissioned or rebuilt as spare.`,
      cost: getReplacementCost(profile.power),
      costDisplay: formatINR(getReplacementCost(profile.power)),
      lifeExtension: expectedLifespan,
      newExpectedLife: expectedLifespan,
      costPerYear: getReplacementCost(profile.power) / expectedLifespan,
      riskIfIgnored: 'Current pump reaches end-of-life. Increasing maintenance burden.',
      recommendation: currentAge > expectedLifespan * 0.7 ? 'GOOD' : 'NOT RECOMMENDED',
      timeToImplement: '1-2 weeks',
      requiresShutdown: true,
    });

    opts.push({
      id: 'rtf',
      rank: 4,
      title: 'Run to failure (do nothing)',
      description: `Continue operating without intervention. Monitor closely.`,
      cost: 0,
      costDisplay: '₹0',
      lifeExtension: 0,
      newExpectedLife: machine.rul_mean / (365 * 24),
      costPerYear: 0,
      riskIfIgnored: `Unplanned failure probability: ${Math.round(machine.fail_prob_30 * 100)}% within 30 cycles. Expected downtime cost: ₹${(8 + Math.random() * 12).toFixed(1)}L.`,
      recommendation: 'NOT RECOMMENDED',
      timeToImplement: 'N/A',
      requiresShutdown: false,
    });

    return opts.sort((a, b) => {
      if (a.recommendation === 'BEST') return -1;
      if (b.recommendation === 'BEST') return 1;
      return a.costPerYear - b.costPerYear;
    });
  }, [machine, machineId]);

  if (!machine) return null;

  if (machine.urgency.level === 'HEALTHY') {
    return (
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-title">REPAIR ADVISOR</div>
        <div style={{ textAlign: 'center', margin: 'auto', padding: '2rem' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✔️</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#34C759' }}>No Immediate Maintenance Required</h3>
          <p className="muted" style={{ lineHeight: 1.5, margin: 0 }}>
            Next recommended service: Bearing inspection in ~{Math.round(machine.rul_mean)} cycles.
          </p>
        </div>
      </div>
    );
  }

  const getBadgeStyle = (rec: RepairOption['recommendation']) => {
    switch(rec) {
      case 'BEST': return { bg: '#064e3b', color: '#34d399', icon: '★ RECOMMENDED' };
      case 'GOOD': return { bg: '#1e3a8a', color: '#60a5fa', icon: '👍 GOOD OPTION' };
      case 'ACCEPTABLE': return { bg: '#78350f', color: '#fbbf24', icon: '✓ ACCEPTABLE' };
      case 'NOT RECOMMENDED': return { bg: '#7f1d1d', color: '#f87171', icon: '⛔ NOT RECOMMENDED' };
    }
  };

  const avgUnplannedCostLakhs = 16; 
  const buildROIBar = (opt: RepairOption) => {
    if (opt.id === 'rtf') return null;
    const costLakhs = opt.cost / 100000;
    const roiMultiplier = Math.round((avgUnplannedCostLakhs - costLakhs) / costLakhs);
    const pct = Math.min(100, Math.max(0, roiMultiplier * 5));
    
    return (
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
        <div style={{ width: 40, fontWeight: 'bold' }}>ROI</div>
        <div style={{ flex: 1, height: 8, background: 'var(--apex-border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <div style={{ width: 60, textAlign: 'right', fontWeight: 'bold', color: 'var(--accent)' }}>{roiMultiplier}x</div>
      </div>
    );
  };

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="section-title">REPAIR OPTIONS (RANKED)</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {options.map((opt, i) => {
          const badge = getBadgeStyle(opt.recommendation);
          return (
            <div key={opt.id} style={{ border: `1px solid ${opt.rank === 1 ? 'var(--accent)' : 'var(--apex-border)'}`, borderRadius: 6, padding: '12px 16px', background: 'var(--apex-surface-2)', position: 'relative' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>{badge.icon}</span>
                  <strong style={{ fontSize: 14 }}>{opt.title}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Rank #{i + 1}</div>
              </div>

              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#e0e0e0', marginBottom: 12 }}>
                {opt.description}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, auto)', gap: '4px 16px', fontSize: 12, marginBottom: 12 }}>
                <div><span className="muted">Cost:</span> <strong style={{ color: '#fff' }}>{opt.costDisplay}</strong></div>
                <div><span className="muted">Life extension:</span> <strong style={{ color: '#fff' }}>+{opt.lifeExtension.toFixed(1)} years</strong></div>
                <div><span className="muted">Cost/year:</span> <strong style={{ color: '#fff' }}>{formatINR(opt.costPerYear)}</strong></div>
                <div><span className="muted">Implementation:</span> <strong style={{ color: '#fff' }}>{opt.timeToImplement}</strong></div>
                <div><span className="muted">Requires shutdown:</span> <strong style={{ color: '#fff' }}>{opt.requiresShutdown ? 'Yes' : 'No'}</strong></div>
              </div>

              <div style={{ background: 'rgba(255, 45, 45, 0.1)', border: '1px solid rgba(255, 45, 45, 0.2)', padding: '6px 10px', borderRadius: 4, fontSize: 12, color: '#fca5a5' }}>
                <strong style={{ opacity: 0.8 }}>⚠ If ignored: </strong>
                {opt.riskIfIgnored}
              </div>

              {buildROIBar(opt)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
