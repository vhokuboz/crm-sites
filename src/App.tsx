import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useProspects } from './lib/useProspects'
import type { Prospect } from './lib/database.types'
import { Login } from './components/Login'
import { Hoje } from './components/Hoje'
import { Funil } from './components/Funil'
import { Base } from './components/Base'
import { Clientes } from './components/Clientes'
import { Drawer } from './components/Drawer'
import { AddProspectModal } from './components/AddProspectModal'
import { Toast } from './components/Toast'

const TABS = ['Hoje', 'Funil', 'Clientes', 'Base'] as const
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
        <p role="status" className="eyebrow">Carregando</p>
      </div>
    )
  }

  if (!session) return <Login />
  return <Crm email={session.user.email ?? ''} />
}

function Crm({ email }: { email: string }) {
  const { prospects, loading, error, toast, update, reload, dismissError, dismissToast } = useProspects()
  const [tab, setTab] = useState<Tab>('Hoje')
  const [open, setOpen] = useState<Prospect | null>(null)
  const [adding, setAdding] = useState(false)

  // Ficha abre direto no prospect recém-criado -- segmento e problema ainda
  // dependem de revisão manual, então não faz sentido deixar o usuário caçá-lo.
  async function handleCreated(prospect: Prospect) {
    setAdding(false)
    await reload()
    setOpen(prospect)
  }

  // O drawer segue o registro: uma edicao no painel reflete no card por baixo.
  const selected = open ? (prospects.find((p) => p.id === open.id) ?? null) : null

  return (
    <div className="min-h-dvh">
      <header className="on-ink bg-ink text-cream">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <img src="/okai-wordmark.webp" alt="Okai · web & digital" className="h-10 w-auto" />

          <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Seções">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`hit flex-1 rounded-sm px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none ${
                  tab === t ? 'bg-cream text-ink' : 'text-cream/70 hover:bg-cream/10'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setAdding(true)}
              className="hit rounded-sm bg-cream px-3.5 py-2 text-sm font-medium text-ink hover:opacity-90"
            >
              + Novo prospect
            </button>
            <span className="hidden text-xs text-cream/60 md:inline">{email}</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="hit rounded-sm border border-cream/30 px-3 py-2 text-sm hover:bg-cream/10"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-seal/30 bg-seal/8">
          <div className="mx-auto flex max-w-[88rem] items-center gap-3 px-4 py-2.5 sm:px-6">
            <p className="flex-1 text-sm text-seal">{error}</p>
            <button onClick={() => void reload()} className="hit text-sm font-medium text-seal underline">
              tentar de novo
            </button>
            <button onClick={dismissError} className="hit text-sm text-seal underline">
              dispensar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
          <p role="status" className="eyebrow">Carregando prospects</p>
        ) : tab === 'Hoje' ? (
          <Hoje prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Funil' ? (
          <Funil prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Clientes' ? (
          <Clientes prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : (
          <Base onOpen={setOpen} />
        )}
      </main>

      {selected && (
        <Drawer prospect={selected} onUpdate={update} onReload={reload} onClose={() => setOpen(null)} />
      )}

      {adding && <AddProspectModal onCreated={handleCreated} onClose={() => setAdding(false)} />}

      {toast && <Toast key={toast.id} message={toast.message} onUndo={toast.undo} onDismiss={dismissToast} />}
    </div>
  )
}
