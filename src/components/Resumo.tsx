import { useState } from 'react'
import type { Prospect } from '../lib/database.types'
import { buildQueue, formatBRL, formatDateBR, isOpen } from '../lib/domain'
import { futureFee, serviceQueue, serviceSummary } from '../lib/service'
import {
  DIMENSIONS,
  MIN_SAMPLE,
  conversionBy,
  finalizedEarnings,
  dimensionKey,
  funnelSummary,
  weekDelta,
  weeklyCounts,
  wasContacted,
  type Dimension,
  type WeekRow,
} from '../lib/stats'

type Props = { prospects: Prospect[] }
type ResumoProps = Props & { onGoto: (tab: 'Hoje' | 'Clientes') => void }

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const short = (iso: string) => formatDateBR(iso).slice(0, 5)

const METRICS: { key: keyof Pick<WeekRow, 'novos' | 'contatados' | 'contratos' | 'fechamentos'>; label: string }[] = [
  { key: 'novos', label: 'Novos prospects' },
  { key: 'contatados', label: 'Contatados' },
  { key: 'contratos', label: 'Contratos gerados' },
  { key: 'fechamentos', label: 'Fechamentos' },
]

export function Resumo({ prospects, onGoto }: ResumoProps) {
  return (
    <div className="space-y-10">
      <Panorama prospects={prospects} onGoto={onGoto} />
      <Semanas prospects={prospects} />
      <Conversao prospects={prospects} />
    </div>
  )
}

