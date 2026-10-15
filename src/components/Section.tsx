import { useCallback, useId, useState } from 'react'

const KEY = 'crm:secao:'

/** Estado aberto/recolhido de uma secao, lembrado no navegador (falha silenciosa se o storage nao existir). */
export function useStoredOpen(id: string, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY + id)
      return saved === null ? defaultOpen : saved === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = useCallback(() => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY + id, o ? '0' : '1')
      } catch {
        /* sem storage: so vale nesta visita */
      }
      return !o
    })
  }, [id])
  return [open, toggle]
}

type Props = {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  /** Texto quando a secao esta aberta e vazia. */
  empty?: string
  hint?: string
  /** Contagem em vermelho quando ha itens (atrasados, servico). */
  urgent?: boolean
  children: React.ReactNode
}

/**
 * Secao da fila que recolhe. A contagem fica no titulo, aberta ou nao, para que
 * recolher nunca esconda que ainda ha trabalho ali.
 */
export function Section({ title, count, open, onToggle, empty, hint, urgent = false, children }: Props) {
  const bodyId = useId()
  return (
    <section>
      <h2 className="font-display text-base font-semibold tracking-tight">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="hit -mx-1 flex items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-card"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {title}
          <span className={`text-xs font-normal tabular-nums ${urgent && count > 0 ? 'text-seal-ink' : 'text-muted'}`}>
            {count}
          </span>
        </button>
      </h2>

      <div id={bodyId} hidden={!open}>
        {hint && <p className="mt-1 text-body text-muted">{hint}</p>}
        {count === 0 ? (
          empty && (
            <p className="mt-3 rounded-sm border border-dashed border-rule px-4 py-6 text-center text-body text-muted">
              {empty}
            </p>
          )
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/** Grade padrao de cards das secoes da fila. */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
}
