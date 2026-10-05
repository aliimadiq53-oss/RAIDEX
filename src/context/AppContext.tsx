import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { Outlet } from 'react-router'
import type { Appeal, AuditEntry, JudgeResult, LiveDisplayState, Player, Round, SystemUser, Tournament, TournamentTemplate, TournamentSponsor } from '../lib/types'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { cloneKarrFarFaults, KARR_FAR_SCORING_DESCRIPTION, withDefaultKarrFarFaults } from '../lib/karrFarRules'

const EMPTY_TOURNAMENT_TEMPLATE: TournamentTemplate = {
  id: 'custom',
  name: 'بطولة مخصصة',
  type: 'مخصص',
  description: '',
  totalRounds: 0,
  roundNames: [],
  faults: cloneKarrFarFaults(),
  scoringDescription: KARR_FAR_SCORING_DESCRIPTION,
}

export interface HeroSlide {
  id: string
  imageUrl: string
  tag: string
  headline: string
  subheadline: string
  ctaText: string
}

export interface GalleryImage {
  id: string
  url: string
  alt: string
}

export interface ChampionEntry {
  id: string
  name: string
  tournament: string
  year: string
  country: string
  imageUrl: string
}

export interface NewsItem {
  id: string
  title: string
  category: string
  date: string
  imageUrl: string
}

export interface SponsorEntry {
  id: string
  name: string
  logoUrl?: string
}

export interface SiteSettings {
  liveResultsEnabled?: boolean
  sections: {
    hero: boolean
    news: boolean
    gallery: boolean
    champions: boolean
    sponsors: boolean
    international: boolean
  }
  /* Hero */
  heroTitle: string
  heroSubtitle: string
  heroCta: string
  heroSlides: HeroSlide[]
  /* Upcoming tournament banner */
  upcomingTitle: string
  upcomingDate: string
  upcomingLocation: string
  upcomingDescription: string
  upcomingTargetDate: string
  upcomingImageUrl: string
  /* Heritage / About */
  heritageTitle: string
  heritageSubtitle: string
  heritageBody: string
  heritageImageUrl: string
  /* Gallery */
  galleryImages: GalleryImage[]
  /* Champions */
  champions: ChampionEntry[]
  /* News */
  newsItems: NewsItem[]
  /* Sponsors */
  sponsors: SponsorEntry[]
  /* Footer */
  footerEmail: string
  footerCity: string
  footerOrganization: string
}

interface AppContextValue {
  players: Player[]
  setPlayers: (p: Player[]) => void
  tournaments: Tournament[]
  setTournaments: (t: Tournament[]) => void
  template: TournamentTemplate
  addEdition: (date: string, rounds: number, venue?: string, description?: string) => Promise<string>
  startEdition: (id: string) => Promise<void>
  cancelEdition: (id: string, reason: string) => void
  completeEdition: (id: string) => void
  siteSettings: SiteSettings
  setSiteSettings: (s: SiteSettings) => Promise<void>
  judgeResults: JudgeResult[]
  addJudgeResult: (r: JudgeResult) => void
  disqualifyParticipant: (tournamentId: string, participantId: string, reason: string) => Promise<void>
  banPlayer: (playerId: string, reason: string) => Promise<void>
  updateResultStatus: (id: string, status: 'approved' | 'rejected', meta?: { approvedBy?: string; rejectedReason?: string }) => void
  publishResult: (id: string, publish: boolean) => void
  liveState: LiveDisplayState
  setLiveDisplay: (result: JudgeResult | null, displayState: LiveDisplayState['displayState'], podiumRank?: 1 | 2 | 3 | null, podiumContext?: 'round' | 'final') => Promise<void>
  liveResultsEnabled: boolean
  setLiveResultsEnabled: (v: boolean) => void
  appeals: Appeal[]
  auditEntries: AuditEntry[]
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => void
  addAppeal: (appeal: Omit<Appeal, 'id' | 'submittedAt' | 'status'>) => void
  updateAppeal: (id: string, patch: Partial<Appeal>) => void
  /* Auth */
  currentUser: SystemUser | null
  login: (username: string, password: string) => Promise<SystemUser | null>
  logout: () => void
  /* User management */
  users: SystemUser[]
  addUser: (u: Omit<SystemUser, 'id' | 'lastLogin'>) => void
  updateUser: (id: string, patch: Partial<SystemUser>) => void
  deleteUser: (id: string) => Promise<void>
  /* Role permissions */
  rolePerms: Record<string, string[]>
  saveRolePerms: (role: string, perms: string[]) => Promise<void> | void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside Root')
  return ctx
}

const BC_CHANNEL = 'afandi_live_display'

