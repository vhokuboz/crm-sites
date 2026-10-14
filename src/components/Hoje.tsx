import { useEffect, useRef, useState } from 'react'
import type { OnUpdate, OnUpdateMany } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import {
  FUNNEL,
  STATUS_LABEL,
  buildQueue,
  byOpportunity,
  isOpen,
  readGap,
} from '../lib/domain'
import { SNOOZE_OPTIONS, contactPatch, matchesFilters, snoozePatch } from '../lib/queueActions'
import { Foco } from './Foco'
import { ProspectCard } from './ProspectCard'
import { ServicoFila } from './ServicoFila'

type Props = {
  prospects: Prospect[]
  onUpdate: OnUpdate
  onUpdateMany: OnUpdateMany
  onOpen: (p: Prospect) => void
}

const FIELD =
  'min-h-9 rounded-sm border border-rule bg-card px-2.5 text-body placeholder:text-muted'

/** Nao dispara atalho de tecla com foco em campo de texto ou com um dialogo aberto. */
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    !!t.closest('input, textarea, select, [contenteditable]') ||
    !!document.querySelector('[aria-modal="true"]')
  )
}

export function Hoje({ prospects, onUpdate, onUpdateMany, onOpen }: Props) {
  const [view, setView] = useState<'lista' | 'foco'>('lista')
  const [filters, setFilters] = useState({ query: '', segment: '', status: '' })
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const segments = [...new Set(prospects.filter(isOpen).map((p) => p.segment).filter(Boolean))].sort()
  const filtered = prospects.filter((p) => matchesFilters(p, filters))
  const filtering = !!(filters.query || filters.segment || filters.status)
  const queue = buildQueue(filtered)
  const abertos = prospects.filter(isOpen)

  // Atalhos da lista: / busca, j/k percorre os cards, f abre o modo foco.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typing(e)) return
      if (e.key === '/') searchRef.current?.focus()
      else if (e.key === 'f') setView((v) => (v === 'foco' ? 'lista' : 'foco'))
      else if (view === 'lista' && (e.key === 'j' || e.key === 'k')) {
        const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')]
        const at = cards.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'j' ? Math.min(at + 1, cards.length - 1) : Math.max(at - 1, 0)
        cards[at === -1 ? 0 : next]?.focus()
        cards[at === -1 ? 0 : next]?.scrollIntoView({ block: 'nearest' })
      } else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [view])

  const allIds = [...queue.overdue, ...queue.today, ...queue.unscheduled].map((p) => p.id)
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const chosen = prospects.filter((p) => selected.includes(p.id))
  function leaveSelection() {
    setSelecting(false)
    setSelected([])
  }
  async function bulk(label: string, patchFor: (p: Prospect) => Parameters<OnUpdate>[1]) {
    await onUpdateMany(chosen.map((p) => ({ id: p.id, patch: patchFor(p) })), label)
    leaveSelection()
  }

  if (prospects.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-rule px-4 py-10 text-center text-body text-muted">
        Nenhum prospect na base ainda. Use “+ Novo prospect” para começar.
      </p>
    )
  }

  if (view === 'foco') {
    return <Foco prospects={filtered} onUpdate={onUpdate} onOpen={onOpen} onExit={() => setView('lista')} />
  }

  const cardProps = {
    onUpdate,
    onOpen,
    selecting,
    onSelect: toggle,
  }

  return (
    <div className={`space-y-8 ${selecting ? 'pb-24' : ''}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Buscar nome, segmento ou cidade"
            aria-label="Buscar na fila"
            className={`${FIELD} min-w-0 flex-1 sm:max-w-xs`}
          />
          <select
            value={filters.segment}
            onChange={(e) => setFilters({ ...filters, segment: e.target.value })}
            aria-label="Filtrar por segmento"
            className={FIELD}
          >
            <option value="">Todos os segmentos</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            aria-label="Filtrar por status"
            className={FIELD}
          >
            <option value="">Todos os status</option>
            {FUNNEL.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {filtering && (
            <button
              onClick={() => setFilters({ query: '', segment: '', status: '' })}
              className="hit px-2 py-2 text-body text-muted underline underline-offset-2 hover:text-ink"
            >
              Limpar filtros
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => (selecting ? leaveSelection() : setSelecting(true))}
              aria-pressed={selecting}
              className={`hit min-h-9 rounded-sm border px-3 text-body ${
                selecting ? 'border-ink bg-ink text-paper' : 'border-rule hover:bg-card'
              }`}
            >
              {selecting ? 'Cancelar seleção' : 'Selecionar'}
            </button>
            <button
              onClick={() => setView('foco')}
              className="hit min-h-9 rounded-sm bg-ink px-3.5 text-body font-medium text-paper hover:opacity-90"
            >
              Modo foco
            </button>
          </div>
        </div>
        <p className="hidden text-meta text-muted lg:block">
          Atalhos: <kbd>/</kbd> buscar · <kbd>j</kbd> <kbd>k</kbd> navegar · <kbd>c</kbd> contato · <kbd>a</kbd> adiar
          amanhã · <kbd>e</kbd> abrir · <kbd>f</kbd> modo foco · <kbd>n</kbd> novo prospect
        </p>
        {filtering && (
          <p className="text-meta text-muted" role="status">
            Filtrando: {queue.overdue.length + queue.today.length + queue.unscheduled.length} na fila de{' '}
            {abertos.length} em aberto.
          </p>
        )}
      </div>

      <div className="space-y-8">
        <ServicoFila prospects={prospects} onUpdate={onUpdate} onOpen={onOpen} />

        <Section
          title="Atrasados"
          count={queue.overdue.length}
          empty="Nada atrasado. A fila está em dia."
          urgent
        >
          {queue.overdue.map((p) => (
            <ProspectCard key={p.id} prospect={p} {...cardProps} selected={selected.includes(p.id)} tone="overdue" />
          ))}
        </Section>

        <Section
          title="Para hoje"
          count={queue.today.length}
          empty="Nenhum retorno marcado para hoje."
        >
          {queue.today.map((p) => (
            <ProspectCard key={p.id} prospect={p} {...cardProps} selected={selected.includes(p.id)} />
          ))}
        </Section>

        <Section
          title="Sem próximo passo"
          count={queue.unscheduled.length}
          empty="Todo mundo em aberto tem uma data marcada."
          hint="Ordenados pela lacuna: primeiro quem é bem avaliado e mal representado."
        >
          {queue.unscheduled.map((p) => (
            <ProspectCard key={p.id} prospect={p} {...cardProps} selected={selected.includes(p.id)} />
          ))}
        </Section>
      </div>

      {/* Panorama é consulta, não fila: fechado por padrão para a fila ter o foco. */}
      <details className="rule-top pt-4">
        <summary className="hit cursor-pointer text-body font-medium text-muted hover:text-ink">
          Panorama · {abertos.length} em aberto
        </summary>
        <div className="mt-5 grid gap-8 md:grid-cols-3">
          <Funnel prospects={prospects} />
          <Segments prospects={prospects} />
          <TopGaps prospects={abertos} onOpen={onOpen} />
        </div>
      </details>

      {selecting && (
        <div
          role="toolbar"
          aria-label="Ações em lote"
          className="on-ink fixed inset-x-0 bottom-0 z-40 border-t border-cream/15 bg-ink px-4 py-3 text-cream"
        >
          <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-2">
            <p className="mr-auto text-body" role="status">
              {selected.length === 0 ? 'Marque os cards' : `${selected.length} selecionado${selected.length === 1 ? '' : 's'}`}
            </p>
            <button
              disabled={selected.length === 0}
              onClick={() => void bulk('Contato registrado', (p) => contactPatch(p))}
              className="hit min-h-10 rounded-sm bg-cream px-3.5 text-body font-medium text-ink disabled:opacity-40"
            >
              Marquei contato
            </button>
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.days}
                disabled={selected.length === 0}
                onClick={() => void bulk(`Adiado: ${o.label.toLowerCase()}`, () => snoozePatch(o.days))}
                className="hit min-h-10 rounded-sm border border-cream/30 px-3 text-body hover:bg-cream/10 disabled:opacity-40"
              >
                Adiar: {o.label.toLowerCase()}
              </button>
            ))}
            <button
              onClick={() => setSelected(selected.length === allIds.length ? [] : allIds)}
              className="hit min-h-10 px-2 text-body underline underline-offset-2"
            >
              {selected.length === allIds.length ? 'Limpar' : 'Marcar todos'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  empty,
  hint,
  urgent = false,
  children,
}: {
  title: string
  count: number
  empty: string
  hint?: string
  urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        <span
          className={`text-xs tabular-nums ${urgent && count > 0 ? 'text-seal-ink' : 'text-muted'}`}
        >
          {count}
        </span>
      </div>
      {hint && <p className="mt-1 text-body text-muted">{hint}</p>}

      {count === 0 ? (
        <p className="mt-3 rounded-sm border border-dashed border-rule px-4 py-6 text-center text-body text-muted">
          {empty}
        </p>
      ) : (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  )
}

function Funnel({ prospects }: { prospects: Prospect[] }) {
  const total = prospects.length || 1
  return (
    <section>
      <h2 className="section-title">Funil</h2>
      <div className="mt-3 space-y-2">
        {FUNNEL.map((s) => {
          const n = prospects.filter((p) => p.status === s).length
          return (
            <div key={s} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-xs text-muted">
                {STATUS_LABEL[s]}
              </span>
              <div className="h-4 flex-1 bg-rule/50">
                <div
                  className="h-full bg-deep transition-[width] duration-500"
                  style={{ width: `${(n / total) * 100}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums">
                {n}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Segments({ prospects }: { prospects: Prospect[] }) {
  type Row = { seg: string; total: number; lost: number; won: number }
  const bySegment = new Map<string, Row>()
  for (const p of prospects) {
    const row = bySegment.get(p.segment) ?? { seg: p.segment, total: 0, lost: 0, won: 0 }
    row.total++
    if (p.status === 'perdido' || p.status === 'descartado') row.lost++
    else if (p.status === 'finalizado') row.won++
    bySegment.set(p.segment, row)
  }
  // Maior taxa de adesão (finalizados / total) primeiro.
  const rows = [...bySegment.values()].sort((a, b) => b.won / b.total - a.won / a.total)

  return (
    <section>
      <h2 className="section-title">Segmentos</h2>
      <div className="mt-3 space-y-2">
        {rows.map((r) => {
          const open = r.total - r.lost - r.won
          return (
            <div key={r.seg} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-xs text-muted">{r.seg}</span>
              <div className="flex h-4 flex-1 overflow-hidden bg-rule/50">
                {r.won > 0 && (
                  <div className="h-full bg-deep" style={{ width: `${(r.won / r.total) * 100}%` }} />
                )}
                {open > 0 && (
                  <div className="h-full bg-gold/70" style={{ width: `${(open / r.total) * 100}%` }} />
                )}
                {r.lost > 0 && (
                  <div className="h-full bg-seal" style={{ width: `${(r.lost / r.total) * 100}%` }} />
                )}
              </div>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums">{r.total}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TopGaps({ prospects, onOpen }: { prospects: Prospect[]; onOpen: (p: Prospect) => void }) {
  const top = [...prospects]
    .filter((p) => readGap(p).size !== null && (readGap(p).size as number) > 0)
    .sort(byOpportunity)
    .slice(0, 5)

  if (top.length === 0) return null

  return (
    <section>
      <h2 className="section-title">Maiores lacunas</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Bem avaliados no Google, mal representados na internet.
      </p>
      <ol className="mt-3 space-y-1.5">
        {top.map((p) => {
          const gap = readGap(p)
          return (
            <li key={p.id}>
              <button
                onClick={() => onOpen(p)}
                className="flex w-full items-baseline gap-2 text-left hover:underline"
              >
                <span className="text-xs tabular-nums font-semibold tabular-nums text-gold-ink">
                  +{(gap.size as number).toFixed(1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">{p.name}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
