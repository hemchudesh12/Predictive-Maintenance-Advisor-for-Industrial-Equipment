import { motion } from 'framer-motion';
import { useApexStore } from '../store/apexStore';
import { getMachineConfig } from '../constants/machines';

// ── Shared Animation Hooks ──────────────────────────────────────────────────

function useSchematicAnimations(machine: any) {
  const urgency = machine?.urgency?.level || 'HEALTHY';
  const zScores = machine?.latest_z_scores || [];
  
  // CMAPSS mapping approximation from 21 sensors
  const heatZ = zScores.slice(0, 4).reduce((a:number,b:number)=>a+Math.abs(b),0) / 4 || 0;

  // Rotational duration mappings
  const rotateDur = urgency === 'CRITICAL' ? 0.3 : urgency === 'WARNING' ? 0.8 : urgency === 'MONITOR' ? 1.5 : 2.5;
  const flowDur = urgency === 'CRITICAL' ? 0.4 : urgency === 'WARNING' ? 0.9 : urgency === 'MONITOR' ? 1.2 : 2.0;
  
  // Vibration amplitude mapping
  const vibAmp = urgency === 'HEALTHY' ? 0 : urgency === 'CRITICAL' ? 3 : 1;
  const heatColor = heatZ > 2.5 ? 'rgba(239, 68, 68, 0.4)' : heatZ > 1.5 ? 'rgba(249, 115, 22, 0.2)' : heatZ > 1.0 ? 'rgba(94, 225, 212, 0.1)' : 'transparent';

  return { rotateDur, flowDur, vibAmp, heatColor };
}

// ── Machine Schematic Implementations ───────────────────────────────────────

function PumpSchematic({ anim }: { anim: ReturnType<typeof useSchematicAnimations> }) {
  return (
    <motion.svg width="100%" height="100%" viewBox="0 0 320 240" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
      {/* Background Heat Glow */}
      <defs>
        <radialGradient id="pump-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={anim.heatColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="120" r="80" fill="url(#pump-heat)" stroke="none" />

      {/* Main Body */}
      <motion.g animate={{ x: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp], y: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp] }} transition={{ repeat: Infinity, duration: 0.1 }}>
        <path d="M40 120 L80 120" />
        <path d="M240 120 L280 120" />
        <rect x="80" y="80" width="40" height="80" rx="4" />
        
        {/* Impeller Housing */}
        <circle cx="160" cy="120" r="40" />
        <path d="M160 80 Q 200 40, 240 120" />

        {/* Rotating Impeller */}
        <motion.g 
          style={{ originX: '160px', originY: '120px' }}
          animate={{ rotate: 360 }} 
          transition={{ ease: 'linear', repeat: Infinity, duration: anim.rotateDur }}
        >
          <circle cx="160" cy="120" r="30" strokeDasharray="10 10" />
          <line x1="160" y1="90" x2="160" y2="150" />
          <line x1="130" y1="120" x2="190" y2="120" />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
}

function TurbineSchematic({ anim }: { anim: ReturnType<typeof useSchematicAnimations> }) {
  return (
    <motion.svg width="100%" height="100%" viewBox="0 0 320 240" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
      <defs>
        <radialGradient id="turb-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={anim.heatColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect x="100" y="60" width="120" height="120" fill="url(#turb-heat)" stroke="none" />

      <motion.g animate={{ x: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp] }} transition={{ repeat: Infinity, duration: 0.1 }}>
        {/* Flared casing */}
        <path d="M40 80 C 100 80, 220 100, 280 100" />
        <path d="M40 160 C 100 160, 220 140, 280 140" />
        <line x1="40" y1="80" x2="40" y2="160" />
        <line x1="280" y1="100" x2="280" y2="140" />
        <line x1="20" y1="120" x2="300" y2="120" />

        {/* Rotor Stages */}
        {[100, 160, 220].map((cx, i) => (
          <motion.ellipse 
            key={i} cx={cx} cy="120" rx="10" ry={30 - i*5} 
            animate={{ rotate: 360 }} 
            style={{ originX: `${cx}px`, originY: '120px' }}
            transition={{ ease: 'linear', repeat: Infinity, duration: anim.rotateDur / (i+1) }} 
            strokeDasharray="4 4"
          />
        ))}
      </motion.g>
    </motion.svg>
  );
}

