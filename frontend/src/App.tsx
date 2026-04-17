import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { HeroChart } from './components/HeroChart';
import { RootCauseAnalysis } from './components/RootCauseAnalysis';
import { MachineProfile } from './components/MachineProfile';
// We will build MachineSchematic next
import { MachineSchematic } from './components/MachineSchematic';
import { EmailAlertModal } from './components/EmailAlertModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ReconnectBanner } from './components/ReconnectBanner';
import { ToastContainer } from './components/ToastContainer';
import { CriticalAlertBanner } from './components/CriticalAlertBanner';
import { SavingsTracker } from './components/SavingsTracker';
import { useWebSocket, restorePersistedMachines } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useVoiceAlert } from './hooks/useVoiceAlert';
import { useApexStore } from './store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function AppContent() {
  const { setCostConfig, connectionState, machines, simRunning } = useApexStore();

  useEffect(() => {
    fetch(`${API_BASE}/config/costs`)
      .then(r => r.json())
      .then(setCostConfig)
      .catch(() => {
        setCostConfig({ cost_per_failure: 250000, cost_per_maintenance: 12000, savings_per_prevention: 238000 });
      });
  }, [setCostConfig]);

  useEffect(() => { restorePersistedMachines(); }, []);
  useWebSocket();
  useKeyboardShortcuts();
  useVoiceAlert();

  const noMachines = Object.keys(machines).length === 0;

  return (
    <>
      <ReconnectBanner />
      <div className="app-layout">
        <Header />
        
        <div className="app-grid">
          {/* Column 1: Machine list + Replay + CTA */}
          <div className="col-sidebar">
            <Sidebar />
          </div>

          {/* Fallback View logic */}
          {noMachines && simRunning ? (
            <div className="card fade-in" style={{ gridColumn: '2 / span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ fontSize: 48 }}>⚙️</div>
              <div className="text-h2">Simulation warming up…</div>
              <div className="text-body" style={{ maxWidth: 380, textAlign: 'center' }}>
                Engines streaming data. Allow <strong style={{color: 'var(--accent)'}}>30 cycles</strong> to pass. 
              </div>
            </div>
          ) : noMachines && connectionState === 'connected' ? (
            <div className="card" style={{ gridColumn: '2 / span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ fontSize: 48 }}>📡</div>
              <div className="text-h2">No engine data yet</div>
              <div className="text-body" style={{ maxWidth: 360, textAlign: 'center' }}>
                Click <strong style={{color: 'var(--accent)'}}>Start Simulation</strong> to begin.
              </div>
            </div>
          ) : (
            <>
              {/* Column 2: Schematic + RCA */}
              <div className="col-schematic">
                <CriticalAlertBanner />
                <SavingsTracker />
                
                <div style={{ flex: '55%', minHeight: 0 }}>
                  <MachineSchematic />
                </div>
                <div style={{ flex: '45%', minHeight: 0 }}>
                  <RootCauseAnalysis />
                </div>
              </div>

              {/* Column 3: Chart + Profile */}
              <div className="col-chart">
                <div style={{ flex: '60%', minHeight: 0 }}>
                  <HeroChart />
                </div>
                <div style={{ flex: '40%', minHeight: 0 }}>
                  <MachineProfile />
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      <EmailAlertModal />
      <ShortcutsModal />
      <ToastContainer />
    </>
  );
}

export default function App() {
  return <AppContent />;
}
