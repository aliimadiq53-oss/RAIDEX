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
  const totalRounds = tournaments.reduce((sum, tournament) => sum + (tournament.rounds?.length || tournament.totalRounds || 0), 0)
  const totalParticipants = tournaments.reduce((sum, tournament) => sum + (tournament.participants?.length || tournament.participantCount || 0), 0)
  const targetDate = upcoming?.websiteTargetDate || siteSettings?.upcomingTargetDate
  const countdown = useCountdown(targetDate ? new Date(targetDate) : null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
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
      <main className="pt-16 sm:pt-20 lg:pt-16">
        {sections?.hero !== false && <section className="relative isolate mx-3 mt-4 h-[180px] overflow-hidden rounded-3xl bg-[#ded4c5] sm:mx-6 sm:mt-6 sm:h-[360px] lg:mx-auto lg:h-[540px] lg:max-w-6xl">
          <SiteImage src={hero.imageUrl} alt="رايد إكس" loading="eager" className="absolute inset-0 h-full w-full bg-[#ded4c5] object-cover object-center" />
          {slides.length > 1 && <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2">{slides.map((item, index) => <button key={item.id} aria-label={`الشريحة ${index + 1}`} onClick={() => setActiveSlide(index)} className={`h-1.5 rounded-full transition-all ${index === activeSlide ? 'w-8 bg-[#b85a35]' : 'w-1.5 bg-[#b85a35]/35'}`} />)}</div>}
        </section>}

        <section className="relative z-10 mx-auto mt-5 max-w-screen-xl px-5 sm:mt-7 sm:px-8 lg:px-16"><div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[#ded4c5] bg-[#fffdf9] shadow-lg shadow-black/5">{[['البطولات', tournaments.length], ['الجولات', totalRounds], ['المشاركون', totalParticipants], ['الهوية', 'RIDEX']].map(([label, value]) => <div key={String(label)} className="flex min-w-0 flex-col items-center justify-center border-l border-[#e8dfd3] px-2 py-3 text-center last:border-0 sm:px-5 sm:py-4"><p className="truncate text-[10px] text-[#8a7c70] sm:text-xs">{label}</p><p className="mt-1 truncate text-xl font-black leading-none text-[#211b16] sm:text-2xl">{value}</p></div>)}</div></section>

        <section className="mx-auto max-w-screen-xl overflow-x-auto px-5 pt-8 sm:px-8 lg:px-16">
          <div className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-4">
            {[
              ['البطولات', 'تصفح الفعاليات', () => onNavigate('tournament')],
              ['النتائج المباشرة', liveResultsEnabled ? 'شاهد الترتيب الآن' : 'النتائج المعتمدة', () => onNavigate('live-results')],
              ['تجربة رايد إكس', 'قصتنا وهويتنا', () => onNavigate('story')],
              ['تقرير البطولة', 'تفاصيل آخر بطولة', () => onSelectTournament?.(tournaments[0]?.id ?? '')],
            ].map(([title, caption, action]) => <button key={String(title)} onClick={action as () => void} className="w-52 rounded-xl border border-[#ded4c5] bg-[#fffdf9] px-4 py-4 text-right transition hover:-translate-y-0.5 hover:border-[#b85a35] sm:w-auto"><span className="block text-sm font-black text-[#211b16]">{title}</span><span className="mt-1 block text-xs text-[#8a7c70]">{caption}</span><span className="mt-3 block text-left text-[#b85a35]">←</span></button>)}
          </div>
        </section>

        {tournaments.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-20 sm:px-8 lg:px-16 lg:py-28"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold tracking-[0.2em] text-[#b85a35]">المشهد الحالي</p><h2 className="text-4xl font-black sm:text-6xl">بطولات رايد إكس</h2></div><button onClick={() => onNavigate('tournament')} className="hidden border-b border-[#b85a35] pb-1 text-sm font-bold text-[#9c492c] sm:block">كل البطولات ←</button></div><div className="grid gap-4 lg:grid-cols-3">{tournaments.map((item, index) => <article key={item.id} onClick={() => onSelectTournament?.(item.id)} className={`${index === 0 ? 'lg:col-span-2 lg:min-h-[520px]' : 'lg:col-span-1 lg:min-h-[250px]'} group relative min-h-[300px] cursor-pointer overflow-hidden rounded-2xl bg-[#2a211b]`}><SiteImage src={item.websiteHeroImage || siteSettings?.upcomingImageUrl || ''} alt={item.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" /><div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7"><div className="mb-3 flex gap-2"><span className="rounded-full bg-[#b85a35] px-3 py-1 text-[10px] font-bold text-white">{statusLabel(item.status)}</span><span className="rounded-full border border-white/30 px-3 py-1 text-[10px] text-white/80">{item.type}</span></div><h3 className="text-2xl font-black text-white sm:text-3xl">{item.name}</h3><p className="mt-2 text-sm text-white/65">{dateLabel(item.date)}{item.location ? ` · ${item.location}` : ''}</p></div></article>)}</div></Reveal>}

        <Reveal className="mx-auto max-w-screen-xl px-5 pb-20 sm:px-8 lg:px-16">
          <div className="flex flex-col gap-6 rounded-2xl bg-[#211914] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div><p className="text-xs font-bold tracking-[0.2em] text-[#e8bd82]">مركز النتائج</p><h2 className="mt-2 text-2xl font-black sm:text-4xl">كل نتيجة لها لحظة تستحق أن تُعرض</h2><p className="mt-3 max-w-xl text-sm leading-7 text-white/60">تابع النتائج المعتمدة، ترتيب الجولات، وأداء الفرسان في واجهة واحدة.</p></div>
            <button onClick={() => onNavigate('live-results')} className="min-h-12 shrink-0 rounded-xl bg-[#b85a35] px-6 py-3 text-sm font-black text-white transition hover:bg-[#d16a40]">فتح النتائج ←</button>
          </div>
        </Reveal>

        {(countdown || upcoming) && <section className="bg-[#211914] py-16 text-white sm:py-24"><div className="mx-auto grid max-w-screen-xl gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-16"><div><p className="mb-3 text-xs font-bold tracking-[0.25em] text-[#e8bd82]">الموعد القادم</p><h2 className="max-w-3xl text-4xl font-black sm:text-6xl">{upcoming?.websiteTitle || upcoming?.name || siteSettings?.upcomingTitle || 'بطولة رايد إكس القادمة'}</h2><p className="mt-4 max-w-xl text-base leading-8 text-white/60">{upcoming?.websiteDescription || upcoming?.description || siteSettings?.upcomingDescription}</p></div>{countdown && <div className="grid grid-cols-4 gap-2 sm:gap-3">{[['يوم', countdown.days], ['ساعة', countdown.hours], ['دقيقة', countdown.minutes], ['ثانية', countdown.seconds]].map(([label, value]) => <div key={String(label)} className="min-w-[60px] rounded-xl border border-white/15 px-3 py-4 text-center"><p className="text-2xl font-black tabular-nums sm:text-4xl">{String(value).padStart(2, '0')}</p><p className="mt-1 text-[10px] text-white/50">{label}</p></div>)}</div>}</div></section>}

        {(siteSettings?.heritageTitle || siteSettings?.heritageBody || siteSettings?.heritageImageUrl) && <Reveal className="mx-auto grid max-w-screen-xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-28 lg:px-16"><div><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">هوية المنصة</p><h2 className="text-4xl font-black leading-tight sm:text-6xl">{siteSettings.heritageTitle || 'قصة رايد إكس'}</h2><p className="mt-6 max-w-xl text-base leading-8 text-[#75695d] sm:text-lg">{excerpt(siteSettings.heritageBody || siteSettings.heritageSubtitle || '', 52)}</p><button onClick={() => onNavigate('story')} className="mt-7 border-b border-[#b85a35] pb-1 text-sm font-bold text-[#9c492c]">اقرأ القصة كاملة ←</button></div><SiteImage src={siteSettings.heritageImageUrl || ''} alt="عن رايد إكس" className="aspect-[4/3] h-full w-full rounded-2xl object-cover" /></Reveal>}

        {sections?.gallery !== false && galleries.length > 0 && <Reveal className="bg-[#eee7dc] py-16 sm:py-20"><div className="mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-16"><div className="mb-6 flex items-end justify-between"><div><p className="mb-2 text-xs font-bold tracking-[0.2em] text-[#b85a35]">من الميدان</p><h2 className="text-3xl font-black sm:text-5xl">معرض الصور</h2></div><span className="text-xs text-[#8a7c70]">{galleries.length} صور</span></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">{galleries.slice(0, 10).map((image) => <button key={image.id} onClick={() => setLightbox(image.url)} className="group aspect-[4/3] overflow-hidden rounded-lg bg-[#d7cdc0] sm:rounded-xl"><SiteImage src={image.url} alt={image.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></button>)}</div><button onClick={() => setGalleryOpen(true)} className="mx-auto mt-7 block border-b border-[#b85a35] pb-1 text-sm font-bold text-[#9c492c]">عرض كل الصور ←</button></div></Reveal>}

        {sections?.champions !== false && champions.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-20 sm:px-8 lg:px-16 lg:py-28"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">نتائج مميزة</p><h2 className="mb-10 text-4xl font-black sm:text-6xl">أبطال رايد إكس</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{champions.slice(0, 6).map((champion) => <article key={champion.id} className="overflow-hidden rounded-2xl border border-[#ded4c5] bg-[#fffdf9]"><SiteImage src={champion.imageUrl} alt={champion.name} className="aspect-[4/3] w-full object-cover" /><div className="p-5"><h3 className="text-xl font-black">{champion.name}</h3><p className="mt-2 text-sm text-[#8a7c70]">{[champion.tournament, champion.year, champion.country].filter(Boolean).join(' · ')}</p></div></article>)}</div></Reveal>}

        {sections?.news !== false && news.length > 0 && <Reveal className="bg-[#eee7dc] py-20 sm:py-28"><div className="mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-16"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#b85a35]">منصة ومجتمع</p><h2 className="mb-10 text-4xl font-black sm:text-6xl">آخر الأخبار</h2><div className="grid gap-4 lg:grid-cols-3">{news.slice(0, 3).map((item) => <article key={item.id} className="overflow-hidden rounded-2xl bg-[#fffdf9]"><SiteImage src={item.imageUrl} alt={item.title} className="block h-auto w-full bg-[#eee7dc] object-contain" /><div className="p-5"><p className="text-xs text-[#8a7c70]">{[item.category, item.date].filter(Boolean).join(' · ')}</p><h3 className="mt-3 text-xl font-black leading-snug">{item.title}</h3></div></article>)}</div></div></Reveal>}

        {sections?.sponsors !== false && sponsors.length > 0 && <Reveal className="mx-auto max-w-screen-xl px-5 py-16 sm:px-8 lg:px-16"><p className="mb-5 text-xs font-bold tracking-[0.2em] text-[#8a7c70]">شركاء رايد إكس</p><div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">{sponsors.map((sponsor) => <div key={sponsor.id} className="flex flex-col items-center text-center"><div className="flex h-24 w-full items-center justify-center">{sponsor.logoUrl ? <SiteImage src={sponsor.logoUrl} alt={sponsor.name} className="h-full max-w-full object-contain" /> : <span className="text-2xl font-black text-[#b85a35]">{sponsor.name.slice(0, 1)}</span>}</div><p className="mt-2 text-sm font-bold text-[#75695d]">{sponsor.name}</p></div>)}</div></Reveal>}
      </main>
      {galleryOpen && <div className="fixed inset-0 z-[998] overflow-y-auto bg-[#f7f3ec]" dir="rtl"><div className="mx-auto max-w-screen-xl px-5 py-6 sm:px-8 lg:px-16"><div className="mb-8 flex items-center justify-between"><div><p className="mb-2 text-xs font-bold tracking-[0.2em] text-[#b85a35]">استوديو رايد إكس</p><h2 className="text-3xl font-black sm:text-5xl">كل الصور</h2></div><button onClick={() => setGalleryOpen(false)} aria-label="إغلاق استوديو الصور" className="text-3xl leading-none text-[#211b16]">×</button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{galleries.map((image) => <button key={image.id} onClick={() => setLightbox(image.url)} className="group aspect-[4/3] overflow-hidden rounded-xl bg-[#d7cdc0]"><SiteImage src={image.url} alt={image.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></button>)}</div></div></div>}
      {lightbox && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-6" onClick={() => setLightbox(null)}><SiteImage src={lightbox} alt="صورة من رايد إكس" className="max-h-[88vh] max-w-full rounded-xl object-contain" /></div>}
      <div id="contact">
        <SiteFooter email={siteSettings?.footerEmail} city={siteSettings?.footerCity} organization={siteSettings?.footerOrganization} />
      </div>
    </div>
  )
}