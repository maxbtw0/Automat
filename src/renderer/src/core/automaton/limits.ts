import { DEFAULT_SIMULATION, type SimulationSettings } from '@shared/simulationSettings'

/** Grenzen der Simulation aus den Einstellungen (Reiter „Simulation“) */
export type SimulationLimits = Pick<
  SimulationSettings,
  'tmStepLimit' | 'pdaConfigurationLimit' | 'pdaStackLimit'
>

/**
 * Aktuelle Grenzen – gelesen, wenn ein Simulator entsteht. Ohne Einstellungen (Tests) die
 * Standardwerte.
 */
let limits: SimulationLimits = { ...DEFAULT_SIMULATION }

export function simulationLimits(): SimulationLimits {
  return limits
}

export function setSimulationLimits(next: SimulationLimits): void {
  limits = {
    tmStepLimit: next.tmStepLimit,
    pdaConfigurationLimit: next.pdaConfigurationLimit,
    pdaStackLimit: next.pdaStackLimit
  }
}

/**
 * Höchstens so viele Schritte rechnet der Export, wenn die Turingmaschine unbegrenzt laufen
 * darf – er rechnet vorab komplett durch und käme sonst bei einer Endlosschleife nie an.
 */
export const EXPORT_STEP_LIMIT = DEFAULT_SIMULATION.tmStepLimit
