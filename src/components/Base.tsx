import { useMemo, useState } from 'react'
import type { Prospect } from '../lib/database.types'
import {
  ALL_STATUS,
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  byOpportunity,
  formatDateBR,
  inactivityRisk,
  instagramLastPostLabel,
  readGap,
} from '../lib/domain'
import { GapMeter } from './GapMeter'
import { QuickActions } from './QuickActions'

type Props = {
  prospects: Prospect[]
  onOpen: (p: Prospect) => void
}

export function Base({ prospects, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('todos')
  const [segment, setSegment] = useState<string | null>(null)

  /* Segmentos ordenados por frequência: os mais comuns viram os primeiros
     pills, os que aparecem só uma vez não empurram os úteis pra fora da tela. */
  const segments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of prospects) counts.set(p.segment, (counts.get(p.segment) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [prospects])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prospects
      .filter((p) => {
        if (status !== 'todos' && p.status !== status) return false
        if (segment && p.segment !== segment) return false
        if (!q) return true
        return [p.name, p.segment, p.problem, p.notes, p.website_quality]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q))
      })
      .sort(byOpportunity)
  }, [prospects, query, status, segment])

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
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {rows.length} de {prospects.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill active={status === 'todos'} onClick={() => setStatus('todos')}>
          Todos
        </Pill>
        {ALL_STATUS.map((s) => (
          <Pill
            key={s}
            active={status === s}
            onClick={() => setStatus(status === s ? 'todos' : s)}
            tone={STATUS_TONE[s]}
          >
            {STATUS_LABEL[s]}
          </Pill>
        ))}
      </div>

      {segments.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {segments.map(([seg, n]) => (
            <Pill key={seg} active={segment === seg} onClick={() => setSegment(segment === seg ? null : seg)}>
              {seg} <span className="text-muted">{n}</span>
            </Pill>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-sm border border-dashed border-rule bg-card px-4 py-8 text-center text-[13px] text-muted">
          Nada encontrado com esses filtros.
        </p>
      ) : (
        <>
          {/* Tabela: só cabe sem scroll horizontal a partir de telas maiores. */}
          <div className="hidden overflow-x-auto rounded-sm border border-rule md:block">
            <table className="w-full min-w-[940px] border-collapse bg-card text-left">
              <thead>
                <tr className="border-b border-rule">
                  <Th>Nome</Th>
                  <Th>Segmento</Th>
                  <Th>Status</Th>
                  <Th>Nota</Th>
                  <Th>Presença</Th>
                  <Th>Oportunidade</Th>
                  <Th>Próxima ação</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const gap = readGap(p)
                  const igLastPost = instagramLastPostLabel(p.instagram_last_post_at)
                  const risk = inactivityRisk(p)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onOpen(p)}
                      className="cursor-pointer border-b border-rule/60 last:border-0 hover:bg-paper/60"
                    >
                      <td className="px-3 py-2.5 text-[13px] font-medium">
                        {p.name}
                        {igLastPost && (
                          <span
                            className={`ml-1 font-mono text-[11px] font-normal ${risk ? RISK_TONE[risk] : 'text-muted'}`}
                            title={`Última postagem no Instagram: ${igLastPost}${risk ? ` · ${RISK_LABEL[risk]}` : ''}`}
                          >
                            · {igLastPost}
                          </span>
                        )}
                      </td>
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
                      <td className="px-3 py-2.5 font-mono text-[11px] font-semibold tabular-nums">
                        {gap.size !== null ? (
                          <span className={gap.size > 0 ? 'text-gold' : 'text-muted'}>
                            {gap.size > 0 ? '+' : ''}
                            {gap.size.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
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
          </div>

          {/* Cards: mesma linha vira um bloco empilhável, sem depender de scroll lateral. */}
          <div className="space-y-2 md:hidden">
            {rows.map((p) => (
              <Row key={p.id} prospect={p} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ prospect: p, onOpen }: { prospect: Prospect; onOpen: (p: Prospect) => void }) {
  const igLastPost = instagramLastPostLabel(p.instagram_last_post_at)
  const risk = inactivityRisk(p)
  return (
    <article
      onClick={() => onOpen(p)}
      className="cursor-pointer rounded-sm border border-rule bg-card p-3 transition-colors active:bg-paper/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">
            {p.name}
            {igLastPost && (
              <span
                className={`ml-1 font-mono text-[11px] font-normal ${risk ? RISK_TONE[risk] : 'text-muted'}`}
                title={`Última postagem no Instagram: ${igLastPost}${risk ? ` · ${RISK_LABEL[risk]}` : ''}`}
              >
                · {igLastPost}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{p.segment}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[p.status]}`}
        >
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      <div className="mt-2.5">
        <GapMeter prospect={p} compact />
      </div>

      <div className="mt-2.5 rule-top pt-2.5">
        <p className="font-mono text-[11px] text-muted">
          próxima ação {formatDateBR(p.next_action_at)}
        </p>
        {/* Os atalhos não devem abrir a ficha por baixo deles. */}
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <QuickActions prospect={p} />
        </div>
      </div>
    </article>
  )
}

function Th({ children }: { children: string }) {
  return (
    <th scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted">
      {children}
    </th>
  )
}

function Pill({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? `border-transparent ${tone ?? 'bg-ink text-paper'}`
          : 'border-rule text-muted hover:bg-paper hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
