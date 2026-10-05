import { useEffect, useState } from 'react'
import type { LiveDisplayState, JudgeResult, TournamentSponsor } from '../lib/types'
import { getEffectiveScore } from '../lib/scoring'

interface Props {
  liveState: LiveDisplayState
  judgeResults?: JudgeResult[]
  tournaments?: { id: string; name: string; status: string; logoUrl?: string; sponsors?: TournamentSponsor[]; logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'center'; logoSize?: number; rounds?: Array<{ id: string; name: string; status: string; number?: number }> }[]
}

interface LiveTimer {
  elapsed: number
  running: boolean
  competitionNumber: string
  playerName: string
  tournamentId: string
  roundId: string
}


function parseTime(t: string): number {
  if (!t) return Infinity
  const [minSec, ms = '0'] = t.split('.')
  const [min = '0', sec = '0'] = minSec.split(':')
  return parseInt(min) * 60000 + parseInt(sec) * 1000 + parseInt(ms)
}
function fmt(t: string): string {
  if (!t) return t
  const [minSec, frac = '00'] = t.split('.')
  return `${minSec}.${frac.slice(0, 2).padEnd(2, '0')}`
}

function fmtTimer(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const hundredths = Math.floor((ms % 1000) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

/* ── Logo (uses PNG with multiply blend — white becomes transparent) ── */
function Logo({ size = 180 }: { size?: number }) {
  return (
    <img
      src="/ridex-logo.svg"
      alt="رايد إكس"
      style={{ width: size, height: 'auto', mixBlendMode: 'multiply' }}
      className="select-none pointer-events-none"
    />
  )
}

/* ── Faint watermark horse mark ── */
function HorseMark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
      <img
        src="/ridex-logo.svg"
        alt=""
        style={{
          width: '70vw',
          maxWidth: 900,
          opacity: 0.04,
          mixBlendMode: 'multiply',
          transform: 'translate(15%, 5%)',
          filter: 'saturate(0)',
        }}
      />
    </div>
  )
}

