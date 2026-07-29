import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { byOpportunity, type OpportunityInput } from './domain'
import type { Prospect, ProspectStatus } from './database.types'

export const PAGE_SIZE = 20

type Filters = {
  query: string
  status: string
  segment: string | null
}

type LightRow = OpportunityInput & {
  id: string
  name: string
  segment: string
  problem: string | null
  notes: string | null
}

const LIGHT_COLUMNS = 'id, name, segment, problem, notes, google_rating, website_quality, website'

/** Segmentos e total da base inteira, independente dos filtros ativos (pra montar os pills). */
export function useBaseMeta() {
  return useQuery({
    queryKey: ['base-meta'],
    queryFn: async () => {
      const { data, error } = await supabase.from('prospects').select('segment')
      if (error) throw error
      const counts = new Map<string, number>()
      for (const { segment } of data) counts.set(segment, (counts.get(segment) ?? 0) + 1)
      return { total: data.length, segments: [...counts.entries()].sort((a, b) => b[1] - a[1]) }
    },
    staleTime: 60_000,
  })
}

/**
 * Lista da Base com scroll infinito. Status/segmento filtram no servidor; a
 * ordenação por oportunidade e a busca por texto rodam sobre uma busca leve
 * (poucas colunas, sem os campos pesados como preview_images ou mensagem de
 * abordagem). Só a página visível busca o registro completo, 20 por vez.
 */
export function useBaseList(filters: Filters) {
  const idsQuery = useQuery({
    queryKey: ['base-ids', filters.status, filters.segment],
    queryFn: async () => {
      let q = supabase.from('prospects').select(LIGHT_COLUMNS)
      if (filters.status !== 'todos') q = q.eq('status', filters.status as ProspectStatus)
      if (filters.segment) q = q.eq('segment', filters.segment)
      const { data, error } = await q
      if (error) throw error
      return data as LightRow[]
    },
  })

  const filtered = useMemo(() => {
    const rows = idsQuery.data ?? []
    const term = filters.query.trim().toLowerCase()
    const matched = !term
      ? rows
      : rows.filter((p) =>
          [p.name, p.segment, p.problem, p.notes, p.website_quality]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(term)),
        )
    return [...matched].sort(byOpportunity)
  }, [idsQuery.data, filters.query])

  const ids = useMemo(() => filtered.map((r) => r.id), [filtered])

  const pagesQuery = useInfiniteQuery({
    queryKey: ['base-rows', ids],
    queryFn: async ({ pageParam }) => {
      const pageIds = ids.slice(pageParam, pageParam + PAGE_SIZE)
      if (pageIds.length === 0) return []
      const { data, error } = await supabase.from('prospects').select('*').in('id', pageIds)
      if (error) throw error
      const byId = new Map(data.map((p) => [p.id, p]))
      return pageIds.map((id) => byId.get(id)).filter((p): p is Prospect => p != null)
    },
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => {
      const loaded = pages.length * PAGE_SIZE
      return loaded < ids.length ? loaded : undefined
    },
    enabled: !!idsQuery.data,
  })

  const rows = useMemo(() => pagesQuery.data?.pages.flat() ?? [], [pagesQuery.data])

  return {
    rows,
    filteredCount: filtered.length,
    isLoading: idsQuery.isLoading,
    isFetchingNextPage: pagesQuery.isFetchingNextPage,
    hasNextPage: pagesQuery.hasNextPage,
    fetchNextPage: pagesQuery.fetchNextPage,
    error: idsQuery.error ?? pagesQuery.error,
  }
}
