import { useState } from 'react'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import SiteImage from '../components/SiteImage'
import type { Tournament, TournamentStatus } from '../lib/types'

type TournamentFilter = 'all' | 'upcoming' | 'active' | 'completed'

interface TournamentListingProps {
  tournaments: Tournament[]
  liveResultsEnabled: boolean
  onNavigate: (page: string) => void
  onSelectTournament: (id: string) => void
}

const filters: { id: TournamentFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'upcoming', label: 'قادمة' },
  { id: 'active', label: 'جارية' },
  { id: 'completed', label: 'منتهية' },
]

function getStatusLabel(status: TournamentStatus): string {
  if (status === 'active') return 'جارية'
  if (status === 'completed') return 'منتهية'
  if (status === 'cancelled' || status === 'archived') return 'مؤرشفة'
  return 'قادمة'
}

export default function TournamentListing({ tournaments, liveResultsEnabled, onNavigate, onSelectTournament }: TournamentListingProps) {
  const [filter, setFilter] = useState<TournamentFilter>('all')
  const visibleTournaments = tournaments
    .filter((tournament) => !['cancelled', 'archived'].includes(tournament.status))
    .filter((tournament) => {
      if (filter === 'upcoming') return ['upcoming', 'registration', 'not_started'].includes(tournament.status)
      if (filter === 'active') return tournament.status === 'active'
      if (filter === 'completed') return tournament.status === 'completed'
      return true
    })

  return (
    <div className="min-h-screen bg-ivory">
      <SiteHeader onNavigate={onNavigate} liveResultsEnabled={liveResultsEnabled} />
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 sm:pt-28 lg:px-12">
        <div className="mb-7 sm:mb-10">
          <p className="mb-2 text-xs font-bold text-brand">رايد إكس · منصة الفروسية</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black text-charcoal sm:text-5xl">البطولات</h1>
              <p className="mt-2 text-sm text-warm-gray">تابع البطولات ومواعيدها وتفاصيل المشاركة.</p>
            </div>
            <p className="text-sm text-muted-text">{visibleTournaments.length} بطولة</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="تصفية البطولات">
          {filters.map((item) => <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${filter === item.id ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-surface text-warm-gray'}`}
          >{item.label}</button>)}
        </div>

        {visibleTournaments.length > 0 ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {visibleTournaments.map((tournament) => <article key={tournament.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <div className="relative aspect-[16/10] bg-sand">
              <SiteImage src={tournament.websiteHeroImage} alt={tournament.websiteTitle || tournament.name} className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-charcoal">{getStatusLabel(tournament.status)}</span>
            </div>
            <div className="p-4 sm:p-5">
              <p className="mb-1 text-xs font-semibold text-brand">{tournament.type}</p>
              <h2 className="text-xl font-black leading-snug text-charcoal">{tournament.websiteTitle || tournament.name}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-warm-gray">{tournament.websiteDescription || tournament.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-text">
                {(tournament.websiteTargetDate || tournament.date) && <span>{tournament.websiteTargetDate || tournament.date}</span>}
                {(tournament.venue || tournament.location) && <span>{tournament.venue || tournament.location}</span>}
              </div>
              <button type="button" onClick={() => onSelectTournament(tournament.id)} className="mt-4 min-h-12 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">تفاصيل البطولة <span aria-hidden="true">←</span></button>
            </div>
          </article>)}
        </div> : <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-14 text-center">
          <p className="font-bold text-charcoal">لا توجد بطولات في هذا التصنيف</p>
          <button type="button" onClick={() => setFilter('all')} className="mt-4 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-brand">عرض جميع البطولات</button>
        </div>}
      </main>
      <SiteFooter />
    </div>
  )
}