function Panorama({ prospects, onGoto }: ResumoProps) {
  const queue = buildQueue(prospects)
  const { ativos, pagantes, mrr } = serviceSummary(prospects)
  const ganhos = finalizedEarnings(prospects)
  const servico = serviceQueue(prospects).length
  const brl = (v: number) => `R$ ${formatBRL(v)}`

  const base: [string, string][] = [
    ['Prospects na base', String(prospects.length)],
    ['Em aberto', String(prospects.filter(isOpen).length)],
    ['Já contatados', String(prospects.filter(wasContacted).length)],
    ['Clientes no ar', String(ativos)],
    ['Receita mensal', `${brl(mrr)} (${pagantes} pagante${pagantes === 1 ? '' : 's'})`],
    ['A entrar após a isenção', brl(futureFee(prospects))],
    ['Projetos finalizados', String(ganhos.count)],
    ['Ganhos dos finalizados', brl(ganhos.total)],
  ]

  return (
    <section aria-labelledby="panorama">
      <h2 id="panorama" className="font-display text-base font-semibold tracking-tight">
        Panorama
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-rule bg-card px-4 py-3">
        <p className="text-body">
          <span className={queue.overdue.length > 0 ? 'font-semibold text-seal-ink' : 'font-semibold'}>
            {queue.overdue.length} atrasado{queue.overdue.length === 1 ? '' : 's'}
          </span>{' '}
          · <span className="font-semibold">{queue.today.length}</span> para hoje
          {queue.proposal.length > 0 && (
            <>
              {' '}
              · <span className="font-semibold">{queue.proposal.length}</span> proposta
              {queue.proposal.length === 1 ? '' : 's'} para enviar
            </>
          )}
          {servico > 0 && (
            <>
              {' '}
              · <span className="font-semibold">{servico}</span> de serviço
            </>
          )}
        </p>
        <button
          onClick={() => onGoto('Hoje')}
          className="hit ml-auto min-h-9 rounded-sm bg-ink px-3.5 text-body font-medium text-paper hover:opacity-90"
        >
          Abrir a Hoje
        </button>
      </div>

      <dl className="mt-2 grid divide-y divide-rule rounded-sm border border-rule bg-card sm:grid-cols-2 sm:divide-y-0">
        {base.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${
              i >= 2 ? 'sm:border-t sm:border-rule' : ''
            } ${i % 2 === 0 ? 'sm:border-r sm:border-rule' : ''}`}
          >
            <dt className="text-body text-muted">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Barra fina de uma medida: o numero sempre aparece ao lado, a barra so ajuda a comparar. */
function Bar({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  return (
    <div className="h-1.5 flex-1 rounded-full bg-rule/70">
      <div
        className={`h-full rounded-full ${strong ? 'bg-ink' : 'bg-stage-6'}`}
        style={{ width: `${max ? Math.max(value ? 4 : 0, (value / max) * 100) : 0}%` }}
      />
    </div>
  )
}

function Semanas({ prospects }: Props) {
  const weeks = weeklyCounts(prospects)
  const last = weeks.length - 1

  return (
    <section aria-labelledby="semanas">
      <h2 id="semanas" className="font-display text-base font-semibold tracking-tight">
        Semana a semana
      </h2>
      <p className="mt-1 text-body text-muted">
        Segunda a domingo. “Contatados” só vale para a semana atual: o app guarda apenas o último contato de cada
        prospect.
      </p>

      <div className="mt-3 overflow-x-auto rounded-sm border border-rule bg-card">
        <table className="w-full min-w-[34rem] text-body">
          <caption className="sr-only">Contagem por semana, das últimas 4 semanas</caption>
          <thead>
            <tr className="border-b border-rule text-left text-meta text-muted">
              <th scope="col" className="px-4 py-2.5 font-normal">
                <span className="sr-only">Medida</span>
              </th>
              {weeks.map((w, i) => (
                <th key={w.start} scope="col" className={`px-3 py-2.5 font-normal ${i === last ? 'font-semibold text-ink' : ''}`}>
                  {i === last ? 'Esta semana' : `${short(w.start)} a ${short(w.end)}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {METRICS.map((m) => {
              const max = Math.max(...weeks.map((w) => w[m.key] ?? 0))
              return (
                <tr key={m.key}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {m.label}
                  </th>
                  {weeks.map((w, i) => {
                    const v = w[m.key]
                    return (
                      <td key={w.start} className="px-3 py-3">
                        {v === null ? (
                          <span className="text-muted" aria-label="sem dado">
                            —
                          </span>
                        ) : (
                          <div className="flex items-center gap-2" title={`${m.label}: ${v}`}>
                            <span className={`w-6 text-right tabular-nums ${i === last ? 'font-semibold' : ''}`}>{v}</span>
                            <Bar value={v} max={max} strong={i === last} />
                            {i === last && m.key !== 'contatados' && <Delta n={weekDelta(weeks, m.key)} />}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Variacao sobre a semana passada, em texto: nunca so cor ou seta. */
function Delta({ n }: { n: number }) {
  const text = n === 0 ? 'igual' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`
  const spoken = n === 0 ? 'igual à semana passada' : `${Math.abs(n)} ${n > 0 ? 'a mais' : 'a menos'} que na semana passada`
  return (
    <span className="w-12 shrink-0 text-meta tabular-nums text-muted" title={spoken}>
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

function Conversao({ prospects }: Props) {
  const [dim, setDim] = useState<Dimension>('segmento')
  const [all, setAll] = useState(false)

  const rows = conversionBy(prospects, (p) => dimensionKey(dim, p))
  const shown = all ? rows : rows.slice(0, 8)
  const f = funnelSummary(prospects)

  return (
    <section aria-labelledby="conversao">
      <h2 id="conversao" className="font-display text-base font-semibold tracking-tight">
        Onde vale prospectar
      </h2>
      <p className="mt-1 text-body text-muted">
        Do total de {f.total} prospects, você descartou {f.discarded}; contatou {f.contacted}; {f.lost} responderam e
        não quiseram seguir; {f.won} fecharam. As taxas são sobre quem foi contatado.
      </p>
      <p className="mt-1 text-meta text-muted">
        Perdido = o cliente respondeu e não quis seguir (conta como contatado e como respondeu). Descartado = escolha
        sua, inclusive quando não houve resposta: só conta como contatado se houver registro de contato. Com menos
        de {MIN_SAMPLE} contatos a taxa ainda não diz nada.
      </p>

      <div role="group" aria-label="Agrupar por" className="mt-3 flex flex-wrap gap-1">
        {DIMENSIONS.map((d) => (
          <button
            key={d.id}
            aria-pressed={dim === d.id}
            onClick={() => {
              setDim(d.id)
              setAll(false)
            }}
            className={`hit min-h-9 rounded-sm px-3 text-body transition-colors ${
              dim === d.id ? 'bg-ink text-paper' : 'border border-rule hover:bg-card'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-rule rounded-sm border border-rule bg-card">
        {shown.map((r) => (
          <li
            key={r.label}
            className="grid gap-x-6 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_15rem_5rem] sm:items-center"
          >
            <div className="min-w-0">
              <p className={`break-words font-semibold ${r.small ? 'text-muted' : ''}`}>{r.label}</p>
              <p className="text-meta text-muted">
                {r.total} prospects · {r.discarded} descartados · {r.contacted} contatados · {r.responded} responderam ·
                {r.lost} perderam · {r.won} fecharam
                {r.small && ' · amostra pequena'}
              </p>
            </div>
            <div className="flex items-center gap-2" title={`Responderam: ${r.responded} de ${r.contacted} contatados`}>
              <span className="w-24 shrink-0 text-meta text-muted">Respondem</span>
              <Bar value={(r.respRate ?? 0) * 100} max={100} strong={!r.small} />
              <span className="w-9 text-right tabular-nums">{pct(r.respRate)}</span>
            </div>
            <p className="text-meta text-muted sm:text-right" title={`Fecharam: ${r.won} de ${r.contacted} contatados`}>
              Fecham <span className="tabular-nums text-ink">{pct(r.wonRate)}</span>
            </p>
          </li>
        ))}
      </ul>

      {rows.length > 8 && (
        <button
          onClick={() => setAll(!all)}
          className="hit mt-2 px-1 py-2 text-body text-muted underline underline-offset-2 hover:text-ink"
        >
          {all ? 'Mostrar só os 8 primeiros' : `Mostrar todos (${rows.length})`}
        </button>
      )}
    </section>
  )
}
