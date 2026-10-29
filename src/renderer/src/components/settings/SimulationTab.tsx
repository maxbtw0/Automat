import { useState } from 'react'
import {
  LIMIT_MINIMUM,
  MAX_SPEED,
  MIN_SPEED,
  SPEED_STEP,
  parseLimit,
  type SimulationLimitField,
  type SimulationSettings
} from '@shared/simulationSettings'
import { CommitInput } from '@/components/common/CommitInput'
import { SettingsField, SettingsGroup } from './SettingsFields'

function formatSpeed(speed: number): string {
  return `${speed.toLocaleString('de-DE')} ${speed === 1 ? 'Schritt' : 'Schritte'}/s`
}

/** Geschwindigkeit beim Start und Grenzen der Simulation. Schrittlimit 0 = unbegrenzt. */
export function SimulationTab({
  value,
  onChange
}: {
  value: SimulationSettings
  onChange(value: SimulationSettings): void
}) {
  const [errors, setErrors] = useState<Partial<Record<SimulationLimitField, string>>>({})

  /** Übernimmt eine Grenze – ungültige Eingaben setzt das Feld zurück und melden sich rot. */
  const commitLimit = (field: SimulationLimitField, text: string): boolean => {
    const parsed = parseLimit(text)
    const minimum = LIMIT_MINIMUM[field]
    const ok = parsed !== null && parsed >= minimum
    setErrors({ ...errors, [field]: ok ? undefined : `Ganze Zahl ab ${minimum}` })
    if (!ok) return false
    onChange({ ...value, [field]: parsed })
    return true
  }

  const limitInput = (field: SimulationLimitField, id: string, title?: string) => (
    <CommitInput
      id={id}
      className="is-mono settings-number"
      inputMode="numeric"
      title={title}
      value={value[field].toLocaleString('de-DE')}
      onCommit={(text) => commitLimit(field, text)}
    />
  )

  return (
    <div className="settings-form">
      <SettingsGroup title="Abspielen">
        <SettingsField label="Geschwindigkeit" htmlFor="sim-start-speed">
          <div className="settings-inline">
            <input
              id="sim-start-speed"
              className="sim-slider settings-slider"
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={value.speed}
              onChange={(e) => onChange({ ...value, speed: Number(e.target.value) })}
            />
            <span className="settings-preview">{formatSpeed(value.speed)}</span>
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Turingmaschine">
        <SettingsField label="Schrittlimit" htmlFor="sim-tm-steps" error={errors.tmStepLimit}>
          <div className="settings-inline">
            {limitInput('tmStepLimit', 'sim-tm-steps', '0 = unbegrenzt')}
            {value.tmStepLimit === 0 && <span className="settings-preview">unbegrenzt</span>}
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Kellerautomat">
        <SettingsField
          label="Konfigurationen"
          htmlFor="sim-pda-configurations"
          error={errors.pdaConfigurationLimit}
        >
          {limitInput('pdaConfigurationLimit', 'sim-pda-configurations')}
        </SettingsField>
        <SettingsField label="Stackhöhe" htmlFor="sim-pda-stack" error={errors.pdaStackLimit}>
          {limitInput('pdaStackLimit', 'sim-pda-stack')}
        </SettingsField>
      </SettingsGroup>
    </div>
  )
}
