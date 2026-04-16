// src/components/CounterfactualCard.tsx
// Failure cost comparison card — shown when the selected machine is CRITICAL.
// Uses warningFirstSeen from the store to compute how many cycles APEX flagged early.

import { useApexStore } from '../store/apexStore';
import { getPumpName, getComponentName } from '../constants/machines';

const COST_PER_CYCLE_INR = 3500; // ₹3,500 per cycle for an SME pump

function formatInr(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function CounterfactualCard() {
  const { selectedMachineId, machines, warningFirstSeen, costConfig } = useApexStore();
  const machine = selectedMachineId ? machines[selectedMachineId] : null;

  if (!machine || machine.urgency.level !== 'CRITICAL') return null;

  const machineId = machine.machine_id;
  const pumpName = getPumpName(machineId);
  const component = getComponentName(machineId, machine.component_attribution.component);
  const firstSeen = warningFirstSeen[machineId];

  // Cycles APEX flagged early = rul at first WARNING detection
  const cyclesEarly = firstSeen ? Math.max(5, Math.round(firstSeen.rul)) : Math.round(machine.rul_mean + 25);

  // Cost calculations
  const runToFailureCost = costConfig?.cost_per_failure ?? 250000;
  const plannedMaintenanceCost = costConfig?.cost_per_maintenance ?? 12000;
  const earlyDetectionSavings = Math.max(0, (cyclesEarly * COST_PER_CYCLE_INR) - plannedMaintenanceCost);
  const totalSavings = Math.max(earlyDetectionSavings, costConfig?.savings_per_prevention ?? 238000);

  const currentCycleLabel = machine.current_cycle > 0 ? `cycle ${machine.current_cycle}` : 'now';
  const failureCycleLabel = machine.current_cycle > 0
    ? `cycle ${machine.current_cycle + Math.round(machine.rul_mean)}`
    : 'imminent';

  return (
    <div
      style={{
        marginTop: 12,
        padding: '14px 16px',
        background: 'rgba(255,45,45,0.05)',
        border: '1px solid rgba(255,45,45,0.25)',
        borderRadius: 10,
        animation: 'slideInFromBottom 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--color-critical)', fontWeight: 700 }}>
          ⚠ FAILURE COST COMPARISON
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          · {pumpName} · {component}
        </span>
      </div>

      {/* Two-column comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {/* Without APEX */}
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255,45,45,0.08)',
          borderRadius: 8,
          borderLeft: '3px solid var(--color-critical)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--color-critical)', fontWeight: 600, marginBottom: 6 }}>
            Without APEX
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Run to failure<br />
            at {failureCycleLabel}<br />
            <span style={{ color: 'var(--color-critical)', fontWeight: 600, fontSize: 13 }}>
              {formatInr(runToFailureCost)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> downtime</span>
          </div>
        </div>

        {/* With APEX */}
        <div style={{
          padding: '10px 12px',
          background: 'rgba(52,199,89,0.08)',
          borderRadius: 8,
          borderLeft: '3px solid var(--color-healthy)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--color-healthy)', fontWeight: 600, marginBottom: 6 }}>
            With APEX
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Flagged {cyclesEarly} cycles early<br />
            at {currentCycleLabel}<br />
            <span style={{ color: 'var(--color-healthy)', fontWeight: 600, fontSize: 13 }}>
              {formatInr(plannedMaintenanceCost)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> planned</span>
          </div>
        </div>
      </div>

      {/* Savings banner */}
      <div style={{
        padding: '8px 14px',
        background: 'rgba(52,199,89,0.12)',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{ color: 'var(--color-healthy)', fontWeight: 700, fontSize: 15 }}>
            SAVED: {formatInr(totalSavings)}
          </span>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            vs. unplanned catastrophic failure
          </div>
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          textAlign: 'right', lineHeight: 1.5,
        }}>
          P(fail 30cy) = {Math.round(machine.fail_prob_30 * 100)}%<br />
          RUL = {machine.rul_mean.toFixed(1)} cy
        </div>
      </div>

      <style>{`
        @keyframes slideInFromBottom {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
