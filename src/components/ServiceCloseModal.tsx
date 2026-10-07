import { useEffect, useState, type FormEvent } from 'react'
import type { Prospect } from '../lib/database.types'

type Props = {
  prospect: Prospect
  kind: 'suspender' | 'encerrar'
  onConfirm: () => Promise<unknown> | void
  onClose: () => void
}

const COPY = {
  suspender: {
    eyebrow: 'Suspender site',
    title: (name: string) => `Suspender o site de ${name}?`,
    body: 'Remove a hospedagem do Cloudflare Pages. Se o cliente pagar depois, é preciso rodar o deploy de novo no agent-okaisites.',
    check: 'Tenho certeza que quero derrubar o site',
    action: 'Suspender site',
    busy: 'Suspendendo…',
  },
  encerrar: {
    eyebrow: 'Encerrar cliente',
    title: (name: string) => `Encerrar ${name}?`,
    body: 'Marca o serviço como encerrado de vez e remove a hospedagem, se ainda estiver no ar.',
    check: 'Tenho certeza que quero encerrar este cliente',
    action: 'Encerrar cliente',
    busy: 'Encerrando…',
  },
} as const

/** Confirmação dupla (checkbox + o confirm do `update`), como o `DiscardModal`. */
export function ServiceCloseModal({ prospect, kind, onConfirm, onClose }: Props) {
  const copy = COPY[kind]
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    await onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title(prospect.name)}
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              {copy.title(prospect.name)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-rule px-2.5 py-1 font-mono text-[11px] hover:bg-card"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-muted">{copy.body}</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {copy.check}
          </label>
          <button
            type="submit"
            disabled={!confirmed || busy}
            className="w-full rounded-sm bg-seal px-4 py-2.5 font-display text-sm font-semibold text-card transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? copy.busy : copy.action}
          </button>
        </form>
      </div>
    </div>
  )
}
