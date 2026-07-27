import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useProspects } from './lib/useProspects'
import type { Prospect } from './lib/database.types'
import { Login } from './components/Login'
import { Hoje } from './components/Hoje'
import { Funil } from './components/Funil'
import { Base } from './components/Base'
import { Drawer } from './components/Drawer'

const TABS = ['Hoje', 'Funil', 'Base'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="eyebrow">Carregando</p>
      </div>
    )
  }

  if (!session) return <Login />
  return <Crm email={session.user.email ?? ''} />
}

function Crm({ email }: { email: string }) {
  const { prospects, loading, error, update, dismissError } = useProspects()
  const [tab, setTab] = useState<Tab>('Hoje')
  const [open, setOpen] = useState<Prospect | null>(null)

  // O drawer segue o registro: uma edicao no painel reflete no card por baixo.
  const selected = open ? (prospects.find((p) => p.id === open.id) ?? null) : null

  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="eyebrow">Bauru · SP</p>
            <h1 className="font-display text-xl font-semibold tracking-tight">Prospecção</h1>
          </div>

          <nav className="flex gap-1" aria-label="Seções">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  tab === t ? 'bg-ink text-paper' : 'text-muted hover:bg-paper'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-muted sm:inline">{email}</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="rounded-sm border border-rule px-2.5 py-1 font-mono text-[11px] hover:bg-paper"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-seal/30 bg-seal/8">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
            <p className="flex-1 text-[13px] text-seal">{error}</p>
            <button onClick={dismissError} className="font-mono text-[11px] text-seal underline">
              dispensar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
          <p className="eyebrow">Carregando prospects</p>
        ) : prospects.length === 0 ? (
          <p className="rounded-sm border border-dashed border-rule px-4 py-10 text-center text-sm text-muted">
            Nenhum prospect na base ainda.
          </p>
        ) : tab === 'Hoje' ? (
          <Hoje prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Funil' ? (
          <Funil prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : (
          <Base prospects={prospects} onOpen={setOpen} />
        )}
      </main>

      {selected && (
        <Drawer prospect={selected} onUpdate={update} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
