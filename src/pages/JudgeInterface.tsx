import { useState, useRef, useEffect, useCallback } from 'react'
import HRRideLogo from '../components/HRRideLogo'
import type { JudgeResult, ResultFault, SystemUser, Tournament, Player } from '../lib/types'
import { parseTimeValue, recalculateRoundScores } from '../lib/scoring'

const EMPTY_FAULTS: ResultFault[] = []

interface Props {
  onNavigate: (page: string) => void
  onSubmitResult: (result: JudgeResult) => Promise<void>
  permissions?: string[]
  onDisqualifyParticipant: (tournamentId: string, participantId: string, reason: string) => Promise<void>
  onBanPlayer: (playerId: string, reason: string) => Promise<void>
  onBack?: () => void
  onLogout?: () => void
  tournaments?: Tournament[]
  players?: Player[]
  judgeResults?: JudgeResult[]
  currentUser?: SystemUser | null
}

type JudgeScreen = 'select-tournament' | 'select-round' | 'judge'

import type { Participant } from '../lib/types'

interface FoundState {
  type: 'ok' | 'not_found' | 'disqualified' | 'banned' | 'already_submitted'
  participant?: Participant
  player?: Player
  horse?: { id?: string; name?: string }
  existingResult?: import('../lib/types').JudgeResult
}


