import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** Laufende Schreibaufträge pro Zielpfad – der nächste wartet, bis der vorige fertig ist. */
const queues = new Map<string, Promise<unknown>>()

/**
 * Schreibt atomar: erst eine eindeutige Hilfsdatei im Zielordner, dann umbenennen. Bricht das
 * Schreiben ab (voller Datenträger, getrennte Verbindung), bleibt die alte Datei heil.
 * Aufträge für denselben Pfad laufen nacheinander in Aufrufreihenfolge.
 */
export function safeWriteFile(target: string, data: string | Uint8Array): Promise<void> {
  const key = target.toLowerCase()
  const previous = queues.get(key) ?? Promise.resolve()
  const job = previous.catch(() => undefined).then(() => writeAtomically(target, data))
  queues.set(key, job)
  void job.finally(() => {
    if (queues.get(key) === job) queues.delete(key)
  }).catch(() => undefined)
  return job
}

async function writeAtomically(target: string, data: string | Uint8Array): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temp, data, typeof data === 'string' ? 'utf-8' : undefined)
    await renameWithRetry(temp, target)
  } catch (err) {
    await rm(temp, { force: true })
    throw err
  }
}

/** Unter Windows sperren Virenscanner oder Indexer die Zieldatei manchmal kurz. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
    }
  }
}
