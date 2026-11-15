/** The Wakil mark: terracotta blades and keystone, with a light (or ink) counter-blade. */
export function WakilMark({ className = 'h-6', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const counter = tone === 'dark' ? '#F8F1EA' : '#0B132B'
  return (
    <svg viewBox="0 0 112 56" className={className} aria-hidden>
      <path d="M2 10h20a8 8 0 0 1 6.4 3.2L50 46H30a8 8 0 0 1-6.4-3.2z" fill="#E67E56" />
      <path d="M43 3.5a4 4 0 0 1 4.6 0l11 8a2 2 0 0 1 0 3.2l-11 8a4 4 0 0 1-4.6 0l-11-8a2 2 0 0 1 0-3.2z" fill="#EE9471" />
      <path d="M30 24.5a3 3 0 0 1 3.4-.6l12 7.6a6 6 0 0 1 1.7 1.7l4.6 6.8c.6 1-.1 2.3-1.3 2.3h-8.6a5 5 0 0 1-4-2L29.5 26.8a1.6 1.6 0 0 1 .5-2.3z" fill="#D9603A" />
      <path d="M53 34l11-7.4c1.5-1 3.2.7 2.2 2.1L56.6 41z" fill={counter} />
      <path d="M57 46l23-32.6A8 8 0 0 1 86.6 10H110L85 43.4A8 8 0 0 1 78.6 46H62a4 4 0 0 1-3.3-1.7z" fill={counter} />
    </svg>
  )
}

export function WakilWordmark({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const base = tone === 'dark' ? 'text-ivory' : 'text-ink'
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <WakilMark className="h-6 w-auto shrink-0" tone={tone} />
      <span className={`text-[17px] font-bold tracking-[0.18em] ${base}`}>
        W<span className="text-terra">Λ</span>KIL
      </span>
    </span>
  )
}
