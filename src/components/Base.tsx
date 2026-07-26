import { useMemo, useState } from 'react'
import type { Prospect } from '../lib/database.types'
import { ALL_STATUS, STATUS_LABEL, STATUS_TONE, formatDateBR, readGap } from '../lib/domain'
import { QuickActions } from './QuickActions'

type Props = {
  prospects: Prospect[]
  onOpen: (p: Prospect) => void
}

export function Base({ prospects, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('todos')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prospects.filter((p) => {
      if (status !== 'todos' && p.status !== status) return false
      if (!q) return true
      return [p.name, p.segment, p.problem, p.notes, p.website_quality]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    })
  }, [prospects, query, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, segmento, problema…"
          className="min-w-60 flex-1 rounded-sm border border-rule bg-card px-3 py-2 text-sm"
          aria-label="Buscar prospects"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-sm border border-rule bg-card px-3 py-2 font-mono text-xs"
          aria-label="Filtrar por status"
        >
          <option value="todos">Todos os status</option>
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {rows.length} de {prospects.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm border border-rule">
        <table className="w-full min-w-[860px] border-collapse bg-card text-left">
          <thead>
            <tr className="border-b border-rule">
              <Th>Nome</Th>
              <Th>Segmento</Th>
              <Th>Status</Th>
              <Th>Nota</Th>
              <Th>Presença</Th>
              <Th>Próxima ação</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const gap = readGap(p)
              return (
                <tr
                  key={p.id}
                  onClick={() => onOpen(p)}
                  className="cursor-pointer border-b border-rule/60 last:border-0 hover:bg-paper/60"
                >
                  <td className="px-3 py-2.5 text-[13px] font-medium">{p.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{p.segment}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums">
                    {gap.reputation !== null ? (
                      <span className="text-gold">★ {gap.reputation.toFixed(1)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {gap.presenceLabel}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted">
                    {formatDateBR(p.next_action_at)}
                  </td>
                  {/* Os atalhos não devem abrir a ficha por baixo deles. */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <QuickActions prospect={p} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="bg-card px-4 py-8 text-center text-[13px] text-muted">
            Nada encontrado com esses filtros.
          </p>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: string }) {
  return (
    <th scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted">
      {children}
    </th>
  )
}
