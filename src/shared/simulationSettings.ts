/** Vorgaben und Grenzen der Simulation. */
export interface SimulationSettings {
  /** Schritte pro Sekunde beim Abspielen – Startwert, der Regler auf dem Screen ändert ihn */
  speed: number
  /** Turingmaschine: höchstens so viele Schritte, 0 = unbegrenzt */
  tmStepLimit: number
  /** Kellerautomat: höchstens so viele Konfigurationen untersucht die Suche */
  pdaConfigurationLimit: number
  /** Kellerautomat: höher darf der Stack nicht werden (ε-Schleifen, die immer weiter ablegen) */
  pdaStackLimit: number
}

export type SimulationLimitField = Exclude<keyof SimulationSettings, 'speed'>

export const DEFAULT_SIMULATION: SimulationSettings = {
  speed: 2,
  tmStepLimit: 10000,
  pdaConfigurationLimit: 20000,
  pdaStackLimit: 100
}

export const MIN_SPEED = 0.5
export const MAX_SPEED = 10
export const SPEED_STEP = 0.5

/** Größte erlaubte Grenze */
export const MAX_LIMIT = 100_000_000

/**
 * Kleinste Grenze je Feld: Das Schrittlimit der Turingmaschine darf 0 (= unbegrenzt) sein – sie
 * rechnet Schritt für Schritt. Die Suche des Kellerautomaten läuft dagegen vorab komplett durch
 * und käme ohne Grenze bei ε-Schleifen nie an.
 */
export const LIMIT_MINIMUM: Record<SimulationLimitField, number> = {
  tmStepLimit: 0,
  pdaConfigurationLimit: 1,
  pdaStackLimit: 1
}

/** „10.000“, „10 000“ oder „10000“ → 10000; `null` bei allem, was keine ganze Zahl ist. */
export function parseLimit(text: string): number | null {
  const digits = text.trim().replace(/[.\s]/g, '')
  if (!/^\d+$/.test(digits)) return null
  const value = Number(digits)
  return value <= MAX_LIMIT ? value : null
}

function limit(value: unknown, minimum: number, fallback: number): number {
  const valid =
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= MAX_LIMIT
  return valid ? value : fallback
}

/** Auf den Regler runden: 0,5 … 10 in Schritten von 0,5 */
export function clampSpeed(value: number): number {
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value))
  return Math.round(clamped / SPEED_STEP) * SPEED_STEP
}

/** Grenzen aus der Einstellungsdatei – jedes ungültige Feld wird zum Standard. */
export function normalizeSimulation(raw: unknown): SimulationSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_SIMULATION
  const speed = r['speed']
  return {
    speed: typeof speed === 'number' && Number.isFinite(speed) ? clampSpeed(speed) : d.speed,
    tmStepLimit: limit(r['tmStepLimit'], LIMIT_MINIMUM.tmStepLimit, d.tmStepLimit),
    pdaConfigurationLimit: limit(
      r['pdaConfigurationLimit'],
      LIMIT_MINIMUM.pdaConfigurationLimit,
      d.pdaConfigurationLimit
    ),
    pdaStackLimit: limit(r['pdaStackLimit'], LIMIT_MINIMUM.pdaStackLimit, d.pdaStackLimit)
  }
}
