import { useEffect, useRef, useState } from 'react'
import type { Prospect } from '../lib/database.types'
import {
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  buildQueue,
  inactivityRisk,
  lastSocialActivityLabel,
  relativeDay,
} from '../lib/domain'
import { SNOOZE_OPTIONS, canRepeat, contactPatch, repeatPatch, snoozePatch } from '../lib/queueActions'
import type { OnUpdate } from '../lib/useProspects'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { GapMeter } from './GapMeter'
import { QuickActions } from './QuickActions'

type Props = {
  prospects: Prospect[]
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
  onExit: () => void
}

const KEY = 'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-current/30 px-1 text-meta opacity-70'

/**
 * Um prospect por vez: a mensagem pronta, os links e quatro saidas
 * (enviei, adiar, pular, abrir a ficha). Ao agir, o proximo ja aparece.
 */
export function Foco({ prospects, onUpdate, onOpen, onExit }: Props) {
  const [skipped, setSkipped] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'erro' | null>(null)

  const q = buildQueue(prospects)
  const all = [...q.overdue, ...q.today, ...q.unscheduled]
  // Quem foi pulado vai para o fim da fila, sem sair dela.
  const ordered = [...all.filter((p) => !skipped.includes(p.id)), ...all.filter((p) => skipped.includes(p.id))]
  const p = ordered[0]
  const total = done + ordered.length
  const repeat = !!p && canRepeat(p)

  async function act(patch: Parameters<OnUpdate>[1], label: string) {
    if (!p || busy) return
    setBusy(true)
    const ok = await onUpdate(p.id, patch, label)
    if (ok) setDone((n) => n + 1)
    setBusy(false)
  }

  const send = () => act(repeat ? repeatPatch(p!) : contactPatch(p!), repeat ? 'Nova cobrança registrada' : 'Contato registrado')
  const snooze = (days: number, label: string) => act(snoozePatch(days), `Adiado: ${label.toLowerCase()}`)
  const skip = () => p && ordered.length > 1 && setSkipped((s) => [...s.filter((id) => id !== p.id), p.id])

  async function copy() {
    if (!p?.approach_message) return
    try {
      await navigator.clipboard.writeText(p.approach_message)
      setCopied('ok')
    } catch {
      setCopied('erro')
    }
    setTimeout(() => setCopied(null), 1800)
  }

  // Atalhos: Enter envia, a/b/c adiam (amanha, 3 dias, 1 semana), s ou seta pula, o abre a ficha.
  const handlers = useRef({ send, snooze, skip, open: () => p && onOpen(p) })
  handlers.current = { send, snooze, skip, open: () => p && onOpen(p) }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('[aria-modal="true"]')) return
      const h = handlers.current
      if (e.key === 'Enter' && t.closest('button, a, summary')) return
      if (e.key === 'Enter') void h.send()
      else if (e.key === 'a') void h.snooze(SNOOZE_OPTIONS[0].days, SNOOZE_OPTIONS[0].label)
      else if (e.key === 'b') void h.snooze(SNOOZE_OPTIONS[1].days, SNOOZE_OPTIONS[1].label)
      else if (e.key === 'c') void h.snooze(SNOOZE_OPTIONS[2].days, SNOOZE_OPTIONS[2].label)
      else if (e.key === 's' || e.key === 'ArrowRight') h.skip()
      else if (e.key === 'o') h.open()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!p) {
    return (
      <div className="mx-auto max-w-xl rounded-sm border border-rule bg-card px-6 py-12 text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight">Fila concluída</h2>
        <p className="mt-2 text-body text-muted">
          {done > 0
            ? `${done} prospect${done === 1 ? '' : 's'} tratado${done === 1 ? '' : 's'} nesta sessão. Nada mais pede ação hoje.`
            : 'Nada pede ação hoje.'}
        </p>
        <button
          onClick={onExit}
          className="hit mt-6 rounded-sm bg-ink px-4 py-2.5 text-body font-medium text-paper hover:opacity-90"
        >
          Voltar para a lista
        </button>
      </div>
    )
  }

  const risk = inactivityRisk(p)
  const lastActivity = lastSocialActivityLabel(p)
  const overdue = !!p.next_action_at && relativeDay(p.next_action_at).startsWith('há')

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Progresso da fila"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-1.5 flex-1 rounded-full bg-rule/70"
        >
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-300"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        <p className="shrink-0 text-meta tabular-nums text-muted">
          {done} feitos · {ordered.length} restam
        </p>
        <button onClick={onExit} className="hit shrink-0 rounded-sm border border-rule px-3 py-1.5 text-body hover:bg-card">
          Sair do foco
        </button>
      </div>

      <article
        className={`mt-4 rounded-sm border bg-card p-5 sm:p-6 ${overdue ? 'border-seal/40' : 'border-rule'}`}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words font-display text-2xl font-semibold leading-tight tracking-tight">{p.name}</h2>
            <p className="mt-1 text-body text-muted">
              {[p.segment, p.city].filter(Boolean).join(' · ')}
              {p.next_action_at && (
                <>
                  {' · '}
                  <span className={overdue ? 'font-semibold text-seal-ink' : ''}>{relativeDay(p.next_action_at)}</span>
                </>
              )}
              {lastActivity && (
                <span className={`ml-1 ${risk ? RISK_TONE[risk] : ''}`} title={risk ? RISK_LABEL[risk] : undefined}>
                  · {lastActivity}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`rounded-full px-2 py-0.5 text-meta uppercase tracking-wider ${STATUS_TONE[p.status]}`}>
              {STATUS_LABEL[p.status]}
            </span>
            <BusinessStatusBadge prospect={p} />
          </div>
        </div>

        {p.problem && <p className="mt-4 text-body leading-relaxed">{p.problem}</p>}

        <div className="mt-4">
          <GapMeter prospect={p} />
        </div>

        {p.approach_message ? (
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Mensagem pronta</h3>
              <button onClick={copy} className="hit rounded-sm border border-rule px-2.5 py-1.5 text-body hover:bg-paper">
                {copied === 'ok' ? 'Copiado' : copied === 'erro' ? 'Não copiou' : 'Copiar'}
              </button>
            </div>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-paper p-3 text-body leading-relaxed">
              {p.approach_message}
            </p>
          </div>
        ) : (
          <p className="mt-5 rounded-sm border border-dashed border-rule p-3 text-body text-muted">
            Sem mensagem de abordagem. Abra a ficha para escrever uma.
          </p>
        )}

        <div className="mt-4">
          <QuickActions prospect={p} size="md" />
        </div>

        <div className="mt-6 space-y-3 rule-top pt-5">
          <button
            onClick={() => void send()}
            disabled={busy}
            className="hit flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-ink px-4 py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {repeat ? 'Cobrei de novo' : 'Enviei'} <span className={`${KEY} hidden sm:inline-flex`}>↵</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta text-muted">Adiar:</span>
            {SNOOZE_OPTIONS.map((o, i) => (
              <button
                key={o.days}
                onClick={() => void snooze(o.days, o.label)}
                disabled={busy}
                className="hit inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-rule px-3 py-2 text-body hover:bg-paper disabled:opacity-50"
              >
                {o.label} <span className={`${KEY} hidden sm:inline-flex`}>{'abc'[i]}</span>
              </button>
            ))}
            <button
              onClick={skip}
              disabled={ordered.length < 2}
              className="hit ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-sm px-3 py-2 text-body text-muted hover:bg-paper disabled:opacity-40"
            >
              Pular <span className={`${KEY} hidden sm:inline-flex`}>s</span>
            </button>
            <button
              onClick={() => onOpen(p)}
              className="hit inline-flex min-h-10 items-center gap-1.5 rounded-sm px-3 py-2 text-body text-muted hover:bg-paper"
            >
              Abrir ficha <span className={`${KEY} hidden sm:inline-flex`}>o</span>
            </button>
          </div>
        </div>
      </article>
    </div>
  )
}
