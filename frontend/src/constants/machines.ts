// src/constants/machines.ts
// Display name mapping for machines. Keys match machine_id sent by the backend.

export interface MachineDisplayInfo {
  name: string;
  defaultComponent: string; // fallback when backend returns "Generic degradation"
  location: string;
}

export const MACHINE_DISPLAY_NAMES: Record<string, MachineDisplayInfo> = {
  engine_1: { name: 'Pump_A3', defaultComponent: 'Bearing',  location: 'North cooling loop' },
  engine_2: { name: 'Pump_B1', defaultComponent: 'Seal',     location: 'Chemical feed'      },
  engine_3: { name: 'Pump_C2', defaultComponent: 'Impeller', location: 'Water circulation'  },
  engine_4: { name: 'Pump_D4', defaultComponent: 'Motor',    location: 'Wastewater'         },
  engine_5: { name: 'Pump_E7', defaultComponent: 'Gearbox',  location: 'Backup system'      },
};

/** Returns pump display name; falls back to machine_id if unmapped. */
export function getPumpName(machineId: string): string {
  return MACHINE_DISPLAY_NAMES[machineId]?.name ?? machineId;
}

/**
 * Returns the best component name: uses backend attribution unless it's the
 * generic fallback, in which case it returns the mapped default component.
 */
export function getComponentName(machineId: string, backendComponent: string): string {
  if (backendComponent && backendComponent !== 'Generic degradation') {
    return backendComponent;
  }
  return MACHINE_DISPLAY_NAMES[machineId]?.defaultComponent ?? backendComponent;
}