/* ── Sidebar leaderboard ─────────────────────────────── */
function Leaderboard({ results, currentCompNum, roundName }: {
  results: JudgeResult[]
  currentCompNum?: string
  roundName: string
}) {
  const sorted = [...results]
    .filter(r => r.status === 'approved' || r.status === 'pending')
    .sort((a, b) => parseTime(a.time) - parseTime(b.time))
    .slice(0, 12)

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#E2D9CE]">
        <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060] mb-0.5">الترتيب</p>
        <p className="text-[#5C3D1E] text-xs font-medium">{roundName}</p>
      </div>
      <div className="flex-1 overflow-hidden py-2">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#C4A882] text-xs font-serif text-center px-4">لا توجد نتائج بعد</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {sorted.map((r, idx) => {
              const isCurrent = r.competitionNumber === currentCompNum
              const totalFaults = r.faults.reduce((s, f) => s + f.count, 0)
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-500 ${
                  isCurrent ? 'bg-[#8D381F]/12 border border-[#8D381F]/30' :
                  idx === 0 ? 'bg-amber-50 border border-amber-200/60' :
                  'hover:bg-[#F0EAE2]'
                }`}>
                  <span className={`font-serif font-light w-5 text-center text-sm shrink-0 ${
                    idx === 0 ? 'text-amber-600' : idx === 1 ? 'text-[#8D8070]' : idx === 2 ? 'text-[#B07040]' : 'text-[#C4A882]'
                  }`}>{idx + 1}</span>
                  <span className="font-serif text-[10px] text-[#C4A882] w-5 text-center shrink-0">{r.competitionNumber}</span>
                  <span className={`flex-1 text-xs font-bold truncate ${isCurrent ? 'text-[#5C1A04]' : 'text-[#3A2010]'}`}>{r.playerName}</span>
                  <span className={`font-serif text-xs tabular-nums shrink-0 ${isCurrent ? 'text-[#8D381F]' : idx === 0 ? 'text-amber-600' : 'text-[#A08060]'}`}>{fmt(r.time)}</span>
                  {totalFaults > 0 && <span className="text-[#8D381F] text-[9px] font-black w-4 text-center shrink-0">{totalFaults}×</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {sorted[0] && (
        <div className="border-t border-[#E2D9CE] px-5 py-3 bg-amber-50/60">
          <p className="text-amber-600/70 text-[9px] tracking-[0.3em] uppercase font-serif mb-1">المتصدر</p>
          <p className="text-[#3A2010] text-xs font-black truncate">{sorted[0].playerName}</p>
          <p className="text-amber-600 font-serif text-sm tabular-nums mt-0.5">{fmt(sorted[0].time)}</p>
        </div>
      )}
    </div>
  )
}

/* ── Waiting sidebar: queue + top 10 ─────────────────── */
function WaitingSidebar({ results, tournamentId, roundId, participantNumbers = [] }: {
  results: JudgeResult[]
  tournamentId?: string
  roundId?: string
  participantNumbers?: string[]
}) {
  const roundResults = results.filter(r => r.tournamentId === tournamentId && r.roundId === roundId)
  const submitted = new Set(roundResults.map(r => r.competitionNumber))
  const allCompetitionNumbers = participantNumbers.length > 0
    ? participantNumbers.map((n) => String(n).trim()).filter(Boolean)
    : Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'))
  const remaining = allCompetitionNumbers.filter(n => !submitted.has(n))
  const top10 = [...roundResults].sort((a, b) => parseTime(a.time) - parseTime(b.time)).slice(0, 10)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Queue */}
      <div className="shrink-0">
        <div className="px-5 py-3 border-b border-[#E2D9CE]">
          <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060] mb-0.5">قائمة الانتظار</p>
          <p className="text-[#8D6040] text-xs">{remaining.length} مشارك متبقي</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {remaining.slice(0, 18).map(n => (
              <span key={n} className="font-serif text-xs text-[#A08060] border border-[#E2D9CE] rounded-lg w-9 h-9 flex items-center justify-center bg-white/60">
                {n}
              </span>
            ))}
            {remaining.length > 18 && <span className="text-[10px] text-[#C4A882] font-serif self-center px-1">+{remaining.length - 18}</span>}
          </div>
        </div>
      </div>
      <div className="border-t border-[#E2D9CE] mx-4" />
      {/* Top 10 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-[#E2D9CE]/60 shrink-0">
          <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060] mb-0.5">أفضل النتائج</p>
          <p className="text-[#8D6040] text-xs">{top10.length} نتيجة</p>
        </div>
        {top10.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#C4A882] text-xs font-serif text-center px-4">لا توجد نتائج بعد</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-1">
            {top10.map((r, idx) => {
              const totalFaults = r.faults.reduce((s, f) => s + f.count, 0)
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-lg mb-0.5 ${idx === 0 ? 'bg-amber-50 border border-amber-200/50' : ''}`}>
                  <span className={`font-serif text-sm font-light w-5 text-center shrink-0 ${idx === 0 ? 'text-amber-600' : idx === 1 ? 'text-[#8D8070]' : idx === 2 ? 'text-[#B07040]' : 'text-[#C4A882]'}`}>{idx + 1}</span>
                  <span className="font-serif text-[10px] text-[#C4A882] w-5 text-center shrink-0">{r.competitionNumber}</span>
                  <span className="flex-1 text-xs font-bold text-[#3A2010] truncate">{r.playerName}</span>
                  <span className={`font-serif text-xs tabular-nums shrink-0 ${idx === 0 ? 'text-amber-600' : 'text-[#A08060]'}`}>{fmt(r.time)}</span>
                  {totalFaults > 0 && <span className="text-[#8D381F] text-[9px] font-black w-4 text-center shrink-0">{totalFaults}×</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ParticipantNumbers({ results, tournamentId, roundId, roundNumber, participantNumbers = [], featuredResult }: {
  results: JudgeResult[]
  tournamentId?: string
  roundId?: string
  roundNumber?: number
  participantNumbers?: string[]
  featuredResult?: JudgeResult | null
}) {
  const roundResults = results.filter((result) =>
    result.tournamentId === tournamentId &&
    (roundId ? result.roundId === roundId : result.roundNumber === roundNumber)
  )
  const approvedNumbers = new Set(
    roundResults
      .filter((result) => result.status === 'approved')
      .map((result) => String(Number(result.competitionNumber)))
  )
  const numbers = participantNumbers.length > 0
    ? participantNumbers
    : Array.from(new Set(roundResults.map((result) => result.competitionNumber))).sort((a, b) => Number(a) - Number(b))

  return (
    <div className="flex flex-col h-full px-5 py-5">
      <div className="flex-1 overflow-y-auto">
        <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060] mb-4">أرقام المشاركين</p>
        <div className="grid grid-cols-4 gap-2">
          {numbers.map((number) => (
            <span
              key={number}
              className={`h-10 flex items-center justify-center rounded-lg border font-serif text-sm tabular-nums ${
                approvedNumbers.has(String(Number(number)))
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                  : 'bg-white/60 border-[#E2D9CE] text-[#8D6040]'
              }`}
            >
              {number}
            </span>
          ))}
        </div>
      </div>
      {featuredResult && (
        <div className="border-t border-[#E2D9CE] pt-5 mt-5 text-center">
          <p className="text-[#A08060] text-[9px] tracking-[0.3em] uppercase font-serif mb-2">النتيجة الحالية</p>
          <p className="text-[#3A2010] text-3xl font-black truncate">{featuredResult.playerName}</p>
          <p className="text-[#8D381F] text-5xl font-serif font-light tabular-nums mt-2">{fmt(featuredResult.time)}</p>
        </div>
      )}
    </div>
  )
}

