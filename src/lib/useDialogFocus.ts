import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex]:not([tabindex="-1"])'

/** Foco entra no diálogo, Tab fica preso nele e o foco volta ao gatilho ao fechar. */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    const trigger = document.activeElement as HTMLElement | null
    if (node && !node.contains(document.activeElement)) {
      node.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      trigger?.focus?.()
    }
  }, [])

  return ref
}
