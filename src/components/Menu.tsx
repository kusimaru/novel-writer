import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Item {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export default function Menu({ items, label = '⋯', className = '' }: { items: Item[]; label?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  return (
    <div className={'menu ' + className} ref={ref}>
      <button
        className="icon-btn menu-trigger"
        aria-label="メニュー"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {label}
      </button>
      {open && (
        <div className="menu-pop" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <button
              key={it.label}
              className={'menu-item' + (it.danger ? ' danger' : '')}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
