// src/App.tsx
// Root application: layout assembly, WS + cost config bootstrapping

import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { HeroChart } from './components/HeroChart';
import { MaintenanceQueue } from './components/MaintenanceQueue';
import { SimilarFailures } from './components/SimilarFailures';
import { EmailAlertModal } from './components/EmailAlertModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ReconnectBanner } from './components/ReconnectBanner';
import { ToastContainer } from './components/ToastContainer';
import { DiagnosticPage } from './components/DiagnosticPage';
import { useWebSocket, restorePersistedMachines } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useApexStore } from './store/apexStore';

// Use VITE_API_URL env var for deployed environments; empty string = same-origin (vite proxy in dev)
const API_BASE = import.meta.env.VITE_API_URL ?? '';

function AppContent() {
  const { setCostConfig, connectionState, machines, viewMode } = useApexStore();

  // Boot: fetch cost config once
  useEffect(() => {
    fetch(`${API_BASE}/config/costs`)
      .then(r => r.json())
      .then(setCostConfig)
      .catch(() => {
        // Fallback: use hardcoded values if backend not yet ready
        setCostConfig({ cost_per_failure: 250000, cost_per_maintenance: 12000, savings_per_prevention: 238000 });
      });
  }, [setCostConfig]);

  // Restore last-known machine values from localStorage on page load.
  // This shows frozen values from the previous session without starting the simulation.
  useEffect(() => {
    restorePersistedMachines();
  }, []);

  // WebSocket connection
  useWebSocket();

  // Keyboard shortcuts
  useKeyboardShortcuts();

  const noMachines = Object.keys(machines).length === 0;

  return (
    <>
      <ReconnectBanner />
      <div className="app-layout">
        <Header />
        <Sidebar />
        <main className="app-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-section)' }}>

          {noMachines && connectionState === 'connected' ? (
            /* Empty state — simulator not running */
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 400 }}>
              <div style={{ fontSize: 48 }}>📡</div>
              <div className="section-title" style={{ fontSize: 18 }}>No engine data yet</div>
              <div className="muted" style={{ maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
                Backend is connected. Click the <strong style={{ color: 'var(--accent)' }}>▶ Start Simulation</strong> button
                in the sidebar to begin streaming live predictions.
              </div>
            </div>
          ) : viewMode === 'detail' ? (
              <DiagnosticPage />
            ) : (
              <>
                {/* Hero chart */}
                <HeroChart />

                {/* Two-column: similar failures + maintenance queue */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--gap-section)' }}>
                  <SimilarFailures />
                  <MaintenanceQueue />
                </div>
              </>
            )
          }

          {/* Footer */}
          <div style={{ paddingTop: 8, paddingBottom: 4, borderTop: '1px solid var(--apex-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 11 }}>
              APEX · Tensor '26 Hackathon PS07 · CNN-BiLSTM FD001 · RMSE 15.39
            </span>
            <span className="muted mono" style={{ fontSize: 11 }}>
              Model: cnn_bilstm_fd001.pt
            </span>
          </div>
        </main>
      </div>

      {/* Modals */}
      <EmailAlertModal />
      <ShortcutsModal />

      {/* Toasts */}
      <ToastContainer />
    </>
  );
}

export default function App() {
  return <AppContent />;
}