function normalizeTournament(raw: Partial<Tournament> & Record<string, unknown>): Tournament {
  const brandingKey = `afandi:tournament-branding:${String(raw.id ?? '')}`
  let localBranding: { logoUrl?: string; sponsors?: TournamentSponsor[] } = {}
  if (typeof window !== 'undefined') {
    try { localBranding = JSON.parse(localStorage.getItem(brandingKey) ?? '{}') } catch { localBranding = {} }
  }
  const rawRoundItems = Array.isArray(raw.rounds) ? raw.rounds as any[] : []
  const totalRounds = rawRoundItems.length > 0
    ? rawRoundItems.length
    : Number(raw.totalRounds ?? raw.round_count ?? raw.rounds_count ?? raw.rounds ?? 0)
  const currentRound = Number(raw.currentRound ?? raw.current_round ?? (raw.status === 'active' ? 1 : 0))
  const resolvedCurrentRound = currentRound > 0 ? currentRound : (raw.status === 'active' && totalRounds > 0 ? 1 : 0)
  const judgeIds = Array.isArray(raw.judgeIds)
    ? raw.judgeIds as string[]
    : Array.isArray(raw.judge_ids)
      ? (raw.judge_ids as string[])
      : []
  const participants = Array.isArray(raw.participants) ? (raw.participants as any[]) : []
  const roundItems = rawRoundItems.length > 0
    ? rawRoundItems.map((r, index) => ({
        id: String(r?.id ?? `${raw.id ?? 't'}-R${index + 1}`),
        tournamentId: String(r?.tournamentId ?? raw.id ?? `t-${index + 1}`),
        number: Number(r?.number ?? index + 1),
        name: String(r?.name ?? `الجولة ${index + 1}`),
        status: (r?.status ?? 'not_started') as Round['status'],
        judgeIds: Array.isArray(r?.judgeIds) ? (r.judgeIds as string[]) : [],
      }))
    : Array.from({ length: Math.max(totalRounds, 0) }, (_, index) => ({
        id: `${raw.id ?? 't'}-R${index + 1}`,
        tournamentId: String(raw.id ?? `t-${index + 1}`),
        number: index + 1,
        name: `الجولة ${index + 1}`,
        status: 'not_started' as const,
        judgeIds: [],
      }))

  const normalizedRounds = roundItems.map((round) => {
    const shouldActivateFirstRound = raw.status === 'active'
      && round.status === 'not_started'
      && resolvedCurrentRound <= 1
      && round.number === 1
    return shouldActivateFirstRound ? { ...round, status: 'active' as const } : round
  })

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: String(raw.name ?? 'بطولة الكر والفر'),
    type: String(raw.type ?? 'الكر والفر'),
    rulesetId: String(raw.rulesetId ?? 'RS01'),
    date: String(raw.date ?? ''),
    location: String(raw.location ?? raw.venue ?? ''),
    status: (raw.status ?? 'upcoming') as Tournament['status'],
    participantCount: Number(raw.participantCount ?? participants.length ?? 0),
    judgeIds,
    currentRound: resolvedCurrentRound,
    totalRounds,
    description: String(raw.description ?? ''),
    templateId: String(raw.templateId ?? 'KF'),
    participants,
    rounds: normalizedRounds,
    faults: withDefaultKarrFarFaults(Array.isArray(raw.faults) ? raw.faults as Tournament['faults'] : undefined),
    startedAt: raw.startedAt ? String(raw.startedAt) : undefined,
    cancelReason: raw.cancelReason ? String(raw.cancelReason) : undefined,
    cancelledBy: raw.cancelledBy ? String(raw.cancelledBy) : undefined,
      logoUrl: raw.logoUrl ? String(raw.logoUrl) : raw.logo_url ? String(raw.logo_url) : localBranding.logoUrl,
      sponsors: Array.isArray(raw.sponsors) && raw.sponsors.length > 0
        ? raw.sponsors.map((s, index) => typeof s === 'string' ? { id: `sponsor-${index}`, name: s } : { id: String((s as Record<string, unknown>).id ?? `sponsor-${index}`), name: String((s as Record<string, unknown>).name ?? ''), logoUrl: (s as Record<string, unknown>).logoUrl ? String((s as Record<string, unknown>).logoUrl) : undefined }).filter((s) => s.name || s.logoUrl)
        : localBranding.sponsors ?? [],
      logoPosition: (raw.logoPosition ?? raw.logo_position ?? localBranding.logoPosition ?? 'top-left') as Tournament['logoPosition'],
      logoSize: Number(raw.logoSize ?? raw.logo_size ?? localBranding.logoSize ?? 96),
      logoX: Number(raw.logoX ?? raw.logo_x ?? localBranding.logoX ?? 8),
      logoY: Number(raw.logoY ?? raw.logo_y ?? localBranding.logoY ?? 8),
      websiteTitle: String(raw.websiteTitle ?? raw.website_title ?? ''),
      websiteDescription: String(raw.websiteDescription ?? raw.website_description ?? ''),
      websiteTargetDate: String(raw.websiteTargetDate ?? raw.website_target_date ?? ''),
      websiteHeroImage: String(raw.websiteHeroImage ?? raw.website_hero_image ?? ''),
      websiteAboutImage: String(raw.websiteAboutImage ?? raw.website_about_image ?? ''),
      websiteImages: Array.isArray(raw.websiteImages) ? raw.websiteImages as string[] : Array.isArray(raw.website_images) ? raw.website_images as string[] : [],
      websiteShowParticipants: raw.websiteShowParticipants === undefined && raw.website_show_participants === undefined
        ? true
        : Boolean(raw.websiteShowParticipants ?? raw.website_show_participants),
      websiteShowRounds: raw.websiteShowRounds === undefined && raw.website_show_rounds === undefined
        ? true
        : Boolean(raw.websiteShowRounds ?? raw.website_show_rounds),
      websiteShowSponsors: raw.websiteShowSponsors === undefined && raw.website_show_sponsors === undefined
        ? true
        : Boolean(raw.websiteShowSponsors ?? raw.website_show_sponsors),
  }
}

import { recalculateRoundScores } from '../lib/scoring'

