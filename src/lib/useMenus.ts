import { useEffect } from 'react'

/**
 * Menus feitos com <details data-menu>: fecham com Esc, clique fora e depois de
 * escolher um item. O <details> nativo nao faz nenhum dos tres.
 */
export function useMenus() {
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]')

    function onClick(e: MouseEvent) {
      const target = e.target as Element
      open().forEach((d) => {
        const inside = d.contains(target)
        const picked = inside && !!target.closest('button, a') && !target.closest('summary')
        if (!inside || picked) d.open = false
      })
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      open().forEach((d) => {
        d.open = false
        d.querySelector('summary')?.focus()
      })
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}
