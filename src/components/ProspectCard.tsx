import { useState } from 'react'
import type { OnUpdate } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import {
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  addBusinessDaysISO,
  addDaysISO,
  canDiscard,
  daysFromToday,
  inactivityRisk,
  lastSocialActivityLabel,
  prototypeUrl,
  relativeDay,
} from '../lib/domain'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { DiscardModal } from './DiscardModal'
import { GapMeter } from './GapMeter'
import { ArchiveIcon, QuickActions } from './QuickActions'

type Props = {
  prospect: Prospect
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
  tone?: 'overdue' | 'normal'
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

/** Confirmação visual de "copiado", no lugar do texto. */
function CheckIcon({ size }: { size: number }) {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

const PRIMARY =
  'hit inline-flex items-center gap-1.5 rounded-sm bg-ink px-3 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85'
const SECONDARY =
  'hit inline-flex items-center gap-1.5 rounded-sm border border-rule px-3 py-2 text-sm transition-colors hover:bg-paper'

export function ProspectCard({ prospect: p, onUpdate, onOpen, tone = 'normal' }: Props) {
  const [copied, setCopied] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const proto = prototypeUrl(p)
  const overdue = tone === 'overdue'
  const lastActivity = lastSocialActivityLabel(p)
  const risk = inactivityRisk(p)

  async function copyApproach() {
    if (!p.approach_message) return
    await navigator.clipboard.writeText(p.approach_message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  /** Registra que houve contato hoje e ja deixa um retorno agendado. */
  function markContacted() {
    const antesDoContato = p.status === 'triagem' || p.status === 'prototipado'
    void onUpdate(p.id, {
      last_contacted_at: new Date().toISOString(),
      ...(antesDoContato
        ? { status: 'contatado' as const }
        : { next_action_at: addDaysISO(3) }),
    }, 'Contato registrado')
  }

  /** Empurra a próxima ação e soma uma tentativa, sem sair do card. */
  function cobrarDeNovo() {
    void onUpdate(p.id, {
      next_action_at: addBusinessDaysISO(3),
      contact_attempts: p.contact_attempts + 1,
    }, 'Nova cobrança registrada')
  }

  const podeCobrarDeNovo =
    p.status === 'contatado' && !!p.next_action_at && daysFromToday(p.next_action_at) <= 0

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
      className={`group relative @container flex h-full flex-col rounded-sm border bg-card p-4 transition-colors ${
        overdue ? 'border-seal/40' : 'border-rule'
      }`}
    >
      {overdue && <span className="absolute inset-y-0 left-0 w-0.5 bg-seal" aria-hidden />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => onOpen(p)}
            className="text-left font-display text-base font-semibold leading-snug tracking-tight hover:underline"
          >
            {p.name}
            {lastActivity && (
              <span
                className={`ml-1 text-xs font-normal ${risk ? RISK_TONE[risk] : 'text-muted'}`}
                title={`Última atividade social: ${lastActivity}${risk ? ` · ${RISK_LABEL[risk]}` : ''}`}
              >
                · {lastActivity}
              </span>
            )}
          </button>
          <p className="mt-0.5 text-xs text-muted">
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${STATUS_TONE[p.status]}`}
          >
            {STATUS_LABEL[p.status]}
          </span>
          <BusinessStatusBadge prospect={p} />
        </div>
      </div>

      {p.problem && (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.problem}</p>
      )}

      <div className="mt-3">
        <GapMeter prospect={p} compact />
      </div>

      <div className="mt-auto rule-top pt-3.5">
        <div className="flex items-center gap-2">
          {/* Uma acao principal, com texto, decidida pelo status. */}
          {(p.status === 'triagem' || p.status === 'prototipado') && (
            <button onClick={markContacted} className={PRIMARY}>
              <ContactIcon size={14} />
              Marquei contato
            </button>
          )}
          {podeCobrarDeNovo && (
            <button onClick={cobrarDeNovo} className={PRIMARY}>
              <RepeatIcon size={14} />
              Cobrei de novo
            </button>
          )}
          {p.status === 'novo' && proto && (
            <button
              onClick={() => void onUpdate(p.id, { status: 'prototipado' }, 'Marcado como prototipado')}
              className={PRIMARY}
            >
              Marcar prototipado
            </button>
          )}
          {p.approach_message && (
            <button onClick={copyApproach} className={SECONDARY}>
              {copied ? <CheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
              {copied ? 'Copiado' : 'Copiar abordagem'}
            </button>
          )}

          {canDiscard(p) && (
            <details className="relative ml-auto">
              <summary
                aria-label="Mais ações"
                className="hit grid h-9 w-9 cursor-pointer list-none place-items-center rounded-sm text-lg leading-none text-muted hover:bg-paper [&::-webkit-details-marker]:hidden"
              >
                ···
              </summary>
              <div className="absolute bottom-full right-0 z-10 mb-1 w-36 rounded-sm border border-rule bg-card p-1 shadow-lg">
                <button
                  onClick={() => setDiscardOpen(true)}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-seal hover:bg-seal/10"
                >
                  <ArchiveIcon size={14} />
                  Descartar
                </button>
              </div>
            </details>
          )}
        </div>

        <div className="mt-2.5">
          <QuickActions prospect={p} max={4} />
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
