// src/components/ShortcutsModal.tsx
import { useApexStore } from '../store/apexStore';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';

export function ShortcutsModal() {
  const { shortcutsModalOpen, setShortcutsModal } = useApexStore();
  if (!shortcutsModalOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setShortcutsModal(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
          <div className="section-title">⌨️ Keyboard Shortcuts</div>
          <button className="btn" style={{ padding: '3px 8px' }} onClick={() => setShortcutsModal(false)} aria-label="Close">✕</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
          <tbody>
            {SHORTCUTS.map(({ key, description }) => (
              <tr key={key}>
                <td style={{ width: 80 }}>
                  <kbd style={{
                    background: 'var(--apex-surface-3)',
                    border: '1px solid var(--apex-border)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent)',
                  }}>{key}</kbd>
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 12 }}>
                  {description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          Press Esc or ? to close
        </div>
      </div>
    </div>
  );
}
