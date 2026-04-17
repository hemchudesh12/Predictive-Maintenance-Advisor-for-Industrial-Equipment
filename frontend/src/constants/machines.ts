// src/constants/machines.ts
// Full machine configuration map for APEX fleet — 5 mixed machine types.
// Keys match machine_id sent by the backend (engine_1 … engine_5).

export type MachineIcon = 'pump' | 'motor' | 'fan' | 'conveyor';

export interface MachineConfig {
  displayName: string;
  type: string;
  subtype: string;
  component: string;
  location: string;
  icon: MachineIcon;
  expectedLifespan: number;   // years
  currentAge: number;         // years
  agePercent: number;         // currentAge / expectedLifespan * 100
  operatingHours: number;
  costPerCycle: number;       // ₹ per cycle of unplanned downtime
  lastMaintenance: string;
  previousFailures: string[];
  fleetAverageRul: number;    // cycles
  power: string;              // for RepairOptions compat
}

export const MACHINE_CONFIGS: Record<string, MachineConfig> = {
  engine_1: {
    displayName: 'Pump_A3',
    type: 'Centrifugal pump',
    subtype: 'End-suction, 50 HP',
    component: 'Bearing',
    location: 'North cooling loop',
    icon: 'pump',
    expectedLifespan: 15,
    currentAge: 5.2,
    agePercent: 34.7,
    operatingHours: 38400,
    costPerCycle: 3500,
    lastMaintenance: '847 cycles ago',
    previousFailures: ['Bearing (Year 2)', 'Seal (Year 4)'],
    fleetAverageRul: 94,
    power: '50 HP',
  },

  engine_2: {
    displayName: 'Motor_B1',
    type: 'Induction motor',
    subtype: 'TEFC, 75 HP, driving air compressor',
    component: 'Winding',
    location: 'Compressor house',
    icon: 'motor',
    expectedLifespan: 20,
    currentAge: 8.1,
    agePercent: 40.5,
    operatingHours: 59400,
    costPerCycle: 4200,
    lastMaintenance: '512 cycles ago',
    previousFailures: ['Winding rewind (Year 5)'],
    fleetAverageRul: 80,
    power: '75 HP',
  },

  engine_3: {
    displayName: 'Pump_C2',
    type: 'Centrifugal pump',
    subtype: 'Multistage, 30 HP',
    component: 'Impeller',
    location: 'Chemical feed line',
    icon: 'pump',
    expectedLifespan: 12,
    currentAge: 3.8,
    agePercent: 31.7,
    operatingHours: 28000,
    costPerCycle: 2800,
    lastMaintenance: '320 cycles ago',
    previousFailures: [],
    fleetAverageRul: 100,
    power: '30 HP',
  },

  engine_4: {
    displayName: 'Fan_D4',
    type: 'Cooling tower fan',
    subtype: 'Axial fan, 25 HP, belt-driven',
    component: 'Belt/Pulley',
    location: 'Cooling tower #2',
    icon: 'fan',
    expectedLifespan: 18,
    currentAge: 6.5,
    agePercent: 36.1,
    operatingHours: 47800,
    costPerCycle: 1800,
    lastMaintenance: '640 cycles ago',
    previousFailures: ['Belt replacement (Year 3)', 'Motor bearing (Year 5)'],
    fleetAverageRul: 88,
    power: '25 HP',
  },

  engine_5: {
    displayName: 'Conv_E7',
    type: 'Conveyor drive motor',
    subtype: 'Geared motor, 15 HP, chain-driven',
    component: 'Gearbox',
    location: 'Packaging line #3',
    icon: 'conveyor',
    expectedLifespan: 15,
    currentAge: 4.2,
    agePercent: 28.0,
    operatingHours: 30800,
    costPerCycle: 2200,
    lastMaintenance: '180 cycles ago',
    previousFailures: ['Chain tensioner (Year 2)'],
    fleetAverageRul: 105,
    power: '15 HP',
  },
};

/** Small icon emoji/label for sidebar inline display. */
export const MACHINE_ICON_LABELS: Record<MachineIcon, string> = {
  pump: '💧',
  motor: '⚡',
  fan: '🌀',
  conveyor: '🔧',
};

/** Returns display name; falls back to machine_id if unmapped. */
export function getPumpName(machineId: string): string {
  return MACHINE_CONFIGS[machineId]?.displayName ?? machineId;
}

/** Returns config or a sensible fallback. */
export function getMachineConfig(machineId: string): MachineConfig {
  return MACHINE_CONFIGS[machineId] ?? {
    displayName: machineId,
    type: 'Industrial machine',
    subtype: 'Unknown',
    component: 'Component',
    location: 'Unknown',
    icon: 'pump' as MachineIcon,
    expectedLifespan: 15,
    currentAge: 7.5,
    agePercent: 50,
    operatingHours: 50000,
    costPerCycle: 3000,
    lastMaintenance: '500 cycles ago',
    previousFailures: ['None'],
    fleetAverageRul: 75,
    power: '50 HP',
  };
}

/**
 * Returns the best component name: uses backend attribution unless it's the
 * generic fallback, in which case it returns the mapped default component.
 */
export function getComponentName(machineId: string, backendComponent: string): string {
  if (backendComponent && backendComponent !== 'Generic degradation') {
    return backendComponent;
  }
  return getMachineConfig(machineId).component;
}

/** Component replacement costs (₹) */
export function getComponentCost(component: string): number {
  const costs: Record<string, number> = {
    'Bearing': 45000,
    'Seal': 35000,
    'Impeller': 85000,
    'Motor': 150000,
    'Gearbox': 120000,
    'Winding': 95000,
    'Belt/Pulley': 25000,
  };
  return costs[component] ?? 50000;
}
