import { addDaysISO, readGap, readPresence, todayISO } from './domain.ts'
import type { Prospect, ProspectStatus } from './database.types.ts'

/* ------------------------------------------------------------ semanas --- */

/** Data local (AAAA-MM-DD) de um timestamp ou de uma data pura. */
export function toLocalISO(value: string): string {
  if (value.length <= 10) return value
  const d = new Date(value)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Segunda-feira da semana de `from`. */
export function weekStartISO(from = todayISO()): string {
  const dow = (new Date(`${from}T00:00:00`).getDay() + 6) % 7
  return addDaysISO(-dow, from)
}

export type WeekRow = {
  start: string
  end: string
  novos: number
  /** So a semana atual e confiavel: guardamos apenas o ULTIMO contato de cada prospect. */
  contatados: number | null
  contratos: number
  fechamentos: number
}

/** As `weeks` ultimas semanas (segunda a domingo), da mais antiga para a atual. */
export function weeklyCounts(ps: Prospect[], now = todayISO(), weeks = 4): WeekRow[] {
  const thisWeek = weekStartISO(now)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDaysISO(-7 * (weeks - 1 - i), thisWeek)
    const end = addDaysISO(6, start)
    const inWeek = (v: string | null) => {
      if (!v) return false
      const d = toLocalISO(v)
      return d >= start && d <= end
    }
    return {
      start,
      end,
      novos: ps.filter((p) => inWeek(p.prospected_at)).length,
      contatados: i === weeks - 1 ? ps.filter((p) => inWeek(p.last_contacted_at)).length : null,
      contratos: ps.filter((p) => inWeek(p.contract_generated_at)).length,
      fechamentos: ps.filter((p) => inWeek(p.service_started_at)).length,
    }
  })
}

/* ---------------------------------------------------------- conversao --- */

// Da negociacao em diante: o prospect respondeu e entrou no processo.
const RESPONDED: ProspectStatus[] = [
  'briefing', 'aguardando_pendencias', 'refinamento', 'em_analise', 'entrega',
  'aguardando_pagamento', 'finalizado', 'respondeu', 'negociando', 'fechado',
]
const WON: ProspectStatus[] = ['finalizado', 'fechado']

export const reachedResponse = (p: Pick<Prospect, 'status'>) => RESPONDED.includes(p.status)
export const reachedWon = (p: Pick<Prospect, 'status'>) => WON.includes(p.status)

/** Foi abordado: tem registro de contato, ou ja esta numa etapa que so existe depois dele. */
export const wasContacted = (p: Pick<Prospect, 'status' | 'last_contacted_at' | 'contact_attempts'>) =>
  p.last_contacted_at !== null || p.contact_attempts > 0 || p.status === 'contatado' || reachedResponse(p)

/** Com menos contatos que isso, a taxa nao diz nada. */
export const MIN_SAMPLE = 5

export type ConversionRow = {
  label: string
  total: number
  contacted: number
  responded: number
  won: number
  /** responderam / contatados; null sem contatos. */
  respRate: number | null
  wonRate: number | null
  small: boolean
}

export function conversionBy(ps: Prospect[], key: (p: Prospect) => string): ConversionRow[] {
  const groups = new Map<string, Prospect[]>()
  for (const p of ps) groups.set(key(p), [...(groups.get(key(p)) ?? []), p])
  const rows = [...groups].map(([label, g]): ConversionRow => {
    const contacted = g.filter(wasContacted).length
    const responded = g.filter(reachedResponse).length
    const won = g.filter(reachedWon).length
    return {
      label,
      total: g.length,
      contacted,
      responded,
      won,
      respRate: contacted ? responded / contacted : null,
      wonRate: contacted ? won / contacted : null,
      small: contacted < MIN_SAMPLE,
    }
  })
  // Amostra suficiente primeiro, pela taxa de resposta; o resto, pelo volume.
  return rows.sort(
    (a, b) =>
      Number(a.small) - Number(b.small) ||
      (b.respRate ?? -1) - (a.respRate ?? -1) ||
      b.contacted - a.contacted ||
      b.total - a.total,
  )
}

export type Dimension = 'segmento' | 'cidade' | 'presenca' | 'lacuna'

export const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'segmento', label: 'Segmento' },
  { id: 'cidade', label: 'Cidade' },
  { id: 'presenca', label: 'Presença digital' },
  { id: 'lacuna', label: 'Lacuna' },
]

const PRESENCE_BUCKET: Record<number, string> = {
  0: 'Sem site',
  1: 'Só rede social ou site quebrado',
  2: 'Site datado ou genérico',
  3: 'Site ok',
  4: 'Site ok',
}

export function dimensionKey(dim: Dimension, p: Prospect): string {
  if (dim === 'segmento') return p.segment || 'Sem segmento'
  if (dim === 'cidade') return p.city || 'Sem cidade'
  if (dim === 'presenca') {
    const score = readPresence(p).score
    return score === null ? 'Não avaliado' : PRESENCE_BUCKET[score]
  }
  const size = readGap(p).size
  if (size === null) return 'Sem nota ou presença'
  if (size >= 3) return 'Grande (3 pontos ou mais)'
  if (size >= 1.5) return 'Média (1,5 a 3)'
  return 'Pequena (menos de 1,5)'
}
