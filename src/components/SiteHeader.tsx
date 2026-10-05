import { useState, useEffect } from 'react'

interface SiteHeaderProps {
  transparent?: boolean
  onNavigate?: (page: string) => void
  liveResultsEnabled?: boolean
  mobileTitle?: string
  onMobileBack?: () => void
}

const baseNavItems = [
  { label: 'الرئيسية', page: 'home' },
  { label: 'عن رايد إكس', page: 'story' },
  { label: 'البطولات', page: 'tournament' },
  { label: 'الفعاليات', page: null },
  { label: 'معرض الصور', page: null },
  { label: 'تواصل معنا', page: 'contact' },
]

export default function SiteHeader({ transparent = false, onNavigate, liveResultsEnabled = false, mobileTitle, onMobileBack }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const light = transparent && !scrolled
  const navItems = liveResultsEnabled
    ? [...baseNavItems.slice(0, 3), { label: 'النتائج المباشرة', page: 'live-results' }, ...baseNavItems.slice(3)]
    : baseNavItems

  const handleNavigate = (page: string) => {
    if (page === 'contact') {
      const contact = document.getElementById('contact')
      if (contact) {
        contact.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setMobileOpen(false)
        return
      }
    }
    onNavigate?.(page)
    setMobileOpen(false)
  }

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          mobileTitle
            ? 'bg-white border-b border-line'
            : light
            ? 'bg-charcoal/95 backdrop-blur-md shadow-lg shadow-charcoal/10'
            : 'bg-ivory/96 backdrop-blur-md border-b border-line'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-16 py-3 sm:py-4 lg:py-1">
          {mobileTitle ? (
            <div className="relative flex min-h-10 w-full items-center justify-center lg:hidden">
              <button onClick={onMobileBack} aria-label="رجوع" className="absolute right-0 text-2xl leading-none text-charcoal">←</button>
              <span className="max-w-[70%] truncate text-base font-bold text-charcoal">{mobileTitle}</span>
            </div>
          ) : <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={mobileOpen}
            className={`lg:hidden text-lg ${light ? 'text-white' : 'text-charcoal'}`}
          >
            {mobileOpen ? '×' : '☰'}
          </button>}

          {/* Nav — center (desktop) */}
          <nav className="hidden items-center gap-4 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => item.page && handleNavigate(item.page)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors duration-200 ${
                  light
                    ? 'text-white/80 hover:text-white'
                    : 'text-charcoal hover:text-brand'
                }`}
              >
                {item.label}
                {item.page === 'live-results' && (
                  <span className="inline-flex items-center gap-1 bg-brand text-ivory text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                    <span className="w-1 h-1 rounded-full bg-ivory animate-pulse" />
                    LIVE
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* RIDEX brand — right start */}
          <button onClick={() => onNavigate?.('home')} className={`flex items-center ${mobileTitle ? 'hidden lg:flex' : ''}`}>
            <img
              src="/ridex-logo.svg"
              alt="رايد إكس"
              className="h-11 w-16 object-contain transition-opacity duration-300 sm:h-14 sm:w-20 lg:h-8 lg:w-14"
              style={light ? { filter: 'brightness(0) invert(1)' } : undefined}
            />
          </button>
        </div>

        {/* Mobile nav */}
        {!mobileTitle && mobileOpen && (
          <div className={`lg:hidden max-h-[calc(100svh-4rem)] overflow-y-auto overscroll-contain border-t ${light ? 'bg-charcoal/95 border-white/10' : 'bg-ivory border-line'}`}>
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => item.page && handleNavigate(item.page)}
                className={`w-full text-start px-6 py-3 text-sm font-medium border-b flex items-center gap-2 ${
                  light ? 'text-white/80 border-white/10 hover:bg-white/5' : 'text-charcoal border-line hover:bg-sand'
                }`}
              >
                {item.label}
                {item.page === 'live-results' && (
                  <span className="inline-flex items-center gap-1 bg-brand text-ivory text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                    <span className="w-1 h-1 rounded-full bg-ivory animate-pulse" />
                    LIVE
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </header>
    </>
  )
}
