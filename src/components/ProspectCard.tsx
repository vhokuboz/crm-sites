import { useState } from 'react'
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import {
  STATUS_LABEL,
  STATUS_TONE,
  addDaysISO,
  prototypeUrl,
  relativeDay,
} from '../lib/domain'
import { GapMeter } from './GapMeter'
import { QuickActions } from './QuickActions'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
  tone?: 'overdue' | 'normal'
}

export function ProspectCard({ prospect: p, onUpdate, onOpen, tone = 'normal' }: Props) {
  const [copied, setCopied] = useState(false)
  const proto = prototypeUrl(p)
  const overdue = tone === 'overdue'

  async function copyApproach() {
    if (!p.approach_message) return
    await navigator.clipboard.writeText(p.approach_message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  /** Registra que houve contato hoje e ja deixa um retorno agendado. */
  function markContacted() {
    const antesDoContato = p.status === 'novo' || p.status === 'prototipado'
    void onUpdate(p.id, {
      last_contacted_at: new Date().toISOString(),
      status: antesDoContato ? 'contatado' : p.status,
      next_action_at: addDaysISO(3),
    })
  }

  return (
    <article
      className={`group relative rounded-sm border bg-card p-4 transition-colors ${
        overdue ? 'border-seal/40' : 'border-rule'
      }`}
    >
      {overdue && <span className="absolute inset-y-0 left-0 w-0.5 bg-seal" aria-hidden />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => onOpen(p)}
            className="text-left font-display text-[15px] font-semibold leading-snug tracking-tight hover:underline"
          >
            {p.name}
          </button>
          <p className="mt-0.5 font-mono text-[11px] text-muted">
            {p.segment}
            {p.next_action_at && (
              <>
                {' · '}
                <span className={overdue ? 'font-semibold text-seal' : ''}>
                  {relativeDay(p.next_action_at)}
                </span>
              </>
            )}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[p.status]}`}
        >
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      {p.problem && (
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{p.problem}</p>
      )}

      <div className="mt-3">
        <GapMeter prospect={p} compact />
      </div>

      <div className="mt-3.5 flex flex-wrap items-start gap-3 rule-top pt-3">
        <div className="min-w-0 flex-1">
          <QuickActions prospect={p} />
        </div>

        {/* Empilhado e ancorado à direita no mobile; em linha a partir de sm. */}
        <div className="ml-auto flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          {p.approach_message && (
            <button
              onClick={copyApproach}
              className="rounded-sm bg-ink px-2.5 py-1.5 font-mono text-[11px] font-medium text-paper transition-opacity hover:opacity-85"
            >
              {copied ? 'Copiado' : 'Copiar abordagem'}
            </button>
          )}

          {p.status === 'novo' && proto ? (
            <button
              onClick={() => void onUpdate(p.id, { status: 'prototipado' })}
              className="rounded-sm border border-deep/40 px-2.5 py-1.5 font-mono text-[11px] text-deep transition-colors hover:bg-deep/10"
            >
              Marcar prototipado
            </button>
          ) : null}

          <button
            onClick={markContacted}
            className="rounded-sm border border-rule px-2.5 py-1.5 font-mono text-[11px] text-ink transition-colors hover:bg-paper"
          >
            Marcar contato
          </button>
        </div>
      </div>
    </article>
  )
}
