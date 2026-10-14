import type { OnUpdate } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import {
  FUNNEL,
  STATUS_LABEL,
  buildQueue,
  byOpportunity,
  isOpen,
  readGap,
} from '../lib/domain'
import { ProspectCard } from './ProspectCard'
import { ServicoFila } from './ServicoFila'

type Props = {
  prospects: Prospect[]
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
}

export function Hoje({ prospects, onUpdate, onOpen }: Props) {
  const queue = buildQueue(prospects)
  const abertos = prospects.filter(isOpen)

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        <ServicoFila prospects={prospects} onUpdate={onUpdate} onOpen={onOpen} />

        <Section
          title="Atrasados"
          count={queue.overdue.length}
          empty="Nada atrasado. A fila está em dia."
          urgent
        >
          {queue.overdue.map((p) => (
            <ProspectCard key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} tone="overdue" />
          ))}
        </Section>

        <Section
          title="Para hoje"
          count={queue.today.length}
          empty="Nenhum retorno marcado para hoje."
        >
          {queue.today.map((p) => (
            <ProspectCard key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
          ))}
        </Section>

        <Section
          title="Sem próximo passo"
          count={queue.unscheduled.length}
          empty="Todo mundo em aberto tem uma data marcada."
          hint="Ordenados pela lacuna: primeiro quem é bem avaliado e mal representado."
        >
          {queue.unscheduled.map((p) => (
            <ProspectCard key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
          ))}
        </Section>
      </div>

      {/* Panorama é consulta, não fila: fechado por padrão para a fila ter o foco. */}
      <details className="rule-top pt-4">
        <summary className="hit cursor-pointer text-sm font-medium text-muted hover:text-ink">
          Panorama · {abertos.length} em aberto
        </summary>
        <div className="mt-5 grid gap-8 md:grid-cols-3">
          <Funnel prospects={prospects} />
          <Segments prospects={prospects} />
          <TopGaps prospects={abertos} onOpen={onOpen} />
        </div>
      </details>
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
          className={`text-xs tabular-nums ${urgent && count > 0 ? 'text-seal' : 'text-muted'}`}
        >
          {count}
        </span>
      </div>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}

      {count === 0 ? (
        <p className="mt-3 rounded-sm border border-dashed border-rule px-4 py-6 text-center text-sm text-muted">
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
      <h2 className="eyebrow">Funil</h2>
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
      <h2 className="eyebrow">Segmentos</h2>
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
      <h2 className="eyebrow">Maiores lacunas</h2>
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
                <span className="text-xs tabular-nums font-semibold tabular-nums text-gold">
                  +{(gap.size as number).toFixed(1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
