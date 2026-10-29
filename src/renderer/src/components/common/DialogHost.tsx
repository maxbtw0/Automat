import { useEffect } from 'react'
import { useDialogStore } from '@/store/dialogStore'
import { classNames } from '@/utils/dom'

/** Zeigt den aktuellen Dialog aus dem dialogStore an (einmal in App eingebunden). */
export function DialogHost() {
  const request = useDialogStore((s) => s.request)
  const answer = useDialogStore((s) => s.answer)

  useEffect(() => {
    if (!request) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') answer(request.buttons.length - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request, answer])

  if (!request) return null

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" className="dialog-title">
          {request.title}
        </h2>
        {request.detail && <p className="dialog-detail">{request.detail}</p>}
        <div className="dialog-buttons">
          {request.buttons.map((label, i) => (
            <button
              key={label}
              className={classNames(
                'btn',
                i === 0 && 'is-primary',
                i === request.danger && 'is-danger'
              )}
              autoFocus={i === 0}
              onClick={() => answer(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
