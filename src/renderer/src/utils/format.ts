/**
 * Aktive Zustände als Text: DEA „q0“, NEA „{q0, q1}“, kein aktiver Zustand „∅“ (Automat hängt).
 */
export function formatStateSet(labels: string[], single: boolean): string {
  if (labels.length === 0) return '∅'
  return single && labels.length === 1 ? labels[0] : `{${labels.join(', ')}}`
}
