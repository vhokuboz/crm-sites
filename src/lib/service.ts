import type { Prospect, ProspectUpdate } from './database.types.ts'
import { addMonthsISO, daysBetweenISO, formatDateBR, todayISO } from './domain.ts'

/* ----------------------------------------------------------------- serviço ---
   Depois de `finalizado` o cliente tem 6 meses de mensalidade isenta; passado
   isso, paga mensalidade por Pix manual e o site cai 7 dias depois do
   vencimento. O estado é sempre DERIVADO das datas -- nunca gravado -- pra
   não ficar desatualizado quando ninguém mexe no registro.
*/

export const FREE_MONTHS = 6
export const RENEWAL_WINDOW_DAYS = 30
export const SUSPEND_AFTER_DAYS = 7

export type ServiceState =
  | 'isento'
  | 'renovacao'
  | 'ativo'
  | 'a_cobrar'
  | 'suspender'
  | 'suspenso'
  | 'encerrado'

export type ServiceInput = Pick<
  Prospect,
  'status' | 'service_started_at' | 'free_until' | 'paid_until' | 'suspended_at' | 'service_ended_at'
>

/**
 * `null` quando o prospect não é cliente (não está finalizado ou ainda não tem
 * o ciclo aberto). `suspender` = passou do prazo, só falta o clique do usuário.
 */
export function serviceState(p: ServiceInput, hoje = todayISO()): ServiceState | null {
  if (p.status !== 'finalizado' || !p.service_started_at || !p.free_until) return null
  if (p.service_ended_at) return 'encerrado'
  if (p.suspended_at) return 'suspenso'

  if (hoje <= p.free_until) {
    const restantes = daysBetweenISO(hoje, p.free_until)
    return !p.paid_until && restantes <= RENEWAL_WINDOW_DAYS ? 'renovacao' : 'isento'
  }

  // Quem não respondeu à renovação vence em free_until; quem já pagou, em paid_until.
  const atraso = daysBetweenISO(p.paid_until ?? p.free_until, hoje)
  if (atraso <= 0) return 'ativo'
  return atraso <= SUSPEND_AFTER_DAYS ? 'a_cobrar' : 'suspender'
}

/* ---------------------------------------------------------------- patches --- */

/**
 * Abre o ciclo do serviço na primeira vez que o prospect vira `finalizado`.
 * Roda depois de `statusTransitionPatch`, dentro de `useProspects.ts::update`,
 * então vale igual venha da ficha ou do Kanban. O que o patch já traz vence.
 */
export function serviceStartPatch(previous: Prospect, patch: ProspectUpdate): ProspectUpdate {
  if (patch.status !== 'finalizado' || previous.status === 'finalizado' || previous.service_started_at) {
    return patch
  }
  const inicio = todayISO()
  return { service_started_at: inicio, free_until: addMonthsISO(FREE_MONTHS, inicio), ...patch }
}

/** Cliente decidiu continuar: guarda a mensalidade; a primeira cobrança vence quando a isenção acaba. */
export function continuePatch(p: Pick<Prospect, 'free_until'>, fee: number): ProspectUpdate {
  return { monthly_fee: fee, paid_until: p.free_until }
}

/**
 * Pix recebido: soma 1 mês ao vencimento anterior (e não à data do pagamento,
 * pra não deslocar o ciclo).
 * ponytail: 31/01 -> 28/02 -> 28/03 desliza o dia; aceitável pra cobrança manual.
 */
export function pixReceivedPatch(p: Pick<Prospect, 'paid_until' | 'free_until'>): ProspectUpdate {
  const base = p.paid_until ?? p.free_until
  return base ? { paid_until: addMonthsISO(1, base) } : {}
}

/* ------------------------------------------------------------ apresentação --- */

export const SERVICE_LABEL: Record<ServiceState, string> = {
  isento: 'Isento',
  renovacao: 'Renovação',
  ativo: 'Ativo',
  a_cobrar: 'A cobrar',
  suspender: 'Suspender',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
}

export const SERVICE_TONE: Record<ServiceState, string> = {
  isento: 'bg-deep/15 text-deep',
  renovacao: 'bg-gold/25 text-gold',
  ativo: 'bg-deep text-card',
  a_cobrar: 'bg-gold/35 text-gold',
  suspender: 'bg-seal/12 text-seal',
  suspenso: 'bg-seal/12 text-seal',
  encerrado: 'bg-rule/40 text-muted',
}

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)

