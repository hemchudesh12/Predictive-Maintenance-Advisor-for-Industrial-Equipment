// src/components/SavingsTracker.tsx
// Feature 5 — Fleet-wide savings tracker.
// Appears in the header/main area once at least one early detection has occurred.

import { useApexStore } from '../store/apexStore';

export function SavingsTracker() {
  const { totalSavings, savingsEvents } = useApexStore();

  if (savingsEvents.length === 0) return null;

  const countText = `${savingsEvents.length} early ${savingsEvents.length === 1 ? 'detection' : 'detections'}`;
  const totalAvoided = savingsEvents.reduce((sum, e) => sum + e.costAvoided, 0);

  return (
    <div
      id="savings-tracker"
      title={`${countText} — total cost avoided: ₹${(totalAvoided / 100000).toFixed(1)}L`}
      style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        border: '1px solid #10b98133',
      }}
    >
      <div>
        <div style={{ fontSize: 10, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          Savings this session
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#ecfdf5', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
          ₹{(totalSavings / 100000).toFixed(1)}L
        </div>
      </div>
      <div style={{ borderLeft: '1px solid #10b98133', paddingLeft: 16 }}>
        <div style={{ fontSize: 11, color: '#a7f3d0' }}>{countText}</div>
        <div style={{ fontSize: 10, color: '#6ee7b7', marginTop: 2 }}>
          vs ₹{(totalAvoided / 100000).toFixed(1)}L if ignored
        </div>
      </div>
      {/* Mini bar: savings / cost avoided ratio */}
      <div style={{ flex: 1, maxWidth: 80 }}>
        <div style={{ height: 4, background: '#052e16', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (totalSavings / Math.max(totalAvoided, 1)) * 100)}%`,
              background: '#10b981',
              borderRadius: 2,
            }}
          />
        </div>
        <div style={{ fontSize: 9, color: '#6ee7b7', marginTop: 3, textAlign: 'right' }}>
          {Math.round((totalSavings / Math.max(totalAvoided, 1)) * 100)}% saved
        </div>
      </div>
    </div>
  );
}
