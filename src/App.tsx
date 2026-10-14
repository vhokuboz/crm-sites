import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useProspects } from './lib/useProspects'
import type { Prospect } from './lib/database.types'
import { Login } from './components/Login'
import { Hoje } from './components/Hoje'
// So a Hoje e o login vao no bundle inicial; o resto carrega ao abrir.
const Funil = lazy(() => import('./components/Funil').then((m) => ({ default: m.Funil })))
const Base = lazy(() => import('./components/Base').then((m) => ({ default: m.Base })))
const Clientes = lazy(() => import('./components/Clientes').then((m) => ({ default: m.Clientes })))
const Resumo = lazy(() => import('./components/Resumo').then((m) => ({ default: m.Resumo })))
const Drawer = lazy(() => import('./components/Drawer').then((m) => ({ default: m.Drawer })))
const AddProspectModal = lazy(() =>
  import('./components/AddProspectModal').then((m) => ({ default: m.AddProspectModal })),
)
import { Toast } from './components/Toast'
import { useMenus } from './lib/useMenus'

const TABS = ['Hoje', 'Funil', 'Clientes', 'Base', 'Resumo'] as const
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
  const { prospects, loading, error, toast, update, updateMany, reload, dismissError, dismissToast } = useProspects()
  const [tab, setTab] = useState<Tab>('Hoje')
  const [open, setOpen] = useState<Prospect | null>(null)
  const [adding, setAdding] = useState(false)
  useMenus()

  // n abre o formulario de novo prospect (fora de campos e dialogos).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      setAdding(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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
          <img
            src="/okai-wordmark-sm.webp"
            alt="Okai · web & digital"
            width={320}
            height={89}
            className="h-10 w-auto"
          />

          <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Seções">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`hit flex-1 rounded-sm px-2 py-2 text-body font-medium transition-colors sm:flex-none sm:px-3.5 ${
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
              className="hit rounded-sm bg-cream px-3.5 py-2 text-body font-medium text-ink hover:opacity-90"
            >
              + Novo prospect
            </button>
            <span className="hidden text-xs text-cream/60 md:inline">{email}</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="hit rounded-sm border border-cream/30 px-3 py-2 text-body hover:bg-cream/10"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-seal/30 bg-seal-tint">
          <div className="mx-auto flex max-w-[88rem] items-center gap-3 px-4 py-2.5 sm:px-6">
            <p className="flex-1 text-body text-seal-ink">{error}</p>
            <button onClick={() => void reload()} className="hit text-body font-medium text-seal-ink underline">
              tentar de novo
            </button>
            <button onClick={dismissError} className="hit text-body text-seal-ink underline">
              dispensar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="sr-only">{tab}</h1>
        <Suspense fallback={<p role="status" className="eyebrow">Carregando</p>}>
        {loading ? (
          <p role="status" className="eyebrow">Carregando prospects</p>
        ) : error && prospects.length === 0 ? (
          <div className="rounded-sm border border-dashed border-seal/40 px-4 py-10 text-center">
            <p className="text-body text-seal-ink">Não foi possível carregar os prospects.</p>
            <button
              onClick={() => void reload()}
              className="hit mt-3 rounded-sm bg-ink px-4 py-2 text-body font-medium text-paper hover:opacity-90"
            >
              Tentar de novo
            </button>
          </div>
        ) : tab === 'Hoje' ? (
          <Hoje prospects={prospects} onUpdate={update} onUpdateMany={updateMany} onOpen={setOpen} />
        ) : tab === 'Funil' ? (
          <Funil prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Clientes' ? (
          <Clientes prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Resumo' ? (
          <Resumo prospects={prospects} />
        ) : (
          <Base onOpen={setOpen} />
        )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        {selected && (
          <Drawer prospect={selected} onUpdate={update} onReload={reload} onClose={() => setOpen(null)} />
        )}

        {adding && <AddProspectModal onCreated={handleCreated} onClose={() => setAdding(false)} />}
      </Suspense>

      {toast && <Toast key={toast.id} message={toast.message} onUndo={toast.undo} onDismiss={dismissToast} />}
    </div>
  )
}