/** A data que importa em cada estado: "isento até 12/03/27", "venceu há 3 dias"... */
export function serviceDateLabel(p: ServiceInput, hoje = todayISO()): string {
  const state = serviceState(p, hoje)
  if (!state) return ''
  if (state === 'encerrado') return `encerrado em ${formatDateBR(p.service_ended_at)}`
  if (state === 'suspenso') return `suspenso em ${formatDateBR(p.suspended_at)}`
  if (state === 'isento' || state === 'renovacao') return `isento até ${formatDateBR(p.free_until)}`
  const falta = daysBetweenISO(hoje, (p.paid_until ?? p.free_until) as string)
  if (falta === 0) return 'vence hoje'
  return falta > 0 ? `vence em ${dias(falta)}` : `venceu há ${dias(-falta)}`
}

export function reminderLabel(
  p: Pick<Prospect, 'last_reminded_at'>,
  hoje = todayISO(),
): string | null {
  if (!p.last_reminded_at) return null
  const atras = daysBetweenISO(p.last_reminded_at, hoje)
  return atras === 0 ? 'lembrado hoje' : `lembrado há ${dias(atras)}`
}

/* ------------------------------------------------------ listas e resumos --- */

export type ServiceGroupKey = 'suspender' | 'a_cobrar' | 'renovacao' | 'ativos' | 'inativos'

const GROUP_OF: Record<ServiceState, ServiceGroupKey> = {
  suspender: 'suspender',
  a_cobrar: 'a_cobrar',
  renovacao: 'renovacao',
  isento: 'ativos',
  ativo: 'ativos',
  suspenso: 'inativos',
  encerrado: 'inativos',
}

const GROUP_ORDER: ServiceGroupKey[] = ['suspender', 'a_cobrar', 'renovacao', 'ativos', 'inativos']

/** Vencimento mais antigo primeiro: pra quem está atrasado, é quem está há mais tempo. */
const byDue = (a: Prospect, b: Prospect) =>
  (a.paid_until ?? a.free_until ?? '').localeCompare(b.paid_until ?? b.free_until ?? '')

export function serviceGroups(
  prospects: Prospect[],
  hoje = todayISO(),
): { key: ServiceGroupKey; items: Prospect[] }[] {
  const byKey = new Map<ServiceGroupKey, Prospect[]>()
  for (const p of prospects) {
    const state = serviceState(p, hoje)
    if (!state) continue
    const key = GROUP_OF[state]
    byKey.set(key, [...(byKey.get(key) ?? []), p])
  }
  return GROUP_ORDER.filter((k) => byKey.has(k)).map((key) => ({
    key,
    items: (byKey.get(key) as Prospect[]).sort(byDue),
  }))
}

/** `ativos` = no ar (tudo menos suspenso/encerrado); `pagantes` = em dia depois da isenção. */
export function serviceSummary(prospects: Prospect[], hoje = todayISO()) {
  let ativos = 0
  let isentos = 0
  let pagantes = 0
  let mrr = 0
  for (const p of prospects) {
    const state = serviceState(p, hoje)
    if (!state || state === 'suspenso' || state === 'encerrado') continue
    ativos++
    if (state === 'isento' || state === 'renovacao') isentos++
    if (state === 'ativo') {
      pagantes++
      mrr += p.monthly_fee ?? 0
    }
  }
  return { ativos, isentos, pagantes, mrr }
}

const QUEUE_ORDER: ServiceState[] = ['suspender', 'a_cobrar', 'renovacao']

/** Quem exige ação hoje, mais urgente primeiro. */
export function serviceQueue(prospects: Prospect[], hoje = todayISO()): Prospect[] {
  return prospects
    .filter((p) => QUEUE_ORDER.includes(serviceState(p, hoje) as ServiceState))
    .sort(
      (a, b) =>
        QUEUE_ORDER.indexOf(serviceState(a, hoje) as ServiceState) -
          QUEUE_ORDER.indexOf(serviceState(b, hoje) as ServiceState) || byDue(a, b),
    )
}
