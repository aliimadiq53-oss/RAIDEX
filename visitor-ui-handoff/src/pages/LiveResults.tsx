import { useState, useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import SiteImage from '../components/SiteImage'
import HRRideLogo, { HRRideWatermark } from '../components/HRRideLogo'
import type { JudgeResult, Tournament } from '../lib/types'
import { getEffectiveScore, getRoundPosition, sortRoundResults } from '../lib/scoring'

interface Props {
  onNavigate: (page: string) => void
  judgeResults: JudgeResult[]
  liveState: { displayState: string; result: JudgeResult | null; tournamentName: string; roundName: string }
  liveResultsEnabled: boolean
  tournaments: Tournament[]
}

function getMedal(rank: number) {
  if (rank === 1) return { bg: 'bg-amber-400/10', border: 'border-amber-400/30', text: 'text-amber-500', symbol: '1' }
  if (rank === 2) return { bg: 'bg-slate-300/10', border: 'border-slate-300/20', text: 'text-slate-400', symbol: '2' }
  if (rank === 3) return { bg: 'bg-amber-700/10', border: 'border-amber-700/20', text: 'text-amber-700', symbol: '3' }
  return { bg: '', border: 'border-line', text: 'text-muted-text', symbol: String(rank) }
}


export default function LiveResults({ onNavigate, judgeResults, liveState, liveResultsEnabled, tournaments }: Props) {
  const [selectedRound, setSelectedRound] = useState<string>('all')
  const [pulse, setPulse] = useState(false)
  const activeTournament = tournaments
    .filter((t) => !['archived', 'cancelled'].includes(t.status))
    .find((t) => t.status === 'active')
    ?? tournaments
      .filter((t) => !['archived', 'cancelled'].includes(t.status))
      .find((t) => ['registration', 'upcoming', 'not_started'].includes(t.status))
    ?? tournaments.filter((t) => !['archived', 'cancelled'].includes(t.status))[0]
  const tournament = activeTournament ?? { id: '', name: 'لا توجد بطولة', type: '', location: '', date: '', status: 'not_started' as const, rounds: [] }
  const rounds = tournament.rounds ?? []

  /* Pulse on new incoming result */
  useEffect(() => {
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 1200)
    return () => clearTimeout(t)
  }, [judgeResults.length])

  /* Keep previous completed results visible until a newer active tournament is selected.
     The real data model uses the result status as the source of truth, while the old
     published flag is not guaranteed to be set for all approved results. */
  const approved = judgeResults.filter((r) => {
    if (r.tournamentId !== tournament.id) return false
    return r.status === 'approved' || r.published === true
  })

  /* Filter by round */
  const filtered = selectedRound === 'all' ? approved : approved.filter((r) => r.roundId === selectedRound)

  /* Build ranking by round score, then elapsed time. */
  const ranked = sortRoundResults(filtered)

  /* Map to include participant data */
  const rows = ranked.map((result) => {
    return { ...result, rank: getRoundPosition(result, filtered), horseName: result.horseName }
  })

  const isLive = liveState.result !== null
  const liveId = liveState.result?.id

  return (
    <div className="bg-ivory min-h-screen">
      <SiteHeader onNavigate={onNavigate} liveResultsEnabled={liveResultsEnabled} />

      {/* Hero banner */}
      <section className="relative bg-charcoal pt-24 sm:pt-32 pb-12 sm:pb-16 overflow-hidden">
        <div className="absolute inset-0">
          <SiteImage
            src="https://images.unsplash.com/photo-1695133994223-02698c56f100?w=1920&h=600&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/90 to-charcoal/70" />
        </div>
        <div className="absolute top-0 -right-20 pointer-events-none">
          <HRRideWatermark color="#ffffff" size={400} opacity={0.04} />
        </div>
        <div className="relative max-w-screen-xl mx-auto px-5 sm:px-8 lg:px-16">
          <p className="font-serif text-[11px] tracking-[0.35em] uppercase text-brand mb-3">نتائج البطولة</p>
          <h1 className="text-white text-3xl sm:text-4xl lg:text-5xl font-black mb-2">{tournament.name}</h1>
          <p className="text-white/55 text-base sm:text-lg">{tournament.location} · {tournament.date}</p>

          {/* Live indicator */}
          {isLive && (
            <div className={`inline-flex items-center gap-2 mt-5 bg-brand/10 border border-brand/30 rounded-full px-4 py-2 transition-opacity duration-500 ${pulse ? 'opacity-100' : 'opacity-70'}`}>
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
              <span className="text-brand text-xs font-bold tracking-wider">LIVE</span>
              <span className="text-white/40 text-xs">· {liveState.roundName}</span>
            </div>
          )}
        </div>
      </section>

      {/* Live Now — currently displayed result */}
      {isLive && liveState.result && (
        <section className="bg-brand">
          <div className="max-w-screen-xl mx-auto px-8 lg:px-16 py-5 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-ivory/70 text-xs font-serif uppercase tracking-widest">اللاعب المعروض حالياً</span>
            </div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="text-ivory font-black text-lg">{liveState.result.playerName}</span>
              <span className="text-ivory/60 text-sm">رقم {liveState.result.competitionNumber}</span>
              <span className="text-ivory font-serif text-xl tabular-nums">{liveState.result.time}</span>
              <span className="text-ivory/70 text-sm">{liveState.result.faults.reduce((s, f) => s + f.count, 0)} أخطاء</span>
            </div>
          </div>
        </section>
      )}

      {/* Main results */}
      <section className="max-w-screen-xl mx-auto px-8 lg:px-16 py-16">

        {/* Round selector + meta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-1">جدول النتائج</p>
            <div className="flex items-baseline gap-3">
              <span className="text-charcoal text-2xl font-black">
                {selectedRound === 'all' ? 'جميع الجولات' : rounds.find((r) => r.id === selectedRound)?.name}
              </span>
              <span className="text-muted-text text-sm font-serif">{rows.length} نتيجة</span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedRound('all')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${selectedRound === 'all' ? 'bg-charcoal text-ivory border-charcoal' : 'border-line text-warm-gray hover:border-charcoal hover:text-charcoal'}`}
            >
              الكل
            </button>
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRound(r.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${selectedRound === r.id ? 'bg-charcoal text-ivory border-charcoal' : 'border-line text-warm-gray hover:border-charcoal hover:text-charcoal'}`}
              >
                {r.name}
                {r.status === 'active' && (
                  <span className="ms-2 inline-block w-1.5 h-1.5 rounded-full bg-brand align-middle" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 gap-3 px-5 py-3 text-muted-text text-xs font-serif uppercase tracking-wider bg-sand/60 rounded-t-lg border border-b-0 border-line">
          <div className="col-span-1 text-center">المركز</div>
          <div className="col-span-1">رقم</div>
          <div className="col-span-4">الفارس</div>
          <div className="col-span-2">الخيل</div>
          <div className="col-span-1 text-center">أخطاء</div>
          <div className="col-span-2 text-center">الوقت</div>
          <div className="col-span-1 text-center">النقاط</div>
        </div>

        {/* Rows */}
        {rows.length === 0 && (
          <div className="text-center py-24 border border-line rounded-b-lg bg-surface">
            <div className="w-16 h-16 rounded-full border-2 border-line flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl text-muted-text/30">◎</span>
            </div>
            <p className="text-charcoal font-black text-xl mb-2">بانتظار النتائج المعتمدة</p>
            <p className="text-muted-text text-sm font-serif max-w-xs mx-auto leading-relaxed">
              ستظهر النتائج هنا فور اعتمادها ونشرها من قِبل إدارة البطولة
            </p>
          </div>
        )}

        <div className="border border-t-0 border-line rounded-b-lg overflow-hidden">
          {rows.map((r, i) => {
            const medal = getMedal(r.rank)
            const totalFaults = r.faults.reduce((s, f) => s + f.count, 0)
            const effectiveScore = getEffectiveScore(r, filtered)
            const isCurrentLive = r.id === liveId

            return (
              <div
                key={r.id}
                className={`grid grid-cols-12 gap-3 px-5 py-4 items-center transition-colors ${i < rows.length - 1 ? 'border-b border-line' : ''} ${isCurrentLive ? 'bg-brand/4 border-brand/10' : r.rank <= 3 ? medal.bg + ' ' : 'bg-surface hover:bg-sand/30'}`}
              >
                {/* Rank */}
                <div className="col-span-1 flex justify-center">
                  {r.rank <= 3 ? (
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center ${medal.border}`}>
                      <span className={`text-sm font-black ${medal.text}`}>{medal.symbol}</span>
                    </div>
                  ) : (
                    <span className="text-muted-text font-serif text-sm tabular-nums">{r.rank}</span>
                  )}
                </div>

                {/* Bib */}
                <div className="col-span-1">
                  <span className="font-serif text-lg text-charcoal/25 font-light tabular-nums">{r.competitionNumber}</span>
                </div>

                {/* Player */}
                <div className="col-span-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className={`font-bold text-sm leading-tight ${r.rank <= 3 ? 'text-charcoal' : 'text-charcoal'}`}>{r.playerName}</p>
                      <p className="text-muted-text text-xs font-serif">{r.roundName}</p>
                    </div>
                    {isCurrentLive && (
                      <span className="flex items-center gap-1 bg-brand/10 border border-brand/25 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                        <span className="text-brand text-[9px] font-bold">LIVE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Horse */}
                <div className="col-span-2">
                  <p className="text-warm-gray text-sm font-serif truncate">{r.horseName}</p>
                </div>

                {/* Faults */}
                <div className="col-span-1 text-center">
                  <span className={`text-lg font-black tabular-nums ${totalFaults === 0 ? 'text-charcoal' : 'text-brand'}`}>
                    {totalFaults}
                  </span>
                </div>

                {/* Time */}
                <div className="col-span-2 text-center">
                  <span className="font-serif text-base text-charcoal tabular-nums">{r.time}</span>
                </div>

                {/* Score */}
                <div className="col-span-1 text-center">
                  <span className={`text-xl font-black tabular-nums ${r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : r.rank === 3 ? 'text-amber-700' : 'text-charcoal'}`}>
                    {effectiveScore}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        {rows.length > 0 && (
          <div className="mt-6 flex items-center gap-6 flex-wrap">
            <p className="text-muted-text text-xs font-serif">
                نظام {tournament.type}
            </p>
            <div className="w-px h-4 bg-line" />
            <p className="text-muted-text text-xs">
              آخر تحديث: {rows[0]?.submittedAt ?? '—'}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-text">
              <span className="w-2 h-2 rounded-full bg-brand" />
              النتائج المعتمدة والمنشورة فقط
            </div>
          </div>
        )}
      </section>

      {/* Ruleset info strip */}
      <section className="border-t border-line bg-sand/40 py-10">
        <div className="max-w-screen-xl mx-auto px-8 lg:px-16">
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-4">نظام التقييم — الكر والفر</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { score: '4 نقاط', cond: 'المركز الأول — ٠ أخطاء' },
              { score: '3 نقاط', cond: 'المركز الثاني — ٠ أخطاء' },
              { score: '2 نقطة', cond: 'المركز الثالث — ٠ أخطاء' },
              { score: '0.5 نقطة', cond: 'خطأ واحد — وقت تنافسي' },
            ].map((s) => (
              <div key={s.score} className="bg-surface border border-line rounded-lg px-4 py-3">
                <p className="text-brand font-black text-lg mb-0.5">{s.score}</p>
                <p className="text-muted-text text-xs">{s.cond}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
