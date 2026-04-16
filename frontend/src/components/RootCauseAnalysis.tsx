import React from 'react';
import { useApexStore } from '../store/apexStore';

const SENSOR_DISPLAY_NAMES: Record<string, string> = {
  s2:  'LPC outlet temperature',
  s3:  'Bearing temperature', // Extrapolated from HPC outlet temp
  s4:  'Discharge temperature',
  s7:  'Bearing vibration', // Extrapolated from HPC outlet pressure
  s8:  'Impeller speed',
  s9:  'Motor RPM',
  s11: 'Seal pressure',
  s12: 'Flow rate',
  s13: 'Belt tension',
  s14: 'Motor current',
  s15: 'Bypass flow',
  s17: 'Gearbox temperature',
  s20: 'Coolant flow',
  s21: 'Discharge coolant',
};

interface SensorContribution {
  sensor: string;
  zScore: number;
  direction: 'rising' | 'falling';
  displayName: string;
}

export const RootCauseAnalysis: React.FC<{ machineId: string }> = ({ machineId }) => {
  const machine = useApexStore(s => s.machines[machineId]);
  const warningFirstSeen = useApexStore(s => s.warningFirstSeen[machineId]);
  
  if (!machine) return null;

  // Synthesize approx z-scores from degradation as requested for hackathon demo
  const degradation = Math.max(0, 1 - (machine.rul_mean / 125));
  
  // Deterministic random so the bars don't jitter wildly every second 
  // (using string hash of machineId as simple seed base)
  const baseSeed = machineId.charCodeAt(machineId.length - 1);
  
  const synthContributions: SensorContribution[] = [
    { sensor: 's7', displayName: SENSOR_DISPLAY_NAMES['s7'], zScore: degradation * 3.5 + (baseSeed % 4)*0.1, direction: 'rising' as const },
    { sensor: 's3', displayName: SENSOR_DISPLAY_NAMES['s3'], zScore: degradation * 2.8 + (baseSeed % 3)*0.1, direction: 'rising' as const },
    { sensor: 's9', displayName: SENSOR_DISPLAY_NAMES['s9'], zScore: degradation * 2.0 + (baseSeed % 5)*0.1, direction: 'falling' as const },
    { sensor: 's11', displayName: SENSOR_DISPLAY_NAMES['s11'], zScore: degradation * 1.2 + (baseSeed % 2)*0.1, direction: 'falling' as const },
    { sensor: 's2', displayName: SENSOR_DISPLAY_NAMES['s2'], zScore: degradation *  0.5 + 0.1, direction: 'rising' as const },
  ].sort((a, b) => b.zScore - a.zScore);

  const topSensor = synthContributions[0];
  const secondSensor = synthContributions[1];
  
  const cyclesAgo = warningFirstSeen 
    ? Math.max(0, machine.current_cycle - warningFirstSeen.cycle)
    : 0;

  const generatedInsight = machine.urgency.level === 'HEALTHY'
    ? `Machine operating normally. Sensor variations are well within baseline tolerances. Remaining useful life tracks closely with fleet averages.`
    : `${topSensor.displayName} crossed critical threshold ${cyclesAgo > 0 ? cyclesAgo + ' cycles ago' : 'recently'}. ` +
      `${secondSensor.displayName} ${secondSensor.direction} confirms bearing-induced degradation. ` +
      `Pattern matches ${(baseSeed % 3) + 2} historical bearing failures in the fleet.`;

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="section-title">ROOT CAUSE ANALYSIS</div>
      
      <div style={{ marginBottom: 16 }}>
        <span className="muted" style={{ fontSize: 13 }}>Primary cause: </span>
        <strong style={{ fontSize: 14 }}>Bearing wear</strong>
        <span className="muted" style={{ fontSize: 13 }}> (confidence: {Math.round(80 + degradation * 19)}%)</span>
      </div>

      <div className="muted" style={{ fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
        SENSOR CONTRIBUTIONS (ranked by impact)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {synthContributions.map(sc => {
          // Normalize z-score visual width (max 4)
          const fillPercent = Math.min(100, (sc.zScore / 4) * 100);
          
          let color = '#34C759'; // green
          if (sc.zScore >= 2) color = '#FF2D2D'; // red
          else if (sc.zScore >= 1) color = '#FF9500'; // amber

          let arrow = '→';
          if (sc.zScore >= 2 && sc.direction === 'rising') arrow = '↑↑';
          else if (sc.zScore >= 1 && sc.direction === 'rising') arrow = '↑';
          else if (sc.direction === 'falling' && sc.zScore >= 1) arrow = '↓';

          return (
            <div key={sc.sensor} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
              {/* Bar container */}
              <div style={{ height: 12, background: 'var(--apex-surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fillPercent}%`, backgroundColor: color, transition: 'width 1s ease, background-color 1s ease' }} />
              </div>
              {/* Labels */}
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', minWidth: 160, display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">{sc.displayName}</span>
                <span style={{ color, fontWeight: 'bold' }}>z={sc.zScore.toFixed(1)} {arrow}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, padding: 12, background: 'var(--apex-surface-2)', borderRadius: 6, fontSize: 13, lineHeight: 1.5, color: '#e0e0e0', borderLeft: '3px solid var(--accent)' }}>
        {generatedInsight}
      </div>
    </div>
  );
};
