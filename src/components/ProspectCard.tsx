import { useState } from 'react'
import type { OnUpdate } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import {
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  canDiscard,
  isOpen,
  inactivityRisk,
  lastSocialActivityLabel,
  prototypeUrl,
  relativeDay,
} from '../lib/domain'
import { SNOOZE_OPTIONS, canContact, canRepeat, contactPatch, repeatPatch, snoozePatch } from '../lib/queueActions'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { DiscardModal } from './DiscardModal'
import { GapMeter } from './GapMeter'
import { CopiarCobranca } from './CopiarCobranca'
import { ArchiveIcon, CheckIcon, QuickActions } from './QuickActions'

type Props = {
  prospect: Prospect
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
  tone?: 'overdue' | 'normal'
  /** Modo de selecao em lote: mostra a caixa de marcar. */
  selecting?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  /** Texto do botao de contato (ex.: "Enviei a proposta"). */
  contactLabel?: string
}

/** Envelope com relógio: usado no botão "marcar contato" (contato + próximo
 *  retorno agendado). Desenhado aqui em vez de vir de um pacote, seguindo o
 *  padrão dos ícones em QuickActions.tsx. */
function ContactIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 14v2.2l1.6 1" />
      <path d="m22 7-.759.484" />
      <path d="M6.835 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2" />
      <path d="M7.605 10.567 2 7" />
      <circle cx="16" cy="16" r="6" />
    </svg>
  )
}

/** Prancheta com seta: usado no botão "copiar abordagem". */
function ClipboardCopyIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v4" />
      <path d="M21 14H11" />
      <path d="m15 10-4 4 4 4" />
    </svg>
  )
}

/** Seta circular: usado no botão "cobrei de novo". */
function RepeatIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

const PRIMARY =
  'hit flex min-h-10 w-full items-center justify-center gap-1.5 rounded-sm bg-ink px-3.5 py-2 text-body font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50'
const SECONDARY =
  'hit inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm border border-rule px-2.5 py-1.5 text-body transition-colors hover:bg-paper'