function normalizeResult(raw: Partial<JudgeResult> & Record<string, unknown>): JudgeResult {
  const normalized: JudgeResult = {
    id: String(raw.id ?? crypto.randomUUID()),
    competitionNumber: String(raw.competitionNumber ?? raw.competition_number ?? ''),
    playerId: String(raw.playerId ?? raw.player_id ?? ''),
    playerName: String(raw.playerName ?? raw.player_name ?? ''),
    horseName: String(raw.horseName ?? raw.horse_name ?? ''),
    tournamentId: String(raw.tournamentId ?? raw.tournament_id ?? ''),
    tournamentName: String(raw.tournamentName ?? raw.tournament_name ?? ''),
    roundId: String(raw.roundId ?? raw.round_id ?? ''),
    roundNumber: Number(raw.roundNumber ?? raw.round ?? 1),
    roundName: String(raw.roundName ?? raw.round_name ?? ''),
    judgeId: String(raw.judgeId ?? raw.judge_id ?? ''),
    judgeName: String(raw.judgeName ?? raw.judge_name ?? ''),
    time: String(raw.time ?? ''),
    faults: Array.isArray(raw.faults) ? raw.faults as JudgeResult['faults'] : [],
    systemScore: Number(raw.systemScore ?? raw.total ?? 0),
    status: String(raw.status ?? '') === 'submitted' ? 'pending' : (raw.status as JudgeResult['status'] ?? 'pending'),
    published: Boolean(raw.published),
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : undefined,
    submittedAt: String(raw.submittedAt ?? raw.submitted_at ?? ''),
    approvedBy: raw.approvedBy ? String(raw.approvedBy) : raw.approved_by ? String(raw.approved_by) : undefined,
    approvedAt: raw.approvedAt ? String(raw.approvedAt) : raw.approved_at ? String(raw.approved_at) : undefined,
    rejectedReason: raw.rejectedReason ? String(raw.rejectedReason) : raw.rejected_reason ? String(raw.rejected_reason) : undefined,
  }

  const recalculated = recalculateRoundScores([normalized]).get(normalized.id) ?? 0
  return { ...normalized, systemScore: recalculated }
}

function normalizeAppeal(raw: Record<string, unknown>): Appeal {
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    playerId: raw.playerId ? String(raw.playerId) : raw.player_id ? String(raw.player_id) : undefined,
    tournamentId: String(raw.tournamentId ?? raw.tournament_id ?? ''),
    participantId: String(raw.participantId ?? raw.participant_id ?? ''),
    competitionNumber: String(raw.competitionNumber ?? raw.competition_number ?? ''),
    playerName: String(raw.playerName ?? raw.player_name ?? ''),
    text: String(raw.text ?? raw.reason ?? ''),
    status: raw.status === 'reviewing' ? 'reviewed' : raw.status === 'rejected' ? 'dismissed' : (raw.status as Appeal['status'] ?? 'pending'),
    submittedAt: String(raw.submittedAt ?? raw.submitted_at ?? ''),
    adminResponse: raw.adminResponse ? String(raw.adminResponse) : raw.admin_notes ? String(raw.admin_notes) : undefined,
  }
}

function normalizePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (!value || typeof value !== 'object') return []
  const labels: Record<string, string> = {
    view_results: 'عرض البطولات', edit_results: 'تعديل نتيجة', publish_results: 'اعتماد نتيجة',
    manage_users: 'إدارة المستخدمين', manage_tournaments: 'تعديل بطولة', manage_site: 'إدارة الموقع',
    view_appeals: 'مشاهدة الاعتراضات', resolve_appeals: 'حل الاعتراضات',
    disqualify_player: 'استبعاد لاعب', ban_player: 'حظر لاعب',
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => labels[key] ?? key)
}

const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  admin: ['عرض البطولات', 'إنشاء بطولة', 'تعديل بطولة', 'إضافة لاعب', 'تعديل لاعب', 'إضافة مشارك', 'إدخال نتيجة', 'تعديل نتيجة', 'اعتماد نتيجة', 'رفض نتيجة', 'استبعاد لاعب', 'حظر لاعب', 'إزالة حظر', 'إدارة الموقع', 'إدارة العرض المباشر', 'مشاهدة سجل العمليات'],
  tournament_manager: ['عرض البطولات', 'تعديل بطولة', 'إضافة مشارك', 'اعتماد نتيجة', 'رفض نتيجة', 'استبعاد لاعب'],
  data_entry: ['عرض البطولات', 'إضافة لاعب', 'تعديل لاعب', 'إضافة مشارك'],
  judge: ['إدخال نتيجة', 'استبعاد لاعب', 'حظر لاعب'],
  result_reviewer: ['عرض البطولات', 'اعتماد نتيجة', 'رفض نتيجة'],
  screen_controller: ['عرض البطولات', 'إدارة العرض المباشر'],
}

const normalizeRoleName = (role?: string | null): string => {
  const value = String(role ?? '').trim()
  if (!value) return ''
  return value
}

