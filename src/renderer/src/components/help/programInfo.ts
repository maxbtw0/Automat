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
  changes: string[]
}

/** Neueste Version zuerst. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    changes: [
      'Angefangene Eingaben werden vor Neu, Öffnen, Speichern, Export und Schließen übernommen',
      'Reguläre Ausdrücke trennen Symbole mit mehreren Zeichen durch Leerzeichen',
      'Der NEA liest ein „ε“ im Eingabewort nicht mehr über einen ε-Übergang',
      'Export sehr langer Simulationen funktioniert wieder, auch als PDF'
    ]
  },
  {
    version: '1.0.0',
    changes: [
      'Erste Version: DEA, NEA, Kellerautomat (DKA, NKA) und Turingmaschine',
      'Grapheneditor, Alphabet, Übergangstabelle, Simulation und reguläre Ausdrücke',
      'Export als PDF, PNG, JPG und CSV, Einstellungen und Hilfe'
    ]
  }
]