export default function JudgeInterface({ onNavigate, onSubmitResult, permissions = [], onDisqualifyParticipant, onBanPlayer, onBack, onLogout, tournaments: tournamentsProp, players: playersProp, judgeResults: judgeResultsProp, currentUser }: Props) {
  const CURRENT_JUDGE = currentUser as SystemUser
  /* — Tournament & round selection — */
  const allTournaments = tournamentsProp ?? []
  const allPlayers = playersProp ?? []
  const assignedTournaments = [...allTournaments]
    .filter((t) => ['active', 'registration', 'upcoming', 'not_started'].includes(t.status))
    .sort((a, b) => {
      const aTime = Date.parse(String(a.startedAt ?? a.date ?? '1970-01-01T00:00:00Z'))
      const bTime = Date.parse(String(b.startedAt ?? b.date ?? '1970-01-01T00:00:00Z'))
      return bTime - aTime
    })
  const activeRoundsFor = (t: Tournament) => (t.rounds ?? []).map((round, index) => {
    // Only infer the first round for legacy records that lack its active status.
    // Later rounds must be explicitly started by the manager.
    const inferredActive = t.status === 'active' && round.status === 'not_started' && index === 0 && (t.currentRound ?? 0) <= 1
    return inferredActive ? { ...round, status: 'active' as const } : round
  }).filter((round) => round.status === 'active')

  const [screen, setScreen] = useState<JudgeScreen>(() => {
    if (assignedTournaments.length === 1) {
      const rounds = activeRoundsFor(assignedTournaments[0])
      if (rounds.length <= 1) return 'judge'
      return 'select-round'
    }
    return 'select-tournament'
  })

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(() =>
    assignedTournaments.length === 1 ? assignedTournaments[0].id : ''
  )

  const [selectedRoundId, setSelectedRoundId] = useState<string>(() => {
    if (assignedTournaments.length === 1) {
      const rounds = activeRoundsFor(assignedTournaments[0])
      if (rounds.length === 1) return rounds[0].id
    }
    return ''
  })

  const selectedTournament = allTournaments.find((t) => t.id === selectedTournamentId)
  /* Rounds come from the edition's embedded rounds */
  const editionRounds = selectedTournament ? selectedTournament.rounds ?? [] : []
  const selectedRound = editionRounds.find((r) => r.id === selectedRoundId)
  const activeFaults = (selectedTournament?.faults ?? EMPTY_FAULTS).filter((f) => f.active)
  const availableRounds = selectedTournament ? activeRoundsFor(selectedTournament) : []

  /* — Judge entry state — */
  const [bibInput, setBibInput] = useState('')
  const [foundState, setFoundState] = useState<FoundState | null>(null)
  const [selectedFaults, setSelectedFaults] = useState<ResultFault[]>([])
  const [showFaultPicker, setShowFaultPicker] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [confirmAction, setConfirmAction] = useState<'disqualify' | 'ban' | null>(null)
  const [lastSuccess, setLastSuccess] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApplyingAction, setIsApplyingAction] = useState(false)
  const [unsavedWarning, setUnsavedWarning] = useState(false)
  const [pendingTournamentSwitch, setPendingTournamentSwitch] = useState('')

  /* — Progress tracking — */
  const activeTournamentIds = new Set(
    allTournaments.filter((t) => ['active', 'registration', 'upcoming', 'not_started'].includes(t.status)).map((t) => t.id)
  )
  const allJudgeResults = (judgeResultsProp ?? []).filter((result) =>
    activeTournamentIds.has(result.tournamentId)
  )
  const submittedKeysRef = useRef(new Set<string>())
  const roundResultsCount = allJudgeResults.filter(
    (r) => r.tournamentId === selectedTournamentId && r.roundId === selectedRoundId
  ).length
  const tournamentParticipants = (selectedTournament?.participants?.length ?? 0) > 0
    ? selectedTournament?.participants ?? []
    : allPlayers
      .filter((player) => (player.tournament_id ?? player.tournamentId) === selectedTournamentId)
      .map((player, index) => ({
        id: `DB-${player.id}`,
        competitionNumber: String(index + 1),
        playerId: player.id,
        horseId: '',
        tournamentId: selectedTournamentId,
        category: 'عام',
        status: 'active' as const,
        roundsCompleted: 0,
      }))
  const totalParticipants = tournamentParticipants.filter((p) => p.status === 'active').length
  const roundLocked = Boolean(selectedRoundId) && totalParticipants > 0 && roundResultsCount >= totalParticipants
  const hasRounds = editionRounds.length > 0
  const hasActiveRound = editionRounds.some((round) => round.status === 'active')
  const allRoundsComplete = hasRounds && editionRounds.every((round) => round.status === 'completed')

  /* — Stopwatch — */
  const [swRunning, setSwRunning] = useState(false)
  const [swMs, setSwMs] = useState(0)
  const [swStopped, setSwStopped] = useState(false)
  const swIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const swStartRef = useRef<number>(0)
  const swAccRef = useRef<number>(0)
  const timerChannelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const channel = new BroadcastChannel('afandi_live_display')
    timerChannelRef.current = channel
    return () => channel.close()
  }, [])

  const broadcastTimer = (elapsed: number, running: boolean) => {
    timerChannelRef.current?.postMessage({
      type: 'judge_timer',
      elapsed,
      running,
      competitionNumber: foundState?.participant?.competitionNumber ?? '',
      playerName: foundState?.player?.name ?? '',
      tournamentId: selectedTournamentId,
      roundId: selectedRoundId,
    })
  }

  const swStart = () => {
    if (swRunning) return
    swStartRef.current = performance.now()
    swIntervalRef.current = setInterval(() => {
      const elapsed = swAccRef.current + Math.floor(performance.now() - swStartRef.current)
      setSwMs(elapsed)
      broadcastTimer(elapsed, true)
    }, 30)
    setSwRunning(true)
    setSwStopped(false)
    broadcastTimer(swAccRef.current, true)
  }

  const swStop = () => {
    if (!swRunning) return
    if (swIntervalRef.current) clearInterval(swIntervalRef.current)
    const elapsed = swAccRef.current + Math.floor(performance.now() - swStartRef.current)
    swAccRef.current = elapsed
    setSwMs(elapsed)
    setSwRunning(false)
    setSwStopped(true)
    broadcastTimer(elapsed, false)
  }

  const swReset = () => {
    if (swIntervalRef.current) clearInterval(swIntervalRef.current)
    swAccRef.current = 0
    setSwMs(0)
    setSwRunning(false)
    setSwStopped(false)
    broadcastTimer(0, false)
  }

  const swDisplay = (ms: number) => {
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    const hundredths = Math.floor((ms % 1000) / 10)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
  }

  useEffect(() => {
    return () => { if (swIntervalRef.current) clearInterval(swIntervalRef.current) }
  }, [])

  const bibRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Focus bib on judge screen */
  useEffect(() => {
    if (screen === 'judge') setTimeout(() => bibRef.current?.focus(), 80)
  }, [screen])

  /* Auto-select when exactly one active tournament/round becomes available */
  useEffect(() => {
    if (assignedTournaments.length === 1 && !selectedTournamentId) {
      const t = assignedTournaments[0]
      setSelectedTournamentId(t.id)
      const activeRounds = activeRoundsFor(t)
      if (activeRounds.length === 1) {
        setSelectedRoundId(activeRounds[0].id)
        setScreen('judge')
      } else if (activeRounds.length > 1) {
        setScreen('select-round')
      } else {
        setScreen('judge')
      }
    }
  }, [assignedTournaments.length, selectedTournamentId])

  /* Auto-select round when tournament is selected but no round yet */
  useEffect(() => {
    if (selectedTournamentId && !selectedRoundId) {
      const t = allTournaments.find((x) => x.id === selectedTournamentId)
      const activeRounds = t ? activeRoundsFor(t) : []
      if (activeRounds.length === 1) setSelectedRoundId(activeRounds[0].id)
    }
  }, [selectedTournamentId, selectedRoundId, allTournaments])

  /* Move to the newly started round after the manager activates it. */
  useEffect(() => {
    if (!selectedTournament || !selectedRoundId) return
    const activeRounds = activeRoundsFor(selectedTournament)
    if (activeRounds.length === 0) {
      setSelectedRoundId('')
      setScreen('judge')
      resetEntry()
      return
    }
    if (activeRounds.some((round) => round.id === selectedRoundId)) return
    if (activeRounds.length === 1) {
      setSelectedRoundId(activeRounds[0].id)
      setScreen('judge')
      resetEntry()
    }
  }, [selectedTournament, selectedRoundId])

  useEffect(() => {
    if (!selectedTournamentId) {
      setScreen('select-tournament')
      return
    }
    const selectedTournamentStillAvailable = allTournaments.some(
      (t) => t.id === selectedTournamentId && ['active', 'registration', 'upcoming', 'not_started'].includes(t.status)
    )
    if (!selectedTournamentStillAvailable) {
      setSelectedTournamentId('')
      setSelectedRoundId('')
      setScreen('select-tournament')
      setFoundState(null)
      resetEntry()
      return
    }
  }, [selectedTournamentId, allTournaments])

  useEffect(() => {
    if (!selectedTournament || !selectedRoundId || !selectedTournament.currentRound) return
    const currentRound = editionRounds.find((round) => round.number === selectedTournament.currentRound)
    const selectedNumber = editionRounds.find((round) => round.id === selectedRoundId)?.number ?? 0
    if (currentRound && selectedNumber < selectedTournament.currentRound) {
      setSelectedRoundId(currentRound.id)
      resetEntry()
    }
  }, [selectedTournament, selectedRoundId, editionRounds])

  /* Auto-search with debounce — uses edition participants */
  const runSearch = useCallback(
    (bib: string) => {
      if (!bib.trim() || !selectedTournamentId) { setFoundState(null); return }
      const normalized = bib.trim()
      const editionParticipants = tournamentParticipants
      const normalizedCompetitionNumber = String(Number(normalized))
      const submittedKey = `${selectedTournamentId}:${selectedRoundId}:${normalizedCompetitionNumber}`
      const participant = editionParticipants.find(
        (p) =>
          String(Number(p.competitionNumber)) === normalizedCompetitionNumber
      )
      if (!participant) { setFoundState({ type: 'not_found' }); return }
      const player = allPlayers.find((p) => p.id === participant.playerId)
      if (!player) { setFoundState({ type: 'not_found' }); return }
      if (submittedKeysRef.current.has(submittedKey)) {
        const horse = participant.horseId ? { id: participant.horseId, name: participant.horseId } : undefined
        setFoundState({ type: 'already_submitted', participant, player, horse })
        return
      }
      if (player.status === 'banned') {
        setFoundState({ type: 'banned', participant, player })
        return
      }
      if (participant.status === 'disqualified') {
        setFoundState({ type: 'disqualified', participant, player })
        return
      }
      /* One result per (tournament + round + participant) — check before allowing entry */
      const existingResult = (allJudgeResults ?? []).find(
        (r) =>
          r.tournamentId === selectedTournamentId &&
          (r.roundNumber === selectedRound?.number || r.roundId === selectedRoundId) &&
          String(Number(r.competitionNumber)) === normalizedCompetitionNumber
      )
      const horse = participant.horseId ? { id: participant.horseId, name: participant.horseId } : undefined
      if (existingResult) {
        setFoundState({ type: 'already_submitted', participant, player, horse, existingResult })
        return
      }
      setFoundState({ type: 'ok', participant, player, horse })
    },
    [selectedTournamentId, selectedTournament, selectedRoundId, judgeResultsProp, tournamentParticipants, allPlayers]
  )

  const handleBibChange = (val: string) => {
    setBibInput(val)
    setFoundState(null)
    setLastSuccess('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) return
    debounceRef.current = setTimeout(() => runSearch(val), 350)
  }

  const handleBibKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      runSearch(bibInput)
    }
  }

  const resetEntry = (preserveSuccess = false) => {
    setBibInput(''); setFoundState(null); if (!preserveSuccess) setLastSuccess(''); setSubmitError('')
    setSelectedFaults([]); setActionReason(''); setConfirmAction(null)
    swReset()
    setTimeout(() => bibRef.current?.focus(), 50)
  }

  const computeScore = (time: string) => {
    const candidate: JudgeResult = {
      id: 'candidate',
      competitionNumber: foundState?.participant?.competitionNumber ?? '',
      playerId: foundState?.player?.id ?? '',
      playerName: foundState?.player?.name ?? '',
      horseName: foundState?.horse?.name ?? '',
      tournamentId: selectedTournamentId,
      tournamentName: selectedTournament?.name ?? '',
      roundId: selectedRoundId,
      roundNumber: selectedRound?.number ?? 1,
      roundName: selectedRound?.name ?? '',
      judgeId: CURRENT_JUDGE.id,
      judgeName: CURRENT_JUDGE.name,
      time,
      faults: selectedFaults,
      systemScore: 0,
      status: 'pending',
      published: false,
      submittedAt: 'الآن',
    }

    const roundResults = allJudgeResults.filter((result) => {
      if (result.tournamentId !== selectedTournamentId) return false
      const sameRoundId = result.roundId === selectedRoundId || (!result.roundId && !selectedRoundId)
      const sameRoundNumber = result.roundNumber === selectedRound?.number
      return sameRoundId || sameRoundNumber
    })

    return recalculateRoundScores([...roundResults, candidate]).get(candidate.id) ?? 0
  }

  const handleSubmit = async () => {

    if (isSubmitting || roundLocked || !foundState || foundState.type !== 'ok' || !foundState.participant || !foundState.player) return
    setSubmitError('')
    const timeStr = swDisplay(swMs)
    if (parseTimeValue(timeStr) === null) {
      setSubmitError('لا يمكن إرسال النتيجة بدون وقت. أوقف الموقت أو أدخل وقتًا صحيحًا أكبر من صفر.')
      return
    }
    const result: JudgeResult = {
      id: `RES${Date.now()}`,
      competitionNumber: foundState.participant.competitionNumber,
      playerId: foundState.player.id,
      playerName: foundState.player.name,
      horseName: foundState.horse?.name ?? '',
      tournamentId: selectedTournamentId,
      tournamentName: selectedTournament?.name ?? '',
      roundId: selectedRoundId,
      roundNumber: selectedRound?.number ?? 1,
      roundName: selectedRound?.name ?? '',
      judgeId: CURRENT_JUDGE.id,
      judgeName: CURRENT_JUDGE.name,
      time: timeStr,
      faults: selectedFaults,
      systemScore: computeScore(timeStr),
      status: 'pending',
      published: false,
      submittedAt: 'الآن',
    }
    try {
      setIsSubmitting(true)
      await onSubmitResult(result)
    } catch (error) {
      setSubmitError('تعذر حفظ النتيجة على الخادم. لم يتم تسجيلها، حاول مرة أخرى.')
      console.error('Failed to submit judge result', error)
      return
    } finally {
      setIsSubmitting(false)
    }
    submittedKeysRef.current.add(`${selectedTournamentId}:${selectedRoundId}:${String(Number(result.competitionNumber))}`)
    const newCount = roundResultsCount + 1
    const isRoundComplete = totalParticipants > 0 && newCount >= totalParticipants
    if (isRoundComplete) {
      setLastSuccess(`تم تسجيل آخر نتيجة — اكتملت ${selectedRound?.name ?? 'الجولة الحالية'}`)
      resetEntry()
    } else {
      setLastSuccess(`تم إرسال نتيجة اللاعب رقم ${foundState.participant.competitionNumber}`)
      resetEntry()
    }
  }

  const handleParticipantAction = async () => {
    if (isApplyingAction || !confirmAction || !foundState?.player || !foundState.participant || !actionReason.trim()) return
    setSubmitError('')
    setIsApplyingAction(true)
    try {
      if (confirmAction === 'disqualify') {
        await onDisqualifyParticipant(selectedTournamentId, foundState.participant.id, actionReason.trim())
        setLastSuccess(`تم استبعاد اللاعب ${foundState.player.name} — رقم ${foundState.participant.competitionNumber}`)
      } else {
        await onBanPlayer(foundState.player.id, actionReason.trim())
        setLastSuccess(`تم حظر اللاعب ${foundState.player.name} وإرسال التحديث إلى الخادم`)
      }
      resetEntry(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? `تعذر حفظ الإجراء: ${error.message}` : 'تعذر حفظ الإجراء على الخادم. حاول مرة أخرى.')
    } finally {
      setIsApplyingAction(false)
    }
  }

  const handleFaultAdd = (faultId: string, faultName: string) => {
    setSelectedFaults((prev) => {
      const existing = prev.find((f) => f.faultId === faultId)
      if (existing) return prev.map((f) => f.faultId === faultId ? { ...f, count: f.count + 1 } : f)
      return [...prev, { faultId, name: faultName, count: 1, penalty: 0 }]
    })
    setShowFaultPicker(false)
  }

  const handleFaultRemove = (faultId: string) => {
    setSelectedFaults((prev) => {
      const ex = prev.find((f) => f.faultId === faultId)
      if (!ex) return prev
      if (ex.count <= 1) return prev.filter((f) => f.faultId !== faultId)
      return prev.map((f) => f.faultId === faultId ? { ...f, count: f.count - 1 } : f)
    })
  }

  const handleTournamentSwitch = (id: string) => {
    if (foundState?.type === 'ok') {
      setPendingTournamentSwitch(id); setUnsavedWarning(true)
    } else {
      applyTournamentSwitch(id)
    }
  }

  const applyTournamentSwitch = (id: string) => {
    setSelectedTournamentId(id)
    const edition = allTournaments.find((t) => t.id === id)
    const rounds = edition ? activeRoundsFor(edition) : []
    if (rounds.length === 1) {
      setSelectedRoundId(rounds[0].id)
      setScreen('judge')
    } else if (rounds.length === 0) {
      setSelectedRoundId('')
      setScreen('judge')
    } else {
      setSelectedRoundId('')
      setScreen('select-round')
    }
    resetEntry(); setUnsavedWarning(false); setPendingTournamentSwitch('')
  }

  const selectTournament = (id: string) => {
    setSelectedTournamentId(id)
    const edition = allTournaments.find((t) => t.id === id)
    const rounds = edition ? activeRoundsFor(edition) : []
    if (rounds.length === 1) {
      setSelectedRoundId(rounds[0].id); setScreen('judge')
    } else if (rounds.length === 0) {
      setSelectedRoundId(''); setScreen('judge')
    } else {
      setSelectedRoundId(''); setScreen('select-round')
    }
  }

  const selectRound = (id: string) => {
    setSelectedRoundId(id); setScreen('judge')
  }

  return (
    <div className="min-h-screen bg-ivory" dir="rtl">
      {/* Header */}
      <div className="border-b border-line px-6 py-4 flex items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-4">
          {screen === 'judge' && selectedTournament ? (
            <div>
              {/* Tournament switcher */}
              {assignedTournaments.length > 1 ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => handleTournamentSwitch(e.target.value)}
                    className="bg-transparent text-muted-text text-xs border-0 focus:outline-none cursor-pointer appearance-none"
                  >
                    {assignedTournaments.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <span className="text-muted-text text-xs">▾</span>
                </div>
              ) : (
                <p className="text-muted-text text-xs font-serif">{selectedTournament.name}</p>
              )}
              {selectedRound && (
                <p className="text-warm-gray text-[10px] mt-0.5">
                  {selectedRound.name} · الحكم: {CURRENT_JUDGE.name}
                </p>
              )}
            </div>
          ) : (
            <p className="text-warm-gray text-xs font-serif">الحكم: {CURRENT_JUDGE.name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <HRRideLogo variant="horizontal" color="brand" markSize={32} />
          {onBack && (
            <button onClick={onBack} className="text-muted-text hover:text-charcoal text-xs font-serif transition-colors border border-line px-2.5 py-1 rounded-lg">
              الملف
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-muted-text hover:text-charcoal text-xs font-serif transition-colors border border-line px-2.5 py-1 rounded-lg"
            >
              خروج
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-10">

        {/* ══ STEP 1: SELECT TOURNAMENT ══ */}
        {screen === 'select-tournament' && (
          <div>
            <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-6">الخطوة 1 من 2</p>
            <h1 className="text-charcoal text-2xl font-black mb-8">اختر البطولة</h1>
            {assignedTournaments.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-text text-sm">لا توجد بطولات نشطة مخصصة لك</p>
                <p className="text-warm-gray text-xs mt-2 font-serif">تواصل مع الإدارة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignedTournaments.map((t) => {
                  const activeRoundsCount = (t.rounds ?? []).filter((r) => r.status === 'active').length
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTournament(t.id)}
                      className="w-full text-right bg-white border border-line hover:border-brand/40 rounded-lg p-5 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-charcoal font-black text-base mb-1">{t.name}</p>
                          <p className="text-muted-text text-sm font-serif">{t.type}</p>
                          <p className="text-warm-gray text-xs mt-1">{t.location} · {t.date}</p>
                        </div>
                        <div className="text-left shrink-0">
                          {activeRoundsCount > 0 && (
                            <span className="inline-flex items-center gap-1 bg-brand/15 border border-brand/30 rounded-full px-2 py-0.5 text-brand text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                              {activeRoundsCount} جولة نشطة
                            </span>
                          )}
                          <p className="text-muted-text text-xs mt-2 font-serif group-hover:text-brand/60 transition-colors">اختر ←</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2: SELECT ROUND ══ */}
        {screen === 'select-round' && (
          <div>
            <button onClick={() => setScreen('select-tournament')} className="text-muted-text text-xs mb-6 flex items-center gap-2 hover:text-charcoal transition-colors">
              ← تغيير البطولة
            </button>
            <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">{selectedTournament?.name}</p>
            <h1 className="text-charcoal text-2xl font-black mb-8">اختر الجولة</h1>
            {availableRounds.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-line rounded-lg">
                <p className="text-muted-text text-sm">لا توجد جولات نشطة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableRounds.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectRound(r.id)}
                    className="w-full text-right bg-white border border-line hover:border-brand/40 rounded-lg px-5 py-4 transition-all group flex items-center justify-between"
                  >
                    <div>
                      <p className="text-charcoal font-black text-base">{r.name}</p>
                      <p className="text-muted-text text-xs mt-0.5 font-serif">الجولة رقم {r.number}</p>
                    </div>
                    <span className="text-muted-text text-xs font-serif group-hover:text-brand/60 transition-colors">اختر ←</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3: JUDGE SCREEN ══ */}
        {screen === 'judge' && (
          <div>
            {/* Lock the judge until the manager starts another round. */}
            {roundLocked && selectedRound && (
              <div className="bg-brand/10 border border-brand/30 rounded-xl px-5 py-4 mb-6">
                <p className="text-brand text-base font-black">تم انتهاء {selectedRound.name}</p>
                <p className="text-muted-text text-sm font-serif mt-1">تم تسجيل نتائج جميع المشاركين. ستفتح الصفحة عند بدء جولة جديدة.</p>
              </div>
            )}

            {/* Progress counter */}
            {selectedRound && totalParticipants > 0 && (
              <div className="flex items-center justify-between bg-white border border-line rounded-lg px-4 py-2.5 mb-4">
                <p className="text-xs text-muted-text font-serif">{selectedRound.name}</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: Math.min(totalParticipants, 20) }).map((_, i) => (
                      <span
                        key={i}
                        className={`block w-2 h-2 rounded-full ${i < roundResultsCount ? 'bg-brand' : 'bg-line'}`}
                      />
                    ))}
                    {totalParticipants > 20 && <span className="text-[10px] text-muted-text mr-1">+{totalParticipants - 20}</span>}
                  </div>
                  <span className="text-xs font-black text-charcoal tabular-nums">{roundResultsCount}/{totalParticipants}</span>
                </div>
              </div>
            )}

            {/* Success flash */}
            {lastSuccess && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
                <span className="text-green-600 text-base">✓</span>
                <div>
                  <p className="text-green-700 text-sm font-bold">{lastSuccess}</p>
                  <p className="text-muted-text text-xs font-serif">بانتظار الاعتماد · أدخل الرقم التالي</p>
                </div>
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
                <p className="text-red-700 text-sm font-bold">{submitError}</p>
                <p className="text-red-600/70 text-xs font-serif mt-1">تحقق من الاتصال ثم أرسل النتيجة مرة أخرى.</p>
              </div>
            )}

            {/* All rounds complete */}
            {allRoundsComplete && (
              <div className="bg-brand/10 border border-brand/30 rounded-xl px-5 py-5 mb-6 text-center">
                <p className="text-brand text-lg font-black">اكتملت جميع جولات البطولة</p>
                <p className="text-muted-text text-sm font-serif mt-1">لا توجد جولات أخرى لإدخال النتائج. يرجى انتظار اعتماد النتائج أو تعليمات الإدارة.</p>
              </div>
            )}

            {/* No active round warning */}
            {!selectedRound && !allRoundsComplete && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
                <p className="text-amber-700 text-sm">الجولة التالية لم تبدأ بعد</p>
                <p className="text-muted-text text-xs font-serif mt-1">سيتم فتحها تلقائياً عند ضغط الإدارة على «بدء الجولة»</p>
              </div>
            )}

            {/* BIB INPUT */}
            <div className="mb-6">
              <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-4">رقم المشاركة</p>
              <input
                ref={bibRef}
                type="text"
                inputMode="numeric"
                value={bibInput}
                onChange={(e) => handleBibChange(e.target.value.replace(/\D/g, ''))}
                onKeyDown={handleBibKeyDown}
                placeholder="00"
                disabled={!selectedRound || roundLocked || allRoundsComplete}
                className="w-full bg-white border border-line text-charcoal text-center font-serif font-light rounded-xl py-8 focus:outline-none focus:border-brand/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ fontSize: 'clamp(48px, 12vw, 88px)', letterSpacing: '0.1em' }}
              />
            </div>

            {/* NOT FOUND */}
            {foundState?.type === 'not_found' && (
              <div className="bg-sand border border-line rounded-lg px-4 py-3 mb-6">
                <p className="text-muted-text text-sm">لا يوجد مشارك بهذا الرقم في البطولة الحالية</p>
              </div>
            )}

            {/* BANNED */}
            {foundState?.type === 'banned' && foundState.player && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-6">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-charcoal font-black text-lg">{foundState.player.name}</p>
                  <span className="text-red-500 text-xs font-serif">{foundState.participant?.competitionNumber}</span>
                </div>
                <span className="inline-block bg-red-100 border border-red-300 text-red-600 text-xs font-black px-3 py-1 rounded-full">
                  محظور
                </span>
                {foundState.player.bannedReason && (
                  <p className="text-muted-text text-xs mt-2 font-serif">{foundState.player.bannedReason}</p>
                )}
              </div>
            )}

            {/* DISQUALIFIED */}
            {foundState?.type === 'disqualified' && foundState.player && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-5 mb-6">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-charcoal font-black text-lg">{foundState.player.name}</p>
                  <span className="text-muted-text font-serif text-lg">{foundState.participant?.competitionNumber}</span>
                </div>
                <span className="inline-block bg-orange-100 border border-orange-300 text-orange-600 text-xs font-black px-3 py-1 rounded-full">
                  مستبعد
                </span>
                {foundState.participant?.disqualifiedReason && (
                  <p className="text-muted-text text-xs mt-2 font-serif">{foundState.participant.disqualifiedReason}</p>
                )}
              </div>
            )}

            {/* ALREADY SUBMITTED */}
            {foundState?.type === 'already_submitted' && foundState.player && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-charcoal font-black text-xl">{foundState.player.name}</p>
                  <span className="font-serif text-3xl text-line font-light">{foundState.participant?.competitionNumber}</span>
                </div>
                {foundState.horse && <p className="text-muted-text text-sm font-serif mb-3">{foundState.horse.name}</p>}
                <span className={`inline-block text-xs font-black px-3 py-1.5 rounded-full mb-3 ${
                  foundState.existingResult?.status === 'approved'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-700'
                    : 'bg-amber-100 border border-amber-300 text-amber-700'
                }`}>
                  {foundState.existingResult?.status === 'approved' ? 'أكمل الجولة — تم الاعتماد' : 'بانتظار اعتماد المدير'}
                </span>
                <div className="border-t border-emerald-200 pt-3 mt-1">
                  <p className="text-emerald-800 text-sm font-semibold mb-1">
                    تم تسجيل نتيجة هذا اللاعب مسبقاً في {selectedRound?.name}
                  </p>
                  {foundState.existingResult && (
                    <p className="text-muted-text text-xs font-serif">
                      الوقت: {foundState.existingResult.time} · الأخطاء: {foundState.existingResult.faults.reduce((s, f) => s + f.count, 0)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* PLAYER FOUND — ENTRY FORM */}
            {foundState?.type === 'ok' && foundState.participant && foundState.player && !confirmAction && (
              <div>
                {/* Player card */}
                <div className="bg-white border border-line rounded-xl p-5 mb-6">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-charcoal font-black text-xl">{foundState.player.name}</p>
                    <span className="font-serif text-4xl text-line font-light">{foundState.participant.competitionNumber}</span>
                  </div>
                  {foundState.horse && (
                    <p className="text-muted-text text-sm font-serif">{foundState.horse.name}</p>
                  )}
                  <p className="text-warm-gray text-xs mt-1 font-serif">
                    {foundState.participant.category ? `الفئة ${foundState.participant.category} · ` : ''}
                    {selectedRound?.name}
                  </p>
                </div>

                {/* Stopwatch */}
                <div className="mb-6">
                  <div className="bg-white border-2 border-brand/20 rounded-2xl overflow-hidden shadow-sm">
                    {/* Timer display */}
                    <div className="px-5 pt-7 pb-5 text-center">
                      <p className="font-serif text-xs tracking-[0.3em] uppercase text-muted-text mb-3">الموقت</p>
                      <p
                        className="font-serif tabular-nums transition-colors"
                        style={{ fontSize: 'clamp(54px, 16vw, 92px)', letterSpacing: '0.05em', color: swRunning ? '#8D381F' : swStopped ? '#1C1A17' : '#C0A98A' }}
                      >
                        {swDisplay(swMs)}
                      </p>
                    </div>

                    {/* Controls */}
                    {!swStopped ? (
                      <div className="flex border-t border-line">
                        {!swRunning ? (
                          <button
                            onClick={swStart}
                            className="flex-1 py-6 text-xl font-black text-brand hover:bg-brand/5 transition-colors flex items-center justify-center gap-3"
                          >
                            <span className="w-5 h-5 rounded-full bg-brand inline-block" />
                            ابدأ
                          </button>
                        ) : (
                          <button
                            onClick={swStop}
                            className="flex-1 py-6 text-xl font-black text-charcoal hover:bg-sand transition-colors flex items-center justify-center gap-3"
                          >
                            <span className="w-5 h-5 rounded bg-charcoal inline-block" />
                            إيقاف
                          </button>
                        )}
                        {swMs > 0 && !swRunning && (
                          <button
                            onClick={swReset}
                            className="border-r border-line px-6 py-6 text-sm text-muted-text hover:text-charcoal hover:bg-sand transition-colors"
                          >
                            إعادة
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Stopped — ask to apply */
                      <div className="border-t border-line bg-brand/5 px-5 py-5 flex items-center justify-between gap-3">
                        <p className="text-sm text-charcoal font-bold">تم تسجيل الوقت بالموقت</p>
                        <div className="flex gap-2">
                          <button
                            onClick={swReset}
                            className="px-3 py-1.5 text-xs text-muted-text border border-line rounded-lg hover:bg-sand transition-colors"
                          >
                            لا
                          </button>
                          <span className="px-4 py-2 text-sm font-black text-brand border border-brand/30 rounded-lg">جاهز للإرسال</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Faults */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-muted-text text-xs tracking-widest font-serif uppercase">الأخطاء</p>
                    <button
                      onClick={() => setShowFaultPicker(!showFaultPicker)}
                      className="text-brand text-sm font-bold border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand/10 transition-colors"
                    >
                      + إضافة خطأ
                    </button>
                  </div>
                  {showFaultPicker && (
                    <div className="bg-white border border-line rounded-lg mb-3 overflow-hidden shadow-sm">
                      {activeFaults.map((fault) => (
                        <button
                          key={fault.id}
                          onClick={() => handleFaultAdd(fault.id, fault.name)}
                          className="w-full text-right px-4 py-3 text-charcoal hover:bg-sand transition-colors border-b border-line last:border-0 flex items-center justify-between"
                        >
                          <span className="text-right">
                            <span className="block text-sm">{fault.name}</span>
                            {fault.name.includes('تجاوز') && <span className="block text-[10px] text-muted-text font-serif mt-0.5">يضاف يدوياً عند تجاوز 60 ثانية</span>}
                          </span>
                          {fault.disqualifies && <span className="text-[10px] text-brand font-serif">يُستبعد</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedFaults.length === 0 ? (
                    <p className="text-muted-text text-sm text-center py-4 border border-dashed border-line rounded-lg">لا أخطاء</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedFaults.map((f) => (
                        <div key={f.faultId} className="flex items-center justify-between bg-white border border-brand/20 rounded-lg px-4 py-3">
                          <span className="text-charcoal text-sm font-medium">{f.name}</span>
                          <div className="flex items-center gap-3">
                            <button onClick={() => handleFaultRemove(f.faultId)} className="w-7 h-7 rounded-full border border-line text-muted-text hover:text-charcoal text-xl leading-none flex items-center justify-center">−</button>
                            <span className="text-brand font-black w-5 text-center tabular-nums">{f.count}</span>
                            <button onClick={() => handleFaultAdd(f.faultId, f.name)} className="w-7 h-7 rounded-full border border-line text-muted-text hover:text-charcoal text-xl leading-none flex items-center justify-center">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || roundLocked || swRunning || swMs <= 0 || !swStopped || !foundState || foundState.type !== 'ok'}
                  className="w-full bg-brand text-ivory py-5 text-lg font-black rounded-xl hover:bg-brand-hover transition-colors mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'جارٍ إرسال النتيجة...' : 'إرسال النتيجة'}
                </button>
                <button
                  onClick={() => resetEntry()}
                  className="w-full border border-line text-muted-text py-3 text-sm rounded-xl hover:bg-sand transition-colors mb-8"
                >
                  إلغاء — مسح
                </button>

                {/* Additional actions */}
                <div className="border-t border-line pt-5">
                  <p className="text-warm-gray text-xs tracking-widest mb-3 font-serif uppercase">إجراءات إضافية</p>
                  <div className="flex gap-3">
                    {permissions.includes('استبعاد لاعب') && (
                      <button
                        onClick={() => { setConfirmAction('disqualify'); setActionReason('') }}
                        className="flex-1 border border-orange-300 text-orange-600 text-sm py-3 rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        استبعاد
                      </button>
                    )}
                    {permissions.includes('حظر لاعب') && (
                      <button
                        onClick={() => { setConfirmAction('ban'); setActionReason('') }}
                        className="flex-1 border border-red-300 text-red-600 text-sm py-3 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        حظر
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CONFIRM DISQUALIFY */}
            {confirmAction === 'disqualify' && foundState?.player && (
              <div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-5 mb-5">
                  <p className="text-orange-700 font-bold mb-1">استبعاد اللاعب</p>
                  <p className="text-charcoal text-sm">{foundState.player.name} — رقم {foundState.participant?.competitionNumber}</p>
                </div>
                <p className="text-muted-text text-sm mb-3">سبب الاستبعاد <span className="text-brand">*</span></p>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                  placeholder="اكتب سبب الاستبعاد بوضوح..."
                  className="w-full bg-white border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-orange-400 resize-none mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleParticipantAction}
                    disabled={!actionReason.trim() || isApplyingAction}
                    className="flex-1 bg-orange-500 text-white py-4 font-black rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isApplyingAction ? 'جارٍ الحفظ...' : 'تأكيد الاستبعاد'}
                  </button>
                  <button onClick={() => setConfirmAction(null)} className="flex-1 border border-line text-muted-text py-4 rounded-lg hover:bg-sand transition-colors">
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* CONFIRM BAN */}
            {confirmAction === 'ban' && foundState?.player && (
              <div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-5">
                  <p className="text-red-700 font-bold mb-1">حظر اللاعب</p>
                  <p className="text-charcoal text-sm mb-2">{foundState.player.name} — رقم {foundState.participant?.competitionNumber}</p>
                  <p className="text-muted-text text-xs font-serif">الحظر يطال ملف اللاعب الدائم. فقط الإدارة المخولة تستطيع رفعه.</p>
                </div>
                <p className="text-muted-text text-sm mb-3">سبب الحظر <span className="text-red-500">*</span></p>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                  placeholder="اكتب سبب الحظر بوضوح..."
                  className="w-full bg-white border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-400 resize-none mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleParticipantAction}
                    disabled={!actionReason.trim() || isApplyingAction}
                    className="flex-1 bg-red-600 text-white py-4 font-black rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isApplyingAction ? 'جارٍ الحفظ...' : 'تأكيد الحظر'}
                  </button>
                  <button onClick={() => setConfirmAction(null)} className="flex-1 border border-line text-muted-text py-4 rounded-lg hover:bg-sand transition-colors">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unsaved warning modal */}
      {unsavedWarning && (
        <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-6" onClick={() => setUnsavedWarning(false)}>
          <div className="bg-white border border-line rounded-xl p-6 max-w-sm w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-charcoal font-black mb-2">تحذير — نتيجة غير محفوظة</p>
            <p className="text-muted-text text-sm mb-5">تبديل البطولة سيمسح البيانات المُدخلة حالياً. هل تريد المتابعة؟</p>
            <div className="flex gap-3">
              <button onClick={() => applyTournamentSwitch(pendingTournamentSwitch)} className="flex-1 bg-brand text-ivory py-3 font-black rounded-lg text-sm hover:bg-brand-hover transition-colors">
                تبديل وإلغاء البيانات
              </button>
              <button onClick={() => { setUnsavedWarning(false); setPendingTournamentSwitch('') }} className="flex-1 border border-line text-muted-text py-3 rounded-lg text-sm hover:bg-sand transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
