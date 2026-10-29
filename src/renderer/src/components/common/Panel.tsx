import type { ReactNode } from 'react'
import { classNames } from '@/utils/dom'

interface PanelProps {
  title: string
  actions?: ReactNode
  fill?: boolean
  children: ReactNode
}

export function Panel({ title, actions, fill, children }: PanelProps) {
  return (
    <section className={classNames('panel', fill && 'is-fill')}>
      <header className="panel-header">
        <h3 className="panel-title">{title}</h3>
        {actions}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
