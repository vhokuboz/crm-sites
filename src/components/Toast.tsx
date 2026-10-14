import { useEffect } from 'react'

type Props = {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

/** Aviso de acao concluida com Desfazer. Some sozinho em 6s; role=status avisa leitores de tela. */
export function Toast({ message, onUndo, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return (
    <div
      role="status"
      className="on-ink fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-sm bg-ink px-4 py-3 text-sm text-cream shadow-lg sm:left-auto sm:right-6 sm:mx-0"
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
