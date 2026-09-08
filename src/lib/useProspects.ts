import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { closesHostedSite, statusTransitionPatch } from './domain'
import type { Prospect, ProspectUpdate } from './database.types'

type State = {
  prospects: Prospect[]
  loading: boolean
  error: string | null
}

export function useProspects() {
  const [state, setState] = useState<State>({ prospects: [], loading: true, error: null })

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      setState({ prospects: [], loading: false, error: error.message })
      return
    }
    setState({ prospects: data ?? [], loading: false, error: null })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Escreve otimista: a tela responde na hora e o registro volta ao valor
   * anterior se o banco recusar (uma policy negando, por exemplo).
   */
  const update = useCallback(async (id: string, patch: ProspectUpdate) => {
    let previous: Prospect | undefined
    setState((s) => {
      previous = s.prospects.find((p) => p.id === id)
      return s
    })

    if (previous && closesHostedSite(previous, patch)) {
      const ok = window.confirm(
        `Isso vai apagar a hospedagem do preview de "${previous.name}" no Cloudflare Pages. Confirmar?`,
      )
      if (!ok) return false
    }

    let finalPatch: ProspectUpdate = patch

    setState((s) => {
      previous = s.prospects.find((p) => p.id === id)
      finalPatch = previous ? statusTransitionPatch(previous, patch) : patch
      return {
        ...s,
        prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...finalPatch } : p)),
      }
    })

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
        prospects: previous
          ? s.prospects.map((p) => (p.id === id ? (previous as Prospect) : p))
          : s.prospects,
      }))
      return false
    }

    setState((s) => ({
      ...s,
      error: null,
      prospects: s.prospects.map((p) => (p.id === id ? data : p)),
    }))

    if (previous && closesHostedSite(previous, patch)) {
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

    return true
  }, [])

  const dismissError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  return { ...state, reload: load, update, dismissError }
}
