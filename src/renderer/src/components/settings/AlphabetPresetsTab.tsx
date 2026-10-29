import { useState } from 'react'
import {
  defaultAlphabetPresets,
  formatPresetSymbols,
  presetProblem,
  splitPresetSymbols,
  type AlphabetPreset
} from '@shared/alphabetPresets'
import { CommitInput } from '@/components/common/CommitInput'
import { Icon } from '@/components/common/Icon'
import { askChoice } from '@/store/dialogStore'

const NEW_NAME = 'Neues Alphabet'

/** „Neues Alphabet“, „Neues Alphabet 2“, … – der erste freie Name. */
function freeName(presets: AlphabetPreset[]): string {
  const taken = new Set(presets.map((p) => p.name.trim()))
  for (let n = 1; ; n++) {
    const name = n === 1 ? NEW_NAME : `${NEW_NAME} ${n}`
    if (!taken.has(name)) return name
  }
}

/**
 * Voreinstellungen für den Alphabeteditor: Name und Symbole (getrennt durch Komma oder
 * Leerzeichen), Reihenfolge wie im Menü. Bearbeitet wird ein Entwurf – gespeichert wird erst im
 * Einstellungen-Fenster.
 */
export function AlphabetPresetsTab({
  presets,
  onChange
}: {
  presets: AlphabetPreset[]
  onChange(presets: AlphabetPreset[]): void
}) {
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const update = (index: number, preset: AlphabetPreset): void =>
    onChange(presets.map((p, i) => (i === index ? preset : p)))

  const move = (index: number, by: number): void => {
    const next = [...presets]
    const [preset] = next.splice(index, 1)
    next.splice(index + by, 0, preset)
    onChange(next)
  }

  const add = (): void => {
    setJustAdded(presets.length)
    onChange([...presets, { name: freeName(presets), symbols: ['a', 'b'] }])
  }

  const resetAll = async (): Promise<void> => {
    const choice = await askChoice({
      title: 'Alle Alphabete zurücksetzen?',
      buttons: ['Zurücksetzen', 'Abbrechen'],
      danger: 0
    })
    if (choice === 0) onChange(defaultAlphabetPresets())
  }

  const isDefault = JSON.stringify(presets) === JSON.stringify(defaultAlphabetPresets())

  return (
    <div className="presets">
      <div className="presets-toolbar">
        <button className="btn is-ghost" onClick={add}>
          <Icon name="plus" /> Neu
        </button>
        <button className="btn is-ghost" disabled={isDefault} onClick={() => void resetAll()}>
          <Icon name="reset" /> Alle zurücksetzen
        </button>
      </div>
      <table className="presets-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Symbole</th>
            <th aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody>
          {presets.map((preset, i) => {
            const problem = presetProblem(presets, i)
            return (
              // Zeilen-key = Position: Verschieben tauscht nur die Werte, der Fokus bleibt.
              <PresetRow
                key={i}
                preset={preset}
                problem={problem}
                autoFocus={i === justAdded}
                first={i === 0}
                last={i === presets.length - 1}
                onChange={(next) => update(i, next)}
                onMove={(by) => move(i, by)}
                onDelete={() => onChange(presets.filter((_, j) => j !== i))}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PresetRow({
  preset,
  problem,
  autoFocus,
  first,
  last,
  onChange,
  onMove,
  onDelete
}: {
  preset: AlphabetPreset
  problem: string | null
  autoFocus: boolean
  first: boolean
  last: boolean
  onChange(preset: AlphabetPreset): void
  onMove(by: number): void
  onDelete(): void
}) {
  return (
    <>
      <tr className={problem ? 'is-invalid' : undefined}>
        <td className="presets-name">
          <CommitInput
            value={preset.name}
            aria-label="Name"
            autoFocus={autoFocus}
            onFocus={(e) => e.currentTarget.select()}
            onCommit={(name) => onChange({ ...preset, name: name.trim() })}
          />
        </td>
        <td>
          <CommitInput
            className="is-mono"
            value={formatPresetSymbols(preset.symbols)}
            aria-label={`Symbole von ${preset.name}`}
            onCommit={(text) => onChange({ ...preset, symbols: splitPresetSymbols(text) })}
          />
        </td>
        <td className="presets-actions">
          <button
            className="btn is-ghost is-icon"
            title="Nach oben"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <Icon name="moveUp" size={14} />
          </button>
          <button
            className="btn is-ghost is-icon"
            title="Nach unten"
            disabled={last}
            onClick={() => onMove(1)}
          >
            <Icon name="moveDown" size={14} />
          </button>
          <button className="btn is-ghost is-icon" title="Löschen" onClick={onDelete}>
            <Icon name="delete" size={14} />
          </button>
        </td>
      </tr>
      {problem && (
        <tr className="presets-error">
          <td colSpan={3}>{problem}</td>
        </tr>
      )}
    </>
  )
}
