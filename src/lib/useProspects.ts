import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { canEnterContatado, closesHostedSite, discardPatch, isCobrancaExpirada, statusTransitionPatch } from './domain'
import { serviceStartPatch } from './service'
import type { Prospect, ProspectUpdate } from './database.types'

type Toast = { id: number; message: string; undo: () => void }

type State = {
  prospects: Prospect[]
  loading: boolean
  error: string | null
  toast: Toast | null
}

/** `undoLabel` ("Marcado como contatado") liga o aviso com Desfazer apos salvar. */
export type OnUpdate = (id: string, patch: ProspectUpdate, undoLabel?: string) => Promise<boolean>

/** Aplica o mesmo tipo de mudanca a varios prospects; devolve quantos foram salvos. */
export type OnUpdateMany = (
  items: { id: string; patch: ProspectUpdate }[],
  label: string,
) => Promise<number>

type WriteResult = { ok: boolean; revert: ProspectUpdate | null; hosted: boolean }

export function useProspects() {
  const [state, setState] = useState<State>({ prospects: [], loading: true, error: null, toast: null })

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      // Mantem o que ja estava na tela: falha de rede nao pode virar "base vazia".
      setState((s) => ({ ...s, loading: false, error: error.message }))
      return
    }
    setState((s) => ({ ...s, prospects: data ?? [], loading: false, error: null }))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Leitura sincrona do estado atual, sem depender do timing do setState.
  const ref = useRef<Prospect[]>([])
  ref.current = state.prospects

  /**
   * Escreve otimista: a tela responde na hora e o registro volta ao valor
   * anterior se o banco recusar (uma policy negando, por exemplo). Devolve
   * tambem o patch que desfaz a escrita.
   */
  const write = useCallback(async (id: string, patch: ProspectUpdate): Promise<WriteResult> => {
    const previous = ref.current.find((p) => p.id === id)
    if (previous && patch.status === 'contatado' && !canEnterContatado(previous)) {
      setState((s) => ({ ...s, error: `"${previous.name}" já passou de Contatado e não pode voltar.` }))
      return { ok: false, revert: null, hosted: false }
    }
    const hosted = !!previous && closesHostedSite(previous, patch)

    if (previous && hosted) {
      const ok = window.confirm(
        `Isso vai apagar a hospedagem do site de "${previous.name}" no Cloudflare Pages. Confirmar?`,
      )
      if (!ok) return { ok: false, revert: null, hosted }
    }

    const finalPatch: ProspectUpdate = previous
      ? serviceStartPatch(previous, statusTransitionPatch(previous, patch))
      : patch

    setState((s) => ({
      ...s,
      prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...finalPatch } : p)),
    }))

    const { data, error } = await supabase
      .from('prospects')
      .update(finalPatch)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      setState((s) => ({
        ...s,
        error: `Não foi possível salvar: ${error.message}`,
        prospects: previous ? s.prospects.map((p) => (p.id === id ? previous : p)) : s.prospects,
      }))
      return { ok: false, revert: null, hosted }
    }

    setState((s) => ({
      ...s,
      error: null,
      prospects: s.prospects.map((p) => (p.id === id ? data : p)),
    }))

    if (previous && hosted) {
      void supabase.functions
        .invoke('encerrar-hospedagem', { body: { slug: previous.slug } })
        .then(({ error: fnError }) => {
          if (fnError) {
            setState((s) => ({
              ...s,
              error: `Hospedagem não removida automaticamente: ${fnError.message}`,
            }))
          }
        })
    }

    // Desfazer regrava so os campos que a acao tocou, com o valor de antes.
    const revert = previous
      ? (Object.fromEntries(
          Object.keys(finalPatch).map((k) => [k, previous[k as keyof Prospect]]),
        ) as ProspectUpdate)
      : null
    return { ok: true, revert, hosted }
  }, [])

  const showToast = useCallback((message: string, undo: () => void) => {
    setState((s) => ({ ...s, toast: { id: Date.now(), message, undo } }))
  }, [])

  const update = useCallback<OnUpdate>(
    async (id, patch, undoLabel) => {
      const r = await write(id, patch)
      // Escrita que apaga hospedagem nao tem volta: sem Desfazer.
      if (r.ok && undoLabel && r.revert && !r.hosted) {
        const revert = r.revert
        showToast(undoLabel, () => void update(id, revert, 'Desfeito'))
      }
      return r.ok
    },
    [write, showToast],
  )

  /** Varias escritas em sequencia, com um unico aviso cujo Desfazer reverte todas. */
  const updateMany = useCallback<OnUpdateMany>(
    async (items, label) => {
      const reverts: { id: string; patch: ProspectUpdate }[] = []
      let done = 0
      for (const { id, patch } of items) {
        const r = await write(id, patch)
        if (!r.ok) continue
        done++
        if (r.revert && !r.hosted) reverts.push({ id, patch: r.revert })
      }
      if (reverts.length > 0) {
        showToast(`${label} (${done})`, () => {
          void (async () => {
            for (const rv of reverts) await write(rv.id, rv.patch)
            showToast('Desfeito', () => {})
          })()
        })
      }
      return done
    },
    [write, showToast],
  )

  // Descarte automático: roda uma vez, quando a primeira carga termina. Só vale com o CRM aberto.
  const swept = useRef(false)
  useEffect(() => {
    if (state.loading || swept.current) return
    swept.current = true
    const items = state.prospects
      .filter(isCobrancaExpirada)
      .map((p) => ({ id: p.id, patch: discardPatch(p, 'Descartado automaticamente: sem resposta após 2 cobranças.') }))
    if (items.length > 0) void updateMany(items, 'Descartados sem resposta')
  }, [state.loading, state.prospects, updateMany])

  const dismissError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  const dismissToast = useCallback(() => setState((s) => ({ ...s, toast: null })), [])

  return { ...state, reload: load, update, updateMany, dismissError, dismissToast }
}
