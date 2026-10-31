import { version } from '../../../../../package.json'

/** Angaben zum Programm für den Hilfe-Reiter „Programm“. */
export const PROGRAM = {
  name: 'Automat',
  version,
  author: 'Max Berger',
  license: 'MIT',
  repository: 'https://github.com/maxbtw0/Automat'
}

export interface ChangelogEntry {
  version: string
  /** Datum im Format JJJJ-MM-TT */
  date: string
  changes: string[]
}

/** Neueste Version zuerst. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-10-31',
    changes: [
      'Angefangene Eingaben werden vor Neu, Öffnen, Speichern, Export und Schließen übernommen',
      'Reguläre Ausdrücke trennen Symbole mit mehreren Zeichen durch Leerzeichen',
      'Der NEA liest ein „ε“ im Eingabewort nicht mehr über einen ε-Übergang',
      'Export sehr langer Simulationen funktioniert wieder, auch als PDF'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-10-29',
    changes: [
      'Erste Version: DEA, NEA, Kellerautomat (DKA, NKA) und Turingmaschine',
      'Grapheneditor, Alphabet, Übergangstabelle, Simulation und reguläre Ausdrücke',
      'Export als PDF, PNG, JPG und CSV, Einstellungen und Hilfe'
    ]
  }
]

/** „2026-10-31“ → „31.10.2026“ */
export function formatChangelogDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}
