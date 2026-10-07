import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { serviceGroups, serviceSummary, type ServiceGroupKey } from '../lib/service'
import { ClienteRow } from './ClienteRow'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

const GROUP_TITLE: Record<ServiceGroupKey, string> = {
  suspender: 'Suspender',
  a_cobrar: 'A cobrar',
  renovacao: 'Renovação',
  ativos: 'Ativos',
  inativos: 'Suspensos e encerrados',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Clientes({ prospects, onUpdate, onOpen }: Props) {
  const groups = serviceGroups(prospects)
  const { ativos, isentos, pagantes, mrr } = serviceSummary(prospects)

  if (groups.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-rule px-4 py-10 text-center text-sm text-muted">
        Nenhum cliente ainda. Quem chega em Finalizado aparece aqui.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <p className="font-mono text-[12px] text-muted">
        {ativos} ativos · {isentos} isentos · {pagantes} pagantes · R$ {brl(mrr)}/mês
      </p>

      {groups.map(({ key, items }) => {
        const rows = (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <ClienteRow key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
            ))}
          </div>
        )
        const title = (
          <>
            <h2 className="font-display text-lg font-semibold tracking-tight">{GROUP_TITLE[key]}</h2>
            <span className={`font-mono text-xs ${key === 'suspender' ? 'text-seal' : 'text-muted'}`}>
              {items.length}
            </span>
          </>
        )
        // Suspensos/encerrados ficam recolhidos: já não pedem ação.
        return key === 'inativos' ? (
          <details key={key}>
            <summary className="flex cursor-pointer items-baseline gap-2">{title}</summary>
            {rows}
          </details>
        ) : (
          <section key={key}>
            <div className="flex items-baseline gap-2">{title}</div>
            {rows}
          </section>
        )
      })}
    </div>
  )
}
