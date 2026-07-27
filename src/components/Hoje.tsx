import type { Prospect, ProspectUpdate } from '../lib/database.types'
import {
  FUNNEL,
  STATUS_LABEL,
  buildQueue,
  byOpportunity,
  isOpen,
  readGap,
} from '../lib/domain'
import { ProspectCard } from './ProspectCard'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

export function Hoje({ prospects, onUpdate, onOpen }: Props) {
  const queue = buildQueue(prospects)
  const abertos = prospects.filter(isOpen)

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="lg:col-start-1 lg:row-start-1">
        <Kpis
          atrasados={queue.overdue.length}
          hoje={queue.today.length}
          abertos={abertos.length}
          semData={queue.unscheduled.length}
        />
      </div>

      {/* No mobile o grid empilha em coluna única: por vir antes da fila no
          DOM, essas métricas aparecem logo abaixo dos KPIs, sem precisar
          rolar a tela toda. No desktop, o grid-column/row a reposiciona
          para a lateral, ao lado de Atrasados/Para hoje/Sem próximo passo. */}
      <aside className="space-y-8 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <Funnel prospects={prospects} />
        <Segments prospects={prospects} />
        <TopGaps prospects={abertos} onOpen={onOpen} />
      </aside>

      <div className="space-y-8 lg:col-start-1 lg:row-start-2">
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
    </div>
  )
}

function Kpis({
  atrasados,
  hoje,
  abertos,
  semData,
}: {
  atrasados: number
  hoje: number
  abertos: number
  semData: number
}) {
  const items = [
    { label: 'atrasados', value: atrasados, urgent: atrasados > 0 },
    { label: 'para hoje', value: hoje, urgent: false },
    { label: 'em aberto', value: abertos, urgent: false },
    { label: 'sem data', value: semData, urgent: false },
  ]

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-card px-4 py-3.5">
          <p
            className={`font-display text-3xl font-semibold tracking-tight tabular-nums ${
              it.urgent ? 'text-seal' : 'text-ink'
            }`}
          >
            {it.value}
          </p>
          <p className="eyebrow mt-0.5">{it.label}</p>
        </div>
      ))}
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
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <span
          className={`font-mono text-xs ${urgent && count > 0 ? 'text-seal' : 'text-muted'}`}
        >
          {count}
        </span>
      </div>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}

      {count === 0 ? (
        <p className="mt-3 rounded-sm border border-dashed border-rule px-4 py-6 text-center text-[13px] text-muted">
          {empty}
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">{children}</div>
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
              <span className="w-20 shrink-0 font-mono text-[11px] text-muted">
                {STATUS_LABEL[s]}
              </span>
              <div className="h-4 flex-1 bg-rule/50">
                <div
                  className="h-full bg-deep transition-[width] duration-500"
                  style={{ width: `${(n / total) * 100}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums">
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
  const bySegment = new Map<string, number>()
  for (const p of prospects) bySegment.set(p.segment, (bySegment.get(p.segment) ?? 0) + 1)
  const rows = [...bySegment.entries()].sort((a, b) => b[1] - a[1])
  const max = rows[0]?.[1] ?? 1

  return (
    <section>
      <h2 className="eyebrow">Segmentos</h2>
      <div className="mt-3 space-y-2">
        {rows.map(([seg, n]) => (
          <div key={seg} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate font-mono text-[11px] text-muted">{seg}</span>
            <div className="h-4 flex-1 bg-rule/50">
              <div className="h-full bg-gold/70" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums">{n}</span>
          </div>
        ))}
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
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
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
                <span className="font-mono text-xs font-semibold tabular-nums text-gold">
                  +{(gap.size as number).toFixed(1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
