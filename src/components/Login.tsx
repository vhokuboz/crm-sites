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
    <main className="on-ink grid min-h-dvh place-items-center bg-ink px-6 text-cream">
      <div className="w-full max-w-sm">
        <h1>
          <img src="/okai-wordmark.webp" alt="Okai · web & digital" width={620} height={172} className="h-20 w-auto" />
        </h1>
        <p className="mt-4 text-body text-cream/70">
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
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2.5 text-body text-ink"
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
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2.5 text-body text-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-body text-seal-on-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-cream px-4 py-2.5 text-body font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
