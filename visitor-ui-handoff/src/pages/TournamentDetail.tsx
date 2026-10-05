import { useState, useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import SiteImage from '../components/SiteImage'
import { useInView } from '../hooks/useInView'
import HRRideLogo, { HRRideWatermark } from '../components/HRRideLogo'
import { apiGet } from '../lib/api'
import { KARR_FAR_SCORING_DESCRIPTION } from '../lib/karrFarRules'
import { compareTotalScoreAndTime, formatElapsedTime, getEffectiveScore, getRoundPosition, getTotalElapsedTime, parseTimeValue, recalculateRoundScores, sortRoundResults } from '../lib/scoring'
import { generatePDF } from './TournamentArchive'
import type { Appeal, JudgeResult, Tournament, TournamentArchive } from '../lib/types'

interface Props {
  tournamentId: string | null
  onNavigate: (page: string) => void
}

interface RoundData {
  num: string
  name: string
  date: string
  status: string
  count: string
}

interface ParticipantRow {
  id?: string
  playerId?: string
  player_id?: string
  horseId?: string
  horse_id?: string
  competitionNumber?: string | number
  competition_number?: string | number
  status?: string
  name?: string
  bib?: string
  horse?: string
  country?: string
  category?: string
  disqualifiedReason?: string
}

interface WebsiteParticipant {
  id: string
  playerId: string
  bib: string
  name: string
  horse: string
  country: string
  category: string
  status: string
  disqualifiedReason?: string
}

interface PublicAppeal {
  id: string
  player_id?: string
  playerId?: string
  reason?: string
  text?: string
  round?: string | number | null
  status?: string
  admin_notes?: string
  adminResponse?: string
  submitted_at?: string
  submittedAt?: string
}

interface PublicRider {
  id: string
  name: string
  country?: string
  horse?: string
}

interface PublicHorse {
  id: string
  name: string
}

function Reveal({ children, className = '', threshold = 0.12 }: { children: React.ReactNode; className?: string; threshold?: number }) {
  const { ref, inView } = useInView(threshold)
  return (
    <div ref={ref} className={`transition-all duration-1000 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}>
      {children}
    </div>
  )
}

function formatTournamentDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function TournamentDetail({ tournamentId, onNavigate }: Props) {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [rounds, setRounds] = useState<RoundData[]>([])
  const [participants, setParticipants] = useState<WebsiteParticipant[]>([])
  const [results, setResults] = useState<JudgeResult[]>([])
  const [appeals, setAppeals] = useState<PublicAppeal[]>([])
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(() => new Set())
  const [resultsLoadError, setResultsLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTournament = async () => {
      setResultsLoadError(false)
      setResults([])
      setExpandedRounds(new Set())
      if (!tournamentId) {
        setError('معرف البطولة غير موجود')
        setLoading(false)
        return
      }

      try {
        const [data, riders, horses, publicResults, publicAppeals] = await Promise.all([
          apiGet<Tournament>(`/tournaments/${tournamentId}`),
          apiGet<PublicRider[]>('/players').catch(() => []),
          apiGet<PublicHorse[]>('/horses').catch(() => []),
          apiGet<unknown>(`/tournaments/${tournamentId}/results`)
            .then((payload) => {
              if (Array.isArray(payload)) return payload as JudgeResult[]
              console.error('Unexpected public tournament results payload:', payload)
              setResultsLoadError(true)
              return []
            })
            .catch((resultsError) => {
              console.error('Error fetching public tournament results:', resultsError)
              setResultsLoadError(true)
              return []
            }),
          apiGet<unknown>(`/appeals/${encodeURIComponent(tournamentId)}/public`)
            .then((payload) => Array.isArray(payload) ? payload as PublicAppeal[] : [])
            .catch(() => []),
        ])
        setTournament(data)
        setResults(publicResults)
        setAppeals(publicAppeals)

        // تحويل البيانات من API إلى الشكل المطلوب
        if (data.rounds && Array.isArray(data.rounds)) {
          const formattedRounds = data.rounds.map((round: any, index: number) => ({
            num: String(index + 1),
            name: round.name || `جولة ${index + 1}`,
            date: round.date || '',
            status: round.status || 'قادم',
            count: round.participantsCount ? `${round.participantsCount} فارساً` : '',
          }))
          setRounds(formattedRounds)
        }

        const ridersById = new Map(riders.map((rider) => [rider.id, rider]))
        const horsesById = new Map(horses.map((horse) => [horse.id, horse]))
        const participantRows = Array.isArray(data.participants) ? data.participants as ParticipantRow[] : []
        setParticipants(participantRows.map((participant, index) => {
            const playerId = participant.playerId ?? participant.player_id ?? ''
            const horseId = participant.horseId ?? participant.horse_id ?? ''
            const rider = ridersById.get(playerId)
            const horse = horsesById.get(horseId)
            const competitionNumber = participant.competitionNumber ?? participant.competition_number ?? participant.bib
            return {
              id: String(participant.id ?? playerId ?? index),
              playerId,
              bib: String(competitionNumber ?? index + 1).padStart(2, '0'),
              name: participant.name ?? rider?.name ?? 'فارس غير مسجل',
              horse: participant.horse ?? horse?.name ?? rider?.horse ?? '',
              country: participant.country ?? rider?.country ?? '',
              category: participant.category ?? '',
              status: participant.status ?? 'active',
              disqualifiedReason: participant.disqualifiedReason ?? participant.disqualified_reason,
            }
          }))

        setError(null)
      } catch (err) {
        console.error('Error fetching tournament:', err)
        setError('حدث خطأ في جلب بيانات البطولة')
      } finally {
        setLoading(false)
      }
    }

    fetchTournament()
  }, [tournamentId])

  if (loading) {
    return (
      <div className="bg-ivory min-h-screen flex items-center justify-center">
        <p className="text-charcoal text-lg">جاري تحميل البطولة...</p>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="bg-ivory min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-charcoal text-lg font-bold mb-4">{error || 'البطولة غير موجودة'}</p>
          <button
            onClick={() => onNavigate('tournament')}
            className="bg-brand text-ivory px-6 py-2 rounded-lg hover:bg-brand-hover transition-colors"
          >
            العودة للبطولات ←
          </button>
        </div>
      </div>
    )
  }

  const publicDate = tournament.websiteTargetDate
    ? formatTournamentDateTime(tournament.websiteTargetDate)
    : tournament.date || 'تاريخ غير محدد'
  const resultsByRound = new Map<number, JudgeResult[]>()
  for (const result of results) {
    const roundResults = resultsByRound.get(result.roundNumber) ?? []
    roundResults.push(result)
    resultsByRound.set(result.roundNumber, roundResults)
  }
  const resultRounds = rounds.length > 0
    ? rounds.map((round) => {
        const roundNumber = Number(round.num)
        return [roundNumber, resultsByRound.get(roundNumber) ?? []] as [number, JudgeResult[]]
      })
    : [...resultsByRound.entries()].sort(([left], [right]) => left - right)
  const approvedResults = results.filter((result) => result.status === 'approved')
  const resultScores = recalculateRoundScores(approvedResults)
  const rankingByParticipant = new Map<string, { name: string; competitionNumber: string; results: JudgeResult[]; totalScore: number; totalFaults: number }>()
  for (const result of approvedResults) {
    const key = result.competitionNumber || result.playerId
    const row = rankingByParticipant.get(key) ?? {
      name: result.playerName,
      competitionNumber: result.competitionNumber,
      results: [],
      totalScore: 0,
      totalFaults: 0,
    }
    row.results.push(result)
    row.totalScore += resultScores.get(result.id) ?? 0
    row.totalFaults += result.faults.reduce((sum, fault) => sum + fault.count, 0)
    rankingByParticipant.set(key, row)
  }
  const overallRanking = [...rankingByParticipant.values()]
    .map((row) => ({ ...row, totalTimeMs: getTotalElapsedTime(row.results) }))
    .sort((a, b) => compareTotalScoreAndTime(
      { totalScore: a.totalScore, totalTimeMs: a.totalTimeMs, competitionNumber: a.competitionNumber },
      { totalScore: b.totalScore, totalTimeMs: b.totalTimeMs, competitionNumber: b.competitionNumber },
    ))
  const disqualifiedParticipants = participants.filter((participant) => participant.status === 'disqualified')
  const disqualificationResults = approvedResults.filter((result) =>
    result.faults.some((fault) => fault.count > 0 && fault.name.toLowerCase().includes('استبعاد')),
  )
  const disqualificationsByNumber = new Map(disqualifiedParticipants.map((participant) => [participant.bib, {
    competitionNumber: participant.bib,
    playerName: participant.name,
    reason: participant.disqualifiedReason || 'مستبعد من البطولة',
  }]))
  for (const result of disqualificationResults) {
    disqualificationsByNumber.set(result.competitionNumber, {
      competitionNumber: result.competitionNumber,
      playerName: result.playerName,
      reason: result.faults.filter((fault) => fault.count > 0 && fault.name.toLowerCase().includes('استبعاد')).map((fault) => fault.name).join('، '),
    })
  }
  const disqualifications = [...disqualificationsByNumber.values()]
  const judgeNames = [...new Set(approvedResults.map((result) => result.judgeName).filter(Boolean))]
  const appealPlayerById = new Map(participants.map((participant) => [participant.playerId, participant]))
  const toggleRoundResults = (roundNumber: number) => {
    setExpandedRounds((current) => {
      const next = new Set(current)
      if (next.has(roundNumber)) next.delete(roundNumber)
      else next.add(roundNumber)
      return next
    })
  }
  const downloadTournamentArchive = () => {
    const archive: TournamentArchive = {
      tournamentId: tournament.id,
      name: tournament.name,
      type: tournament.type,
      date: tournament.date,
      location: tournament.location || tournament.venue || '',
      description: tournament.description,
      totalRounds: tournament.totalRounds || rounds.length,
      participantCount: participants.length,
      judgeNames,
      status: tournament.status,
      archivedAt: tournament.status === 'archived' ? 'تمت أرشفته' : new Date().toLocaleDateString('ar-IQ'),
      archivedBy: 'إدارة البطولة',
      reportVersion: 1,
      rulesetSnapshot: {
        rulesetId: tournament.rulesetId,
        name: tournament.type,
        description: tournament.description,
        scoringDescription: KARR_FAR_SCORING_DESCRIPTION,
        rounds: tournament.totalRounds || rounds.length,
        faults: tournament.faults ?? [],
        snapshotAt: new Date().toLocaleDateString('ar-IQ'),
      },
      participants: participants.map((participant) => ({
        competitionNumber: participant.bib,
        playerName: participant.name,
        playerId: participant.playerId,
        horseName: participant.horse,
        category: participant.category,
        status: participant.status === 'disqualified' ? 'disqualified' : participant.status === 'withdrawn' ? 'withdrawn' : 'active',
        disqualifiedReason: participant.disqualifiedReason,
      })),
      results: approvedResults.map((result) => ({
        id: result.id,
        tournamentId: result.tournamentId,
        roundId: result.roundId,
        playerId: result.playerId,
        competitionNumber: result.competitionNumber,
        playerName: result.playerName,
        roundNumber: result.roundNumber,
        roundName: result.roundName,
        time: result.time,
        faults: result.faults,
        systemScore: resultScores.get(result.id) ?? 0,
        status: 'approved',
        published: result.published,
        judgeName: result.judgeName,
        submittedAt: result.submittedAt,
        approvedBy: result.approvedBy,
        approvedAt: result.approvedAt,
        rejectedReason: result.rejectedReason,
      })),
      disqualifications: disqualifications.map((item) => {
        const sourceResult = disqualificationResults.find((result) => result.competitionNumber === item.competitionNumber)
        return {
          competitionNumber: item.competitionNumber,
          playerName: item.playerName,
          roundName: sourceResult?.roundName || '—',
          reason: item.reason,
          by: sourceResult?.approvedBy || sourceResult?.judgeName || 'إدارة البطولة',
          at: sourceResult?.approvedAt || sourceResult?.submittedAt || '',
        }
      }),
      appeals: appeals.map((appeal) => {
        const player = appealPlayerById.get(appeal.player_id ?? appeal.playerId ?? '')
        return {
          competitionNumber: player?.bib ?? '',
          playerName: player?.name ?? 'مشارك',
          roundName: appeal.round ? `الجولة ${appeal.round}` : undefined,
          text: appeal.reason ?? appeal.text ?? '',
          status: appeal.status === 'reviewed' || appeal.status === 'reviewing'
            ? 'reviewed'
            : appeal.status === 'dismissed' || appeal.status === 'rejected' ? 'dismissed' : 'pending',
          submittedAt: appeal.submitted_at ?? appeal.submittedAt ?? '',
          adminResponse: appeal.admin_notes ?? appeal.adminResponse,
        }
      }),
      auditLog: [],
    }
    generatePDF(archive, new Set(['info', 'rules', 'participants', 'rounds', 'ranking', 'disqualifications', 'appeals']))
  }

  return (
    <div className="bg-ivory">
      <SiteHeader transparent onNavigate={onNavigate} />

      {/* Hero */}
      <section className="relative h-[78svh] min-h-[32rem] sm:h-[80vh] sm:min-h-[560px] overflow-hidden bg-charcoal">
        {/* Imposed watermark */}
        <div className="absolute -top-10 -left-10 pointer-events-none select-none">
          <HRRideWatermark color="#ffffff" size={500} opacity={0.05} />
        </div>
        <SiteImage
          src={tournament.websiteHeroImage || 'https://images.unsplash.com/photo-1695133994223-02698c56f100?w=1920&h=1080&fit=crop&auto=format'}
          alt={tournament.websiteTitle || tournament.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/30 to-charcoal/20" />

        <button onClick={() => onNavigate('tournament')} className="absolute right-5 top-20 z-10 min-h-11 rounded-xl border border-white/50 bg-charcoal/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm sm:right-8">
          ← كل البطولات
        </button>

        <div className="absolute bottom-10 right-5 left-5 sm:bottom-14 sm:right-8 sm:left-8 lg:right-16 max-w-xl">
          <span className="inline-block bg-brand text-ivory text-xs font-black px-3 py-1.5 rounded mb-4 sm:mb-5 tracking-wide">
            {tournament.status === 'completed' ? 'منتهي' : tournament.status === 'active' ? 'جاري' : 'قادم'} · {publicDate}
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-white leading-tight lg:leading-none mb-3 break-words">
            {tournament.websiteTitle || tournament.name}
          </h1>
          <p className="text-white/60 text-lg">{tournament.location || 'موقع غير محدد'}</p>
        </div>
      </section>

      {/* Overview bar */}
      <section className="max-w-screen-xl mx-auto px-5 sm:px-8 lg:px-16 py-12 sm:py-16 lg:py-20">
        <Reveal>
          <div className="mb-10 grid grid-cols-2 gap-3 sm:mb-20 sm:grid-cols-3">
            {[
              { label: 'التاريخ والوقت', val: publicDate, className: 'col-span-2 sm:col-span-1' },
              { label: 'المكان', val: tournament.venue || tournament.location || 'غير محدد' },
              { label: 'المشاركون', val: `${participants.length || 0} فارساً` },
            ].map((item, i) => (
              <div key={item.label} className={`${item.className ?? ''} min-w-0 rounded-xl border border-line bg-surface px-4 py-4 sm:px-6 sm:py-6`}>
                <p className="mb-2 font-serif text-[10px] uppercase tracking-widest text-muted-text sm:text-xs">{item.label}</p>
                <p className="break-words text-sm font-bold leading-relaxed text-charcoal sm:text-lg">{item.val}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mb-14 sm:mb-20 flex justify-start">
          <button
            onClick={() => document.getElementById('tournament-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="inline-flex min-h-11 items-center gap-2 bg-brand px-5 py-3 text-sm font-black text-ivory transition-colors hover:bg-brand-hover"
          >
            النتائج والتفاصيل
            {approvedResults.length > 0 && <span className="border-r border-ivory/30 pr-2 text-xs font-semibold">{approvedResults.length} نتيجة</span>}
            <span aria-hidden="true">↓</span>
          </button>
        </div>

        {/* About */}
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-14 sm:mb-20">
            <div>
              <div className="w-10 h-px bg-brand mb-7" />
              <h2 className="text-3xl sm:text-4xl font-black text-charcoal mb-5 sm:mb-7 leading-snug">عن البطولة</h2>

                <section>
                  <div className="mb-5 border-b border-line pb-3">
                    <p className="font-serif text-[11px] tracking-[0.2em] text-muted-text">طاقم التحكيم</p>
                    <h3 className="mt-1 text-2xl font-black text-charcoal">الحكام</h3>
                  </div>
                  {judgeNames.length === 0 ? (
                    <p className="text-sm text-muted-text">لا توجد نتائج معتمدة بأسماء الحكام بعد.</p>
                  ) : (
                    <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                      {judgeNames.map((judgeName) => (
                        <div key={judgeName} className="flex items-center justify-between gap-4 bg-surface p-4 sm:p-5">
                          <span className="font-bold text-charcoal">{judgeName}</span>
                          <span className="text-xs text-muted-text">{approvedResults.filter((result) => result.judgeName === judgeName).length} نتيجة معتمدة</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              <p className="text-base sm:text-lg text-warm-gray leading-loose font-light mb-5">
                {tournament.websiteDescription || tournament.description || 'لا توجد وصف متاح للبطولة'}
              </p>
              <p className="text-warm-gray text-base leading-loose font-light">
                عدد الجولات: {tournament.totalRounds || rounds.length}
              </p>
            </div>
            <div className="aspect-[4/3] overflow-hidden bg-sand">
              <SiteImage
                src={tournament.websiteAboutImage || 'https://images.unsplash.com/photo-1497624138727-ebc770ef361e?w=900&h=700&fit=crop&auto=format'}
                alt="تفاصيل البطولة"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>
        </Reveal>

        {/* Official tournament report */}
        <Reveal threshold={0.02}>
          <div id="tournament-report" className="mb-16 scroll-mt-8 sm:mb-24">
            <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-brand mb-3">التقرير الرسمي</p>
            <h2 className="text-3xl sm:text-4xl font-black text-charcoal mb-3">تقرير البطولة</h2>
            <p className="text-muted-text text-sm mb-8">{tournament.type} · {publicDate} · {tournament.location || 'الموقع غير محدد'}</p>
            {resultsLoadError ? (
              <p className="border border-dashed border-line px-5 py-10 text-center text-sm text-muted-text">تعذر تحميل نتائج البطولة حالياً.</p>
            ) : (
              <div className="space-y-14">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                  {[
                    { label: 'المشاركون', value: participants.length },
                    { label: 'الجولات', value: rounds.length },
                    { label: 'النتائج المعتمدة', value: approvedResults.length },
                    { label: 'الحكام', value: judgeNames.length },
                  ].map((item) => (
                    <div key={item.label} className="bg-surface px-4 py-5 sm:px-6">
                      <p className="text-xs text-muted-text">{item.label}</p>
                      <p className="mt-1 text-2xl font-black text-charcoal">{item.value}</p>
                    </div>
                  ))}
                </div>

                <section>
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <p className="font-serif text-[11px] tracking-[0.2em] text-muted-text">{['completed', 'archived'].includes(tournament.status) ? 'النتيجة النهائية' : 'النتيجة الحالية'}</p>
                      <h3 className="mt-1 text-2xl font-black text-charcoal">الترتيب العام</h3>
                    </div>
                    <p className="text-xs text-muted-text">مجموع النقاط، ثم إجمالي الوقت عند التعادل</p>
                  </div>
                  {overallRanking.length === 0 ? (
                    <p className="py-8 text-sm text-muted-text">لا توجد نتائج معتمدة حتى الآن.</p>
                  ) : (
                    <>
                      <div className="mb-6 grid grid-cols-3 gap-2 overflow-hidden rounded-xl border border-line bg-line sm:gap-px">
                        {overallRanking.slice(0, 3).map((row, index) => (
                          <div key={row.competitionNumber} className={`min-w-0 rounded-lg bg-surface p-2.5 text-center sm:rounded-none sm:p-6 ${index === 0 ? 'border-t-2 border-t-brand' : ''}`}>
                            <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-between sm:gap-3">
                              <span className="font-serif text-[10px] text-brand sm:text-sm">المركز {index + 1}</span>
                              <span className="font-serif text-[9px] text-muted-text sm:text-xs">رقم {row.competitionNumber}</span>
                            </div>
                            <p className="mt-2 min-h-8 break-words text-xs font-black leading-snug text-charcoal sm:mt-3 sm:text-base">{row.name}</p>
                            <p className="mt-1 text-sm font-black text-brand sm:mt-2 sm:text-lg">{row.totalScore} نقطة</p>
                            <p className="mt-1 break-words text-[9px] leading-snug text-muted-text sm:text-xs">{row.totalTimeMs === null ? '—' : formatElapsedTime(row.totalTimeMs)} · {row.totalFaults} أخطاء</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:hidden">
                        {overallRanking.map((row, index) => (
                          <div key={row.competitionNumber} className={`min-w-0 rounded-xl border bg-surface p-2.5 ${index < 3 ? 'border-brand/30' : 'border-line'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-serif text-[10px] font-bold text-brand">المركز {index + 1}</span>
                              <span className="font-serif text-[10px] text-muted-text">رقم {row.competitionNumber}</span>
                            </div>
                            <p className="mt-2 truncate text-xs font-black text-charcoal">{row.name}</p>
                            <div className="mt-2 flex items-baseline justify-between gap-1">
                              <span className="text-xs font-black text-brand">{row.totalScore} نقطة</span>
                              <span className="truncate font-serif text-[9px] tabular-nums text-muted-text">{row.totalTimeMs === null ? '—' : formatElapsedTime(row.totalTimeMs)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden overflow-x-auto border-y border-line sm:block">
                        <table className="w-full min-w-[640px] text-right text-sm">
                          <thead className="bg-sand/50 text-xs text-muted-text">
                            <tr><th className="px-4 py-3">المركز</th><th className="px-4 py-3">الرقم</th><th className="px-4 py-3">الفارس</th><th className="px-4 py-3">النقاط</th><th className="px-4 py-3">الأخطاء</th><th className="px-4 py-3">إجمالي الوقت</th></tr>
                          </thead>
                          <tbody>
                            {overallRanking.map((row, index) => (
                              <tr key={row.competitionNumber} className="border-t border-line/70">
                                <td className="px-4 py-3 font-serif text-brand">{index + 1}</td>
                                <td className="px-4 py-3 font-serif text-muted-text">{row.competitionNumber}</td>
                                <td className="px-4 py-3 font-bold text-charcoal">{row.name}</td>
                                <td className="px-4 py-3 font-black text-brand">{row.totalScore}</td>
                                <td className="px-4 py-3 text-muted-text">{row.totalFaults}</td>
                                <td className="px-4 py-3 font-serif tabular-nums text-warm-gray">{row.totalTimeMs === null ? '—' : formatElapsedTime(row.totalTimeMs)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>

                <section>
                  <div className="mb-5 border-b border-line pb-3">
                    <p className="font-serif text-[11px] tracking-[0.2em] text-muted-text">تفاصيل الجولات</p>
                    <h3 className="mt-1 text-2xl font-black text-charcoal">نتائج كل جولة</h3>
                  </div>
                  {resultRounds.length === 0 ? (
                    <p className="py-6 text-sm text-muted-text">لا توجد نتائج معتمدة حتى الآن.</p>
                  ) : (
                    <div className="space-y-10">
                      {resultRounds.map(([roundNumber, roundResults]) => {
                        const rankedResults = sortRoundResults(roundResults)
                        const podiumResults = rankedResults.filter((result) => getRoundPosition(result, roundResults) <= 3)
                        const roundName = rounds.find((round) => Number(round.num) === roundNumber)?.name
                          || rankedResults[0]?.roundName
                          || `الجولة ${roundNumber}`
                        return (
                          <div key={roundNumber}>
                            <h4 className="mb-4 text-xl font-black text-charcoal">{roundName}</h4>
                            {rankedResults.length === 0 ? (
                              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted-text">لا توجد نتائج معتمدة في هذه الجولة بعد.</p>
                            ) : <>
                            <p className="mb-2 text-xs text-muted-text">المراكز الثلاثة الأولى</p>
                            <div className="mb-4 grid grid-cols-3 gap-2 overflow-hidden rounded-xl border border-line bg-line sm:gap-px">
                              {podiumResults.map((result) => {
                                const position = getRoundPosition(result, roundResults)
                                return <div key={result.id} className="min-w-0 rounded-lg bg-surface p-2.5 text-center sm:rounded-none sm:p-5">
                                  <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-between sm:gap-2">
                                    <span className="font-serif text-[10px] text-brand sm:text-xs">م{position}</span>
                                    <span className="font-serif text-[9px] text-muted-text sm:text-xs">رقم {result.competitionNumber}</span>
                                  </div>
                                  <p className="mt-2 min-h-8 break-words text-xs font-bold leading-snug text-charcoal sm:text-sm">{result.playerName}</p>
                                  <p className="mt-1 break-words text-[10px] font-serif text-brand sm:text-sm">{getEffectiveScore(result, roundResults)} نقطة · {result.time}</p>
                                </div>
                              })}
                            </div>
                            <button
                              type="button"
                              aria-expanded={expandedRounds.has(roundNumber)}
                              aria-controls={`round-results-${roundNumber}`}
                              onClick={() => toggleRoundResults(roundNumber)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-right transition-colors hover:bg-sand/50"
                            >
                              <span className="text-sm font-bold text-charcoal">
                                {expandedRounds.has(roundNumber) ? 'إخفاء نتائج الجولة' : `عرض نتائج الجولة ${roundNumber}`}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-muted-text">
                                <span>{rankedResults.length} نتيجة</span>
                                <span aria-hidden="true">{expandedRounds.has(roundNumber) ? '−' : '+'}</span>
                              </span>
                            </button>
                            {expandedRounds.has(roundNumber) && <div id={`round-results-${roundNumber}`} className="mt-3">
                            <p className="mb-2 text-xs text-muted-text">نتائج الجولة {roundNumber}</p>
                            <div className="grid grid-cols-2 gap-2 sm:hidden">
                              {rankedResults.map((result, index) => (
                                <div key={result.id} className="min-w-0 rounded-lg border border-line bg-surface p-3">
                                  <div className="flex items-center justify-between gap-1 text-[10px] text-muted-text">
                                    <span>المركز {getRoundPosition(result, roundResults)}</span>
                                    <span>رقم {result.competitionNumber}</span>
                                  </div>
                                  <p className="mt-2 truncate text-xs font-bold text-charcoal">{result.playerName}</p>
                                  <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
                                    <span className="font-serif tabular-nums text-warm-gray">{result.time}</span>
                                    <span className="font-black text-brand">{getEffectiveScore(result, roundResults)} ن</span>
                                  </div>
                                  <p className="mt-1 text-[9px] text-muted-text">الأخطاء: {result.faults.reduce((sum, fault) => sum + fault.count, 0)}</p>
                                </div>
                              ))}
                            </div>
                            <div className="hidden overflow-x-auto border-y border-line sm:block">
                              <table className="w-full min-w-[720px] text-right text-sm">
                                <thead className="bg-sand/50 text-xs text-muted-text">
                                  <tr><th className="px-4 py-3">المركز</th><th className="px-4 py-3">الرقم</th><th className="px-4 py-3">الفارس</th><th className="px-4 py-3">الخيل</th><th className="px-4 py-3">الوقت</th><th className="px-4 py-3">الأخطاء</th><th className="px-4 py-3">النقاط</th></tr>
                                </thead>
                                <tbody>
                                  {rankedResults.map((result) => (
                                    <tr key={result.id} className="border-t border-line/70">
                                      <td className="px-4 py-3 font-serif text-brand">{getRoundPosition(result, roundResults)}</td>
                                      <td className="px-4 py-3 font-serif text-muted-text">{result.competitionNumber}</td>
                                      <td className="px-4 py-3 font-bold text-charcoal">{result.playerName}</td>
                                      <td className="px-4 py-3 text-warm-gray">{result.horseName || '—'}</td>
                                      <td className="px-4 py-3 font-serif tabular-nums text-warm-gray">{result.time}</td>
                                      <td className="px-4 py-3 text-muted-text">{result.faults.reduce((sum, fault) => sum + fault.count, 0)}</td>
                                      <td className="px-4 py-3 font-black text-brand">{getEffectiveScore(result, roundResults)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            </div>}
                            </>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="grid gap-10 lg:grid-cols-2">
                  <div>
                    <div className="mb-4 border-b border-line pb-3">
                      <p className="font-serif text-[11px] tracking-[0.2em] text-muted-text">القوانين</p>
                      <h3 className="mt-1 text-xl font-black text-charcoal">نظام احتساب النقاط</h3>
                    </div>
                    <p className="mb-5 text-sm leading-7 text-warm-gray">{KARR_FAR_SCORING_DESCRIPTION}</p>
                    <div className="divide-y divide-line border-y border-line">
                      {(tournament.faults ?? []).map((fault) => (
                        <div key={fault.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                          <span className="font-semibold text-charcoal">{fault.name}</span>
                          <span className="shrink-0 text-xs text-muted-text">{fault.disqualifies ? 'يؤدي للاستبعاد' : `العقوبة ${fault.penalty}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-4 border-b border-line pb-3">
                      <p className="font-serif text-[11px] tracking-[0.2em] text-muted-text">سجل المنافسة</p>
                      <h3 className="mt-1 text-xl font-black text-charcoal">الاستبعادات والاعتراضات</h3>
                    </div>
                    <div className="space-y-4">
                      {disqualifications.map((item) => (
                        <div key={`dq-${item.competitionNumber}`} className="border-r-2 border-brand py-1 pr-4">
                          <p className="font-bold text-charcoal">{item.playerName} · رقم {item.competitionNumber}</p>
                          <p className="mt-1 text-sm text-muted-text">{item.reason}</p>
                        </div>
                      ))}
                      {appeals.map((appeal) => {
                        const player = appealPlayerById.get(appeal.player_id ?? appeal.playerId ?? '')
                        const status = appeal.status === 'reviewed' || appeal.status === 'reviewing' ? 'تمت المراجعة' : appeal.status === 'dismissed' || appeal.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'
                        return (
                          <div key={appeal.id} className="border-r-2 border-line py-1 pr-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold text-charcoal">اعتراض · {player?.name ?? 'مشارك'}{player ? ` · رقم ${player.bib}` : ''}</p>
                              <span className="text-xs text-muted-text">{status}</span>
                            </div>
                            <p className="mt-1 text-sm text-muted-text">{appeal.reason ?? appeal.text ?? ''}</p>
                            {(appeal.admin_notes || appeal.adminResponse) && <p className="mt-1 text-sm text-warm-gray">القرار: {appeal.admin_notes ?? appeal.adminResponse}</p>}
                          </div>
                        )
                      })}
                      {disqualifications.length === 0 && appeals.length === 0 && <p className="text-sm text-muted-text">لا توجد استبعادات أو اعتراضات مسجلة.</p>}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </Reveal>

        {/* Participants */}
        {tournament.websiteShowParticipants !== false && <Reveal>
          <div className="mb-12 sm:mb-16">
            <div className="mb-6 sm:mb-8">
              <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">دولي</p>
              <h2 className="text-3xl sm:text-4xl font-black text-charcoal">الفرسان المشاركون</h2>
            </div>

            {participants.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {participants.map((p, idx) => (
                  <div key={p.id || p.bib || idx} className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface p-3 transition-colors duration-200 hover:bg-sand sm:gap-4 sm:p-5">
                    <span className="w-7 shrink-0 font-serif text-xl leading-none text-charcoal/30 tabular-nums sm:w-10 sm:text-3xl">{p.bib || String(idx + 1).padStart(2, '0')}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-bold text-charcoal sm:text-sm">{p.name || 'فارس'}</p>
                      <p className="text-muted-text text-xs truncate">{p.horse || 'الحصان'}</p>
                      <p className="mt-0.5 truncate text-[10px] text-warm-gray sm:text-xs">{p.country || 'الدولة'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-sand/30 rounded">
                <p className="text-muted-text">لم يتم تحديد المشاركين بعد</p>
              </div>
            )}
          </div>
        </Reveal>}

        {tournament.websiteShowSponsors !== false && (tournament.sponsors?.length ?? 0) > 0 && (
          <Reveal>
            <div className="mb-16">
              <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-3">بدعم من</p>
              <h2 className="text-3xl sm:text-4xl font-black text-charcoal mb-6 sm:mb-8">رعاة البطولة</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-line border border-line">
                {tournament.sponsors!.map((sponsor) => (
                  <div key={sponsor.id} className="bg-surface min-h-28 p-5 flex items-center justify-center">
                    {sponsor.logoUrl ? <SiteImage src={sponsor.logoUrl} alt={sponsor.name} className="max-h-16 max-w-full object-contain" /> : <p className="text-charcoal text-sm font-bold text-center">{sponsor.name}</p>}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        )}

      </section>

      {/* Gallery strip */}
      {(tournament.websiteImages?.length ?? 0) > 0 && (
        <section className="pb-14 sm:pb-20 bg-sand py-12 sm:py-16">
            <div className="max-w-screen-xl mx-auto px-5 sm:px-8 lg:px-16">
              <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-6 sm:mb-8">صور البطولة</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {tournament.websiteImages!.map((src, index) => (
                <div key={src} className="shrink-0 w-56 h-40 sm:w-64 sm:h-44 overflow-hidden bg-beige group">
                  <SiteImage src={src} alt={`صورة البطولة ${index + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-line bg-surface py-8 sm:py-10">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-16">
          <div>
            <h2 className="text-lg font-black text-charcoal">أرشيف البطولة الكامل</h2>
            <p className="mt-1 text-xs text-muted-text">معلومات البطولة، القوانين، المشاركون، النتائج والترتيب النهائي</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={downloadTournamentArchive} className="min-h-12 rounded-xl bg-brand px-6 py-3 text-sm font-black text-ivory transition-colors hover:bg-brand-hover">
              تنزيل أرشيف البطولة PDF
            </button>
            <button onClick={() => onNavigate('home')} className="min-h-12 rounded-xl border border-line px-6 py-3 text-sm font-bold text-charcoal transition-colors hover:bg-sand">
              العودة للرئيسية
            </button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
