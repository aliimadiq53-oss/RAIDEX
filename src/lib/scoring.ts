import type { JudgeResult } from './types'

export function parseTimeValue(time: string | undefined): number | null {
  if (!time || typeof time !== 'string') return null

  const cleaned = time.trim().replace(/[،٫]/g, '.')
  if (!cleaned) return null

  if (/^00:00(?:\.0{1,3})?$/.test(cleaned)) return null
  if (/^0+(?:\.0+)?$/.test(cleaned)) return null

  const colonMatch = cleaned.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (colonMatch) {
    const [, minutes, seconds, milliseconds = '0'] = colonMatch
    const totalMs = Number(minutes) * 60000 + Number(seconds) * 1000 + Number(String(milliseconds).padEnd(3, '0').slice(0, 3))
    if (!Number.isFinite(totalMs) || totalMs <= 0) return null
    return totalMs
  }

  const decimalMatch = cleaned.match(/^(\d+)(?:\.(\d{1,3}))?$/)
  if (decimalMatch) {
    const [, whole, fraction = '0'] = decimalMatch
    const totalMs = Number(whole) * 1000 + Number(String(fraction).padEnd(3, '0').slice(0, 3))
    if (!Number.isFinite(totalMs) || totalMs <= 0) return null
    return totalMs
  }

  return null
}

function getValidZeroFaultEntries(results: JudgeResult[]) {
  return results
    .filter((result) => getFaultTotal(result) === 0 && parseTimeValue(result.time) !== null)
    .sort((a, b) => (parseTimeValue(a.time) ?? Number.MAX_SAFE_INTEGER) - (parseTimeValue(b.time) ?? Number.MAX_SAFE_INTEGER))
}

export function getFaultTotal(result: Pick<JudgeResult, 'faults'>): number {
  return (result.faults ?? []).reduce((sum, fault) => sum + (Number(fault.count) || 0), 0)
}

export function getTotalElapsedTime(results: Pick<JudgeResult, 'time'>[]): number | null {
  if (results.length === 0) return null
  let total = 0
  for (const result of results) {
    const elapsed = parseTimeValue(result.time)
    if (elapsed === null) return null
    total += elapsed
  }
  return total
}

export function formatElapsedTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds % 60000) / 1000)
  const hundredths = Math.floor((milliseconds % 1000) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

export function compareTotalScoreAndTime(
  a: { totalScore: number; totalTimeMs: number | null; competitionNumber: string },
  b: { totalScore: number; totalTimeMs: number | null; competitionNumber: string },
): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore
  if (a.totalTimeMs === null && b.totalTimeMs !== null) return 1
  if (a.totalTimeMs !== null && b.totalTimeMs === null) return -1
  return (a.totalTimeMs ?? 0) - (b.totalTimeMs ?? 0)
    || Number(a.competitionNumber) - Number(b.competitionNumber)
    || a.competitionNumber.localeCompare(b.competitionNumber)
}

export function recalculateRoundScores(results: JudgeResult[]) {
  const scoreMap = new Map<string, number>()
  const roundGroups = new Map<string, JudgeResult[]>()

  for (const result of results) {
    const roundKey = result.roundNumber > 0
      ? `${result.tournamentId}:${result.roundNumber}`
      : `${result.tournamentId}:${result.roundId}`
    const group = roundGroups.get(roundKey) ?? []
    group.push(result)
    roundGroups.set(roundKey, group)
  }

  for (const roundResults of roundGroups.values()) {
    const seenParticipants = new Set<string>()
    const uniqueRoundResults = roundResults.filter((result) => {
      const participantKey = result.competitionNumber || result.playerId || result.id
      if (seenParticipants.has(participantKey)) {
        scoreMap.set(result.id, 0)
        return false
      }
      seenParticipants.add(participantKey)
      return true
    })
    const zeroFaultEntries = getValidZeroFaultEntries(uniqueRoundResults)

    zeroFaultEntries.forEach((result, index) => {
      scoreMap.set(result.id, index === 0 ? 4 : index === 1 ? 3 : index === 2 ? 2 : 1)
    })

    for (const result of uniqueRoundResults) {
      const faultTotal = getFaultTotal(result)
      if (faultTotal >= 2) {
        scoreMap.set(result.id, 0)
        continue
      }

      if (faultTotal === 1) {
        scoreMap.set(result.id, 0.5)
        continue
      }

      if (parseTimeValue(result.time) === null) {
        scoreMap.set(result.id, 0)
        continue
      }

      if (!scoreMap.has(result.id)) {
        scoreMap.set(result.id, 0)
      }
    }
  }

  return scoreMap
}

export function sortRoundResults(results: JudgeResult[]): JudgeResult[] {
  const scoreMap = recalculateRoundScores(results)
  return [...results].sort((a, b) => {
    const scoreDifference = (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0)
    if (scoreDifference !== 0) return scoreDifference
    const aTime = parseTimeValue(a.time)
    const bTime = parseTimeValue(b.time)
    if (aTime === null && bTime !== null) return 1
    if (aTime !== null && bTime === null) return -1
    return (aTime ?? 0) - (bTime ?? 0)
      || Number(a.competitionNumber) - Number(b.competitionNumber)
      || a.competitionNumber.localeCompare(b.competitionNumber)
  })
}

export function getRoundPosition(result: JudgeResult, results: JudgeResult[]): number {
  const sorted = sortRoundResults(results)
  const resultIndex = sorted.findIndex((entry) => entry.id === result.id)
  return resultIndex < 0 ? results.length + 1 : resultIndex + 1
}

export function recalculateResultScores(results: JudgeResult[]) {
  const scoreMap = recalculateRoundScores(results)
  return results.map((result) => ({ ...result, systemScore: scoreMap.get(result.id) ?? 0 }))
}

export function getEffectiveScore(result: JudgeResult, results: JudgeResult[]) {
  return recalculateRoundScores(results).get(result.id) ?? 0
}
