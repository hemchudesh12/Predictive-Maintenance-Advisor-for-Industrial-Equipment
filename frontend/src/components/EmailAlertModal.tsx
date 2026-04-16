// src/components/EmailAlertModal.tsx
// Email alert modal with rate-limit feedback and toast response

import { useState } from 'react';
import { useApexStore } from '../store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function EmailAlertModal() {
  const { selectedMachineId, machines, emailModalOpen, setEmailModal, addToast } = useApexStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (!emailModalOpen) return null;

  const machine = selectedMachineId ? machines[selectedMachineId] : null;
  const machineId = machine?.machine_id ?? selectedMachineId ?? 'unknown';

  const send = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/alert/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machineId, user_email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', message: `✅ Alert sent to ${email} — ID: ${data.message_id}` });
        setEmailModal(false);
        setEmail('');
      } else if (data.rate_limited) {
        addToast({ type: 'warn', message: `⏱ Rate-limited. Retry in ${data.retry_after_sec}s.` });
      } else {
        addToast({ type: 'error', message: `Failed: ${data.error ?? 'Unknown error'}` });
      }
    } catch {
      addToast({ type: 'error', message: "Couldn't reach the server — retrying connection." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setEmailModal(false)} role="dialog" aria-modal="true" aria-label="Email alert">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
          <div className="section-title">📧 Send Maintenance Alert</div>
          <button className="btn" style={{ padding: '3px 8px' }} onClick={() => setEmailModal(false)} aria-label="Close modal">✕</button>
        </div>

        {machine && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--apex-surface-2)', borderRadius: 8 }}>
            <div className="flex justify-between">
              <span style={{ fontSize: 13, fontWeight: 500 }}>{machine.machine_id}</span>
              <span className={`badge badge-${machine.urgency.level}`}>{machine.urgency.level}</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              RUL: <span className="mono">{machine.rul_mean.toFixed(1)} cy</span> · {machine.component_attribution.component}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="alert-email" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Recipient email address
          </label>
          <input
            id="alert-email"
            className="input"
            type="email"
            placeholder="maintenance@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            autoFocus
          />
        </div>

        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setEmailModal(false)}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={send}
            disabled={loading || !email.trim()}
            aria-label="Send alert email"
          >
            {loading ? 'Sending…' : 'Send Alert'}
          </button>
        </div>

        <div className="muted" style={{ fontSize: 10, marginTop: 12, textAlign: 'center' }}>
          Rate-limited to 1 alert per 60s per machine · Press E to open, Esc to close
        </div>
      </div>
    </div>
  );
}
