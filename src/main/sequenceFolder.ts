import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Höchstens so viele Varianten „name (n)“ probieren, dann aufgeben. */
const MAX_ATTEMPTS = 1000

/**
 * Legt in `parent` einen neuen, leeren Ordner für eine Bildfolge an: `name`, bei Bedarf
 * `name (2)`, `name (3)` … Ein vorhandener Ordner wird nie benutzt – so überschreibt eine
 * Bildfolge keine früheren Bilder und mischt sich nicht mit einer älteren Serie.
 */
export async function createSequenceFolder(parent: string, name: string): Promise<string> {
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const folder = join(parent, n === 1 ? name : `${name} (${n})`)
    try {
      await mkdir(folder)
      return folder
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new Error('Kein freier Ordnername für die Bildfolge')
}
