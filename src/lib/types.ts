export type TournamentStatus = 'not_started' | 'upcoming' | 'registration' | 'active' | 'completed' | 'archived' | 'cancelled'
export type ResultStatus = 'pending' | 'approved' | 'rejected'
export type PlayerStatus = 'active' | 'banned'
export type RoundStatus = 'not_started' | 'active' | 'closed' | 'completed'
export type UserRole = 'super_admin' | 'admin' | 'tournament_manager' | 'data_entry' | 'judge' | 'result_reviewer' | 'screen_controller'
export type DisplayState = 'waiting' | 'player_intro' | 'result' | 'disqualified' | 'break' | 'podium'

export interface Player {
  id: string
  name: string
  dob: string
  phone: string
  club: string
  status: PlayerStatus
  tournament_id?: string
  tournamentId?: string
  bannedReason?: string
  bannedAt?: string
}

export interface Horse {
  id: string
  name: string
  registrationNo: string
  breed: string
  age: number
  gender: string
  color: string
  owner: string
}

export interface Fault {
  id: string
  name: string
  description: string
  penalty: number
  disqualifies: boolean
  repeatable: boolean
  active: boolean
}

export interface Ruleset {
  id: string
  name: string
  description: string
  rounds: number
  faults: Fault[]
  scoringDescription: string
}

export interface Participant {
  id: string
  competitionNumber: string
  playerId: string
  horseId: string
  tournamentId: string
  category: string
  status: 'active' | 'disqualified' | 'withdrawn'
  disqualifiedReason?: string
  roundsCompleted: number
  appealCode?: string
}

export type AppealStatus = 'pending' | 'reviewed' | 'dismissed'

export interface Appeal {
  id: string
  playerId?: string
  tournamentId: string
  participantId: string
  competitionNumber: string
  playerName: string
  roundName?: string
  text: string
  status: AppealStatus
  submittedAt: string
  reviewedAt?: string
  reviewedBy?: string
  adminResponse?: string
}

export interface Round {
  id: string
  tournamentId: string
  number: number
  name: string
  status: RoundStatus
  judgeIds: string[]
}

export interface Tournament {
  id: string
  name: string
  type: string
  rulesetId: string
  date: string
  location: string
  status: TournamentStatus
  participantCount: number
  judgeIds: string[]
  currentRound: number
  totalRounds: number
  description: string
  /* Edition system — present on Karr & Farr editions */
  templateId?: string
  participants?: Participant[]
  rounds?: Round[]
  faults?: Fault[]
  startedAt?: string
  cancelReason?: string
  cancelledBy?: string
  logoUrl?: string
  sponsors?: TournamentSponsor[]
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'center'
  logoSize?: number
  logoX?: number
  logoY?: number
    /* Website display settings */
    websiteTitle?: string
    websiteDescription?: string
    websiteTargetDate?: string
    websiteHeroImage?: string
    websiteAboutImage?: string
    websiteImages?: string[]
    websiteVideoUrl?: string
    websiteShowParticipants?: boolean
    websiteShowRounds?: boolean
    websiteShowSponsors?: boolean
}

export interface TournamentSponsor {
  id: string
  name: string
  logoUrl?: string
}

export interface TournamentTemplate {
  id: string
  name: string
  type: string
  description: string
  totalRounds: number
  roundNames: string[]
  faults: Fault[]
  scoringDescription: string
}

export interface ResultFault {
  faultId: string
  name: string
  count: number
  penalty: number
}

export interface JudgeResult {
  id: string
  competitionNumber: string
  playerId: string
  playerName: string
  horseName: string
  tournamentId: string
  tournamentName: string
  roundId: string
  roundNumber: number
  roundName: string
  judgeId: string
  judgeName: string
  time: string
  faults: ResultFault[]
  systemScore: number
  status: ResultStatus
  published: boolean
  publishedAt?: string
  submittedAt: string
  approvedBy?: string
  approvedAt?: string
  rejectedReason?: string
}

export interface SystemUser {
  id: string
  name: string
  username: string
  email: string
  role: UserRole
  userStatus: 'active' | 'suspended'
  assignedTournaments: string[]
  lastLogin: string
  password?: string
}

export interface AuditEntry {
  id: string
  action: string
  description: string
  userId: string
  userName: string
  category: string
  timestamp: string
}

export interface LiveDisplayState {
  displayState: DisplayState
  result: JudgeResult | null
  tournamentName: string
  roundName: string
  podiumRank?: 1 | 2 | 3 | null
  announcedPodium?: Partial<Record<1 | 2 | 3, JudgeResult>>
  podiumContext?: 'round' | 'final'
}

export interface RulesetSnapshot {
  rulesetId: string
  name: string
  description: string
  scoringDescription: string
  rounds: number
  faults: Fault[]
  snapshotAt: string
}

export interface ArchiveParticipant {
  competitionNumber: string
  playerName: string
  playerId: string
  horseName: string
  category: string
  status: 'active' | 'disqualified' | 'withdrawn'
  disqualifiedReason?: string
}

export interface ArchiveResult {
  id: string
  tournamentId: string
  roundId: string
  playerId: string
  competitionNumber: string
  playerName: string
  roundNumber: number
  roundName: string
  time: string
  faults: ResultFault[]
  systemScore: number
  status: ResultStatus
  published: boolean
  judgeName: string
  submittedAt: string
  approvedBy?: string
  approvedAt?: string
  rejectedReason?: string
}

export interface ArchiveDisqualification {
  competitionNumber: string
  playerName: string
  roundName: string
  reason: string
  by: string
  at: string
}

export interface ArchiveAuditEntry {
  action: string
  description: string
  userName: string
  category: string
  timestamp: string
}

export interface ArchiveAppealSummary {
  competitionNumber: string
  playerName: string
  roundName?: string
  text: string
  status: AppealStatus
  submittedAt: string
  reviewedBy?: string
  adminResponse?: string
}

export interface TournamentArchive {
  tournamentId: string
  name: string
  type: string
  date: string
  location: string
  description: string
  totalRounds: number
  participantCount: number
  judgeNames: string[]
  status: TournamentStatus
  archivedAt: string
  archivedBy: string
  reportVersion: number
  rulesetSnapshot: RulesetSnapshot
  participants: ArchiveParticipant[]
  results: ArchiveResult[]
  disqualifications: ArchiveDisqualification[]
  appeals: ArchiveAppealSummary[]
  auditLog: ArchiveAuditEntry[]
}
