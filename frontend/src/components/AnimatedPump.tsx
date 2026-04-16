import React from 'react';
import './AnimatedPump.css'; // We'll create this next

export interface AnimatedPumpProps {
  urgency: 'CRITICAL' | 'WARNING' | 'MONITOR' | 'HEALTHY';
  rpm: number;           // normalized 0-1, controls impeller rotation speed
  vibration: number;     // normalized 0-1, controls shake intensity
  bearingTemp: number;   // normalized 0-1, controls bearing color
  motorTemp: number;     // normalized 0-1, controls motor coil color
  flowRate: number;      // normalized 0-1, controls flow arrow speed
  isRunning: boolean;    // false = machine stopped (impeller frozen)
}

function getTempColor(val: number, isPulsing: boolean = false): string {
  if (val < 0.3) return '#3b82f6';
  if (val < 0.6) return '#f59e0b';
  if (val < 0.8) return '#ef4444';
  return isPulsing ? 'var(--pulse-danger, #dc2626)' : '#dc2626';
}

function getAnimationDurations(urgency: AnimatedPumpProps['urgency']) {
  switch (urgency) {
    case 'CRITICAL': return { impeller: '5s' };
    case 'WARNING': return { impeller: '2.5s' };
    case 'MONITOR': return { impeller: '1.5s' };
    case 'HEALTHY': return { impeller: '0.8s' };
    default: return { impeller: '0.8s' };
  }
}

export const AnimatedPump: React.FC<AnimatedPumpProps> = ({
  urgency,
  vibration,
  bearingTemp,
  motorTemp,
  flowRate,
  isRunning,
}) => {
  const bColor = getTempColor(bearingTemp, true);
  const mColor = getTempColor(motorTemp, false);
  const dur = getAnimationDurations(urgency);
  
  // Vibration logic
  const isVibrating = vibration > 0.5;
  const shakeDur = `${0.3 - vibration * 0.2}s`;

  // Flow animation logic
  const dashOffsetAnimDur = flowRate > 0 ? `${1.5 - flowRate * 1.2}s` : '0s';

  return (
    <div className="animated-pump-container">
      <svg
        viewBox="0 0 300 400"
        xmlns="http://www.w3.org/2000/svg"
        className="pump-svg"
      >
        <defs>
          <radialGradient id="casingGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
        </defs>

        {/* Discharge Pipe (Outlet) */}
        <path d="M120,60 L120,10 L180,10 L180,60" fill="none" stroke="#444" strokeWidth="8" />
        {/* Flow arrows in discharge */}
        {isRunning && (
          <path
            d="M150,55 L150,15"
            fill="none"
            stroke="#666"
            strokeWidth="3"
            strokeDasharray="4 8"
            className="flow-line discharge-flow"
            style={{ animationDuration: dashOffsetAnimDur }}
          />
        )}
        <text x="190" y="35" fill="#888" fontSize="12">▶ OUTLET</text>

        {/* --- VOLUTE CASING / MAIN BODY --- */}
        <rect x="50" y="60" width="200" height="150" rx="16" fill="url(#casingGrad)" stroke="#555" strokeWidth="2" />
        
        {/* The Impeller Box */}
        <rect x="100" y="90" width="100" height="90" fill="#222" stroke="#444" strokeWidth="2" rx="4" />
        
        {/* Rotating Impeller lines inside the box */}
        <g 
          className="impeller" 
          style={{ 
            animationDuration: dur.impeller, 
            animationPlayState: isRunning ? 'running' : 'paused' 
          }}
        >
          {/* We rotate around Center (150, 135) */}
          <circle cx="150" cy="135" r="35" fill="none" stroke="#555" strokeWidth="2" />
          <path d="M150,100 L150,170" stroke="#777" strokeWidth="4" />
          <path d="M115,135 L185,135" stroke="#777" strokeWidth="4" />
          <path d="M125,110 L175,160" stroke="#777" strokeWidth="4" />
          <path d="M125,160 L175,110" stroke="#777" strokeWidth="4" />
          <circle cx="150" cy="135" r="8" fill="#999" />
        </g>

        {/* Bearings (Left and Right) */}
        <g className={isVibrating ? 'bearing-shake' : ''} style={{ animationDuration: shakeDur }}>
          {/* Left Bearing */}
          <rect x="70" y="120" width="20" height="30" fill={bColor} rx="3" stroke="#111" strokeWidth="2" />
          {/* Right Bearing */}
          <rect x="210" y="120" width="20" height="30" fill={bColor} rx="3" stroke="#111" strokeWidth="2" />
          
          {/* Vibration indicators */}
          {isVibrating && (
            <g stroke={bColor} strokeWidth="2" fill="none" opacity="0.8">
              {/* Left waves */}
              <path d="M60,120 Q55,125 60,130 T60,140" />
              <path d="M50,125 Q45,130 50,135 T50,145" />
              {/* Right waves */}
              <path d="M240,120 Q245,125 240,130 T240,140" />
              <path d="M250,125 Q255,130 250,135 T250,145" />
            </g>
          )}
        </g>

        {/* SHAFT connecting everything */}
        <path d="M150,210 L150,230" stroke="#888" strokeWidth="12" />

        {/* --- ELECTRIC MOTOR --- */}
        <rect x="70" y="230" width="160" height="100" rx="4" fill="#2d2d2d" stroke="#555" strokeWidth="2" />
        <text x="85" y="250" fill="#666" fontSize="12" fontWeight="bold">ELECTRIC MOTOR</text>

        {/* Motor Coils */}
        <g fill={mColor} stroke="#111" strokeWidth="1">
          <rect x="85"  y="270" width="20" height="40" rx="2" />
          <rect x="120" y="270" width="20" height="40" rx="2" />
          <rect x="160" y="270" width="20" height="40" rx="2" />
          <rect x="195" y="270" width="20" height="40" rx="2" />
        </g>
        
        {/* Suction Pipe (Inlet) */}
        <path d="M120,330 L120,380 L180,380 L180,330" fill="none" stroke="#444" strokeWidth="8" />
        {isRunning && (
          <path
            d="M150,375 L150,335"
            fill="none"
            stroke="#666"
            strokeWidth="3"
            strokeDasharray="4 8"
            className="flow-line suction-flow"
            style={{ animationDuration: dashOffsetAnimDur }}
          />
        )}
        <text x="190" y="365" fill="#888" fontSize="12">◀ INLET</text>
      </svg>
    </div>
  );
};
