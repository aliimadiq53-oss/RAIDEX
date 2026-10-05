import { useMemo, useState } from 'react'
import HRRideLogo from '../components/HRRideLogo'
import JudgeInterface from './JudgeInterface'
import type { JudgeResult, Player, SystemUser, Tournament } from '../lib/types'
import { getEffectiveScore } from '../lib/scoring'

interface Props {
  currentUser: SystemUser
  tournaments: Tournament[]
  players: Player[]
  judgeResults: JudgeResult[]
  onSubmitResult: (result: JudgeResult) => Promise<void>
  permissions: string[]
  onDisqualifyParticipant: (tournamentId: string, participantId: string, reason: string) => Promise<void>
  onBanPlayer: (playerId: string, reason: string) => Promise<void>
  onLogout: () => void
}

function parseTime(time: string): number {
  const [minuteSecond, fraction = '0'] = time.split('.')
  const [minute = '0', second = '0'] = minuteSecond.split(':')
  return Number(minute) * 60000 + Number(second) * 1000 + Number(fraction)
}

function roundResults(results: JudgeResult[]): JudgeResult[] {
  return [...results].sort((left, right) => {
    const scoreDifference = getEffectiveScore(right, results) - getEffectiveScore(left, results)
    return scoreDifference || parseTime(left.time) - parseTime(right.time)
  })
}

