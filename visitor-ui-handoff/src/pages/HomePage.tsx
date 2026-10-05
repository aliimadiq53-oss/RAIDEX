import { useEffect, useState } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import SiteImage from '../components/SiteImage'
import { useCountdown, useInView } from '../hooks/useInView'
import type { SiteSettings } from '../App'
import type { Tournament } from '../lib/types'

interface Props {
  onNavigate: (page: string) => void
  liveResultsEnabled?: boolean
  siteSettings?: SiteSettings
  tournaments: Tournament[]
  onSelectTournament?: (tournamentId: string) => void
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, inView } = useInView(0.08)
  return <div ref={ref} className={`transition-all duration-700 ${inView ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'} ${className}`}>{children}</div>
}

function dateLabel(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : value
}

function excerpt(value: string, limit = 45) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  return words.length > limit ? `${words.slice(0, limit).join(' ')}...` : value
}

export default function HomePage({ onNavigate, liveResultsEnabled = false, siteSettings, tournaments, onSelectTournament }: Props) {
  const sections = siteSettings?.sections
  const slides = (siteSettings?.heroSlides ?? []).filter((slide) => slide.imageUrl || slide.headline || slide.subheadline)
  const galleries = (siteSettings?.galleryImages ?? []).filter((item) => item.url)
  const champions = (siteSettings?.champions ?? []).filter((item) => item.name)
  const news = (siteSettings?.newsItems ?? []).filter((item) => item.title)
  const sponsors = (siteSettings?.sponsors ?? []).filter((item) => item.name)
  const upcoming = tournaments.find((item) => !['completed', 'archived', 'cancelled'].includes(item.status))
  const targetDate = upcoming?.websiteTargetDate || siteSettings?.upcomingTargetDate
  const countdown = useCountdown(targetDate ? new Date(targetDate) : null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const slide = slides[activeSlide] ?? slides[0]
  const hero = {
    id: slide?.id ?? 'fallback-hero',
    imageUrl: slide?.imageUrl || siteSettings?.upcomingImageUrl || '/4.png',
    tag: slide?.tag || 'رايد إكس · منصة الفروسية',
    headline: slide?.headline && !slide.headline.includes('منصه التحكيم الخاصه') ? slide.headline : 'الفروسية كما يجب أن تكون',
    subheadline: slide?.subheadline || 'منصة تجمع البطولة، التحكيم، والنتائج في تجربة واحدة.',
    ctaText: slide?.ctaText || 'استكشف البطولات',
  }

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 6500)
    return () => window.clearInterval(timer)
  }, [slides.length])

  const statusLabel = (status: string) => status === 'active' ? 'جارية' : status === 'completed' || status === 'archived' ? 'منتهية' : 'قادمة'

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#211b16]">
      <SiteHeader transparent onNavigate={onNavigate} liveResultsEnabled={liveResultsEnabled} />
      <main>
        {sections?.hero !== false && <section className="relative isolate min-h-[650px] overflow-hidden bg-[#17130f] text-white sm:min-h-[760px]">
          <SiteImage src={hero.imageUrl} alt={hero.tag || 'رايد إكس'} loading="eager" className="absolute inset-0 -z-20 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(17,13,10,.95),rgba(17,13,10,.48),rgba(17,13,10,.12))]" />
          <div className="absolute inset-x-5 bottom-20 mx-auto max-w-screen-xl sm:right-8 sm:left-8 sm:bottom-28 lg:right-16 lg:left-16">
            <p className="mb-5 text-xs font-bold tracking-[0.25em] text-[#e8bd82] sm:text-sm">{hero.tag}</p>
            <h1 className="max-w-[13ch] text-5xl font-black leading-[1.05] sm:text-7xl lg:text-8xl">{hero.headline}</h1>
            {hero.subheadline && <p className="mt-6 max-w-xl text-base leading-8 text-white/70 sm:text-xl">{hero.subheadline}</p>}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={() => onNavigate('tournament')} className="min-h-12 rounded-xl bg-[#b85a35] px-7 py-3 text-sm font-black text-white transition hover:bg-[#d16a40]">{hero.ctaText} ←</button><button onClick={() => onNavigate('story')} className="min-h-12 rounded-xl border border-white/30 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/10">اكتشف رايد إكس</button></div>
          </div>
          {slides.length > 1 && <div className="absolute bottom-8 right-5 flex gap-2 sm:right-8 lg:right-16">{slides.map((item, index) => <button key={item.id} aria-label={`الشريحة ${index + 1}`} onClick={() => setActiveSlide(index)} className={`h-2 rounded-full transition-all ${index === activeSlide ? 'w-10 bg-[#e8bd82]' : 'w-2 bg-white/40'}`} />)}</div>}
        </section>}

        <section className={`relative z-10 mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-16 ${sections?.hero !== false ? '-mt-8' : 'mt-8'}`}><div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#ded4c5] bg-[#fffdf9] shadow-xl shadow-black/5 sm:grid-cols-4">{[['البطولات', tournaments.length], ['الجولات', upcoming?.totalRounds ?? 0], ['المشاركون', upcoming?.participantCount ?? 0], ['الهوية', 'RIDEX']].map(([label, value]) => <div key={String(label)} className="border-l border-[#e8dfd3] px-4 py-5 last:border-0 sm:px-6"><p className="text-xs text-[#8a7c70]">{label}</p><p className="mt-1 text-2xl font-black text-[#211b16]">{value}</p></div>)}</div></section>

        {tournaments.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-20 sm:px-8 lg:px-16 lg:py-28"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold tracking-[0.2em] text-[#b85a35]">المشهد الحالي</p><h2 className="text-4xl font-black sm:text-6xl">بطولات رايد إكس</h2></div><button onClick={() => onNavigate('tournament')} className="hidden border-b border-[#b85a35] pb-1 text-sm font-bold text-[#9c492c] sm:block">كل البطولات ←</button></div><div className="grid gap-4 lg:grid-cols-12">{tournaments.slice(0, 4).map((item, index) => <article key={item.id} onClick={() => onSelectTournament?.(item.id)} className={`${index === 0 ? 'lg:col-span-7 lg:min-h-[520px]' : 'lg:col-span-5 lg:min-h-[250px]'} group relative min-h-[300px] cursor-pointer overflow-hidden rounded-2xl bg-[#2a211b]`}><SiteImage src={item.websiteHeroImage || siteSettings?.upcomingImageUrl || ''} alt={item.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" /><div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7"><div className="mb-3 flex gap-2"><span className="rounded-full bg-[#b85a35] px-3 py-1 text-[10px] font-bold text-white">{statusLabel(item.status)}</span><span className="rounded-full border border-white/30 px-3 py-1 text-[10px] text-white/80">{item.type}</span></div><h3 className="text-2xl font-black text-white sm:text-3xl">{item.name}</h3><p className="mt-2 text-sm text-white/65">{dateLabel(item.date)}{item.location ? ` · ${item.location}` : ''}</p></div></article>)}</div></Reveal>}

        {(countdown || upcoming) && <section className="bg-[#211914] py-16 text-white sm:py-24"><div className="mx-auto grid max-w-screen-xl gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-16"><div><p className="mb-3 text-xs font-bold tracking-[0.25em] text-[#e8bd82]">الموعد القادم</p><h2 className="max-w-3xl text-4xl font-black sm:text-6xl">{upcoming?.websiteTitle || upcoming?.name || siteSettings?.upcomingTitle || 'بطولة رايد إكس القادمة'}</h2><p className="mt-4 max-w-xl text-base leading-8 text-white/60">{upcoming?.websiteDescription || upcoming?.description || siteSettings?.upcomingDescription}</p></div>{countdown && <div className="grid grid-cols-4 gap-2 sm:gap-3">{[['يوم', countdown.days], ['ساعة', countdown.hours], ['دقيقة', countdown.minutes], ['ثانية', countdown.seconds]].map(([label, value]) => <div key={String(label)} className="min-w-[60px] rounded-xl border border-white/15 px-3 py-4 text-center"><p className="text-2xl font-black tabular-nums sm:text-4xl">{String(value).padStart(2, '0')}</p><p className="mt-1 text-[10px] text-white/50">{label}</p></div>)}</div>}</div></section>}

        {(siteSettings?.heritageTitle || siteSettings?.heritageBody || siteSettings?.heritageImageUrl) && <Reveal className="mx-auto grid max-w-screen-xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-28 lg:px-16"><div><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">هوية المنصة</p><h2 className="text-4xl font-black leading-tight sm:text-6xl">{siteSettings.heritageTitle || 'قصة رايد إكس'}</h2><p className="mt-6 max-w-xl text-base leading-8 text-[#75695d] sm:text-lg">{excerpt(siteSettings.heritageBody || siteSettings.heritageSubtitle || '', 52)}</p><button onClick={() => onNavigate('story')} className="mt-7 border-b border-[#b85a35] pb-1 text-sm font-bold text-[#9c492c]">اقرأ القصة كاملة ←</button></div><SiteImage src={siteSettings.heritageImageUrl || ''} alt="عن رايد إكس" className="aspect-[4/3] h-full w-full rounded-2xl object-cover" /></Reveal>}

        {sections?.gallery !== false && galleries.length > 0 && <Reveal className="bg-[#eee7dc] py-20 sm:py-28"><div className="mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-16"><div className="mb-8 flex items-end justify-between"><h2 className="text-4xl font-black sm:text-6xl">من الميدان</h2><span className="text-xs text-[#8a7c70]">{galleries.length} صور</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{galleries.slice(0, 8).map((image) => <button key={image.id} onClick={() => setLightbox(image.url)} className="group aspect-square overflow-hidden rounded-xl bg-[#d7cdc0]"><SiteImage src={image.url} alt={image.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></button>)}</div></div></Reveal>}

        {sections?.champions !== false && champions.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-20 sm:px-8 lg:px-16 lg:py-28"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">نتائج مميزة</p><h2 className="mb-10 text-4xl font-black sm:text-6xl">أبطال رايد إكس</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{champions.slice(0, 6).map((champion) => <article key={champion.id} className="overflow-hidden rounded-2xl border border-[#ded4c5] bg-[#fffdf9]"><SiteImage src={champion.imageUrl} alt={champion.name} className="aspect-[4/3] w-full object-cover" /><div className="p-5"><h3 className="text-xl font-black">{champion.name}</h3><p className="mt-2 text-sm text-[#8a7c70]">{[champion.tournament, champion.year, champion.country].filter(Boolean).join(' · ')}</p></div></article>)}</div></Reveal>}

        {sections?.news !== false && news.length > 0 && <Reveal className="bg-[#eee7dc] py-20 sm:py-28"><div className="mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-16"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">منصة ومجتمع</p><h2 className="mb-10 text-4xl font-black sm:text-6xl">آخر الأخبار</h2><div className="grid gap-4 lg:grid-cols-3">{news.slice(0, 3).map((item) => <article key={item.id} className="overflow-hidden rounded-2xl bg-[#fffdf9]"><SiteImage src={item.imageUrl} alt={item.title} className="aspect-[16/10] w-full object-cover" /><div className="p-5"><p className="text-xs text-[#8a7c70]">{[item.category, item.date].filter(Boolean).join(' · ')}</p><h3 className="mt-3 text-xl font-black leading-snug">{item.title}</h3></div></article>)}</div></div></Reveal>}

        {sections?.sponsors !== false && sponsors.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-16 sm:px-8 lg:px-16"><p className="mb-5 text-xs font-bold tracking-[0.2em] text-[#8a7c70]">شركاء رايد إكس</p><div className="flex flex-wrap gap-3">{sponsors.map((sponsor) => <span key={sponsor.id} className="rounded-full border border-[#d8cbbb] px-5 py-3 text-sm font-bold text-[#75695d]">{sponsor.name}</span>)}</div></Reveal>}
      </main>
      {lightbox && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-6" onClick={() => setLightbox(null)}><SiteImage src={lightbox} alt="صورة من رايد إكس" className="max-h-[88vh] max-w-full rounded-xl object-contain" /></div>}
      <SiteFooter email={siteSettings?.footerEmail} city={siteSettings?.footerCity} organization={siteSettings?.footerOrganization} />
    </div>
  )
}