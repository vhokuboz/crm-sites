import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  images: string[]
  initialIndex?: number
  title: string
  onClose: () => void
}

/** Modal simples com carrossel para os previews do protótipo. */
export function ImagePreviewModal({ images, initialIndex = 0, title, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex)
  const hasMultiple = images.length > 1

  function prev() {
    setIndex((i) => (i - 1 + images.length) % images.length)
  }

  function next() {
    setIndex((i) => (i + 1) % images.length)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasMultiple) prev()
      if (e.key === 'ArrowRight' && hasMultiple) next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hasMultiple, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-ink/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-full w-full max-w-3xl flex-col"
      >
        <div className="flex items-center justify-between pb-2">
          <p className="font-mono text-[11px] text-paper/80">
            {title}
            {hasMultiple && ` · ${index + 1} / ${images.length}`}
          </p>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-sm border border-paper/30 px-2.5 py-1 font-mono text-[11px] text-paper hover:bg-paper/10"
          >
            Fechar
          </button>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden rounded-sm border border-paper/20 bg-ink">
          <img
            key={images[index]}
            src={images[index]}
            alt={`${title} — imagem ${index + 1}`}
            className="max-h-[75vh] w-full object-contain"
          />

          {hasMultiple && (
            <>
              <button
                onClick={prev}
                aria-label="Imagem anterior"
                className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-ink/70 text-paper hover:bg-ink/90"
              >
                ‹
              </button>
              <button
                onClick={next}
                aria-label="Próxima imagem"
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-ink/70 text-paper hover:bg-ink/90"
              >
                ›
              </button>
            </>
          )}
        </div>

        {hasMultiple && (
          <div className="mt-3 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={src}
                onClick={() => setIndex(i)}
                aria-label={`Ir para imagem ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-paper' : 'w-1.5 bg-paper/40 hover:bg-paper/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