export default function JudgeProfile({ currentUser, tournaments, players, judgeResults, onSubmitResult, permissions, onDisqualifyParticipant, onBanPlayer, onLogout }: Props) {
  const [section, setSection] = useState<'current' | 'judging' | 'tournaments' | 'archive' | 'profile'>('current')
  const assignedTournamentIds = new Set(currentUser.assignedTournaments ?? [])
  const judgedTournamentIds = new Set(
    judgeResults.filter((result) => result.judgeId === currentUser.id).map((result) => result.tournamentId),
  )
  const judgedTournaments = tournaments
    .filter((tournament) => tournament.judgeIds.includes(currentUser.id) || assignedTournamentIds.has(tournament.id) || judgedTournamentIds.has(tournament.id))
    .sort((left, right) => Date.parse(String(right.date)) - Date.parse(String(left.date)))
  const [selectedTournamentId, setSelectedTournamentId] = useState(judgedTournaments[0]?.id ?? '')
  const [isJudging, setIsJudging] = useState(false)
  const selectedTournament = judgedTournaments.find((tournament) => tournament.id === selectedTournamentId) ?? judgedTournaments[0]
  const selectedResults = judgeResults.filter((result) => result.tournamentId === selectedTournament?.id)
  const selectedRounds = useMemo(() => {
    const rounds = selectedTournament?.rounds ?? []
    const resultRounds = new Map<number, string>()
    selectedResults.forEach((result) => resultRounds.set(result.roundNumber, result.roundName || `الجولة ${result.roundNumber}`))
    return rounds.length > 0
      ? rounds
      : Array.from(resultRounds.entries()).map(([number, name]) => ({ id: `${selectedTournament?.id}-${number}`, tournamentId: selectedTournament?.id ?? '', number, name, status: 'completed' as const, judgeIds: [] }))
  }, [selectedResults, selectedTournament])
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null)
  const activeRoundNumber = selectedRoundNumber ?? selectedRounds[0]?.number ?? 0
  const currentRoundResults = roundResults(selectedResults.filter((result) => result.roundNumber === activeRoundNumber))
  const archive = judgedTournaments.filter((tournament) => ['completed', 'archived'].includes(tournament.status))
  const activeAssignedTournaments = judgedTournaments.filter((tournament) =>
    tournament.status === 'active' && (tournament.judgeIds.includes(currentUser.id) || assignedTournamentIds.has(tournament.id)),
  )

  if (isJudging) {
    return (
      <JudgeInterface
        onNavigate={() => undefined}
        onBack={() => setIsJudging(false)}
        onSubmitResult={onSubmitResult}
        permissions={permissions}
        onDisqualifyParticipant={onDisqualifyParticipant}
        onBanPlayer={onBanPlayer}
        onLogout={onLogout}
        tournaments={activeAssignedTournaments}
        players={players}
        judgeResults={judgeResults}
        currentUser={currentUser}
      />
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f1eb] text-charcoal">
      <header className="border-b border-line bg-white px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <HRRideLogo variant="horizontal" color="brand" markSize={34} />
            <div>
              <p className="text-xs text-muted-text font-serif">ملف الحكم</p>
              <h1 className="text-lg font-black">{currentUser.name}</h1>
            </div>
          </div>
          <button onClick={onLogout} className="rounded-lg border border-line px-3 py-2 text-xs text-muted-text hover:bg-sand">تسجيل خروج</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 pb-28 sm:px-10">
        {section === 'profile' && <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="text-xs text-muted-text">الحكم</p>
            <p className="mt-2 text-xl font-black">{currentUser.name}</p>
            <p className="mt-1 text-sm text-muted-text font-serif">@{currentUser.username}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="text-xs text-muted-text">البطولات التي حكمتها</p>
            <p className="mt-2 text-3xl font-black text-brand">{judgedTournaments.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="text-xs text-muted-text">النتائج المسجلة باسمك</p>
            <p className="mt-2 text-3xl font-black text-brand">{judgeResults.filter((result) => result.judgeId === currentUser.id).length}</p>
          </div>
        </section>}

        {(section === 'current' || section === 'judging') && <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-text font-serif">للاطلاع فقط</p>
              <h2 className="mt-1 text-2xl font-black">نتائج الجولات وترتيب المشاركين</h2>
            </div>
            <select value={selectedTournament?.id ?? ''} onChange={(event) => { setSelectedTournamentId(event.target.value); setSelectedRoundNumber(null) }} className="min-w-56 rounded-lg border border-line bg-ivory px-3 py-2 text-sm">
              {judgedTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
            </select>
          </div>

          {!selectedTournament && <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted-text">لا توجد بطولة مرتبطة بهذا الحكم بعد.</p>}
          {selectedTournament && (
            <>
              {activeAssignedTournaments.some((tournament) => tournament.id === selectedTournament.id) && (
                <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-black text-charcoal">هذه البطولة مفتوحة للتحكيم</p>
                    <p className="mt-1 text-xs text-muted-text font-serif">أنت مضاف كحكم ويمكنك إدخال نتائج الجولة الحالية.</p>
                  </div>
                  <button onClick={() => setIsJudging(true)} className="shrink-0 rounded-lg bg-brand px-4 py-2 text-xs font-black text-ivory hover:bg-brand-hover">بدء التحكيم</button>
                </div>
              )}
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedRounds.map((round) => (
                  <button key={round.id} onClick={() => setSelectedRoundNumber(round.number)} className={`rounded-lg border px-4 py-2 text-sm ${activeRoundNumber === round.number ? 'border-brand bg-brand/10 text-brand font-black' : 'border-line text-muted-text hover:bg-sand'}`}>
                    {round.name}
                  </button>
                ))}
              </div>
              {currentRoundResults.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted-text">لا توجد نتائج لهذه الجولة.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="grid grid-cols-12 gap-2 bg-sand/50 px-4 py-3 text-xs text-muted-text font-serif">
                    <span className="col-span-1">المركز</span><span className="col-span-1">الرقم</span><span className="col-span-4">المشارك</span><span className="col-span-2">الوقت</span><span className="col-span-2">الأخطاء</span><span className="col-span-2">النقاط</span>
                  </div>
                  {currentRoundResults.map((result, index) => (
                    <div key={result.id} className="grid grid-cols-12 items-center gap-2 border-t border-line/70 px-4 py-3 text-sm">
                      <span className="col-span-1 font-black text-brand">{index + 1}</span>
                      <span className="col-span-1 text-muted-text">{result.competitionNumber}</span>
                      <span className="col-span-4 font-semibold">{result.playerName}</span>
                      <span className="col-span-2 text-muted-text font-serif tabular-nums">{result.time}</span>
                      <span className="col-span-2 text-muted-text">{result.faults.reduce((sum, fault) => sum + fault.count, 0)}</span>
                      <span className="col-span-2 font-black text-brand">{getEffectiveScore(result, currentRoundResults)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>}

        {section === 'tournaments' && <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-2xl font-black">البطولات التي حكمتها</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {judgedTournaments.map((tournament) => <button key={tournament.id} onClick={() => { setSelectedTournamentId(tournament.id); setSection('current') }} className="rounded-lg border border-line p-4 text-right hover:border-brand/40 hover:bg-brand/5"><p className="font-black">{tournament.name}</p><p className="mt-1 text-xs text-muted-text font-serif">{tournament.date} · {tournament.status === 'active' ? 'جارية' : 'مغلقة'}</p></button>)}
          </div>
        </section>}

        {section === 'archive' && <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-text font-serif">الأرشيف</p>
          <h2 className="mt-1 text-2xl font-black">أرشيف البطولات التي حكمتها</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {archive.length === 0 && <p className="text-sm text-muted-text">لا توجد بطولات مكتملة في الأرشيف.</p>}
            {archive.map((tournament) => (
              <button key={tournament.id} onClick={() => { setSelectedTournamentId(tournament.id); setSelectedRoundNumber(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-right rounded-lg border border-line p-4 hover:border-brand/40 hover:bg-brand/5">
                <div className="flex items-center justify-between gap-3"><p className="font-black">{tournament.name}</p><span className="rounded-full bg-sand px-2 py-1 text-[10px] text-muted-text">{tournament.status === 'archived' ? 'مؤرشفة' : 'مكتملة'}</span></div>
                <p className="mt-1 text-xs text-muted-text font-serif">{tournament.date} · {tournament.location || 'الموقع غير محدد'}</p>
              </button>
            ))}
          </div>
        </section>}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-white/95 px-3 py-2 backdrop-blur sm:px-10">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
          {([['current', 'الحالية'], ['judging', 'التحكيم'], ['tournaments', 'البطولات'], ['archive', 'الأرشيف'], ['profile', 'ملفي']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} className={`rounded-lg px-2 py-2 text-xs font-semibold ${section === id ? 'bg-brand text-ivory' : 'text-muted-text hover:bg-sand'}`}>{label}</button>
          ))}
        </div>
      </nav>
    </div>
  )
}
