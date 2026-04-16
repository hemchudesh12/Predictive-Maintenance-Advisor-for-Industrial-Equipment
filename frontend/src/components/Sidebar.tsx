// src/components/Sidebar.tsx
// Left sidebar: fleet machine list + replay controls

import { useApexStore } from '../store/apexStore';
import { MachineCard } from './MachineCard';
import { ReplayControls } from './ReplayControls';
import { SkeletonCard } from './SkeletonCard';

export function Sidebar() {
  const { machines, connectionState } = useApexStore();
  const machineList = Object.values(machines);
  const isWaiting = machineList.length === 0;

  return (
    <aside
      className="app-sidebar flex-col"
      style={{ padding: '14px 12px 12px', gap: 0, display: 'flex', flexDirection: 'column' }}
    >
      {/* Fleet section */}
      <div className="sidebar-label" style={{ marginBottom: 10, paddingLeft: 2 }}>
        FLEET
        {machineList.length > 0 && (
          <span
            className="mono"
            style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}
          >
            ({machineList.length})
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
        {isWaiting ? (
          connectionState === 'connected' ? (
            // Connected but no data yet — show skeleton
            <>
              {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
            </>
          ) : (
            // Not connected
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '40px 8px', lineHeight: 1.7 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              Waiting for<br />backend connection…
            </div>
          )
        ) : (
          // Machine list — sorted by urgency score (most critical first)
          <div className="fade-in">
            {machineList
              .sort((a, b) => b.urgency.score - a.urgency.score)
              .map((m, i) => <MachineCard key={m.machine_id} machine={m} index={i} />)}
          </div>
        )}
      </div>

      <div className="divider" />
      <ReplayControls />
    </aside>
  );
}
