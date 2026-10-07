import type { Prospect } from './database.types.ts'
import { daysBetweenISO, todayISO } from './domain.ts'

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
