import type { AlphabetPreset } from '@shared/alphabetPresets'
import { TAPE_MOVES, type StackAcceptance, type TapeMove } from '@shared/automatonTypes'
import { newAutomatonProblems, type NewAutomatonSettings } from '@shared/newAutomaton'
import { CommitInput } from '@/components/common/CommitInput'
import { automatonDefinitions } from '@/core/automaton/registry'
import type { AutomatonType } from '@/model/graph'
import { SettingsField, SettingsGroup, SettingsSegmented } from './SettingsFields'

const MOVE_TITLES: Record<TapeMove, string> = {
  L: 'Links',
  N: 'Stehen bleiben',
  R: 'Rechts'
}

/**
 * Vorgaben für „Neu“: Typ, Alphabet (aus den Voreinstellungen des Entwurfs), Zustandsnamen;
 * Startsymbol/Akzeptanz und Blank/Bewegung gelten auch, wenn Stack oder Band beim Typwechsel
 * neu entstehen.
 */
export function NewAutomatonTab({
  value,
  presets,
  onChange
}: {
  value: NewAutomatonSettings
  presets: AlphabetPreset[]
  onChange(value: NewAutomatonSettings): void
}) {
  const problems = newAutomatonProblems(value, presets)
  const set = <K extends keyof NewAutomatonSettings>(
    key: K,
    next: NewAutomatonSettings[K]
  ): void => onChange({ ...value, [key]: next })
  // Gelöschte oder umbenannte Voreinstellung → leeres Alphabet
  const preset = presets.some((p) => p.name === value.alphabetPreset) ? value.alphabetPreset : ''

  return (
    <div className="settings-form">
      <SettingsGroup title="Allgemein">
        <SettingsField label="Typ" htmlFor="new-type">
          <select
            id="new-type"
            className="select"
            value={value.type}
            onChange={(e) => set('type', e.target.value as AutomatonType)}
          >
            {automatonDefinitions.map((def) => (
              <option key={def.type} value={def.type} title={def.description}>
                {def.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="Alphabet" htmlFor="new-alphabet">
          <select
            id="new-alphabet"
            className="select"
            value={preset}
            onChange={(e) => set('alphabetPreset', e.target.value)}
          >
            <option value="">Leer</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="Zustandsnamen" htmlFor="new-prefix" error={problems.statePrefix}>
          <div className="settings-inline">
            <CommitInput
              id="new-prefix"
              className="is-mono settings-short"
              value={value.statePrefix}
              onCommit={(text) => set('statePrefix', text.trim())}
            />
            {!problems.statePrefix && (
              <span className="settings-preview">
                {[0, 1, 2].map((i) => `${value.statePrefix}${i}`).join(', ')}, …
              </span>
            )}
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Kellerautomat">
        <SettingsField label="Startsymbol" htmlFor="new-stack-start" error={problems.stackStart}>
          <CommitInput
            id="new-stack-start"
            className="is-mono settings-short"
            value={value.stackStart}
            onCommit={(text) => set('stackStart', text.trim())}
          />
        </SettingsField>
        <SettingsField label="Akzeptanz">
          <SettingsSegmented<StackAcceptance>
            label="Akzeptanz"
            options={[
              { value: 'final', label: 'Endzustand' },
              { value: 'empty', label: 'Leerer Stack' }
            ]}
            value={value.acceptance}
            onChange={(acceptance) => set('acceptance', acceptance)}
          />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Turingmaschine">
        <SettingsField label="Blank" htmlFor="new-blank" error={problems.blank}>
          <CommitInput
            id="new-blank"
            className="is-mono settings-short"
            value={value.blank}
            onCommit={(text) => set('blank', text.trim())}
          />
        </SettingsField>
        <SettingsField label="Bewegung neuer Regeln">
          <SettingsSegmented<TapeMove>
            label="Bewegung neuer Regeln"
            compact
            options={TAPE_MOVES.map((move) => ({
              value: move,
              label: move,
              title: MOVE_TITLES[move]
            }))}
            value={value.tapeMove}
            onChange={(move) => set('tapeMove', move)}
          />
        </SettingsField>
      </SettingsGroup>
    </div>
  )
}