/* ── WAITING screen ──────────────────────────────────── */
function WaitingScreen({ tournamentName, roundName, results, tournamentId, roundId, roundNumber, participantNumbers = [] }: {
  tournamentName: string; roundName: string; results: JudgeResult[]
  tournamentId?: string; roundId?: string
  roundNumber?: number
  participantNumbers?: string[]
}) {
  const [dots, setDots] = useState(0)
  useEffect(() => { const id = setInterval(() => setDots(d => (d + 1) % 4), 800); return () => clearInterval(id) }, [])

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        <HorseMark />
        {/* Decorative top line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#8D381F]/30 to-transparent" />
        <div className="relative z-10 text-center px-12">
          <Logo size={200} />
          <div className="w-16 h-px bg-[#8D381F]/30 mx-auto my-8" />
          <p className="font-serif text-[11px] tracking-[0.5em] uppercase text-[#A08060] mb-2">{tournamentName}</p>
          <p className="font-serif text-sm tracking-[0.25em] text-[#C4A882] mb-12">{roundName}</p>
          <div className="flex items-center gap-3 justify-center">
            <span className="w-2 h-2 rounded-full bg-[#8D381F] animate-pulse" />
            <p className="text-[#8D6040] text-xl font-light tracking-wider">
              بانتظار المتسابق التالي{'.'.repeat(dots)}
            </p>
          </div>
        </div>
        {/* Decorative bottom line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#8D381F]/20 to-transparent" />
      </div>
      {/* Sidebar */}
      <div className="w-72 border-r border-[#E2D9CE] bg-[#F5EFE7]/60 flex flex-col">
        <ParticipantNumbers results={results} tournamentId={tournamentId} roundId={roundId} participantNumbers={participantNumbers} />
      </div>
    </div>
  )
}

/* ── BREAK screen ────────────────────────────────────── */
function BreakScreen({ tournamentName }: { tournamentName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      <HorseMark />
      <div className="relative z-10 text-center">
        <Logo size={180} />
        <div className="w-20 h-px bg-[#8D381F]/40 mx-auto my-8" />
        <p className="font-serif text-[11px] tracking-[0.45em] uppercase text-[#A08060] mb-6">{tournamentName}</p>
        <p className="text-[#3A2010] text-5xl font-black tracking-[0.25em]">استراحة</p>
        <p className="text-[#C4A882] text-sm font-serif mt-3 tracking-[0.3em]">INTERMISSION</p>
      </div>
    </div>
  )
}

/* ── PLAYER INTRO screen ─────────────────────────────── */
function PlayerIntroScreen({ result, roundName, results, participantNumbers }: {
  result: NonNullable<LiveDisplayState['result']>; roundName: string; results: JudgeResult[]
  participantNumbers: string[]
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t) }, [])

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col justify-center px-16 lg:px-24 relative" style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(20px)',
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
      }}>
        <HorseMark />
        <div className="relative z-10">
          <p className="font-serif text-[11px] tracking-[0.4em] uppercase text-[#8D381F] mb-5">{roundName}</p>
          <p className="text-[#C4A882] text-sm font-serif mb-2">رقم المشاركة</p>
          <p className="font-serif font-light text-[#8D381F]/20 leading-none mb-6 select-none"
            style={{ fontSize: 'clamp(100px, 15vw, 220px)', lineHeight: 0.85 }}>
            {result.competitionNumber}
          </p>
          <div className="w-12 h-px bg-[#8D381F]/30 mb-6" />
          <p className="text-[#1C1A17] font-black leading-tight mb-3"
            style={{ fontSize: 'clamp(32px, 5vw, 68px)' }}>
            {result.playerName}
          </p>
          {result.horseName && <p className="text-[#A08060] text-xl font-serif">{result.horseName}</p>}
        </div>
      </div>
      <div className="w-72 border-r border-[#E2D9CE] bg-[#F5EFE7]/60 flex flex-col">
        <ParticipantNumbers results={results} tournamentId={result.tournamentId} roundId={result.roundId} roundNumber={result.roundNumber} participantNumbers={participantNumbers} />
      </div>
    </div>
  )
}

function getPodiumResults(results: JudgeResult[]) {
  return [...results]
    .filter((r) => r.status === 'approved' || r.status === 'pending')
    .sort((a, b) => parseTime(a.time) - parseTime(b.time))
    .slice(0, 3)
    .map((r, index) => ({ ...r, rank: (index + 1) as 1 | 2 | 3 }))
}

