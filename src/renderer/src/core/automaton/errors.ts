/**
 * Wird von noch nicht implementierten Automaten-Methoden geworfen.
 * Die UI erkennt diesen Fehler und zeigt einen Hinweis statt einer Fehlermeldung.
 */
export class NotImplementedError extends Error {
  constructor(
    readonly feature: string,
    readonly location: string
  ) {
    super(`${feature} ist noch nicht implementiert (${location}).`)
    this.name = 'NotImplementedError'
  }
}

export function isNotImplemented(err: unknown): err is NotImplementedError {
  return err instanceof NotImplementedError
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
