// src/hooks/useKeyboardShortcuts.ts
// Registers all keyboard shortcuts for APEX dashboard

import { useEffect } from 'react';
import { useApexStore } from '../store/apexStore';

export function useKeyboardShortcuts() {
  const {
    machines,
    selectedMachineId,
    setSelectedMachine,
    setEmailModal,
    setShortcutsModal,
    shortcutsModalOpen,
    emailModalOpen,
  } = useApexStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const machineIds = Object.keys(machines);

      switch (e.key) {
        case '1': case '2': case '3': case '4': case '5': {
          const idx = parseInt(e.key) - 1;
          if (machineIds[idx]) setSelectedMachine(machineIds[idx]);
          break;
        }
        case '?': {
          e.preventDefault();
          setShortcutsModal(!shortcutsModalOpen);
          break;
        }
        case 'e': case 'E': {
          if (!emailModalOpen) setEmailModal(true);
          break;
        }
        case 'Escape': {
          if (shortcutsModalOpen) setShortcutsModal(false);
          if (emailModalOpen) setEmailModal(false);
          break;
        }
        case 'f': case 'F': {
          // Fullscreen toggle (hero chart area)
          const hero = document.getElementById('hero-chart-section');
          if (hero) {
            if (!document.fullscreenElement) {
              hero.requestFullscreen?.().catch(() => {});
            } else {
              document.exitFullscreen?.().catch(() => {});
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [machines, selectedMachineId, shortcutsModalOpen, emailModalOpen,
      setSelectedMachine, setEmailModal, setShortcutsModal]);
}

// Exported shortcut definitions for the ? modal
export const SHORTCUTS = [
  { key: '1 – 5', description: 'Select machine by position' },
  { key: 'E',     description: 'Open email alert modal' },
  { key: 'F',     description: 'Toggle fullscreen on hero chart' },
  { key: '?',     description: 'Show / hide this shortcuts panel' },
  { key: 'Esc',   description: 'Close any open modal' },
];
