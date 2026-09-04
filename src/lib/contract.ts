import type { Prospect } from './database.types.ts'
import { todayISO } from './domain.ts'

export type ContractExtraField = 'legal_name' | 'cpf_cnpj' | 'rg' | 'cep'

export const CONTRACT_EXTRA_FIELDS: { key: ContractExtraField; label: string }[] = [
  { key: 'legal_name', label: 'Nome completo / razão social' },
  { key: 'cpf_cnpj', label: 'CPF ou CNPJ' },
  { key: 'rg', label: 'RG' },
  { key: 'cep', label: 'CEP' },
]

export type ContractFormValues = Partial<Record<ContractExtraField, string>>

/** Só os campos extras ainda não salvos na ficha -- são os únicos que aparecem no formulário do modal. */
export function missingContractFields(p: Prospect): ContractExtraField[] {
  return CONTRACT_EXTRA_FIELDS.map((f) => f.key).filter((key) => !p[key])
}

const money = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatMoney(value: number | null): string {
  return value == null ? '' : money.format(value)
}

/** dd/mm/aaaa com ano completo -- diferente de formatDateBR (domain.ts), que trunca o ano pra exibição na tela. */
function todayBR(): string {
  const [y, m, d] = todayISO().split('-')
  return `${d}/${m}/${y}`
}

/**
 * Monta o mapa {{placeholder}}: valor que a Edge Function `generate-contract` usa pra
 * preencher o .docx. Campo do formulário (ainda não salvo) tem prioridade sobre o que já
 * está na ficha, porque é o valor mais recente digitado pelo usuário.
 */
export function buildContractFieldMap(p: Prospect, form: ContractFormValues): Record<string, string> {
  return {
    nome_completo: form.legal_name?.trim() || p.legal_name || '',
    cpf_cnpj: form.cpf_cnpj?.trim() || p.cpf_cnpj || '',
    rg: form.rg?.trim() || p.rg || '',
    endereco: p.address ?? '',
    cidade: p.city,
    cep: form.cep?.trim() || p.cep || '',
    valor_total: formatMoney(p.deal_value),
    valor_sinal: formatMoney(p.deposit_paid_amount),
    valor_final: formatMoney(p.final_paid_amount),
    data_hoje: todayBR(),
  }
}
