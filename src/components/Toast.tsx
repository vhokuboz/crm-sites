import { useEffect, useState } from 'react'

type Props = {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

/** Aviso de acao concluida com Desfazer. Some sozinho em 10s (pausa com mouse/foco); role=status avisa leitores de tela. */
export function Toast({ message, onUndo, onDismiss }: Props) {
  const [paused, setPaused] = useState(false)

  // Parado com mouse ou foco em cima: quem le devagar nao perde o Desfazer.
  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDismiss, 10000)
    return () => clearTimeout(t)
  }, [message, onDismiss, paused])

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="on-ink fixed inset-x-4 bottom-20 sm:bottom-20 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-sm bg-ink px-4 py-3 text-body text-cream shadow-lg sm:left-auto sm:right-6 sm:mx-0"
    >
      <p className="min-w-0 flex-1">{message}</p>
      <button
        onClick={() => {
          onUndo()
          onDismiss()
        }}
        className="hit shrink-0 rounded-sm px-2 py-1 font-semibold underline underline-offset-2 hover:bg-cream/10"
      >
        Desfazer
      </button>
    </div>
  )
}