export function Root() {
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null)
  const [users, setUsers] = useState<SystemUser[]>([])
  const [rolePerms, setRolePermsState] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMS)
  const [players, setPlayers] = useState<Player[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [siteSettings, setSiteSettingsState] = useState<SiteSettings>({
    sections: { hero: true, news: true, gallery: true, champions: true, sponsors: true, international: true },
    heroTitle: '', heroSubtitle: '', heroCta: '', heroSlides: [],
    upcomingTitle: '', upcomingDate: '', upcomingLocation: '', upcomingDescription: '', upcomingTargetDate: '', upcomingImageUrl: '',
    heritageTitle: '', heritageSubtitle: '', heritageBody: '', heritageImageUrl: '', galleryImages: [], champions: [], newsItems: [], sponsors: [],
    footerEmail: '', footerCity: '', footerOrganization: '',
  })
  const latestLoadRequestRef = useRef(0)
  const protectedPollInFlightRef = useRef(false)
  const tournamentPollInFlightRef = useRef(false)
  const livePollInFlightRef = useRef(false)
  const liveActionRef = useRef(false)
  const rolePermsMutationRef = useRef(false)
  const liveMutationVersionRef = useRef(0)
  const publishActionRef = useRef(new Set<string>())
  const authGenerationRef = useRef(0)
  const [judgeResults, setJudgeResults] = useState<JudgeResult[]>([])
  const [appeals, setAppeals] = useState<Appeal[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [liveResultsEnabled, setLiveResultsEnabledState] = useState(true)
  const [liveState, setLiveState] = useState<LiveDisplayState>({
    displayState: 'waiting',
    result: null,
    tournamentName: 'بطولة رايد إكس الدولية',
    roundName: 'التصفيات الثانية',
  })

  /* BroadcastChannel — cross-tab sync for LED display */
  const bcRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    const bc = new BroadcastChannel(BC_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e) => {
      if (e.data?.type === 'live_sync') {
        setLiveState(e.data.liveState)
        if (e.data.judgeResults) setJudgeResults(e.data.judgeResults)
      }
    }
    return () => bc.close()
  }, [])

  useEffect(() => {
    const loadSiteData = async () => {
      try {
        const [settingsResult, slidesResult, galleryResult, championsResult, newsResult, sponsorsResult] = await Promise.allSettled([
          apiGet<Partial<SiteSettings>>('/settings'),
          apiGet<Array<Record<string, unknown>>>('/content/hero_slides'),
          apiGet<Array<Record<string, unknown>>>('/content/gallery'),
          apiGet<Array<Record<string, unknown>>>('/content/champions'),
          apiGet<Array<Record<string, unknown>>>('/content/news'),
          apiGet<Array<Record<string, unknown>>>('/content/sponsors'),
        ])
        const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : {}
        if (typeof settings.liveResultsEnabled === 'boolean') setLiveResultsEnabledState(settings.liveResultsEnabled)
        const content = (result: PromiseSettledResult<Array<Record<string, unknown>>>) => (result.status === 'fulfilled' ? result.value : []).map((item) => ({
          id: String(item.id),
          title: String(item.title || ''),
          subtitle: String(item.subtitle || ''),
          body: String(item.body || ''),
          image_url: String(item.image_url || ''),
          meta: (item.meta || {}) as Record<string, unknown>,
        }))
        setSiteSettingsState((current) => ({
          ...current,
          ...settings,
          heroSlides: Array.isArray(settings.heroSlides) ? settings.heroSlides : content(slidesResult).map((item) => ({ id: item.id, imageUrl: item.image_url, tag: item.subtitle, headline: item.title, subheadline: item.body, ctaText: String(item.meta.ctaText || '') })),
          galleryImages: Array.isArray(settings.galleryImages) ? settings.galleryImages : content(galleryResult).map((item) => ({ id: item.id, url: item.image_url, alt: item.title })),
          champions: Array.isArray(settings.champions) ? settings.champions : content(championsResult).map((item) => ({ id: item.id, name: item.title, tournament: item.subtitle, year: String(item.meta.year || ''), country: String(item.meta.country || ''), imageUrl: item.image_url })),
          newsItems: Array.isArray(settings.newsItems) ? settings.newsItems : content(newsResult).map((item) => ({ id: item.id, title: item.title, category: item.subtitle, date: String(item.meta.date || ''), imageUrl: item.image_url })),
          sponsors: Array.isArray(settings.sponsors) ? settings.sponsors : content(sponsorsResult).map((item) => ({ id: item.id, name: item.title })),
        }))
      } catch {
        // Empty API responses should leave the public site without fabricated content.
      }
    }
    void loadSiteData()
  }, [])

  useEffect(() => {
    const syncTournamentData = () => {
      if (tournamentPollInFlightRef.current) return
      tournamentPollInFlightRef.current = true
      const loadSnapshot = async () => {
        const storedToken = sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token')
        if (!storedToken) {
          const [tournaments, players] = await Promise.all([
            apiGet<Array<Partial<Tournament> & Record<string, unknown>>>('/tournaments'),
            apiGet<Player[]>('/players').catch(() => []),
          ])
          return { tournaments, players }
        }
        try {
          return await apiGet<{ tournaments: Array<Partial<Tournament> & Record<string, unknown>>; players: Player[] }>('/sync')
        } catch {
          const [tournaments, players] = await Promise.all([
            apiGet<Array<Partial<Tournament> & Record<string, unknown>>>('/tournaments'),
            apiGet<Player[]>('/players').catch(() => []),
          ])
          return { tournaments, players }
        }
      }

      void loadSnapshot()
        .then(({ tournaments: tournamentData, players: playerData }) => {
          setTournaments((current) => tournamentData.map((tournament) => {
            const next = normalizeTournament(tournament)
            const existing = current.find((item) => item.id === next.id)
            const linkedPlayers = playerData.filter((player) => (player.tournament_id ?? player.tournamentId) === next.id)
            return {
              ...next,
              participantCount: Math.max(next.participantCount, linkedPlayers.length),
              participants: next.participants ?? existing?.participants ?? [],
              judgeIds: next.judgeIds ?? existing?.judgeIds ?? [],
            }
          }))
          setPlayers(playerData.map((player) => {
            const rawPlayer = player as Player & { banned_reason?: string; banned_at?: string }
            return {
              ...player,
              bannedReason: player.bannedReason ?? rawPlayer.banned_reason,
              bannedAt: player.bannedAt ?? rawPlayer.banned_at,
            }
          }))
        })
        .catch(() => undefined)
        .finally(() => { tournamentPollInFlightRef.current = false })
    }

    syncTournamentData()
    const pollId = window.setInterval(syncTournamentData, currentUser ? 2000 : 15000)
    return () => window.clearInterval(pollId)
  }, [currentUser])

  useEffect(() => {
    type LiveApiData = {
      result?: JudgeResult | null
      displayState?: LiveDisplayState['displayState']
      podiumRank?: 1 | 2 | 3 | null
      announcedPodium?: LiveDisplayState['announcedPodium']
    }

    const syncLiveState = () => {
      if (liveActionRef.current || livePollInFlightRef.current) return
      livePollInFlightRef.current = true
      const requestVersion = liveMutationVersionRef.current
      void apiGet<{ display_data?: LiveApiData }>('/live').then((live) => {
        if (liveActionRef.current || requestVersion !== liveMutationVersionRef.current) return
        if (!live.display_data) return
        setLiveState((current) => ({
          ...current,
          result: live.display_data?.result ?? null,
          displayState: live.display_data?.displayState ?? 'waiting',
          podiumRank: live.display_data?.podiumRank ?? null,
          announcedPodium: live.display_data?.announcedPodium ?? {},
        }))
      }).catch((error) => console.error('Failed to sync live state', error))
        .finally(() => { livePollInFlightRef.current = false })
    }

    syncLiveState()
    const pollId = window.setInterval(syncLiveState, 1000)
    return () => window.clearInterval(pollId)
  }, [])

  const loadProtectedData = useCallback(async () => {
    const storedToken = sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token')
    if (!currentUser) return
    if (!storedToken) {
      setCurrentUser(null)
      return
    }
    const screenOnly = currentUser?.role === 'screen_controller'
    const requestId = Date.now() + Math.random()
    const currentRequestIdRef = { current: requestId }
    latestLoadRequestRef.current = requestId

    const [syncData, appealData, auditData] = await Promise.allSettled([
      apiGet<{ tournaments: Array<Partial<Tournament> & Record<string, unknown>>; players: Player[]; results: JudgeResult[] }>('/sync'),
      screenOnly ? Promise.resolve([] as Record<string, unknown>[]) : apiGet<Record<string, unknown>[]>('/appeals'),
      screenOnly ? Promise.resolve([] as AuditEntry[]) : apiGet<AuditEntry[]>('/audit'),
    ])

    if (latestLoadRequestRef.current !== requestId) return

    if (syncData.status === 'fulfilled') {
      const tournamentData = syncData.value.tournaments
      const playerData = syncData.value.players
      const resultData = syncData.value.results
      setTournaments((prev) => {
        const next = tournamentData.map((t) => normalizeTournament(t))
        return next.map((t) => {
          const existing = prev.find((current) => current.id === t.id)
          if (!existing) return t
          return {
            ...t,
            participants: t.participants ?? existing.participants ?? [],
            rounds: t.rounds ?? existing.rounds ?? [],
            judgeIds: t.judgeIds ?? existing.judgeIds ?? [],
          }
        })
      })
      const normalizedPlayers = playerData.map((player) => {
        const rawPlayer = player as Player & { banned_reason?: string; banned_at?: string }
        return {
          ...player,
          bannedReason: player.bannedReason ?? rawPlayer.banned_reason,
          bannedAt: player.bannedAt ?? rawPlayer.banned_at,
        }
      })
      setPlayers(normalizedPlayers)
      setTournaments((previous) => previous.map((tournament) => {
        const linkedPlayers = normalizedPlayers.filter((player) => (player.tournament_id ?? player.tournamentId) === tournament.id)
        return {
          ...tournament,
          participantCount: Math.max(tournament.participantCount, linkedPlayers.length),
        }
      }))
      const normalizedResults = resultData.map((result) => normalizeResult(result as JudgeResult & Record<string, unknown>))
      const recalculated = recalculateRoundScores(normalizedResults)
      const nextResults = normalizedResults.map((result) => ({ ...result, systemScore: recalculated.get(result.id) ?? 0 }))
      setJudgeResults(nextResults)
    }
    if (appealData.status === 'fulfilled') setAppeals(appealData.value.map(normalizeAppeal))
    if (auditData.status === 'fulfilled') setAuditEntries(auditData.value)
    const userData = screenOnly ? null : await Promise.resolve(apiGet<SystemUser[]>('/users')).catch(() => null)
    if (latestLoadRequestRef.current !== requestId) return
    if (userData) {
      const normalizedUsers = userData.map((user) => ({
        ...user,
        role: normalizeRoleName(user.role),
        userStatus: user.userStatus ?? (user as SystemUser & { status?: string }).status as SystemUser['userStatus'] ?? 'active',
      }))
      setUsers(normalizedUsers)
      setTournaments((previous) => previous.map((tournament) => ({
        ...tournament,
        judgeIds: normalizedUsers
          .filter((user) => user.role === 'judge' && user.assignedTournaments?.includes(tournament.id))
          .map((user) => user.id),
      })))
    }
    const permissions = screenOnly || rolePermsMutationRef.current
      ? null
      : await Promise.resolve(apiGet<Record<string, unknown>>('/settings/roles')).catch(() => null)
    if (latestLoadRequestRef.current !== requestId) return
    if (permissions) {
      const normalizedPermissions = Object.fromEntries(
        Object.entries(permissions).map(([role, value]) => [normalizeRoleName(role), normalizePermissions(value)])
      )
      setRolePermsState({
        ...DEFAULT_ROLE_PERMS,
        ...normalizedPermissions,
        data_entry: normalizedPermissions.data_entry ?? DEFAULT_ROLE_PERMS.data_entry,
        result_reviewer: normalizedPermissions.result_reviewer ?? DEFAULT_ROLE_PERMS.result_reviewer,
      })
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    const intervalId = window.setInterval(() => {
      const storedToken = sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token')
      if (!storedToken) {
        setCurrentUser(null)
        return
      }
      if (protectedPollInFlightRef.current) return
      protectedPollInFlightRef.current = true
      void loadProtectedData().finally(() => { protectedPollInFlightRef.current = false })
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [currentUser, loadProtectedData])

  useEffect(() => {
    const restoreSession = async () => {
      const restoreGeneration = authGenerationRef.current
      const token = sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token')
      if (!token) {
        setCurrentUser(null)
        return
      }
      try {
        const user = await apiGet<SystemUser>('/auth/me')
        const nextUser = { ...user, userStatus: user.userStatus || 'active' } as SystemUser
        sessionStorage.setItem('afandi_token', token)
        localStorage.setItem('afandi_token', token)
        setCurrentUser(nextUser)
      } catch {
        const currentToken = sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token')
        if (restoreGeneration === authGenerationRef.current && currentToken === token) {
          sessionStorage.removeItem('afandi_token')
          localStorage.removeItem('afandi_token')
          setCurrentUser(null)
        }
      }
    }
    void restoreSession()
  }, [])

  useEffect(() => {
    if (!currentUser) return
    void loadProtectedData()
  }, [currentUser, loadProtectedData])

  const broadcast = (state: LiveDisplayState, results: JudgeResult[]) => {
    bcRef.current?.postMessage({ type: 'live_sync', liveState: state, judgeResults: results })
  }

  const addAuditEntry = (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => {
    const auditEntry: AuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      userId: currentUser?.id ?? '',
      userName: currentUser?.name ?? 'مستخدم النظام',
      timestamp: new Date().toLocaleString('ar-IQ'),
    }
    setAuditEntries((previous) => [auditEntry, ...previous])
    void apiPost('/audit', { ...entry, user_name: auditEntry.userName }).catch(() => undefined)
  }

  const addJudgeResult = async (result: JudgeResult) => {
    await apiPost('/results', {
      player_id: result.playerId,
      tournament_id: result.tournamentId,
      competition_number: result.competitionNumber,
      round_id: result.roundId,
      round: result.roundNumber,
      round_name: result.roundName,
      tournament_name: result.tournamentName,
      player_name: result.playerName,
      horse_name: result.horseName,
      judge_name: result.judgeName,
      time: result.time,
      faults: result.faults,
      scores: { systemScore: result.systemScore },
      notes: '',
    })
    addAuditEntry({ tournamentId: result.tournamentId, action: 'إدخال نتيجة', description: `${result.playerName} - ${result.roundName} - ${result.time}`, category: 'نتائج' })
    setJudgeResults((prev) => {
      const next = [{ ...result, published: false }, ...prev]
      broadcast(liveState, next)
      return next
    })
    await loadProtectedData()
  }

  const disqualifyParticipant = async (tournamentId: string, participantId: string, reason: string) => {
    await apiPost(`/tournaments/${tournamentId}/disqualify`, { participant_id: participantId, reason })
    addAuditEntry({ action: 'استبعاد لاعب', description: `البطولة ${tournamentId} - المشارك ${participantId} - ${reason}`, category: 'بطولات' })
    await loadProtectedData()
  }

  const banPlayer = async (playerId: string, reason: string) => {
    await apiPost(`/players/${playerId}/ban`, { reason })
    addAuditEntry({ action: 'حظر لاعب', description: `معرّف اللاعب ${playerId} - ${reason}`, category: 'لاعبون' })
    await loadProtectedData()
  }

  const updateResultStatus = async (
    id: string,
    status: 'approved' | 'rejected',
    meta?: { approvedBy?: string; rejectedReason?: string }
  ) => {
    const result = judgeResults.find((item) => item.id === id)
    await apiPut(`/results/${id}/status`, {
      status,
      approved_by: meta?.approvedBy ?? '',
      rejected_reason: meta?.rejectedReason ?? '',
    })
    if (result) addAuditEntry({ tournamentId: result.tournamentId, action: status === 'approved' ? 'اعتماد نتيجة' : 'رفض نتيجة', description: `${result.playerName} - ${result.roundName}`, category: 'نتائج' })
    setJudgeResults((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, approvedBy: meta?.approvedBy, approvedAt: status === 'approved' ? 'الآن' : undefined, rejectedReason: meta?.rejectedReason }
          : r
      )
    )
    await loadProtectedData()
  }

  const publishResult = async (id: string, publish: boolean) => {
    const actionKey = `${id}:${publish ? 'publish' : 'unpublish'}`
    if (publishActionRef.current.has(actionKey)) return
    publishActionRef.current.add(actionKey)
    setJudgeResults((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, published: publish, publishedAt: publish ? 'الآن' : undefined } : r
      )
    )
    try {
      if (publish) await apiPost(`/results/${id}/publish`, {})
      else await apiPut(`/results/${id}/status`, { status: 'pending' })
      await loadProtectedData()
    } finally {
      publishActionRef.current.delete(actionKey)
    }
  }

  const addEdition = async (date: string, rounds: number, venue?: string, description?: string): Promise<string> => {
    const { id } = await apiPost<{ id: string }>('/tournaments', {
      name: 'بطولة جديدة',
      date,
      location: venue ?? '',
      status: 'upcoming',
      type: 'مخصص',
      rounds,
      venue: venue ?? '',
      description: description ?? '',
    })
    await loadProtectedData()
    const edition: Tournament = {
      id,
      name: 'بطولة جديدة',
      type: 'مخصص',
      rulesetId: 'custom',
      date,
      location: venue ?? '',
      status: 'upcoming',
      participantCount: 0,
      judgeIds: [],
      currentRound: 0,
      totalRounds: rounds,
      description: description ?? '',
      templateId: EMPTY_TOURNAMENT_TEMPLATE.id,
      participants: [],
      faults: cloneKarrFarFaults(),
      rounds: Array.from({ length: rounds }, (_, i) => ({
        id: `${id}-R${i + 1}`,
        tournamentId: id,
        number: i + 1,
        name: `الجولة ${i + 1}`,
        status: 'not_started' as const,
        judgeIds: [],
      })),
      startedAt: undefined,
    }
    setTournaments((prev) => [edition, ...prev])
    return id
  }

  const startEdition = async (id: string) => {
    await apiPost(`/tournaments/${id}/start`, {})
    setTournaments((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const rounds = (t.rounds ?? []).map((r, i) =>
          i === 0 ? { ...r, status: 'active' as const } : r
        )
        const firstRoundName = rounds[0]?.name ?? ''
        setLiveState((ls) => ({ ...ls, tournamentName: t.name, roundName: firstRoundName }))
        return { ...t, status: 'active' as const, currentRound: 1, startedAt: new Date().toISOString(), rounds }
      })
    )
  }

  const cancelEdition = async (id: string, reason: string) => {
    await apiPost(`/tournaments/${id}/cancel`, { reason })
    setTournaments((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'cancelled' as const, cancelReason: reason, cancelledBy: 'المدير' }
          : t
      )
    )
  }

  const completeEdition = async (id: string) => {
    await apiPost(`/tournaments/${id}/complete`, {})
    setTournaments((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'completed' as const } : t
      )
    )
    setLiveState((prev) => {
      const completed = tournaments.find((t) => t.id === id)
      if (!completed) return prev
      return {
        ...prev,
        tournamentName: prev.tournamentName || completed.name,
        roundName: prev.roundName || (completed.rounds?.[completed.currentRound - 1]?.name ?? prev.roundName),
      }
    })
  }

  const addAppeal = async (data: Omit<Appeal, 'id' | 'submittedAt' | 'status'>) => {
    const localAppeal = {
      ...data,
      id: `APL-${Date.now()}`,
      status: 'pending' as const,
      submittedAt: new Date().toLocaleString('ar-IQ'),
    }
    await apiPost('/appeals', {
      player_id: data.playerId ?? data.participantId,
      tournament_id: data.tournamentId,
      reason: data.text,
      round: null,
    })
    setAppeals((prev) => [...prev, localAppeal])
    await loadProtectedData()
  }

  const updateAppeal = async (id: string, patch: Partial<Appeal>) => {
    setAppeals((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a))
    await apiPut(`/appeals/${id}`, {
      ...(patch.status ? { status: patch.status === 'reviewed' ? 'reviewing' : patch.status === 'dismissed' ? 'rejected' : patch.status } : {}),
      ...(patch.adminResponse !== undefined ? { admin_notes: patch.adminResponse } : {}),
    })
    await loadProtectedData()
  }

  const login = async (username: string, password: string): Promise<SystemUser | null> => {
    authGenerationRef.current += 1
    const result = await apiPost<{ token: string; user: SystemUser }>('/auth/login', { username, password })
    const token = result.token
    sessionStorage.setItem('afandi_token', token)
    localStorage.setItem('afandi_token', token)
    const user = { ...result.user, userStatus: result.user.userStatus || 'active' } as SystemUser
    setCurrentUser(user)
    return user
  }

  const logout = () => {
    sessionStorage.removeItem('afandi_token')
    localStorage.removeItem('afandi_token')
    setCurrentUser(null)
  }

  const addUser = async (data: Omit<SystemUser, 'id' | 'lastLogin'>) => {
    const apiRole = normalizeRoleName(data.role)
    const apiData = {
      ...data,
      role: apiRole,
    }
    const { id } = await apiPost<{ id: string }>('/users', apiData)
    setUsers((prev) => [...prev, { ...data, role: apiRole, id, lastLogin: '—' }])
    await loadProtectedData()
  }

  const updateUser = async (id: string, patch: Partial<SystemUser>) => {
    const apiPatch = { ...patch, ...(patch.userStatus ? { status: patch.userStatus } : {}) }
    if (apiPatch.role) apiPatch.role = normalizeRoleName(apiPatch.role)
    delete (apiPatch as Partial<SystemUser> & { status?: string }).userStatus
    await apiPut(`/users/${id}`, apiPatch)
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...patch, role: patch.role ? normalizeRoleName(patch.role) : u.role } : u))
    await loadProtectedData()
  }

  const deleteUser = async (id: string) => {
    await apiDelete(`/users/${id}`)
    setUsers((prev) => prev.filter((user) => user.id !== id))
    await loadProtectedData()
  }

  const setSiteSettings = async (settings: SiteSettings) => {
    await apiPut('/settings', settings)
    setSiteSettingsState(settings)
  }

  const setLiveResultsEnabled = (enabled: boolean) => {
    setLiveResultsEnabledState(enabled)
    void apiPut('/settings', { ...siteSettings, liveResultsEnabled: enabled }).catch((error) => console.error('Failed to save live results setting', error))
  }

  const saveRolePerms = async (role: string, perms: string[]) => {
    const normalizedRole = normalizeRoleName(role)
    rolePermsMutationRef.current = true
    latestLoadRequestRef.current = Date.now() + Math.random()
    setRolePermsState((prev) => ({ ...prev, [normalizedRole]: perms }))
    try {
      await apiPut('/settings/roles', { role: normalizedRole, permissions: perms })
    } catch (error) {
      console.error('Failed to save role permissions', error)
      throw error
    } finally {
      rolePermsMutationRef.current = false
      latestLoadRequestRef.current = Date.now() + Math.random()
    }
  }

  const setLiveDisplay = async (result: JudgeResult | null, displayState: LiveDisplayState['displayState'], podiumRank?: 1 | 2 | 3 | null, podiumContext?: 'round' | 'final') => {
    if (liveActionRef.current) return
    liveActionRef.current = true
    liveMutationVersionRef.current += 1
    let nextState: LiveDisplayState
    setLiveState((prev) => {
      const currentTournament = tournaments
        .filter((t) => !['archived', 'cancelled', 'completed'].includes(t.status))
        .find((t) => t.status === 'active') ?? tournaments.filter((t) => !['archived', 'cancelled', 'completed'].includes(t.status))[0]
      const next = {
        ...prev,
        result,
        displayState,
        podiumRank: displayState === 'podium' ? (podiumRank ?? prev.podiumRank ?? null) : null,
        announcedPodium: displayState === 'podium' && podiumRank && result
          ? { ...prev.announcedPodium, [podiumRank]: result }
          : {},
        tournamentName: currentTournament?.name ?? prev.tournamentName,
        roundName: currentTournament?.rounds?.find((r) => r.status === 'active')?.name ?? prev.roundName,
      }
      nextState = next
      broadcast(next, judgeResults)
      return next
    })
    try {
      await apiPut('/live', {
        current_player_id: result?.playerId ?? null,
        current_tournament_id: result?.tournamentId ?? null,
        is_active: displayState !== 'waiting',
        display_data: {
          result,
          displayState,
          podiumRank: displayState === 'podium' ? (podiumRank ?? null) : null,
          announcedPodium: displayState === 'podium' && podiumRank && result
            ? { ...nextState!.announcedPodium, [podiumRank]: result }
            : {},
          podiumContext: displayState === 'podium' ? (podiumContext ?? 'round') : undefined,
        },
        display_state: displayState,
      })
    } catch (error) {
      console.error('Failed to save live display state', error)
      throw error
    } finally {
      liveActionRef.current = false
    }
  }

  useEffect(() => {
    if (!tournaments.length) return
    const currentTournament = tournaments.find((t) => t.status === 'active')
      ?? tournaments.find((t) => ['registration', 'upcoming', 'not_started'].includes(t.status))
      ?? tournaments.find((t) => t.status === 'completed')
      ?? tournaments[0]
    if (!currentTournament) return
    const activeRound = currentTournament.rounds?.find((r) => r.status === 'active') ?? currentTournament.rounds?.[0]
    setLiveState((prev) => {
      const nextTournamentName = prev.tournamentName && prev.tournamentName !== 'بطولة رايد إكس الدولية' ? prev.tournamentName : currentTournament.name
      const nextRoundName = prev.roundName && prev.roundName !== 'التصفيات الثانية' ? prev.roundName : (activeRound?.name ?? prev.roundName)
      if (prev.tournamentName === nextTournamentName && prev.roundName === nextRoundName) return prev
      return { ...prev, tournamentName: nextTournamentName, roundName: nextRoundName }
    })
  }, [tournaments])

  useEffect(() => {
    const activeDisplayStates = new Set(['result', 'player_intro', 'disqualified', 'podium'])
    if (!judgeResults.length || !activeDisplayStates.has(liveState.displayState)) return

    const displayed = judgeResults.find((result) => result.id === liveState.result?.id)
      ?? judgeResults.find((result) => result.status === 'approved' || result.status === 'pending')
      ?? judgeResults[0]

    if (!displayed) return

    setLiveState((previous) => {
      if (previous.result?.id === displayed.id) return previous
      return {
        ...previous,
        result: displayed,
        tournamentName: displayed.tournamentName || previous.tournamentName,
        roundName: displayed.roundName || previous.roundName,
      }
    })
  }, [judgeResults, liveState.displayState, liveState.result?.id])

  const value: AppContextValue = {
    players, setPlayers,
    tournaments, setTournaments,
    template: EMPTY_TOURNAMENT_TEMPLATE,
    addEdition, startEdition, cancelEdition, completeEdition,
    siteSettings, setSiteSettings,
    judgeResults, addJudgeResult, disqualifyParticipant, banPlayer, updateResultStatus, publishResult,
    liveState, setLiveDisplay,
    liveResultsEnabled, setLiveResultsEnabled,
    appeals, addAppeal, updateAppeal, auditEntries, addAuditEntry,
    currentUser, login, logout,
    users, addUser, updateUser, deleteUser,
    rolePerms, saveRolePerms,
  }

  return (
    <AppContext.Provider value={value}>
      <Outlet />
    </AppContext.Provider>
  )
}