function MotorSchematic({ anim }: { anim: ReturnType<typeof useSchematicAnimations> }) {
  return (
    <motion.svg width="100%" height="100%" viewBox="0 0 320 240" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
      <defs>
        <radialGradient id="motor-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={anim.heatColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="120" r="70" fill="url(#motor-heat)" stroke="none" />

      <motion.g animate={{ x: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp] }} transition={{ repeat: Infinity, duration: 0.1 }}>
        <rect x="80" y="70" width="160" height="100" rx="10" />
        <rect x="140" y="50" width="40" height="20" />
        <line x1="240" y1="120" x2="290" y2="120" />
        
        {/* Rotor */}
        <motion.g animate={{ rotate: 360 }} style={{ originX: '160px', originY: '120px' }} transition={{ ease: 'linear', repeat: Infinity, duration: anim.rotateDur }}>
          <circle cx="160" cy="120" r="30" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
            <line key={deg} x1="160" y1="90" x2="160" y2="100" transform={`rotate(${deg} 160 120)`} />
          ))}
        </motion.g>
      </motion.g>
    </motion.svg>
  );
}

function EngineSchematic({ anim }: { anim: ReturnType<typeof useSchematicAnimations> }) {
  return (
    <motion.svg width="100%" height="100%" viewBox="0 0 320 240" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
      <defs>
        <radialGradient id="engine-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={anim.heatColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect x="60" y="80" width="200" height="80" fill="url(#engine-heat)" stroke="none" />

      <motion.g animate={{ x: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp], y: [-anim.vibAmp, anim.vibAmp, -anim.vibAmp] }} transition={{ repeat: Infinity, duration: 0.1 }}>
        <rect x="60" y="80" width="200" height="80" rx="4" />
        
        {/* Pistons */}
        {[100, 160, 220].map((cx, i) => (
          <motion.rect 
            key={i} x={cx - 15} y="40" width="30" height="40" 
            animate={{ y: [0, 20, 0] }} 
            transition={{ ease: 'easeInOut', repeat: Infinity, duration: anim.rotateDur, delay: i * 0.2 }} 
          />
        ))}
        
        <path d="M40 160 L280 160" />
      </motion.g>
    </motion.svg>
  );
}

// ── Wrapper Component ───────────────────────────────────────────────────────

export function MachineSchematic() {
  const { machines, selectedMachineId } = useApexStore();
  const machine = selectedMachineId ? machines[selectedMachineId] : null;
  const config = machine ? getMachineConfig(machine.machine_id) : null;
  
  const anim = useSchematicAnimations(machine);

  if (!machine || !config) {
    return (
      <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-tertiary text-body text-center">Select a machine</div>
      </div>
    );
  }

  const typeLow = config.type.toLowerCase();
  let SchematicSVG = PumpSchematic;
  if (typeLow.includes('motor')) SchematicSVG = MotorSchematic;
  else if (typeLow.includes('fan') || typeLow.includes('turbine')) SchematicSVG = TurbineSchematic;
  else if (typeLow.includes('engine') || typeLow.includes('conveyor')) SchematicSVG = EngineSchematic;

  return (
    <div className="card" style={{ height: '100%', position: 'relative', overflow: 'hidden', filter: 'drop-shadow(0 0 12px rgba(94,225,212,0.05))' }}>
      
      {/* Center Schematic */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SchematicSVG anim={anim} />
      </div>

      {/* Bottom Status Strip */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
        <span className="mono-body" style={{ color: 'var(--text-primary)' }}>{machine.machine_id}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>·</span>
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>{config.type}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>·</span>
        <span className="mono-body" style={{ color: 'var(--text-secondary)' }}>{Math.round(machine.current_cycle).toLocaleString()} cy</span>
        
        <div style={{ flex: 1 }} />
        <div className="flex items-center gap-2">
          <div className="dot dot-healthy" />
          <span className="text-micro" style={{ color: 'var(--text-tertiary)' }}>LIVE</span>
        </div>
      </div>

    </div>
  );
}
