import { addBusinessDaysISO, addDaysISO, daysFromToday } from './domain.ts'
import type { Prospect, ProspectUpdate } from './database.types.ts'

/** Adiar um prospect: a nova data de retorno, a partir de hoje. */
export const SNOOZE_OPTIONS = [
  { label: 'Amanhã', days: 1 },
  { label: 'Em 3 dias', days: 3 },
  { label: 'Em 1 semana', days: 7 },
] as const

export function snoozePatch(days: number): ProspectUpdate {
  return { next_action_at: addDaysISO(days) }
}

/**
 * "Registrei contato": antes do primeiro contato vira "contatado" (a regra de
 * transição agenda o retorno); nos demais casos soma o retorno de 3 dias.
 */
export function contactPatch(p: Pick<Prospect, 'status'>, now = new Date()): ProspectUpdate {
  const antesDoContato = p.status === 'triagem' || p.status === 'prototipado'
  return {
    last_contacted_at: now.toISOString(),
    ...(antesDoContato ? { status: 'contatado' as const } : { next_action_at: addDaysISO(3) }),
  }
}

/** "Cobrei de novo": só faz sentido para quem já foi contatado e está com o retorno vencido. */
export function canRepeat(p: Pick<Prospect, 'status' | 'next_action_at'>): boolean {
  return p.status === 'contatado' && !!p.next_action_at && daysFromToday(p.next_action_at) <= 0
}

export function repeatPatch(p: Pick<Prospect, 'contact_attempts'>): ProspectUpdate {
  return { next_action_at: addBusinessDaysISO(3), contact_attempts: p.contact_attempts + 1 }
}

export type QueueFilters = { query: string; segment: string; status: string }

const plain = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Busca por nome, segmento ou cidade (sem acento e sem caixa), mais segmento e status exatos. */
export function matchesFilters(
  p: Pick<Prospect, 'name' | 'segment' | 'city' | 'status'>,
  f: QueueFilters,
): boolean {
  if (f.segment && p.segment !== f.segment) return false
  if (f.status && p.status !== f.status) return false
  const q = plain(f.query.trim())
  if (!q) return true
  return plain(`${p.name} ${p.segment} ${p.city ?? ''}`).includes(q)
}
