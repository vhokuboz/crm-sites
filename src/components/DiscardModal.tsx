import { useEffect, useState, type FormEvent } from 'react'
import type { Prospect } from '../lib/database.types'

type Props = {
  prospect: Prospect
  onConfirm: (note: string) => Promise<void> | void
  onClose: () => void
}

/**
 * Confirmação de descarte: exige marcar a caixa "tenho certeza" antes de
 * habilitar o envio, pra não bastar um clique isolado no botão do card ou do
 * header pra encerrar o prospect. Mesmo padrão de modal do ContractModal.
 */
export function DiscardModal({ prospect, onConfirm, onClose }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [note, setNote] = useState('')
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
    await onConfirm(note.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Descartar ${prospect.name}`}
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Descartar</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Descartar {prospect.name}?
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

        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Move para "Descartado" e apaga a próxima ação agendada
          {prospect.landing_page_url ? ', além de remover a hospedagem do preview publicado' : ''}.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">Motivo (opcional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Vai para as anotações, sem apagar o que já tinha"
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Tenho certeza que quero descartar
          </label>

          <button
            type="submit"
            disabled={!confirmed || busy}
            className="w-full rounded-sm bg-seal px-4 py-2.5 font-display text-sm font-semibold text-card transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Descartando…' : 'Descartar'}
          </button>
        </form>
      </div>
    </div>
  )
}
