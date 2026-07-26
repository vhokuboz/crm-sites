import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha não conferem.'
          : error.message,
      )
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Bauru · SP</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
          Prospecção
        </h1>
        <p className="mt-2 text-sm text-muted">
          Quem vale a pena procurar hoje, e o que dizer.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="eyebrow block">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow block">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="border-l-2 border-seal pl-3 text-sm text-seal">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-ink px-4 py-2.5 font-display text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
