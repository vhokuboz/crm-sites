import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { SERVICE_LABEL, SERVICE_TONE, reminderLabel, serviceDateLabel, serviceState } from '../lib/service'
import { ServiceActions } from './ServiceActions'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

/** Uma linha de cliente: badge do estado, a data que importa e as ações do estado. */
export function ClienteRow({ prospect: p, onUpdate, onOpen }: Props) {
  const state = serviceState(p)
  if (!state) return null
  const detalhes = [
    serviceDateLabel(p),
    reminderLabel(p),
    p.monthly_fee ? `R$ ${p.monthly_fee}/mês` : null,
  ].filter(Boolean)

  return (
    <article className="rounded-sm border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(p)} className="min-w-0 text-left">
          <h3 className="truncate font-display text-base font-semibold tracking-tight">{p.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{detalhes.join(' · ')}</p>
        </button>
        <span
          className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SERVICE_TONE[state]}`}
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
