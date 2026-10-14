import { useState } from 'react'
import type { Prospect } from '../lib/database.types'
import { formatDateBR } from '../lib/domain'
import {
  DIMENSIONS,
  MIN_SAMPLE,
  conversionBy,
  dimensionKey,
  weeklyCounts,
  wasContacted,
  type Dimension,
  type WeekRow,
} from '../lib/stats'

type Props = { prospects: Prospect[] }

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const short = (iso: string) => formatDateBR(iso).slice(0, 5)

const METRICS: { key: keyof Pick<WeekRow, 'novos' | 'contatados' | 'contratos' | 'fechamentos'>; label: string }[] = [
  { key: 'novos', label: 'Novos prospects' },
  { key: 'contatados', label: 'Contatados' },
  { key: 'contratos', label: 'Contratos gerados' },
  { key: 'fechamentos', label: 'Fechamentos' },
]

export function Resumo({ prospects }: Props) {
  return (
    <div className="space-y-10">
      <Semanas prospects={prospects} />
      <Conversao prospects={prospects} />
    </div>
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

function Conversao({ prospects }: Props) {
  const [dim, setDim] = useState<Dimension>('segmento')
  const [all, setAll] = useState(false)

  const rows = conversionBy(prospects, (p) => dimensionKey(dim, p))
  const shown = all ? rows : rows.slice(0, 8)
  const contacted = prospects.filter(wasContacted).length

  return (
    <section aria-labelledby="conversao">
      <h2 id="conversao" className="font-display text-base font-semibold tracking-tight">
        Onde vale prospectar
      </h2>
      <p className="mt-1 text-body text-muted">
        Taxas sobre quem já foi contatado: {contacted} de {prospects.length} prospects. Prospect perdido conta como
        contatado, mas não como respondeu. Com menos de {MIN_SAMPLE} contatos a taxa ainda não diz nada.
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
                {r.total} prospects · {r.contacted} contatados · {r.responded} responderam · {r.won} fecharam
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