function PodiumScreen({ tournamentName, roundName, results, selectedRank, selectedResult, announcedPodium = {}, podiumContext = 'round' }: {
  tournamentName: string
  roundName: string
  results: JudgeResult[]
  selectedRank?: 1 | 2 | 3 | null
  selectedResult?: JudgeResult | null
  announcedPodium?: LiveDisplayState['announcedPodium']
  podiumContext?: LiveDisplayState['podiumContext']
}) {
  const podium = getPodiumResults(results)
  const allSorted = [...results]
    .filter((r) => r.status === 'approved' || r.status === 'pending')
    .sort((a, b) => parseTime(a.time) - parseTime(b.time))

  const first = podium.find((r) => r.rank === 1)
  const second = podium.find((r) => r.rank === 2)
  const third = podium.find((r) => r.rank === 3)
  const remainingResults = allSorted.slice(3)
  const showRemainingResults = selectedRank === 3 || !selectedRank
  const activeResult = selectedRank
    ? selectedResult ?? podium.find((r) => r.rank === selectedRank) ?? podium[0]
    : null
  const announcedResults = ([2, 1, 3] as const)
    .map((rank) => ({ rank, result: announcedPodium[rank] ?? (rank === selectedRank ? activeResult : undefined) }))
    .filter((entry): entry is { rank: 1 | 2 | 3; result: JudgeResult } => Boolean(entry.result))

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-10 pt-7 pb-5 border-b border-[#E2D9CE] shrink-0">
          <Logo size={120} />
          <div className="text-center">
            <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060]">{tournamentName}</p>
            <p className="text-[#8D6040] text-xs mt-0.5">{roundName}</p>
          </div>
          <div className="text-left min-w-[140px]">
            <p className="text-[10px] text-[#A08060] font-serif tracking-widest">{podiumContext === 'final' ? 'النهائي' : roundName}</p>
            <p className="font-black text-[#1C1A17] text-2xl">{selectedRank ? `المركز ${selectedRank}` : 'المراكز الثلاثة'}</p>
          </div>
        </div>

        <div className="flex-1 flex items-end justify-center px-10 pb-10 relative overflow-hidden">
          <HorseMark />
          <div className="relative z-10 w-full max-w-6xl">
            {selectedRank && activeResult ? (
              <div className="relative isolate flex items-end justify-center gap-5 sm:gap-8 lg:gap-12 mb-6 pt-12 pb-4" dir="ltr">
                <div className="pointer-events-none absolute bottom-4 left-1/2 h-64 w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,207,73,0.24)_0%,rgba(255,230,170,0.1)_44%,transparent_72%)] blur-xl" />
                {announcedResults.map(({ rank, result: announcedResult }) => (
                  <div key={rank} className="relative z-10 flex flex-col items-center justify-end" style={rank === 2 ? { transform: 'translateY(28px)' } : rank === 3 ? { transform: 'translateY(28px)' } : undefined}>
                    <div dir="rtl" className={`relative flex flex-col items-center justify-center overflow-visible rounded-[32px] border-2 text-center shadow-[0_20px_34px_rgba(71,48,20,0.18)] ${rank === 1 ? 'h-[310px] w-[250px] border-[#F6D367] bg-gradient-to-b from-[#FFFDF8] via-[#FFF5D9] to-[#FFE29B] px-6 sm:h-[405px] sm:w-[320px] sm:shadow-[0_26px_50px_rgba(154,105,0,0.32)]' : rank === 2 ? 'h-[275px] w-[210px] border-[#D5E1E9] bg-gradient-to-b from-[#FCFEFF] via-[#EAF3F8] to-[#C7D9E7] px-5 sm:h-[345px] sm:w-[255px]' : 'h-[275px] w-[210px] border-[#F0D3BF] bg-gradient-to-b from-[#FFFDFB] via-[#F8E8DD] to-[#E9BF9E] px-5 sm:h-[345px] sm:w-[255px]'}`}>
                      <div className={`pointer-events-none absolute inset-2 rounded-[25px] border ${rank === 1 ? 'border-[#D89705]/30' : rank === 2 ? 'border-[#587286]/20' : 'border-[#9D552B]/20'}`} />
                      <div className={`absolute top-4 right-4 z-10 min-w-12 rounded-lg border px-2 py-1 text-center shadow-sm ${rank === 1 ? 'border-[#D89705]/30 bg-[#FFF8D9] text-[#916000]' : rank === 2 ? 'border-[#6E879A]/30 bg-white/70 text-[#435B6C]' : 'border-[#A3582F]/30 bg-[#FFF6F0] text-[#7D3D1D]'}`}>
                        <p className="text-[8px] font-bold tracking-wide">رقم اللاعب</p>
                        <p className="mt-0.5 font-serif text-lg leading-none">{announcedResult.competitionNumber}</p>
                      </div>
                      <div className="relative flex flex-col items-center">
                        <div className={`relative flex items-center justify-center rounded-full border-[5px] shadow-[0_10px_18px_rgba(45,31,12,0.24)] ${rank === 1 ? 'h-24 w-24 border-[#FFF2AC] bg-gradient-to-br from-[#FFE885] via-[#EFB70B] to-[#A96600] sm:h-32 sm:w-32' : rank === 2 ? 'h-20 w-20 border-[#F4FAFF] bg-gradient-to-br from-[#EDF5FC] via-[#A7BBCB] to-[#536B7D] sm:h-24 sm:w-24' : 'h-20 w-20 border-[#FFE8D7] bg-gradient-to-br from-[#F7D0B0] via-[#C47844] to-[#72300D] sm:h-24 sm:w-24'}`}>
                          <span className={`absolute inset-1.5 rounded-full border ${rank === 1 ? 'border-[#8D5900]/35' : rank === 2 ? 'border-[#334A5C]/30' : 'border-[#54220C]/30'}`} />
                          <span className={`relative font-serif leading-none ${rank === 1 ? 'text-5xl text-[#FFFBE4] drop-shadow-[0_2px_1px_rgba(93,54,0,0.45)] sm:text-6xl' : 'text-4xl text-white drop-shadow-[0_2px_1px_rgba(27,41,54,0.5)] sm:text-5xl'}`}>{rank}</span>
                        </div>
                        <div className={`relative -mt-2 min-w-28 rounded-sm border px-3 py-1 text-[9px] font-black tracking-[0.12em] shadow-sm ${rank === 1 ? 'border-[#C78700]/40 bg-[#8F5B00] text-[#FFF3BE]' : rank === 2 ? 'border-[#5B7284]/35 bg-[#546D80] text-[#F4FAFF]' : 'border-[#7B3514]/35 bg-[#82401D] text-[#FFF0E5]'}`}>
                          {rank === 1 ? 'البطل' : rank === 2 ? 'الوصيف' : 'المركز الثالث'}
                        </div>
                      </div>
                      <p className="mt-5 text-xl font-black text-[#171411] sm:text-3xl truncate w-full">{announcedResult.playerName}</p>
                      <div className={`my-4 flex w-full items-center gap-2 ${rank === 1 ? 'text-[#D89705]' : rank === 2 ? 'text-[#718A9F]' : 'text-[#AD6335]'}`}>
                        <span className="h-px flex-1 bg-current opacity-40" />
                        <span className="h-2 w-2 rotate-45 bg-current" />
                        <span className="h-px flex-1 bg-current opacity-40" />
                      </div>
                      <p className={`font-serif text-3xl tabular-nums sm:text-4xl ${rank === 1 ? 'text-[#9B6500]' : rank === 2 ? 'text-[#3C5367]' : 'text-[#6E3518]'}`}>{fmt(announcedResult.time)}</p>
                      <div className={`mt-4 flex items-center gap-2 ${rank === 1 ? 'text-[#E6AA10]' : rank === 2 ? 'text-[#8EA3B5]' : 'text-[#C8885D]'}`}>
                        <span className="h-px w-7 bg-current opacity-60" />
                        <span className="h-1.5 w-1.5 rotate-45 bg-current" />
                        <span className="h-px w-7 bg-current opacity-60" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-end justify-center gap-5 lg:gap-8 mb-6">
                {second && (
                  <div className="flex flex-col items-center justify-end" style={{ transform: 'translateY(18px)' }}>
                    <div className="mb-2 rounded-full bg-slate-200/80 px-3 py-1 text-xs font-bold text-slate-700">المركز الثاني</div>
                    <div className="w-40 lg:w-52 rounded-t-[20px] bg-gradient-to-b from-[#D7E2EA] to-[#B3C0CA] p-4 text-center shadow-lg border border-white/60" style={{ transform: 'scale(0.92)' }}>
                      <p className="text-[10px] tracking-[0.3em] text-slate-600 font-serif">{second.competitionNumber}</p>
                      <p className="mt-3 text-lg font-black text-[#1C1A17] truncate">{second.playerName}</p>
                      <p className="mt-2 text-[#405062] font-serif text-xl tabular-nums">{fmt(second.time)}</p>
                    </div>
                  </div>
                )}

                {first && (
                  <div className="flex flex-col items-center justify-end">
                    <div className="mb-2 rounded-full bg-amber-400/90 px-4 py-1 text-xs font-black text-[#3C2200]">المركز الأول</div>
                    <div className="w-48 lg:w-64 rounded-t-[26px] bg-gradient-to-b from-[#F9E7A9] via-[#F2C75C] to-[#D89F1B] p-5 text-center shadow-2xl border-2 border-[#F4D67F]" style={{ transform: 'scale(1.08)' }}>
                      <p className="text-[10px] tracking-[0.3em] text-[#7A5300] font-serif">{first.competitionNumber}</p>
                      <p className="mt-3 text-2xl font-black text-[#1C1A17] truncate">{first.playerName}</p>
                      <p className="mt-2 text-[#4C2F00] font-serif text-2xl tabular-nums">{fmt(first.time)}</p>
                    </div>
                  </div>
                )}

                {third && (
                  <div className="flex flex-col items-center justify-end" style={{ transform: 'translateY(24px)' }}>
                    <div className="mb-2 rounded-full bg-[#C98A5A]/80 px-3 py-1 text-xs font-bold text-[#3E210B]">المركز الثالث</div>
                    <div className="w-40 lg:w-52 rounded-t-[20px] bg-gradient-to-b from-[#E6C3A1] to-[#B87543] p-4 text-center shadow-lg border border-white/60" style={{ transform: 'scale(0.9)' }}>
                      <p className="text-[10px] tracking-[0.3em] text-[#4A2913] font-serif">{third.competitionNumber}</p>
                      <p className="mt-3 text-lg font-black text-[#1C1A17] truncate">{third.playerName}</p>
                      <p className="mt-2 text-[#47270F] font-serif text-xl tabular-nums">{fmt(third.time)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-[360px] border-r border-[#E2D9CE] bg-[#F5EFE7]/60 flex flex-col">
        <div className="px-5 py-4 border-b border-[#E2D9CE]">
          <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060] mb-1">المراكز التالية</p>
          <p className="text-[#5C3D1E] text-xs font-medium">من المركز الرابع فصاعداً</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {showRemainingResults && remainingResults.map((r, index) => (
            <div key={r.id} className="mx-2 mb-1 flex items-center gap-2 rounded-lg bg-white/40 px-3 py-2">
              <span className="font-serif text-sm w-5 text-center shrink-0 text-[#C4A882]">
                {index + 4}
              </span>
              <span className="font-serif text-[10px] text-[#C4A882] w-7 text-center shrink-0">{r.competitionNumber}</span>
              <span className="flex-1 text-xs font-bold text-[#3A2010] truncate">{r.playerName}</span>
              <span className="font-serif text-xs tabular-nums text-[#8D381F]">{fmt(r.time)}</span>
            </div>
          ))}
          {!showRemainingResults && (
            <p className="px-5 py-6 text-center text-xs text-[#A08060]">تظهر المراكز التالية بعد إعلان المركز الثالث</p>
          )}
          {showRemainingResults && remainingResults.length === 0 && (
            <p className="px-5 py-6 text-center text-xs text-[#A08060]">لا توجد مراكز تالية</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── RESULT screen ───────────────────────────────────── */
function ResultScreen({ result, tournamentName, roundName, results, participantNumbers, showFeaturedResult }: {
  result: NonNullable<LiveDisplayState['result']>; tournamentName: string; roundName: string; results: JudgeResult[]
  participantNumbers: string[]
  showFeaturedResult: boolean
}) {
  const totalFaults = result.faults.reduce((s, f) => s + f.count, 0)
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t) }, [])

  const allSorted = [...results].filter(r => r.status === 'approved' || r.status === 'pending').sort((a, b) => parseTime(a.time) - parseTime(b.time))
  const rank = allSorted.findIndex(r => r.competitionNumber === result.competitionNumber) + 1

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-10 pt-7 pb-5 border-b border-[#E2D9CE] shrink-0">
          <Logo size={130} />
          <div className="text-center">
            <p className="font-serif text-[9px] tracking-[0.35em] uppercase text-[#A08060]">{tournamentName}</p>
            <p className="text-[#8D6040] text-xs mt-0.5">{roundName}</p>
          </div>
          {rank > 0 ? (
            <div className="text-left min-w-[60px]">
              <p className="text-[10px] text-[#A08060] font-serif tracking-widest">الترتيب</p>
              <p className={`font-serif font-light text-4xl leading-none tabular-nums ${rank === 1 ? 'text-amber-600' : rank <= 3 ? 'text-[#8D6040]' : 'text-[#C4A882]'}`}>{rank}</p>
            </div>
          ) : <div className="w-16" />}
        </div>

        {/* Main */}
        <div className="flex-1 flex items-center px-10 lg:px-14 relative" style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(24px)',
          transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
        }}>
          <HorseMark />
          <div className="w-full relative z-10">
            {/* Ghost bib */}
            <div className="flex items-end gap-4 mb-1">
              <span className="font-serif font-light leading-none select-none" style={{
                fontSize: 'clamp(70px, 10vw, 150px)', lineHeight: 0.85, color: '#8D381F', opacity: 0.08
              }}>{result.competitionNumber}</span>
              <p className="text-[#C4A882] text-xs font-serif pb-3">رقم المشاركة</p>
            </div>

            {/* Name */}
            <h1 className="font-black leading-tight mb-2 text-[#1C1A17]" style={{ fontSize: 'clamp(28px, 4.5vw, 62px)' }}>
              {result.playerName}
            </h1>
            {result.horseName && <p className="text-[#A08060] font-serif text-lg mb-5">{result.horseName}</p>}

            {/* Time */}
            <div className="mb-7">
              <p className="text-[#C4A882] text-xs font-serif mb-1 tracking-widest">الوقت</p>
              <p className="font-serif font-light text-[#8D381F] leading-none tabular-nums"
                style={{ fontSize: 'clamp(48px, 8vw, 112px)', lineHeight: 1 }}>
                {fmt(result.time)}
              </p>
            </div>

            {/* Stats */}
            <div className="flex gap-10 lg:gap-14 items-end">
              <div>
                <p className="text-[#C4A882] text-xs tracking-widest mb-2 font-serif uppercase">الأخطاء</p>
                <p className={`font-black tabular-nums ${totalFaults === 0 ? 'text-[#1C1A17]' : 'text-[#8D381F]'}`}
                  style={{ fontSize: 'clamp(28px, 4vw, 52px)' }}>{totalFaults}</p>
              </div>
              <div>
                <p className="text-[#C4A882] text-xs tracking-widest mb-2 font-serif uppercase">النقاط</p>
                <p className="text-[#1C1A17] font-black tabular-nums" style={{ fontSize: 'clamp(28px, 4vw, 52px)' }}>{getEffectiveScore(result, results)}</p>
              </div>
              {result.faults.length > 0 && (
                <div className="pb-1">
                  <p className="text-[#C4A882] text-xs tracking-widest mb-2 font-serif uppercase">تفاصيل</p>
                  <div className="space-y-0.5">
                    {result.faults.map(f => (
                      <p key={f.faultId} className="text-[#A08060] text-sm">{f.name} × {f.count}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="px-10 pb-5 shrink-0">
          <div className="w-full h-px bg-[#E2D9CE] mb-3" />
          <p className="text-[#C4A882] text-[9px] tracking-[0.45em] uppercase font-serif">رايد إكس · منصة الفروسية</p>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-72 border-r border-[#E2D9CE] bg-[#F5EFE7]/60 flex flex-col">
        <ParticipantNumbers results={results} tournamentId={result.tournamentId} roundId={result.roundId} roundNumber={result.roundNumber} participantNumbers={participantNumbers} featuredResult={showFeaturedResult ? result : null} />
      </div>
    </div>
  )
}

/* ── DISQUALIFIED screen ─────────────────────────────── */
function DisqualifiedScreen({ result, roundName, results, participantNumbers }: {
  result: NonNullable<LiveDisplayState['result']>; roundName: string; results: JudgeResult[]
  participantNumbers: string[]
}) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center relative px-16">
        <HorseMark />
        <div className="relative z-10 text-center">
          <p className="font-serif text-[11px] tracking-[0.35em] uppercase text-[#A08060] mb-7">{roundName}</p>
          <p className="text-[#C4A882] text-sm mb-2 font-serif">رقم المشاركة {result.competitionNumber}</p>
          <p className="text-[#1C1A17] font-black leading-tight mb-5" style={{ fontSize: 'clamp(28px, 5vw, 60px)' }}>{result.playerName}</p>
          <div className="w-16 h-px bg-[#8D381F]/40 mx-auto mb-5" />
          <p className="text-[#8D381F] text-2xl font-black tracking-[0.3em]">مستبعد</p>
          <p className="text-[#C4A882] text-sm font-serif mt-2 tracking-widest">DISQUALIFIED</p>
        </div>
      </div>
      <div className="w-72 border-r border-[#E2D9CE] bg-[#F5EFE7]/60 flex flex-col">
        <ParticipantNumbers results={results} tournamentId={result.tournamentId} roundId={result.roundId} roundNumber={result.roundNumber} participantNumbers={participantNumbers} />
      </div>
    </div>
  )
}

/* ── Round badge — shows prominently which round is live ── */
function RoundBadge({ roundName, roundNumber }: { roundName: string; roundNumber?: number }) {
  if (!roundName) return null
  return (
    <div className="shrink-0 flex items-center justify-center gap-3 py-2 border-b border-[#E2D9CE] bg-[#8D381F]/5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#8D381F] animate-pulse" />
      <p className="font-serif text-[11px] tracking-[0.4em] uppercase text-[#8D381F] font-bold">
        {roundNumber ? `الجولة ${roundNumber} — ` : ''}{roundName}
      </p>
      <span className="w-1.5 h-1.5 rounded-full bg-[#8D381F] animate-pulse" />
    </div>
  )
}

function TournamentFooter({ tournament }: { tournament: { name: string; logoUrl?: string; sponsors?: TournamentSponsor[] } | null }) {
  const sponsors = (tournament?.sponsors ?? []).filter((sponsor) => sponsor.name || sponsor.logoUrl)
  if (!tournament?.logoUrl && sponsors.length === 0) return null

  return (
    <footer className="shrink-0 border-t border-[#E2D9CE] bg-[#1C1A17] px-8 py-3 text-[#FAF7F3]">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-3">
          {tournament.logoUrl && (
            <img src={tournament.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain bg-white/95 p-1" />
          )}
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.35em] text-[#C4A882]">البطولة</p>
            <p className="truncate text-sm font-black">{tournament.name}</p>
          </div>
        </div>
        {sponsors.length > 0 && (
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-sm font-black uppercase tracking-[0.25em] text-[#F3D4A5] sm:text-base">برعاية</span>
            <div className="flex flex-wrap justify-end gap-2">
              {sponsors.map((sponsor) => (
                <span key={sponsor.id} className="flex items-center gap-2 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85">
                  {sponsor.logoUrl && <img src={sponsor.logoUrl} alt="" className="h-7 w-7 rounded bg-white object-contain p-0.5" />}
                  {sponsor.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </footer>
  )
}

/* ── ROOT ────────────────────────────────────────────── */
export default function LiveDisplay({ liveState, judgeResults = [], tournaments = [] }: Props) {
  const { displayState, result, tournamentName, roundName, podiumRank, podiumContext } = liveState
  const [resultVisible, setResultVisible] = useState(true)
  const [liveTimer, setLiveTimer] = useState<LiveTimer | null>(null)
  const [brandingOverrides, setBrandingOverrides] = useState<Record<string, { logoUrl?: string; sponsors?: TournamentSponsor[]; logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'center'; logoSize?: number; logoX?: number; logoY?: number }>>({})

  useEffect(() => {
    const channel = new BroadcastChannel('afandi_live_display')
    channel.onmessage = (event) => {
      if (event.data?.type === 'judge_timer') setLiveTimer(event.data as LiveTimer)
      if (event.data?.type === 'tournament_branding' && event.data.tournamentId) {
        setBrandingOverrides((current) => ({ ...current, [event.data.tournamentId]: event.data.branding }))
      }
    }
    return () => channel.close()
  }, [])

  useEffect(() => {
    if (displayState !== 'result' || !result) {
      setResultVisible(true)
      return
    }
    setResultVisible(true)
    const timeoutId = window.setTimeout(() => setResultVisible(false), 5000)
    return () => window.clearTimeout(timeoutId)
  }, [displayState, result?.id])

  const resultTournament = result
    ? tournaments.find((t) => t.id === result.tournamentId)
    : null
  const activeTournament = resultTournament
    ?? tournaments
    .filter((t) => !['archived', 'cancelled'].includes(t.status))
    .find((t) => t.status === 'active')
    ?? tournaments
      .filter((t) => !['archived', 'cancelled'].includes(t.status))
      .find((t) => ['registration', 'upcoming', 'not_started'].includes(t.status))
    ?? tournaments.filter((t) => !['archived', 'cancelled'].includes(t.status))[0] ?? null

  const activeTournamentId = activeTournament?.id ?? result?.tournamentId ?? judgeResults[0]?.tournamentId ?? ''
  const displayTournament = activeTournament
    ? { ...activeTournament, ...brandingOverrides[activeTournament.id] }
    : null
  const logoPositionClass = displayTournament?.logoX !== undefined
    ? ''
    : displayTournament?.logoPosition === 'top-center'
    ? 'left-1/2 -translate-x-1/2 top-7'
    : displayTournament?.logoPosition === 'top-right'
      ? 'right-8 top-7'
      : displayTournament?.logoPosition === 'center'
        ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        : 'left-8 top-7'
  const fallbackResult =
    (displayState === 'result' || displayState === 'player_intro' || displayState === 'disqualified' || displayState === 'podium')
      ? [...judgeResults]
          .filter((entry) => entry.status === 'approved' || entry.status === 'pending')
          .sort((a, b) => parseTime(a.time) - parseTime(b.time))[0] ?? judgeResults[0] ?? null
      : null
  const activeResult = (result && result.tournamentId === activeTournamentId ? result : null) ?? fallbackResult
  const activeRound = activeTournament?.rounds?.find((r) => r.status === 'active') ?? activeTournament?.rounds?.[0] ?? null
  const activeRoundId = activeRound?.id ?? activeResult?.roundId ?? result?.roundId ?? judgeResults.find((r) => r.tournamentId === activeTournamentId)?.roundId ?? ''
  const roundResults = judgeResults.filter(r => r.tournamentId === activeTournamentId)
  const participantNumbers = (activeTournament?.participants ?? [])
    .map((p) => String(p.competitionNumber ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b))
  const visibleTournamentName = activeTournament?.name ?? tournamentName
  const visibleRoundName = activeRound?.name ?? roundName
  const visibleRoundNumber = activeRound?.number

  /* Round number comes from the result (set when judge submitted) */
  const roundNumber = activeResult?.roundNumber ?? result?.roundNumber

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      dir="rtl"
      style={{
        fontFamily: "'Thmanyah Sans', sans-serif",
        background: 'linear-gradient(135deg, #FAF7F3 0%, #F5EDE0 40%, #FAF7F3 100%)',
      }}
    >
      {/* Top brand accent */}
      <div className="h-1 shrink-0 bg-gradient-to-r from-transparent via-[#8D381F]/40 to-transparent" />

      {/* Round indicator — always visible, identifies which round is on display */}
      {visibleRoundName && displayState !== 'waiting' && (
        <RoundBadge roundName={visibleRoundName} roundNumber={roundNumber} />
      )}

      {displayTournament?.logoUrl && (
        <div className={`absolute z-20 hidden sm:block ${displayTournament.logoX !== undefined ? 'inset-0 pointer-events-none' : logoPositionClass}`}>
          <img src={displayTournament.logoUrl} alt="" className="absolute rounded-xl bg-white/90 object-contain p-2 shadow-sm" style={{ width: displayTournament.logoSize ?? 96, height: displayTournament.logoSize ?? 96, ...(displayTournament.logoX !== undefined ? { left: `${displayTournament.logoX}%`, top: `${displayTournament.logoY ?? 8}%`, transform: 'translate(-50%, -50%)' } : {}) }} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {displayState === 'waiting' && (
          <WaitingScreen tournamentName={visibleTournamentName} roundName={visibleRoundName} results={roundResults} tournamentId={activeTournamentId} roundId={activeRoundId} roundNumber={visibleRoundNumber} participantNumbers={participantNumbers} />
        )}
        {displayState === 'break' && <BreakScreen tournamentName={visibleTournamentName} />}
        {displayState === 'player_intro' && activeResult && (
          <PlayerIntroScreen result={activeResult} roundName={visibleRoundName} results={roundResults} participantNumbers={participantNumbers} />
        )}
        {displayState === 'result' && activeResult && (
          <ResultScreen result={activeResult} tournamentName={visibleTournamentName} roundName={visibleRoundName} results={roundResults} participantNumbers={participantNumbers} showFeaturedResult={resultVisible} />
        )}
        {displayState === 'podium' && (
          <PodiumScreen
            tournamentName={visibleTournamentName}
            roundName={visibleRoundName}
            results={roundResults}
            selectedRank={podiumRank ?? null}
            selectedResult={result}
            announcedPodium={liveState.announcedPodium}
            podiumContext={podiumContext}
          />
        )}
        {displayState === 'disqualified' && activeResult && (
          <DisqualifiedScreen result={activeResult} roundName={visibleRoundName} results={roundResults} participantNumbers={participantNumbers} />
        )}
      </div>

      {liveTimer && liveTimer.tournamentId === activeTournamentId && liveTimer.roundId === activeRoundId && liveTimer.elapsed > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 min-w-64 rounded-xl border border-[#8D381F]/20 bg-[#FAF7F3]/95 px-8 py-4 text-center shadow-lg">
          <p className="text-[#A08060] text-xs font-serif mb-1">{liveTimer.playerName || `رقم المشاركة ${liveTimer.competitionNumber}`}</p>
          <p className={`font-serif text-6xl tabular-nums ${liveTimer.running ? 'text-[#8D381F]' : 'text-[#A08060]'}`}>{fmtTimer(liveTimer.elapsed)}</p>
        </div>
      )}

      <TournamentFooter tournament={displayTournament} />

      {/* Bottom accent */}
      <div className="h-1 shrink-0 bg-gradient-to-r from-transparent via-[#8D381F]/25 to-transparent" />
    </div>
  )
}