export function ProspectCard({
  prospect: p,
  onUpdate,
  onOpen,
  tone = 'normal',
  selecting = false,
  selected = false,
  onSelect,
  contactLabel = 'Marquei contato',
}: Props) {
  const [copied, setCopied] = useState<'ok' | 'erro' | null>(null)
  // Segura cliques repetidos enquanto a gravacao nao volta ("cobrei de novo" somaria 2x).
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const proto = prototypeUrl(p)
  const overdue = tone === 'overdue'
  const lastActivity = lastSocialActivityLabel(p)
  const risk = inactivityRisk(p)

  async function copyApproach() {
    if (!p.approach_message) return
    try {
      await navigator.clipboard.writeText(p.approach_message)
      setCopied('ok')
    } catch {
      setCopied('erro')
    }
    setTimeout(() => setCopied(null), 1800)
  }

  async function run(save: Promise<boolean>) {
    setBusy(true)
    await save
    setBusy(false)
  }

  /** Registra que houve contato hoje e ja deixa um retorno agendado. */
  function markContacted() {
    void run(onUpdate(p.id, contactPatch(p), 'Contato registrado'))
  }

  /** Empurra a próxima ação e soma uma tentativa, sem sair do card. */
  function cobrarDeNovo() {
    void run(onUpdate(p.id, repeatPatch(p), 'Nova cobrança registrada'))
  }

  function snooze(days: number, label: string) {
    void run(onUpdate(p.id, snoozePatch(days), `Adiado: ${label.toLowerCase()}`))
  }

  const podeCobrarDeNovo = canRepeat(p)

  /** Atalhos com o card focado (j/k movem o foco entre cards, na Hoje). */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey || busy) return
    if (e.key === 'Enter' || e.key === 'e') onOpen(p)
    else if (e.key === 'c') podeCobrarDeNovo ? cobrarDeNovo() : canContact(p) && markContacted()
    else if (e.key === 'a') snooze(1, 'amanhã')
    else if (e.key === 'x' && selecting) onSelect?.(p.id)
    else return
    e.preventDefault()
  }

  /** Anexa a nota digitada no modal, sem apagar o que já estava anotado. */
  async function discardWithNote(note: string) {
    await onUpdate(p.id, {
      status: 'descartado',
      next_action_at: null,
      notes: note ? (p.notes ? `${p.notes}\n\n${note}` : note) : p.notes,
    }, `${p.name} descartado`)
  }

  return (
    <article
      data-card
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`@container flex h-full flex-col rounded-sm border bg-card p-4 ${
        selected ? 'border-ink ring-1 ring-ink' : overdue ? 'border-seal/40' : 'border-rule'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {selecting && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(p.id)}
            aria-label={`Selecionar ${p.name}`}
            className="hit mt-1 h-4 w-4 shrink-0 accent-ink"
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onOpen(p)}
            className="text-left break-words font-semibold text-name tracking-tight hover:underline"
          >
            {p.name}
          </button>
          {lastActivity && (
            <span
              className={`ml-1.5 text-xs ${risk ? RISK_TONE[risk] : 'text-muted'}`}
              title={`Última atividade social: ${lastActivity}${risk ? ` · ${RISK_LABEL[risk]}` : ''}`}
            >
              · {lastActivity}
            </span>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {p.segment}
            {p.next_action_at && (
              <>
                {' · '}
                <span className={overdue ? 'font-semibold text-seal-ink' : ''}>
                  {relativeDay(p.next_action_at)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-meta uppercase tracking-wider ${STATUS_TONE[p.status]}`}
          >
            {STATUS_LABEL[p.status]}
          </span>
          <BusinessStatusBadge prospect={p} />
        </div>
      </div>

      {p.problem && (
        <p className="mt-2.5 line-clamp-2 text-body leading-relaxed text-muted">{p.problem}</p>
      )}

      <div className="mt-3">
        <GapMeter prospect={p} compact />
      </div>

      <div className="mt-auto space-y-2.5 rule-top pt-3.5">
        {/* Uma acao principal, larga e com texto, decidida pelo status. */}
        {p.status === 'prototipado' && (
          <button onClick={markContacted} disabled={busy} className={PRIMARY}>
            <ContactIcon size={14} />
            {contactLabel}
          </button>
        )}
        {podeCobrarDeNovo && (
          <button onClick={cobrarDeNovo} disabled={busy} className={PRIMARY}>
            <RepeatIcon size={14} />
            Cobrei de novo
          </button>
        )}
        {p.status === 'novo' && proto && (
          <button
            onClick={() => void run(onUpdate(p.id, { status: 'prototipado' }, 'Marcado como prototipado'))}
            disabled={busy}
            className={PRIMARY}
          >
            Marcar prototipado
          </button>
        )}

        {/* Barra quieta: atalhos de link a esquerda, copiar e menu a direita. */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <QuickActions prospect={p} max={4} />
          </div>
          <CopiarCobranca prospect={p} onUpdate={onUpdate} className={SECONDARY} />
          {p.approach_message && (
            <button onClick={copyApproach} aria-label="Copiar mensagem de abordagem" className={SECONDARY}>
              {copied === 'ok' ? <CheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
              {copied === 'ok' ? 'Copiado' : copied === 'erro' ? 'Não copiou' : (
                <>
                  Copiar<span className="hidden @sm:inline"> mensagem</span>
                </>
              )}
            </button>
          )}
          {isOpen(p) && (
            <details data-menu className="relative">
              <summary
                aria-label="Adiar ou descartar"
                className="hit grid h-9 w-9 cursor-pointer list-none place-items-center rounded-sm text-lg leading-none text-muted hover:bg-paper [&::-webkit-details-marker]:hidden"
              >
                ···
              </summary>
              <div className="absolute bottom-full right-0 z-10 mb-1 w-44 rounded-sm border border-rule bg-card p-1 shadow-lg">
                <p className="px-2.5 pb-1 pt-1.5 text-meta text-muted">Adiar</p>
                {SNOOZE_OPTIONS.map((o) => (
                  <button
                    key={o.days}
                    onClick={() => snooze(o.days, o.label)}
                    disabled={busy}
                    className="block w-full rounded-sm px-2.5 py-2.5 text-left text-body hover:bg-paper disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
                {canDiscard(p) && (
                  <button
                    onClick={() => setDiscardOpen(true)}
                    className="mt-1 flex w-full items-center gap-2 rounded-sm border-t border-rule px-2.5 py-2.5 text-body text-seal-ink hover:bg-seal/10"
                  >
                    <ArchiveIcon size={14} />
                    Descartar
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
      </div>

      {discardOpen && (
        <DiscardModal
          prospect={p}
          onConfirm={discardWithNote}
          onClose={() => setDiscardOpen(false)}
        />
      )}
    </article>
  )
}
