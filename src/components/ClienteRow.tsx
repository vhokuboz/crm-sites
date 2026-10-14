import type { OnUpdate } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import { SERVICE_LABEL, SERVICE_TONE, reminderLabel, serviceDateLabel, serviceState } from '../lib/service'
import { ServiceActions } from './ServiceActions'

type Props = {
  prospect: Prospect
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
}

/** Uma linha de cliente: badge do estado, a data que importa e as ações do estado. */
export function ClienteRow({ prospect: p, onUpdate, onOpen }: Props) {
  const state = serviceState(p)
  if (!state) return null
  const detalhes = [
    serviceDateLabel(p),
    reminderLabel(p),
    p.monthly_fee ? `${p.monthly_fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês` : null,
  ].filter(Boolean)

  return (
    <article className="rounded-sm border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(p)} className="min-w-0 text-left">
          <h3 className="truncate font-semibold text-name tracking-tight">{p.name}</h3>
          <p className="mt-0.5 text-xs text-muted">{detalhes.join(' · ')}</p>
        </button>
        <span
          className={`shrink-0 rounded-sm px-2 py-0.5 text-xs uppercase tracking-wider ${SERVICE_TONE[state]}`}
        >
          {SERVICE_LABEL[state]}
        </span>
      </div>
      <div className="mt-3">
        <ServiceActions prospect={p} onUpdate={onUpdate} />
      </div>
    </article>
  )
}
