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

/** Em triagem o prospect ainda esta sendo avaliado: nao se registra contato (nem se pula o protótipo). */
export function canContact(p: Pick<Prospect, 'status'>): boolean {
  return p.status !== 'triagem'
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

/** Botão "Copiar cobrança": contatado com retorno vencido e já classificado como singular/plural. */
export function canCopyCobranca(p: Pick<Prospect, 'status' | 'next_action_at' | 'tratamento' | 'landing_page_url'>): boolean {
  return canRepeat(p) && !!p.tratamento && !!p.landing_page_url
}

/** Mensagem de follow-up por substituição de variáveis: singular usa o primeiro nome, plural o nome do espaço. */
export function cobrancaMessage(p: Pick<Prospect, 'name' | 'tratamento' | 'landing_page_url'>): string {
  const aviso = 'Há alguns dias deixei uma mensagem por aqui e imagino que tenha se perdido no meio das outras. 😊'
  if (p.tratamento === 'plural')
    return `Olá! Aqui é o Vitor Okubo, de Bauru. ${aviso}

Resumindo: montei por conta própria uma amostra de página para o ${p.name}, para vocês verem como o espaço pode aparecer na internet e receber contatos pelo WhatsApp:
${p.landing_page_url}

Se der, dê uma olhada e me diga o que acharam. Sem compromisso! Se preferirem, também posso explicar por aqui ou por telefone.`
  return `Olá, ${p.name.split(' ')[0]}! Aqui é o Vitor Okubo, de Bauru. ${aviso}

Resumindo: montei por conta própria uma amostra de página com o seu nome, para você ver como seu trabalho pode aparecer na internet e receber contatos pelo WhatsApp:
${p.landing_page_url}

Se der, dê uma olhada e me diga o que achou. Sem compromisso! Se preferir, também posso explicar por aqui ou por telefone.`
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
