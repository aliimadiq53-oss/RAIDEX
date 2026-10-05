import { Fragment, useEffect, useRef, useState } from 'react'
import HRRideLogo from '../components/HRRideLogo'
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from '../lib/api'
import type { Appeal, AuditEntry, Horse, JudgeResult, LiveDisplayState, SystemUser, Player, Tournament, TournamentSponsor, TournamentTemplate } from '../lib/types'
import { compareTotalScoreAndTime, formatElapsedTime, getEffectiveScore, getRoundPosition, getTotalElapsedTime, parseTimeValue, sortRoundResults } from '../lib/scoring'
import { cloneKarrFarFaults, KARR_FAR_SCORING_DESCRIPTION } from '../lib/karrFarRules'
import TournamentArchiveView from './TournamentArchive'
import type { SiteSettings, HeroSlide, GalleryImage, ChampionEntry, NewsItem, SponsorEntry } from '../context/AppContext'
import { QRCodeSVG } from 'qrcode.react'

function generateAppealCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
function normalizeHorse(raw: Record<string, unknown>): Horse {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    registrationNo: String(raw.registrationNo ?? raw.registration_no ?? ''),
    breed: String(raw.breed ?? ''),
    age: Number(raw.age ?? 0),
    gender: String(raw.gender ?? ''),
    color: String(raw.color ?? ''),
    owner: String(raw.owner ?? ''),
  }
}

type WebsiteDateTimeParts = { date: string; hour: string; minute: string; period: 'AM' | 'PM' }

function parseWebsiteDateTime(value: string): WebsiteDateTimeParts {
  const [date = '', time = '12:00'] = value.split('T')
  const [rawHour = '12', minute = '00'] = time.split(':')
  const hour24 = Number(rawHour) || 0
  return {
    date,
    hour: String(hour24 % 12 || 12).padStart(2, '0'),
    minute,
    period: hour24 >= 12 ? 'PM' : 'AM',
  }
}

function serializeWebsiteDateTime(parts: WebsiteDateTimeParts): string {
  if (!parts.date) return ''
  const hour24 = Number(parts.hour) % 12 + (parts.period === 'PM' ? 12 : 0)
  return `${parts.date}T${String(hour24).padStart(2, '0')}:${parts.minute}`
}

function getRoundRankScore(result: JudgeResult, results: JudgeResult[]) {
  return getEffectiveScore(result, results)
}

function groupResultsByRound(results: JudgeResult[]) {
  const groups = new Map<number, JudgeResult[]>()
  for (const result of results) {
    const roundNumber = result.roundNumber || 1
    groups.set(roundNumber, [...(groups.get(roundNumber) ?? []), result])
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left - right)
}

interface Props {
  onNavigate: (page: string) => void
  judgeResults: JudgeResult[]
  onUpdateResultStatus: (id: string, status: 'approved' | 'rejected', meta?: { approvedBy?: string; rejectedReason?: string }) => Promise<void>
  onPublishResult: (id: string, publish: boolean) => void
  liveState: LiveDisplayState
  onSetLiveDisplay: (result: JudgeResult | null, displayState: LiveDisplayState['displayState'], podiumRank?: 1 | 2 | 3 | null, podiumContext?: 'round' | 'final') => Promise<void>
  liveResultsEnabled: boolean
  onSetLiveResultsEnabled: (enabled: boolean) => void
  siteSettings: SiteSettings
  onUpdateSiteSettings: (s: SiteSettings) => Promise<void>
  players: Player[]
  onSetPlayers: (p: Player[]) => void
  tournaments: Tournament[]
  onSetTournaments: (t: Tournament[]) => void
  template?: TournamentTemplate
  onAddEdition?: (date: string, rounds: number, venue?: string, description?: string) => Promise<string>
  onStartEdition?: (id: string) => Promise<void>
  onCancelEdition?: (id: string, reason: string) => void
  onCompleteEdition?: (id: string) => void
  currentUser?: SystemUser | null
  onLogout?: () => void
  appeals?: Appeal[]
  onUpdateAppeal?: (id: string, patch: Partial<Appeal>) => void
  users?: SystemUser[]
  onAddUser?: (u: Omit<SystemUser, 'id' | 'lastLogin'>) => void
  onUpdateUser?: (id: string, patch: Partial<SystemUser>) => void
  onDeleteUser?: (id: string) => Promise<void>
  rolePerms?: Record<string, string[]>
  onSaveRolePerms?: (role: string, perms: string[]) => void
  onAudit?: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => void
}

type AdminView =
  | 'overview'
  | 'tournaments'
  | 'tournament-workspace'
  | 'create-tournament'
  | 'players'
  | 'player-profile'
  | 'horses'
  | 'judges'
  | 'users'
  | 'roles'
  | 'results-approval'
  | 'live-control'
  | 'site'
  | 'audit-log'
  | 'settings'
  | 'archive'

type WorkspaceTab = 'overview' | 'participants' | 'rounds' | 'judges' | 'rules' | 'faults' | 'results' | 'ranking' | 'appeals' | 'audit' | 'settings-tab' | 'website-settings'
const EMPTY_ROLE_LABELS: Record<string, string> = {
  super_admin: 'مدير النظام',
  admin: 'مسؤول',
  tournament_manager: 'مدير بطولة',
  data_entry: 'مدخل بيانات',
  judge: 'حكم',
  result_reviewer: 'مراجع نتائج',
  screen_controller: 'تحكم الشاشة',
}

function ImageUploadField({ value, onChange, label = 'تحميل صورة' }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const upload = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      const result = await apiUpload<{ url: string }>('/upload', file)
      onChange(result.url)
    } catch (uploadError) {
      setError('تعذر رفع الصورة. تأكد من تسجيل الدخول وحجم الملف (5 MB كحد أقصى).')
      console.error('Failed to upload image', uploadError)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 border border-dashed border-brand/35 bg-brand/5 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-brand/10 transition-colors">
        <span className="text-brand text-xs font-bold">{uploading ? 'جارٍ رفع الصورة...' : label}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = '' }} className="sr-only" />
        <span className="text-muted-text text-xs">JPG · PNG · WEBP</span>
      </label>
      {value && <img src={value} alt="معاينة" className="h-24 w-full rounded-lg border border-line bg-sand object-cover" />}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}

function MultiImageUploadField({ onChange, onUploadingChange, label }: { onChange: (urls: string[]) => void; onUploadingChange: (uploading: boolean) => void; label: string }) {
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const upload = async (files: File[]) => {
    const uploaded: string[] = []
    let failed = 0
    setError('')
    onUploadingChange(true)
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`جارٍ رفع الصورة ${index + 1} من ${files.length}...`)
        try {
          const result = await apiUpload<{ url: string }>('/upload', file)
          uploaded.push(result.url)
        } catch (uploadError) {
          failed += 1
          console.error('Failed to upload image', uploadError)
        }
      }
      if (uploaded.length > 0) onChange(uploaded)
      if (failed > 0) setError(`تعذر رفع ${failed} صورة. الحد الأقصى 5 MB للصورة.`)
    } finally {
      setProgress('')
      onUploadingChange(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 border border-dashed border-brand/35 bg-brand/5 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-brand/10 transition-colors">
        <span className="text-brand text-xs font-bold">{progress || label}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={Boolean(progress)} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length > 0) void upload(files); event.currentTarget.value = '' }} className="sr-only" />
        <span className="text-muted-text text-xs">اختر عدة صور · حتى 5 MB للصورة</span>
      </label>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}

function LogoPlacementEditor({ logoUrl, x, y, size, onMove }: { logoUrl: string; x: number; y: number; size: number; onMove: (x: number, y: number) => void }) {
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.getBoundingClientRect()
    onMove(Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100)), Math.max(8, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100)))
  }

  return (
    <div>
      <p className="text-muted-text text-xs mb-2 font-serif">معاينة شاشة العرض — اسحب الشعار إلى المكان المطلوب</p>
      <div
        className="relative h-56 w-full overflow-hidden rounded-xl border-2 border-brand/30 bg-[#F5EDE0] shadow-inner"
        onPointerMove={move}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <div className="absolute inset-x-0 top-0 h-8 border-b border-brand/15 bg-white/50" />
        <div className="absolute inset-x-5 bottom-5 h-8 rounded border border-charcoal/10 bg-charcoal/90" />
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="شعار البطولة"
            draggable={false}
            onPointerDown={(event) => { event.currentTarget.parentElement?.setPointerCapture(event.pointerId) }}
            className="pointer-events-auto absolute cursor-move rounded-lg bg-white/90 object-contain p-1 shadow-md"
            style={{ left: `${x}%`, top: `${y}%`, width: Math.max(32, size / 2), height: Math.max(32, size / 2), transform: 'translate(-50%, -50%)' }}
          />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-muted-text text-sm">ارفع شعارًا لمعاينته</p>
        )}
      </div>
    </div>
  )
}

type TournamentFault = NonNullable<Tournament['faults']>[number]

function FaultModal({
  onClose,
  localFaults,
  onSave,
}: {
  onClose: () => void
  localFaults: TournamentFault[]
  onSave: (faults: TournamentFault[]) => Promise<void>
}) {
  const [fault, setFault] = useState({ name: '', description: '', disqualifies: false })
  const [error, setError] = useState('')
  const faultNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    faultNameRef.current?.focus()
  }, [])

  const save = async () => {
    const next = [...localFaults, {
      id: `F${Date.now()}`,
      name: fault.name.trim(),
      description: fault.description.trim(),
      penalty: 0,
      disqualifies: fault.disqualifies,
      repeatable: true,
      active: true,
    }]
    try {
      await onSave(next)
      onClose()
    } catch (saveError) {
      setError('تعذر حفظ الخطأ. تأكد من صلاحياتك واتصال الخادم ثم حاول مرة أخرى.')
      console.error('Failed to add tournament fault', saveError)
    }
  }

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4 cursor-default" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl p-5 w-full max-w-lg cursor-default" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-charcoal font-black text-lg">إضافة خطأ جديد</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-muted-text text-2xl leading-none hover:text-warm-gray">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-muted-text text-xs block mb-1">اسم الخطأ *</label>
            <input ref={faultNameRef} autoFocus value={fault.name} onChange={(event) => setFault((current) => ({ ...current, name: event.target.value }))} placeholder="مثال: سقوط العارضة" className="w-full cursor-text bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <div>
            <label className="text-muted-text text-xs block mb-1">الوصف</label>
            <textarea value={fault.description} onChange={(event) => setFault((current) => ({ ...current, description: event.target.value }))} rows={3} className="w-full cursor-text resize-y bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={fault.disqualifies} onChange={(event) => setFault((current) => ({ ...current, disqualifies: event.target.checked }))} className="h-5 w-5 cursor-pointer accent-brand" />
            <span className="text-charcoal text-sm">يؤدي إلى الاستبعاد</span>
          </label>
        </div>
        {error && <p className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 mt-4 text-sm">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button type="button" disabled={!fault.name.trim()} onClick={save} className="flex-1 cursor-pointer bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">إضافة</button>
          <button type="button" onClick={onClose} className="cursor-pointer border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
        </div>
      </div>
    </div>
  )
}

function EditTournamentFieldModal({ label, value, onClose, onSave }: { label: string; value: string; onClose: () => void; onSave: (value: string) => Promise<void> }) {
  const [nextValue, setNextValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4 cursor-default" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl p-5 w-full max-w-md cursor-default" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-charcoal font-black text-lg">تعديل — {label}</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-muted-text text-2xl leading-none">×</button>
        </div>
        <input ref={inputRef} value={nextValue} onChange={(event) => setNextValue(event.target.value)} className="w-full cursor-text bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 mb-5" />
        <div className="flex gap-3">
          <button type="button" onClick={() => void onSave(nextValue)} className="flex-1 cursor-pointer bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors">حفظ</button>
          <button type="button" onClick={onClose} className="cursor-pointer border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_TEMPLATE = {
  id: 'KF',
  name: 'بطولة الكر والفر',
  type: 'الكر والفر',
  description: '',
  totalRounds: 0,
  roundNames: [],
  faults: cloneKarrFarFaults(),
  scoringDescription: KARR_FAR_SCORING_DESCRIPTION,
}

const EMPTY_RULESETS: Array<{ id: string; name: string; description: string; rounds: number; scoringDescription: string; faults: Array<{ id: string; name: string; description: string; penalty: number; disqualifies: boolean; repeatable: boolean; active: boolean }> }> = []

const EMPTY_AUDIT_LOG: Array<{ id: string; action: string; description: string; userId?: string; userName?: string; category?: string; timestamp?: string }> = []

const navItems: { id: AdminView; label: string; group?: string }[] = [
  { id: 'overview',          label: 'نظرة عامة' },
  { id: 'tournaments',       label: 'البطولات', group: 'إدارة البطولات' },
  { id: 'archive',           label: 'أرشيف البطولات', group: 'إدارة البطولات' },
  { id: 'results-approval',  label: 'اعتماد النتائج', group: 'إدارة البطولات' },
  { id: 'live-control',      label: 'التحكم المباشر', group: 'إدارة البطولات' },
  { id: 'players',           label: 'قاعدة اللاعبين', group: 'السجلات' },
  { id: 'horses',            label: 'الخيول', group: 'السجلات' },
  { id: 'judges',            label: 'الحكام', group: 'السجلات' },
  { id: 'users',             label: 'المستخدمون', group: 'النظام' },
  { id: 'roles',             label: 'الأدوار والصلاحيات', group: 'النظام' },
  { id: 'site',              label: 'إدارة الموقع', group: 'النظام' },
  { id: 'audit-log',         label: 'سجل العمليات', group: 'النظام' },
  { id: 'settings',          label: 'الإعدادات', group: 'النظام' },
]

const viewPermissions: Partial<Record<AdminView, string>> = {
  overview: 'عرض البطولات',
  tournaments: 'عرض البطولات',
  archive: 'عرض البطولات',
  players: 'عرض البطولات',
  'player-profile': 'عرض البطولات',
  horses: 'عرض البطولات',
  judges: 'إدارة المستخدمين',
  users: 'إدارة المستخدمين',
  roles: 'إدارة المستخدمين',
  'results-approval': 'اعتماد نتيجة',
  'live-control': 'إدارة العرض المباشر',
  site: 'إدارة الموقع',
  'audit-log': 'مشاهدة سجل العمليات',
  settings: 'إدارة الموقع',
}

function Chip({ label, color = 'gray' }: { label: string; color?: 'green' | 'amber' | 'brand' | 'gray' | 'red' | 'blue' }) {
  const cls = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    brand: 'bg-brand/10 text-brand border-brand/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    gray: 'bg-sand/60 text-muted-text border-line',
  }[color]
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cls}`}>{label}</span>
}

function tournamentStatusColor(status: string): 'green' | 'amber' | 'brand' | 'gray' | 'red' | 'blue' {
  if (status === 'active') return 'green'
  if (status === 'registration') return 'amber'
  if (status === 'upcoming') return 'blue'
  if (status === 'completed') return 'gray'
  return 'gray'
}

function tournamentStatusLabel(status: string) {
  const map: Record<string, string> = { active: 'جارية', registration: 'التسجيل مفتوح', upcoming: 'قادمة', not_started: 'لم تبدأ', completed: 'مكتملة', archived: 'مؤرشفة', cancelled: 'ملغية' }
  return map[status] ?? status
}

function isCurrentEdition(t: Tournament | null | undefined) {
  if (!t) return false
  return ['active', 'registration', 'upcoming', 'not_started'].includes(t.status)
}

function roundStatusLabel(s: string) {
  const map: Record<string, string> = { not_started: 'لم تبدأ', active: 'جارية', closed: 'مغلقة', completed: 'مكتملة' }
  return map[s] ?? s
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW VIEW
═══════════════════════════════════════════════════════════ */
function OverviewView({ judgeResults, tournaments, onNavigate, onOpenTournament }: { judgeResults: JudgeResult[]; tournaments: Tournament[]; onNavigate: (v: AdminView) => void; onOpenTournament: (id: string) => void }) {
  const activeTournament = (tournaments ?? []).find((t) => isCurrentEdition(t))
  const currentRound = activeTournament
    ? (Array.isArray(activeTournament.rounds) ? activeTournament.rounds : []).find((r) => r.status === 'active')
    : null
  const currentRoundNumber = currentRound?.number ?? activeTournament?.currentRound ?? 0
  const activeTournamentResults = activeTournament
    ? judgeResults.filter((r) => r.tournamentId === activeTournament.id)
    : []
  const pending = activeTournamentResults.filter((r) => r.status === 'pending').length
  const approved = activeTournamentResults.filter((r) => r.status === 'approved').length
  const recentActivity = [...EMPTY_AUDIT_LOG].slice(0, 6)

  return (
    <div className="p-5 sm:p-8 max-w-6xl">
      <div className="flex items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-muted-text text-xs mb-1">لوحة الإدارة</p>
          <h1 className="text-charcoal text-3xl sm:text-4xl font-black tracking-tight">نظرة عامة</h1>
        </div>
        <span className="hidden sm:block text-muted-text text-xs font-serif">آخر مزامنة: الآن</span>
      </div>

      {/* Template ready state — no active edition */}
      {!activeTournament && (
        <div className="bg-surface border border-line rounded-xl p-8 mb-6 text-center">
          <div className="mb-4">
            <span className="inline-block bg-brand/10 text-brand text-xs font-bold px-3 py-1 rounded-full tracking-wider mb-4">قالب البطولة جاهز</span>
            <h2 className="text-charcoal text-2xl font-black mb-1">{EMPTY_TEMPLATE.name}</h2>
            <p className="text-muted-text text-sm font-serif mb-1">{EMPTY_TEMPLATE.totalRounds} جولات · {EMPTY_TEMPLATE.faults.length} أخطاء معرّفة</p>
            <p className="text-muted-text/60 text-xs font-serif">القوانين والإعدادات جاهزة — يكفي تحديد تاريخ البطولة لبدء نسخة جديدة</p>
          </div>
          <button
            onClick={() => onNavigate('tournaments')}
            className="bg-brand text-ivory font-black px-8 py-3 rounded-xl hover:bg-brand-hover transition-colors text-sm"
          >
            بدء بطولة جديدة
          </button>
        </div>
      )}

      {/* Active tournament hero */}
      {activeTournament && (
        <div className="bg-charcoal rounded-2xl p-6 sm:p-8 mb-6 text-white overflow-hidden relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-emerald-400/15 text-emerald-300 border border-emerald-300/20 text-[11px] font-bold px-2.5 py-1 rounded-full">جارية الآن</span>
                <span className="text-white/45 text-xs font-serif">{activeTournament.type}</span>
              </div>
              <h2 className="text-white text-2xl sm:text-3xl font-black mb-1">{activeTournament.name}</h2>
              <p className="text-white/50 text-sm">{activeTournament.location}</p>
            </div>
            <button
              onClick={() => activeTournament && onOpenTournament(activeTournament.id)}
              className="bg-brand text-ivory text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-brand-hover transition-colors shrink-0"
            >
              إدارة البطولة
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-text mb-1.5">
              <span>{currentRound ? `الجولة الحالية: ${currentRound.name}` : 'بانتظار بدء الجولة'}</span>
              <span>{currentRoundNumber} / {activeTournament.totalRounds}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-brand h-2 rounded-full transition-all duration-500"
                style={{ width: `${(currentRoundNumber / activeTournament.totalRounds) * 100}%` }}
              />
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-5 border-t border-white/10">
            {[
              { label: 'المشاركون', val: activeTournament.participantCount },
              { label: 'الحكام', val: activeTournament.judgeIds.length },
              { label: 'الجولة', val: `${currentRoundNumber}/${activeTournament.totalRounds}` },
              { label: 'بانتظار الاعتماد', val: pending, highlight: pending > 0 },
              { label: 'النتائج المعتمدة', val: approved },
            ].map((s) => (
              <div key={s.label}>
                <p className={`font-black text-xl leading-none mb-1 ${s.highlight ? 'text-brand' : 'text-white'}`}>{s.val}</p>
                <p className="text-white/45 text-[10px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-9">
        {[
          { label: 'إدارة البطولة', view: 'tournament-workspace' as AdminView },
          { label: 'اعتماد النتائج', view: 'results-approval' as AdminView, badge: pending > 0 ? pending : undefined },
          { label: 'التحكم المباشر', view: 'live-control' as AdminView },
          { label: 'إضافة لاعب', view: 'players' as AdminView },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.view)}
            className="relative bg-surface border border-line text-charcoal text-sm font-semibold py-4 px-4 rounded-xl hover:border-brand/40 hover:bg-brand/5 transition-all text-right"
          >
            {a.badge && (
              <span className="absolute top-2 left-2 bg-brand text-ivory text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {a.badge}
              </span>
            )}
            {a.label}
          </button>
        ))}
      </div>

      {/* Recent activity */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-charcoal font-black">آخر النشاطات</p>
          <button onClick={() => onNavigate('audit-log')} className="text-brand text-xs font-bold">عرض السجل ←</button>
        </div>
        <div className="space-y-0">
          {recentActivity.map((entry, i) => (
            <div key={entry.id} className={`flex items-start gap-4 py-3 ${i < recentActivity.length - 1 ? 'border-b border-line/60' : ''}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-brand/50 mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-warm-gray text-sm">{entry.description}</p>
                <p className="text-muted-text/70 text-xs mt-0.5 font-serif">{entry.timestamp}</p>
              </div>
              <Chip label={entry.category} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   EDITIONS LIST VIEW (formerly TournamentsView)
═══════════════════════════════════════════════════════════ */
function TournamentsView({ tournaments, onSelectTournament, onCreateTournament, canCreate }: { tournaments: Tournament[]; onSelectTournament: (id: string) => void; onCreateTournament: () => void; canCreate: boolean }) {
  const editions = tournaments.filter((t) => t.templateId === 'KF' || t.templateId === undefined || !t.templateId)
  const currentEdition = editions.find((t) => isCurrentEdition(t))
  const activeEdition = editions.find((t) => t.status === 'active')
  const notStarted = editions.find((t) => t.status === 'not_started' || t.status === 'upcoming' || t.status === 'registration')
  const pastEditions = editions.filter((t) => t.status === 'archived' || t.status === 'completed' || t.status === 'cancelled')

  return (
    <div className="p-8 max-w-5xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة البطولات</p>
      <h1 className="text-charcoal text-3xl font-black mb-8">بطولات الكر والفر</h1>

      {/* Template card */}
      <div className="bg-surface border border-brand/20 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block bg-brand/10 text-brand text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider mb-3">قالب البطولة</span>
            <h2 className="text-charcoal text-xl font-black mb-1">{EMPTY_TEMPLATE.name}</h2>
            <p className="text-muted-text text-sm font-serif mb-3">{EMPTY_TEMPLATE.totalRounds} جولات · {EMPTY_TEMPLATE.faults.length} أخطاء · القوانين والإعدادات تُحدّد من لوحة الإدارة</p>
            <p className="text-muted-text/60 text-xs font-serif">{EMPTY_TEMPLATE.scoringDescription}</p>
          </div>
          {canCreate && (
            <button
              onClick={onCreateTournament}
              className="bg-brand text-ivory font-black px-6 py-3 rounded-xl hover:bg-brand-hover transition-colors text-sm shrink-0"
            >
              {currentEdition ? 'إنشاء بطولة أخرى' : 'بدء بطولة جديدة'}
            </button>
          )}
          {currentEdition && (
            <div className="text-right shrink-0">
              <Chip label={currentEdition.status === 'active' ? 'جارية الآن' : tournamentStatusLabel(currentEdition.status)} color={currentEdition.status === 'active' ? 'green' : 'amber'} />
              <p className="text-muted-text text-xs mt-2 font-serif">{currentEdition.date}</p>
            </div>
          )}
        </div>
      </div>

      {/* Current or upcoming edition */}
      {currentEdition && (
        <div className="mb-6">
          <p className="text-muted-text text-xs tracking-widest font-serif uppercase mb-3">النسخة الحالية</p>
          {[currentEdition].map((t) => (
            <div key={t.id} className="bg-surface border border-line rounded-xl p-5 cursor-pointer hover:border-brand/30 transition-colors" onClick={() => onSelectTournament(t.id)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Chip label={tournamentStatusLabel(t.status)} color={tournamentStatusColor(t.status)} />
                  </div>
                  <h3 className="text-charcoal font-bold text-lg mb-1">{t.name}</h3>
                  <p className="text-muted-text text-sm font-serif">{t.location ? `${t.location} · ` : ''}{t.date}</p>
                </div>
                <div className="text-right shrink-0 ms-6">
                  <p className="text-muted-text text-xs mb-1">{t.participantCount} مشارك</p>
                  {t.status === 'active' && <p className="text-brand text-xs">الجولة {t.currentRound}/{t.totalRounds}</p>}
                  {t.status === 'not_started' && <p className="text-amber-600 text-xs">لم تبدأ بعد</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Past editions */}
      {pastEditions.length > 0 && (
        <div>
          <p className="text-muted-text text-xs tracking-widest font-serif uppercase mb-3">البطولات السابقة</p>
          <div className="space-y-2">
            {pastEditions.map((t) => (
              <div key={t.id} className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-sand/40 transition-colors" onClick={() => onSelectTournament(t.id)}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Chip label={tournamentStatusLabel(t.status)} color={tournamentStatusColor(t.status)} />
                    <span className="text-muted-text text-xs font-serif">{t.date}</span>
                  </div>
                  <p className="text-charcoal font-semibold text-sm">{t.name}</p>
                  {t.location && <p className="text-muted-text text-xs">{t.location}</p>}
                </div>
                <div className="text-right shrink-0 ms-4">
                  <p className="text-muted-text text-xs">{t.participantCount} مشارك</p>
                  <p className="text-muted-text/60 text-xs mt-1">{t.totalRounds} جولات</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editions.length === 0 && !currentEdition && (
        <div className="border border-dashed border-line rounded-xl p-12 text-center text-muted-text/60 text-sm">
          لا توجد نسخ سابقة — اضغط "بدء بطولة جديدة" أعلاه لإنشاء النسخة الأولى.
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT WORKSPACE
═══════════════════════════════════════════════════════════ */
function TournamentWorkspace({ judgeResults, tournaments, tournamentId, players, horses, users, auditEntries, onAudit, onSetPlayers, onSetTournaments, onStartEdition, onCancelEdition, onCompleteEdition, onSetLiveDisplay, onNavigate, appeals, onUpdateAppeal, onBack }: {
  judgeResults: JudgeResult[]; tournaments: Tournament[]; tournamentId: string
  players: Player[]; horses: Horse[]; users: SystemUser[]; onSetPlayers: (p: Player[]) => void; onSetTournaments: (t: Tournament[]) => void
  auditEntries: AuditEntry[]
  onAudit: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => void
  onStartEdition?: (id: string) => Promise<void>
  onCancelEdition?: (id: string, reason: string) => void
  onCompleteEdition?: (id: string) => void
  onSetLiveDisplay: Props['onSetLiveDisplay']
  onNavigate: Props['onNavigate']
  appeals?: Appeal[]; onUpdateAppeal?: (id: string, patch: Partial<Appeal>) => void
  onBack: () => void
}) {
  const [tab, setTab] = useState<WorkspaceTab>('overview')

  const baseTournament = tournaments.find((t) => t.id === tournamentId) ?? tournaments[0]!
  if (!baseTournament) return <div className="p-8 text-muted-text">لا توجد بطولة</div>

  const [localTournament, setLocalTournament] = useState(baseTournament)
  const [localParticipants, setLocalParticipants] = useState(() =>
    Array.isArray(baseTournament?.participants) ? baseTournament.participants : []
  )
  const [localRounds, setLocalRounds] = useState(() =>
    Array.isArray(baseTournament?.rounds) ? baseTournament.rounds : []
  )
  const [localJudgeIds, setLocalJudgeIds] = useState<string[]>(Array.isArray(baseTournament?.judgeIds) ? baseTournament.judgeIds : [])

  useEffect(() => {
    if (!baseTournament || baseTournament.id !== tournamentId) return
    const nextParticipants = Array.isArray(baseTournament.participants) ? baseTournament.participants : []
    const nextRounds = Array.isArray(baseTournament.rounds) ? baseTournament.rounds : []
    const nextJudgeIds = Array.isArray(baseTournament.judgeIds) ? baseTournament.judgeIds : []
    setLocalTournament((current) => ({ ...current, ...baseTournament }))
    setLocalParticipants((current) => JSON.stringify(current) === JSON.stringify(nextParticipants) ? current : nextParticipants)
    setLocalRounds((current) => JSON.stringify(current) === JSON.stringify(nextRounds) ? current : nextRounds)
    setLocalJudgeIds((current) => JSON.stringify(current) === JSON.stringify(nextJudgeIds) ? current : nextJudgeIds)
  }, [baseTournament, tournamentId])

  const isLocked = ['completed', 'archived', 'cancelled'].includes(localTournament.status)

  // modals
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [showAddJudge, setShowAddJudge] = useState(false)
  const [editingField, setEditingField] = useState<{ label: string; key: keyof typeof localTournament; val: string } | null>(null)
  const [editingFault, setEditingFault] = useState<{ id: string; name: string; description: string; penalty: number; disqualifies: boolean; repeatable: boolean; active: boolean } | null>(null)
  const [showAddFault, setShowAddFault] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showStartConfirm, setShowStartConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [removingParticipantId, setRemovingParticipantId] = useState<string | null>(null)
  const [removingParticipant, setRemovingParticipant] = useState(false)
  const [roundActionError, setRoundActionError] = useState('')
  const [startActionError, setStartActionError] = useState('')
  const [startingEdition, setStartingEdition] = useState(false)

  const ruleset = (EMPTY_RULESETS.find((rs) => rs.id === localTournament.rulesetId) ?? EMPTY_RULESETS[0] ?? {
    id: 'custom',
    name: 'نظام مخصص',
    description: '',
    rounds: localTournament.totalRounds || 0,
    scoringDescription: '',
    faults: [],
  })
  const [localFaults, setLocalFaults] = useState(() => (localTournament.faults?.length ? localTournament.faults : ruleset?.faults ?? []))
  const [tournamentLogo, setTournamentLogo] = useState(localTournament.logoUrl ?? '')
  const [tournamentSponsors, setTournamentSponsors] = useState<TournamentSponsor[]>(localTournament.sponsors ?? [])
  const [logoPosition, setLogoPosition] = useState<Tournament['logoPosition']>(localTournament.logoPosition ?? 'top-left')
  const [logoSize, setLogoSize] = useState(String(localTournament.logoSize ?? 96))
  const [logoX, setLogoX] = useState(localTournament.logoX ?? 8)
  const [logoY, setLogoY] = useState(localTournament.logoY ?? 8)
  const [brandingMessage, setBrandingMessage] = useState('')
  // Website settings
  const [websiteTitle, setWebsiteTitle] = useState(localTournament.websiteTitle ?? '')
  const [websiteDescription, setWebsiteDescription] = useState(localTournament.websiteDescription ?? '')
  const [websiteTargetDate, setWebsiteTargetDate] = useState(localTournament.websiteTargetDate ?? '')
  const [websiteDateTimeParts, setWebsiteDateTimeParts] = useState(() => parseWebsiteDateTime(localTournament.websiteTargetDate ?? ''))
  const [websiteHeroImage, setWebsiteHeroImage] = useState(localTournament.websiteHeroImage ?? '')
  const [websiteAboutImage, setWebsiteAboutImage] = useState(localTournament.websiteAboutImage ?? '')
  const [websiteImages, setWebsiteImages] = useState<string[]>(localTournament.websiteImages ?? [])
  const [uploadingWebsiteImages, setUploadingWebsiteImages] = useState(false)
  const [websiteVideoUrl, setWebsiteVideoUrl] = useState(localTournament.websiteVideoUrl ?? '')
  const [websiteShowParticipants, setWebsiteShowParticipants] = useState(localTournament.websiteShowParticipants ?? true)
  const [websiteShowRounds, setWebsiteShowRounds] = useState(localTournament.websiteShowRounds ?? true)
  const [websiteShowSponsors, setWebsiteShowSponsors] = useState(localTournament.websiteShowSponsors ?? true)
  const [websiteMessage, setWebsiteMessage] = useState('')

  const tResults = judgeResults.filter((r) => r.tournamentId === tournamentId)
  const tournamentAppeals = (appeals ?? []).filter((a) => a.tournamentId === tournamentId)
  const tournamentAudit = auditEntries.filter((entry) => entry.tournamentId === tournamentId)
  const [printParticipantId, setPrintParticipantId] = useState<string | null>(null)

  const saveTournamentField = async (key: keyof typeof localTournament, val: string) => {
    try {
      await apiPut(`/tournaments/${tournamentId}`, { [key]: val })
      const updated = { ...localTournament, [key]: val }
      setLocalTournament(updated)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
    } catch (error) {
      console.error('Failed to update tournament', error)
    }
  }

  const saveTournamentBranding = async () => {
    const sponsors = tournamentSponsors.filter((sponsor) => sponsor.name.trim() || sponsor.logoUrl).map((sponsor) => ({ ...sponsor, name: sponsor.name.trim() }))
    const next = { ...localTournament, logoUrl: tournamentLogo.trim(), sponsors, logoPosition, logoSize: Math.max(48, Math.min(320, Number(logoSize) || 96)), logoX, logoY }
    try {
      await apiPut(`/tournaments/${tournamentId}`, { logo_url: next.logoUrl, sponsors, logo_position: next.logoPosition, logo_size: next.logoSize, logo_x: next.logoX, logo_y: next.logoY })
      localStorage.setItem(`afandi:tournament-branding:${tournamentId}`, JSON.stringify({ logoUrl: next.logoUrl, sponsors, logoPosition: next.logoPosition, logoSize: next.logoSize, logoX, logoY }))
      const brandingChannel = new BroadcastChannel('afandi_live_display')
      brandingChannel.postMessage({ type: 'tournament_branding', tournamentId, branding: { logoUrl: next.logoUrl, sponsors, logoPosition: next.logoPosition, logoSize: next.logoSize, logoX, logoY } })
      brandingChannel.close()
      setLocalTournament(next)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? next : t))
      setBrandingMessage('تم حفظ هوية شاشة العرض')
    } catch (error) {
      setBrandingMessage('تعذر حفظ الهوية. تحقق من اتصال الخادم ثم حاول مرة أخرى.')
      console.error('Failed to save tournament branding', error)
    }
  }

  const setRoundStatus = async (roundId: string, status: 'not_started' | 'active' | 'closed' | 'completed') => {
    if (status === 'active' && localTournament.status !== 'active') {
      setRoundActionError('لا يمكن بدء الجولة قبل بدء البطولة. اضغط «بدء البطولة» أولاً.')
      return
    }
    const round = localRounds.find((item) => item.id === roundId)
    const nextCurrentRound = status === 'closed' ? (round?.number ?? localTournament.currentRound) + 1 : round?.number ?? localTournament.currentRound
    const previousRounds = localRounds
    const previousTournament = localTournament
    const rounds = localRounds.map((r) => r.id === roundId ? { ...r, status } : r)
    const updated = { ...localTournament, currentRound: nextCurrentRound, rounds }
    setRoundActionError('')
    setLocalRounds(rounds)
    setLocalTournament(updated)
    onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
    try {
      await apiPut(`/tournaments/${tournamentId}`, { current_round: nextCurrentRound, rounds })
      onAudit({ tournamentId, action: `تغيير حالة ${round?.name ?? 'الجولة'}`, description: `تم تغيير الحالة إلى ${roundStatusLabel(status)}`, category: 'بطولات' })
    } catch (error) {
      setLocalRounds(previousRounds)
      setLocalTournament(previousTournament)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? previousTournament : t))
      setRoundActionError('تعذر بدء الجولة. تحقق من اتصال الخادم ثم حاول مرة أخرى.')
      console.error('Failed to update round status', error)
    }
  }

  const addParticipant = async (p: typeof localParticipants[0]) => {
    try {
      const newList = [...localParticipants, {
        ...p,
        id: p.id || `PA-${p.playerId}-${Date.now()}`,
        playerId: p.playerId,
        tournamentId,
      }]
      await apiPut(`/tournaments/${tournamentId}`, { participants: newList })
      setLocalParticipants(newList)
      onAudit({ tournamentId, action: 'إضافة مشارك', description: `تمت إضافة المشارك رقم ${p.competitionNumber}`, category: 'مشاركون' })
      const updated = { ...localTournament, participantCount: newList.length, participants: newList }
      setLocalTournament(updated)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
    } catch (error) {
      console.error('Failed to save participant to database', error)
      throw error
    }
  }

  const removeParticipant = async (id: string) => {
    const newList = localParticipants.filter((p) => p.id !== id)
    const removed = localParticipants.find((p) => p.id === id)
    try {
      await apiPut(`/tournaments/${tournamentId}`, { participants: newList })
      if (removed) {
        const player = players.find((item) => item.id === removed.playerId)
        if (player?.tournament_id === tournamentId) {
          onSetPlayers(players.map((item) => item.id === player.id ? { ...item, tournament_id: undefined } : item))
        }
      }
      setLocalParticipants(newList)
      const updated = { ...localTournament, participantCount: newList.length, participants: newList }
      setLocalTournament(updated)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
      setRemovingParticipantId(null)
    } catch (error) {
      console.error('Failed to remove participant', error)
      throw error
    } finally {
      setRemovingParticipant(false)
    }
  }

  const addJudge = async (uid: string) => {
    if (localJudgeIds.includes(uid)) return

    const user = users.find((u) => u.id === uid)
    const assignedTournaments = Array.from(new Set([...(user?.assignedTournaments ?? []), tournamentId]))

    try {
      await apiPut(`/users/${uid}`, { assignedTournaments })
    } catch (error) {
      console.error('Failed to assign judge to tournament', error)
      return
    }

    const updated = { ...localTournament, judgeIds: [...localJudgeIds, uid] }
    await apiPut(`/tournaments/${tournamentId}`, { judgeIds: updated.judgeIds })
    setLocalJudgeIds(updated.judgeIds)
    onAudit({ tournamentId, action: 'إضافة حكم', description: `تم إسناد الحكم ${user?.name ?? uid} إلى البطولة`, category: 'بطولات' })
    setLocalTournament(updated)
    onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
  }

  const removeJudge = async (uid: string) => {
    const user = users.find((u) => u.id === uid)
    try {
      await apiPut(`/users/${uid}`, { assignedTournaments: (user?.assignedTournaments ?? []).filter((id) => id !== tournamentId) })
      const updated = { ...localTournament, judgeIds: localJudgeIds.filter((id) => id !== uid) }
      await apiPut(`/tournaments/${tournamentId}`, { judgeIds: updated.judgeIds })
      setLocalJudgeIds(updated.judgeIds)
      setLocalTournament(updated)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
    } catch (error) {
      console.error('Failed to remove judge from tournament', error)
    }
  }

  const archiveTournament = () => {
    const updated = { ...localTournament, status: 'archived' as const }
    void apiPut(`/tournaments/${tournamentId}`, { status: 'archived' }).then(() => {
      setLocalTournament(updated)
      onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
      setShowArchiveConfirm(false)
      onBack()
    }).catch((error) => console.error('Failed to archive tournament', error))
  }

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'overview', label: 'نظرة عامة' }, { id: 'participants', label: `المشاركون (${localParticipants.length})` },
    { id: 'rounds', label: 'الجولات' }, { id: 'judges', label: `الحكام (${localJudgeIds.length})` },
    { id: 'rules', label: 'القوانين' }, { id: 'faults', label: 'الأخطاء' },
    { id: 'results', label: 'النتائج' }, { id: 'ranking', label: 'الترتيب' },
    { id: 'appeals', label: `الاعتراضات${tournamentAppeals.length > 0 ? ` (${tournamentAppeals.length})` : ''}` },
    { id: 'audit', label: 'سجل التعديلات' },
    { id: 'settings-tab', label: 'الإعدادات' },
    { id: 'website-settings', label: 'إعدادات الموقع' },
  ]

  /* ── Shared modal shell ── */
  const Modal = ({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
    <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4 cursor-default" onClick={onClose}>
      <div className={`bg-surface border border-line rounded-xl p-5 w-full ${wide ? 'max-w-lg' : 'max-w-md'} cursor-default`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-charcoal font-black text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-muted-text text-2xl leading-none hover:text-warm-gray">×</button>
        </div>
        {children}
      </div>
    </div>
  )

  /* ── Add Participant modal ── */
  const participantModalContext = useRef({ localParticipants, players, horses, tournamentId, onSetPlayers, addParticipant, setShowAddParticipant })
  participantModalContext.current = { localParticipants, players, horses, tournamentId, onSetPlayers, addParticipant, setShowAddParticipant }

  const AddParticipantModal = useRef(() => {
    const { localParticipants, players, horses, tournamentId, onSetPlayers, addParticipant, setShowAddParticipant } = participantModalContext.current
    const [playerId, setPlayerId] = useState('')
    const [horseId, setHorseId] = useState('')
    const [category, setCategory] = useState('عام')
    const [search, setSearch] = useState('')
    const [showNewPlayerForm, setShowNewPlayerForm] = useState(false)
    const [savingParticipant, setSavingParticipant] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [newPlayer, setNewPlayer] = useState({ name: '', dob: '', phone: '', club: '' })

    const usedNums = new Set(localParticipants.map((p) => parseInt(p.competitionNumber)))
    const nextNum = Array.from({ length: 100 }, (_, i) => i + 1).find((n) => !usedNums.has(n)) ?? localParticipants.length + 1
    const [compNum, setCompNum] = useState(String(nextNum))

    const filtered = players.filter((p) => p.name.includes(search) || p.club.includes(search)).slice(0, 8)
    const selectedPlayer = players.find((p) => p.id === playerId)
    const isBanned = selectedPlayer?.status === 'banned'

    const handleAddNew = async () => {
      if (!newPlayer.name.trim() || savingParticipant) return
      setSavingParticipant(true)
      setSaveError('')
      try {
        const created = await apiPost<{ id: string }>('/players', {
          name: newPlayer.name.trim(),
          country: '',
          club: newPlayer.club.trim(),
          horse: horses.find((horse) => horse.id === horseId)?.name ?? '',
          category: category || 'عام',
          tournament_id: tournamentId,
        })
        const dbPlayer: Player = {
          id: created.id,
          name: newPlayer.name.trim(),
          dob: newPlayer.dob,
          phone: newPlayer.phone,
          club: newPlayer.club.trim(),
          status: 'active',
          tournament_id: tournamentId,
        }
        onSetPlayers([...players, dbPlayer])
        await addParticipant({
          id: `PA-${created.id}-${Date.now()}`,
          competitionNumber: compNum,
          playerId: created.id,
          horseId,
          tournamentId,
          category,
          status: 'active',
          roundsCompleted: 0,
          appealCode: generateAppealCode(),
        })
        setShowAddParticipant(false)
      } catch (error) {
        setSaveError('تعذر حفظ اللاعب أو تسجيله في البطولة. إذا تم إنشاء اللاعب، ابحث عنه وأعد محاولة إضافته.')
        console.error('Failed to create player and participant in database', error)
      } finally {
        setSavingParticipant(false)
      }
    }

    return (
      <Modal title="إضافة مشارك" onClose={() => setShowAddParticipant(false)}>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">

          {!showNewPlayerForm ? (
            <>
              <div>
                <label className="text-muted-text text-xs block mb-1">بحث عن لاعب</label>
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPlayerId('') }} placeholder="اسم اللاعب أو النادي..." className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
              </div>

              {search && (
                <div className="border border-line rounded-lg overflow-hidden">
                  {filtered.map((p) => (
                    <button key={p.id} onClick={() => { setPlayerId(p.id); setSearch('') }}
                      className={`w-full text-right px-4 py-3 text-sm flex items-center justify-between transition-colors border-b border-line/40 last:border-0 ${playerId === p.id ? 'bg-brand/10 text-brand' : p.status === 'banned' ? 'bg-red-50/50 text-muted-text cursor-default' : 'hover:bg-sand/50 text-charcoal'}`}>
                      <span className="font-semibold">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-text text-xs">{p.club}</span>
                        {p.status === 'banned' && <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">محظور</span>}
                      </span>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="p-4 text-center">
                      <p className="text-muted-text text-sm mb-3">لا يوجد لاعب بهذا الاسم في القاعدة</p>
                      <button
                        onClick={() => { setShowNewPlayerForm(true) }}
                        className="bg-brand/10 border border-brand/30 text-brand text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand/15 transition-colors"
                      >
                        + تسجيل لاعب جديد
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Banned warning */}
              {isBanned && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-red-600 font-bold text-sm mb-0.5">هذا اللاعب محظور من المشاركة</p>
                  <p className="text-red-400 text-xs font-serif">يرجى إبلاغ الإدارة لإزالة الحظر قبل إضافته.</p>
                  {selectedPlayer?.bannedReason && <p className="text-red-400/70 text-xs font-serif mt-1">السبب: {selectedPlayer.bannedReason}</p>}
                </div>
              )}

              {selectedPlayer && !isBanned && (
                <div className="bg-brand/8 border border-brand/20 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-charcoal font-bold text-sm">{selectedPlayer.name}</p>
                    <p className="text-muted-text text-xs font-serif">{selectedPlayer.club}</p>
                  </div>
                  <button onClick={() => setPlayerId('')} className="text-muted-text text-xs hover:text-red-400">✕</button>
                </div>
              )}

              {!search && !selectedPlayer && (
                <div className="border-t border-dashed border-line pt-3 mt-1">
                  <button
                    onClick={() => setShowNewPlayerForm(true)}
                    className="w-full text-center text-muted-text text-sm py-2 hover:text-brand transition-colors"
                  >
                    + اللاعب غير موجود في القاعدة؟ سجّله الآن
                  </button>
                </div>
              )}

              <div>
                <label className="text-muted-text text-xs block mb-1">الخيل <span className="text-muted-text/50">(اختياري)</span></label>
                <select value={horseId} onChange={(e) => setHorseId(e.target.value)} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50">
                  <option value="">بدون خيل</option>
                  {horses.map((horse) => <option key={horse.id} value={horse.id}>{horse.name}{horse.breed ? ` — ${horse.breed}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-text text-xs block mb-1">رقم المشاركة <span className="text-brand/60 font-serif">(تلقائي)</span></label>
                  <input value={compNum} onChange={(e) => setCompNum(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 tabular-nums" />
                </div>
                <div>
                  <label className="text-muted-text text-xs block mb-1">الفئة</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50">
                    {['عام', 'شباب', 'ناشئين', 'بطولة A', 'بطولة B'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {usedNums.has(parseInt(compNum)) && (
                <p className="text-amber-600 text-xs font-serif">رقم المشاركة {compNum} مستخدم — غيّره يدوياً.</p>
              )}
            </>
          ) : (
            /* ── New player inline form ── */
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setShowNewPlayerForm(false)} className="text-muted-text text-xs hover:text-charcoal">← رجوع</button>
                <p className="text-charcoal font-bold text-sm">تسجيل لاعب جديد</p>
              </div>
              <div>
                <label className="text-muted-text text-xs block mb-1">الاسم الكامل <span className="text-brand">*</span></label>
                <input value={newPlayer.name} onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })} placeholder="علي محمد الجبوري" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-text text-xs block mb-1">تاريخ الميلاد</label>
                  <input type="date" value={newPlayer.dob} onChange={(e) => setNewPlayer({ ...newPlayer, dob: e.target.value })} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-muted-text text-xs block mb-1">رقم الهاتف</label>
                  <input value={newPlayer.phone} onChange={(e) => setNewPlayer({ ...newPlayer, phone: e.target.value })} placeholder="077XXXXXXXX" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
                </div>
              </div>
              <div>
                <label className="text-muted-text text-xs block mb-1">النادي</label>
                <input value={newPlayer.club} onChange={(e) => setNewPlayer({ ...newPlayer, club: e.target.value })} placeholder="نادي بغداد للفروسية" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
              </div>
              <button
                disabled={!newPlayer.name.trim() || savingParticipant}
                onClick={handleAddNew}
                className="w-full bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
              >
                {savingParticipant ? 'جارٍ الحفظ...' : 'إنشاء اللاعب وإضافته'}
              </button>
            </div>
          )}
        </div>

        {saveError && <p role="alert" className="mt-3 text-red-600 text-sm">{saveError}</p>}

        {!showNewPlayerForm && (
          <div className="flex gap-3 mt-5">
            <button
              disabled={!playerId || isBanned || savingParticipant}
              onClick={async () => {
                if (savingParticipant) return
                setSavingParticipant(true)
                setSaveError('')
                try {
                  await addParticipant({ id: `PA${Date.now()}`, competitionNumber: compNum, playerId, horseId, tournamentId, category, status: 'active', roundsCompleted: 0, appealCode: generateAppealCode() })
                  setShowAddParticipant(false)
                } catch (error) {
                  setSaveError('تعذر إضافة المشارك إلى قاعدة البيانات. تحقق من صلاحيات الحساب واتصاله ثم أعد المحاولة.')
                  console.error('Failed to add tournament participant', error)
                } finally {
                  setSavingParticipant(false)
                }
              }}
              className="flex-1 bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
            >
              {savingParticipant ? 'جارٍ الحفظ...' : 'إضافة مشارك'}
            </button>
            <button onClick={() => setShowAddParticipant(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
          </div>
        )}
      </Modal>
    )
  }).current

  /* ── Add Judge modal ── */
  const AddJudgeModal = () => {
    const judges = users.filter((u) => u.role === 'judge' && !localJudgeIds.includes(u.id))
    return (
      <Modal title="إضافة حكم" onClose={() => setShowAddJudge(false)}>
        {judges.length === 0 && <p className="text-muted-text text-sm mb-4">لا يوجد حكام متاحون للإضافة.</p>}
        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {judges.map((u) => (
            <button key={u.id} onClick={() => { addJudge(u.id); setShowAddJudge(false) }}
              className="w-full text-right bg-surface border border-line rounded-lg px-4 py-3 flex items-center justify-between hover:border-brand/40 hover:bg-brand/5 transition-colors">
              <div>
                <p className="text-charcoal font-bold text-sm">{u.name}</p>
                <p className="text-muted-text text-xs font-serif">{u.username}</p>
              </div>
              <Chip label={u.userStatus === 'active' ? 'نشط' : 'موقوف'} color={u.userStatus === 'active' ? 'green' : 'red'} />
            </button>
          ))}
        </div>
        <button onClick={() => setShowAddJudge(false)} className="w-full border border-line text-muted-text text-sm py-2.5 rounded-lg hover:bg-sand transition-colors">إغلاق</button>
      </Modal>
    )
  }

  /* ── Edit Fault modal ── */
  const EditFaultModal = ({ fault }: { fault: typeof localFaults[0] }) => {
    const [f, setF] = useState({ name: fault.name, description: fault.description, disqualifies: fault.disqualifies, active: fault.active })
    return (
      <Modal title="تعديل الخطأ" onClose={() => setEditingFault(null)}>
        <div className="space-y-3">
          <div><label className="text-muted-text text-xs block mb-1">اسم الخطأ</label>
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" /></div>
          <div><label className="text-muted-text text-xs block mb-1">الوصف</label>
            <input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" /></div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={f.disqualifies}
              onChange={(e) => setF((p) => ({ ...p, disqualifies: e.target.checked }))}
              className="h-5 w-5 cursor-pointer accent-brand"
            />
            <span className="text-charcoal text-sm">يؤدي إلى الاستبعاد</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setF((p) => ({ ...p, active: !p.active }))} className={`w-5 h-5 rounded border flex items-center justify-center ${f.active ? 'bg-brand border-brand' : 'bg-ivory border-line'}`}>
              {f.active && <span className="text-ivory text-xs font-black">✓</span>}
            </div>
            <span className="text-charcoal text-sm">فعال في هذه البطولة</span>
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={async () => {
            const next = localFaults.map((x) => x.id === fault.id ? { ...x, ...f } : x)
            try { await apiPut(`/tournaments/${tournamentId}`, { faults: next }); setLocalFaults(next); setEditingFault(null) }
            catch (error) { console.error('Failed to update tournament faults', error) }
          }}
            className="flex-1 bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors">حفظ</button>
          <button onClick={() => setEditingFault(null)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
        </div>
      </Modal>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Modals */}
      {showAddParticipant && <AddParticipantModal />}
      {showAddJudge && <AddJudgeModal />}
      {editingFault && <EditFaultModal fault={editingFault} />}
      {showAddFault && (
        <FaultModal
          onClose={() => setShowAddFault(false)}
          localFaults={localFaults}
          onSave={async (next) => {
            await apiPut(`/tournaments/${tournamentId}`, { faults: next })
            const updated = { ...localTournament, faults: next }
            setLocalFaults(next)
            setLocalTournament(updated)
            onSetTournaments(tournaments.map((t) => t.id === tournamentId ? updated : t))
          }}
        />
      )}
      {editingField && (
        <EditTournamentFieldModal
          label={editingField.label}
          value={editingField.val}
          onClose={() => setEditingField(null)}
          onSave={async (value) => { await saveTournamentField(editingField.key, value); setEditingField(null) }}
        />
      )}
      {showArchiveConfirm && (
        <Modal title="أرشفة البطولة" onClose={() => setShowArchiveConfirm(false)}>
          <p className="text-muted-text text-sm mb-1">هل تريد أرشفة <strong className="text-charcoal">{localTournament.name}</strong>؟</p>
          <p className="text-muted-text/60 text-xs font-serif mb-5">لن تظهر في قائمة البطولات النشطة وستنتقل إلى الأرشيف.</p>
          <div className="flex gap-3">
            <button onClick={archiveTournament} className="flex-1 bg-charcoal text-ivory py-2.5 font-black text-sm rounded-lg hover:opacity-80 transition-opacity">تأكيد الأرشفة</button>
            <button onClick={() => setShowArchiveConfirm(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
          </div>
        </Modal>
      )}

      {showStartConfirm && (
        <Modal title="بدء بطولة الكر والفر؟" onClose={() => setShowStartConfirm(false)}>
          <p className="text-muted-text text-sm mb-2">بعد البدء سيتم:</p>
          <ul className="text-muted-text text-xs font-serif space-y-1 mb-5 list-disc list-inside">
            <li>تفعيل البطولة</li>
            <li>تفعيل واجهات الحكام</li>
            <li>السماح بإدخال النتائج</li>
            <li>تفعيل الجولات</li>
          </ul>
          {startActionError && <p className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 mb-4 text-sm">{startActionError}</p>}
          <div className="flex gap-3">
            <button
              disabled={startingEdition}
              onClick={async () => {
                if (!onStartEdition || startingEdition) return
                setStartingEdition(true)
                setStartActionError('')
                try {
                  await onStartEdition(tournamentId)
                  setShowStartConfirm(false)
                  onBack()
                } catch (error) {
                  setStartActionError('تعذر بدء البطولة. تحقق من اتصال الخادم ثم حاول مرة أخرى.')
                  console.error('Failed to start tournament', error)
                } finally {
                  setStartingEdition(false)
                }
              }}
              className="flex-1 bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {startingEdition ? 'جارٍ بدء البطولة...' : 'تأكيد بدء البطولة'}
            </button>
            <button onClick={() => setShowStartConfirm(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">رجوع</button>
          </div>
        </Modal>
      )}

      {showCancelConfirm && (
        <Modal title="إلغاء البطولة" onClose={() => setShowCancelConfirm(false)}>
          <p className="text-muted-text text-sm mb-3">هل أنت متأكد من إلغاء بطولة الكر والفر؟</p>
          <div className="mb-4">
            <label className="text-muted-text text-xs block mb-1">سبب الإلغاء <span className="text-brand">*</span></label>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء..."
              className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400/50"
            />
          </div>
          <div className="flex gap-3">
            <button
              disabled={!cancelReason.trim()}
              onClick={() => { onCancelEdition?.(tournamentId, cancelReason); setShowCancelConfirm(false); onBack() }}
              className="flex-1 bg-red-600 text-white py-2.5 font-black text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              تأكيد الإلغاء
            </button>
            <button onClick={() => setShowCancelConfirm(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">رجوع</button>
          </div>
        </Modal>
      )}
      {removingParticipantId && (
        <Modal title="إزالة مشارك" onClose={() => setRemovingParticipantId(null)}>
          <p className="text-muted-text text-sm mb-5">هل تريد إزالة هذا المشارك من البطولة؟</p>
          <div className="flex gap-3">
            <button disabled={removingParticipant} onClick={async () => { setRemovingParticipant(true); try { await removeParticipant(removingParticipantId) } catch { /* keep modal open for retry */ } }} className="flex-1 bg-red-600 text-white py-2.5 font-black text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">{removingParticipant ? 'جارٍ الإزالة...' : 'إزالة'}</button>
            <button onClick={() => setRemovingParticipantId(null)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="text-muted-text text-xs hover:text-warm-gray transition-colors mb-3">← البطولات</button>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Chip label={tournamentStatusLabel(localTournament.status)} color={tournamentStatusColor(localTournament.status)} />
              <span className="text-muted-text text-xs font-serif">{localTournament.type}</span>
            </div>
            <h1 className="text-charcoal text-2xl font-black">{localTournament.name}</h1>
            <p className="text-muted-text text-sm mt-1 font-serif">{localTournament.location} · {localTournament.date}</p>
          </div>
        </div>
        <div className="flex gap-0 border-b border-line overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === t.id ? 'text-brand border-brand' : 'text-muted-text border-transparent hover:text-warm-gray'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {/* Start button for not_started editions */}
          {(localTournament.status === 'not_started' || localTournament.status === 'upcoming' || localTournament.status === 'registration') && (
            <div className="bg-brand/5 border border-brand/20 rounded-xl p-6 mb-6 flex items-center justify-between">
              <div>
                <p className="text-charcoal font-black text-base mb-1">البطولة جاهزة للبدء</p>
                <p className="text-muted-text text-xs font-serif">أضف المشاركين والحكام ثم اضغط بدء البطولة لتفعيل المنافسة</p>
              </div>
              <button
                onClick={() => setShowStartConfirm(true)}
                className="bg-brand text-ivory font-black px-6 py-3 rounded-xl hover:bg-brand-hover transition-colors text-sm shrink-0"
              >
                بدء البطولة ←
              </button>
            </div>
          )}
          {/* Complete button for active editions */}
          {localTournament.status === 'active' && (
            <div className="bg-surface border border-line rounded-xl p-4 mb-6 flex items-center justify-between">
              <p className="text-muted-text text-sm font-serif">إنهاء البطولة بعد اكتمال جميع الجولات</p>
              <button
                onClick={() => { onCompleteEdition?.(tournamentId); onBack() }}
                className="border border-line text-charcoal font-bold px-5 py-2 rounded-lg hover:bg-sand/60 transition-colors text-sm"
              >
                إنهاء البطولة
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'المشاركون', val: localParticipants.length },
              { label: 'الحكام', val: localJudgeIds.length },
              { label: `الجولة ${localTournament.currentRound}/${localTournament.totalRounds}`, val: localTournament.currentRound },
              { label: 'نتائج مسجلة', val: tResults.length },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-line rounded-lg p-4">
                <p className="text-charcoal text-2xl font-black mb-1">{s.val}</p>
                <p className="text-muted-text text-xs">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="w-full bg-line rounded-full h-1.5 mb-6">
            <div className="bg-brand h-1.5 rounded-full transition-all" style={{ width: `${(localTournament.totalRounds > 0 ? localTournament.currentRound / localTournament.totalRounds : 0) * 100}%` }} />
          </div>
          <p className="text-muted-text text-sm leading-relaxed">{localTournament.description}</p>
        </div>
      )}

      {/* ── PARTICIPANTS ── */}
      {tab === 'participants' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-muted-text text-sm font-serif">{localParticipants.length} مشارك مسجل</p>
            <div className="flex gap-2">
              {localParticipants.length > 0 && (
                <button onClick={() => setPrintParticipantId('all')} className="border border-line text-muted-text text-sm px-3 py-2 rounded-lg hover:bg-sand transition-colors flex items-center gap-1.5">
                  <span>⎙</span> تحميل PDF للكل
                </button>
              )}
              {!isLocked && <button onClick={() => setShowAddParticipant(true)} className="bg-brand text-ivory text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة مشارك</button>}
            </div>
          </div>
          {localParticipants.length === 0 ? (
            <div className="border border-dashed border-line rounded-xl p-12 text-center">
              <p className="text-muted-text text-sm">لا يوجد مشاركون بعد</p>
              {!isLocked && <button onClick={() => setShowAddParticipant(true)} className="mt-3 text-brand text-sm font-bold hover:underline">+ إضافة أول مشارك</button>}
            </div>
          ) : (
            <div className="border border-line rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-5 py-3 text-muted-text/70 text-xs font-serif uppercase bg-sand/40">
                <div className="col-span-1">رقم</div><div className="col-span-4">اللاعب</div>
                <div className="col-span-3">الخيل</div><div className="col-span-2">الفئة</div>
                <div className="col-span-1">الحالة</div><div className="col-span-1"></div>
              </div>
              {localParticipants.map((p, i) => {
                const pl = players.find((x) => x.id === p.playerId)
                const horseName = horses.find((horse) => horse.id === p.horseId)?.name || '—'
                return (
                  <div key={p.id} className={`grid grid-cols-12 gap-4 px-5 py-3.5 items-center ${i < localParticipants.length - 1 ? 'border-b border-line/60' : ''} hover:bg-sand/30`}>
                    <div className="col-span-1 font-serif text-muted-text text-lg font-light">{p.competitionNumber}</div>
                    <div className="col-span-4 text-charcoal font-semibold text-sm">{pl?.name ?? p.playerId}</div>
                    <div className="col-span-3 text-muted-text text-sm font-serif">{horseName}</div>
                    <div className="col-span-2 text-muted-text text-sm">{p.category}</div>
                    <div className="col-span-1">
                      {p.status === 'active' && <Chip label="نشط" color="green" />}
                      {p.status === 'disqualified' && <Chip label="مستبعد" color="red" />}
                      {p.status === 'withdrawn' && <Chip label="منسحب" color="gray" />}
                    </div>
                    <div className="col-span-1 text-left flex items-center gap-2">
                      <button onClick={() => setPrintParticipantId(p.id)} className="text-brand/50 hover:text-brand text-xs transition-colors" title="طباعة بطاقة اللاعب">⎙</button>
                      {!isLocked && <button onClick={() => setRemovingParticipantId(p.id)} className="text-red-400/50 hover:text-red-500 text-xs transition-colors">✕</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}

      {/* ── ROUNDS ── */}
      {tab === 'rounds' && (
        <div className="space-y-3">
          {roundActionError && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{roundActionError}</div>}
          {localRounds.length === 0 && <p className="text-muted-text text-sm py-4">لا توجد جولات لهذه البطولة.</p>}
          {localRounds.map((r) => (
            <div key={r.id} className="bg-surface border border-line rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-serif text-3xl text-muted-text/30 font-light">{r.number}</span>
                  <div>
                    <p className="text-charcoal font-bold">{r.name}</p>
                    <p className="text-muted-text text-xs font-serif">{r.judgeIds.length} حكام مسندون</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.status === 'not_started' && <Chip label="لم تبدأ" color="gray" />}
                  {r.status === 'active' && <Chip label="جارية" color="green" />}
                  {r.status === 'closed' && <Chip label="مغلقة" color="amber" />}
                  {r.status === 'completed' && <Chip label="مكتملة" color="gray" />}
                  {!isLocked && r.status === 'not_started' && (
                    <button
                      onClick={() => setRoundStatus(r.id, 'active')}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${localTournament.status === 'active' ? 'bg-brand text-ivory hover:bg-brand-hover' : 'border border-line text-muted-text hover:bg-sand/60'}`}
                    >
                      {localTournament.status === 'active' ? 'بدء الجولة ←' : 'ابدأ البطولة أولاً'}
                    </button>
                  )}
                  {!isLocked && r.status === 'active' && (
                    <button onClick={() => setRoundStatus(r.id, 'closed')} className="border border-line text-warm-gray text-xs font-bold px-4 py-2 rounded-lg hover:bg-sand/60 transition-colors">إغلاق الجولة</button>
                  )}
                  {!isLocked && r.status === 'closed' && (
                    <button onClick={() => setRoundStatus(r.id, 'completed')} className="border border-green-500/30 text-green-600 text-xs font-bold px-4 py-2 rounded-lg hover:bg-green-500/10 transition-colors">تأكيد الاكتمال ✓</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── JUDGES ── */}
      {tab === 'judges' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-muted-text text-sm font-serif">{localJudgeIds.length} حكام مسندون</p>
            {!isLocked && <button onClick={() => setShowAddJudge(true)} className="bg-brand text-ivory text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة حكم</button>}
          </div>
          {localJudgeIds.length === 0 ? (
            <div className="border border-dashed border-line rounded-xl p-12 text-center">
              <p className="text-muted-text text-sm">لا يوجد حكام مسندون بعد</p>
              {!isLocked && <button onClick={() => setShowAddJudge(true)} className="mt-3 text-brand text-sm font-bold hover:underline">+ إضافة حكم</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {localJudgeIds.map((uid) => {
                const user = users.find((u) => u.id === uid)
                return (
                  <div key={uid} className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-sand flex items-center justify-center shrink-0">
                        <span className="text-charcoal font-black text-sm">{(user?.name ?? uid)[0]}</span>
                      </div>
                      <div>
                        <p className="text-charcoal font-semibold text-sm">{user?.name ?? uid}</p>
                        <p className="text-muted-text text-xs font-serif">{user?.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Chip label={user?.userStatus === 'active' ? 'نشط' : 'موقوف'} color={user?.userStatus === 'active' ? 'green' : 'red'} />
                      {!isLocked && <button onClick={() => removeJudge(uid)} className="text-red-400/50 hover:text-red-500 text-xs transition-colors">✕ إزالة</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── RULES ── */}
      {tab === 'rules' && ruleset && (
        <div>
          <div className="bg-surface border border-line rounded-lg p-6 mb-4">
            <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-2">نظام البطولة</p>
            <h3 className="text-charcoal text-xl font-black mb-2">{ruleset.name}</h3>
            <p className="text-muted-text text-sm leading-relaxed mb-4">{ruleset.description}</p>
            <div className="border-t border-line pt-4">
              <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-2">نظام النقاط</p>
              <p className="text-warm-gray text-sm leading-relaxed">{ruleset.scoringDescription}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── FAULTS ── */}
      {tab === 'faults' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-muted-text text-sm font-serif">{localFaults.length} خطأ مسجل</p>
              {!isLocked && <button onClick={() => setShowAddFault(true)} className="bg-brand text-ivory text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة خطأ</button>}
          </div>
          <div className="space-y-2">
            {localFaults.map((fault) => (
              <div key={fault.id} className="bg-surface border border-line rounded-lg p-4 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <p className="text-charcoal font-semibold text-sm">{fault.name}</p>
                    {fault.disqualifies && <Chip label="يُستبعد" color="red" />}
                    {!fault.active && <Chip label="غير فعال" color="gray" />}
                  </div>
                  <p className="text-muted-text text-xs">{fault.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {tab === 'results' && (
        <div>
          {tResults.length > 0 && (
            <div className="mb-6 border-2 border-brand/40 rounded-2xl overflow-hidden bg-[#fffaf4] shadow-sm">
              <div className="bg-brand px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-ivory text-base font-black">النهائي — نتائج البطولة</p>
                  <p className="text-ivory/70 text-xs font-serif mt-1">الترتيب النهائي بعد جمع نقاط جميع الجولات</p>
                </div>
                <span className="border border-ivory/40 text-ivory text-[10px] font-black px-3 py-1 rounded-full">نهائي</span>
              </div>
              {(() => {
                const validResults = tResults.filter((r) => r.status === 'approved' || r.status === 'pending')
                const finalRows = localParticipants.map((participant) => {
                  const playerResults = validResults.filter((r) => r.playerId === participant.playerId)
                  const roundKeys = Array.from(new Set(playerResults.map((r) => `${r.tournamentId}:${r.roundId || r.roundNumber}`)))
                  const total = roundKeys.reduce((sum, roundKey) => {
                    const roundResults = validResults.filter((r) => `${r.tournamentId}:${r.roundId || r.roundNumber}` === roundKey)
                    const entry = roundResults.find((r) => r.playerId === participant.playerId)
                    return sum + (entry ? getEffectiveScore(entry, roundResults) : 0)
                  }, 0)
                  const totalTimeMs = getTotalElapsedTime(playerResults)
                  const player = players.find((item) => item.id === participant.playerId)
                  const finalResult = [...playerResults].sort((left, right) => right.roundNumber - left.roundNumber)[0]
                  return { name: player?.name ?? participant.playerId, competitionNumber: participant.competitionNumber, total, totalTimeMs, result: finalResult }
                }).sort((a, b) => compareTotalScoreAndTime(
                  { totalScore: a.total, totalTimeMs: a.totalTimeMs, competitionNumber: a.competitionNumber },
                  { totalScore: b.total, totalTimeMs: b.totalTimeMs, competitionNumber: b.competitionNumber },
                ))

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
                    {finalRows.slice(0, 3).map((row, index) => (
                      <div key={row.competitionNumber} className={`rounded-xl border bg-white p-4 ${index === 0 ? 'border-amber-300 shadow-md' : 'border-line'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-serif text-xl ${index === 0 ? 'text-amber-600' : index === 1 ? 'text-slate-500' : 'text-[#B07040]'}`}>المركز {index + 1}</span>
                          <span className="text-muted-text text-xs font-serif">رقم {row.competitionNumber}</span>
                        </div>
                        <p className="text-charcoal text-lg font-black">{row.name}</p>
                        <p className="text-brand text-xl font-black mt-2">{row.total} نقطة</p>
                        <p className="text-muted-text text-xs font-serif mt-1">إجمالي الوقت: {row.totalTimeMs === null ? '—' : formatElapsedTime(row.totalTimeMs)}</p>
                        {row.result && (
                          <button
                            onClick={() => { onSetLiveDisplay(row.result!, 'podium', (index + 1) as 1 | 2 | 3, 'final'); onNavigate('live-display') }}
                            className="mt-3 w-full rounded-lg bg-charcoal py-2 text-xs font-black text-ivory hover:opacity-85"
                          >
                            عرض المركز {index + 1}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
          <p className="text-muted-text text-sm mb-4 font-serif">{tResults.length} نتيجة مسجلة</p>
          {tResults.length === 0 ? (
            <div className="border border-dashed border-line rounded-xl p-12 text-center text-muted-text text-sm">لا توجد نتائج بعد — يُدخلها الحكام من بوابتهم.</div>
          ) : (
            <div className="border border-line rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-5 py-3 text-muted-text/70 text-xs font-serif uppercase bg-sand/40">
                <div className="col-span-1">رقم</div><div className="col-span-3">اللاعب</div>
                <div className="col-span-2">الجولة</div><div className="col-span-2">الوقت</div>
                <div className="col-span-1">أخطاء</div><div className="col-span-1">نقاط</div><div className="col-span-2">الحالة</div>
              </div>
              {(() => {
                const groupedByRound = new Map<string, { roundNumber: number; roundName: string; results: JudgeResult[] }>()

                for (const r of tResults) {
                  const roundNumber = Number.isFinite(r.roundNumber) ? r.roundNumber : 0
                  const roundName = r.roundName || `الجولة ${roundNumber || 1}`
                  const key = `${roundNumber || 0}:${String(roundName).trim() || 'unknown'}`
                  const existing = groupedByRound.get(key)

                  if (existing) {
                    existing.results.push(r)
                  } else {
                    groupedByRound.set(key, { roundNumber, roundName, results: [r] })
                  }
                }

                const rounds = Array.from(groupedByRound.values()).sort((a, b) => {
                  const left = Number.isFinite(a.roundNumber) ? a.roundNumber : 0
                  const right = Number.isFinite(b.roundNumber) ? b.roundNumber : 0
                  return left - right
                })
                const rows: React.ReactNode[] = []

                rounds.forEach((group, groupIndex) => {
                  const roundLabel = group.roundName || `الجولة ${group.roundNumber || groupIndex + 1}`
                  const roundTitle = `جدول ${roundLabel}`

                  rows.push(
                    <div key={`round-block-${group.roundName}-${group.roundNumber}`} className="mt-4 first:mt-0 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                      <div className="bg-[#f4efe8] border-b border-line px-5 py-3 text-sm font-black text-charcoal flex items-center justify-between">
                        <span>{roundTitle}</span>
                        <span className="text-xs text-muted-text font-serif">{group.results.length} نتيجة</span>
                      </div>

                      <div className="border-b border-line bg-surface p-4">
                        <p className="text-muted-text text-xs font-black mb-3">مراكز {roundLabel}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {sortRoundResults(group.results).filter((result) => getRoundPosition(result, group.results) <= 3).map((r) => {
                            const rank = getRoundPosition(r, group.results) as 1 | 2 | 3
                            return (
                              <div key={`podium-${r.id}`} className="rounded-lg border border-line bg-white p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`font-serif text-base ${rank === 1 ? 'text-amber-600' : rank === 2 ? 'text-slate-500' : 'text-[#B07040]'}`}>المركز {rank}</span>
                                  <span className="text-muted-text text-[10px] font-serif">{r.competitionNumber}</span>
                                </div>
                                <p className="text-charcoal font-black text-sm">{r.playerName}</p>
                                <p className="text-muted-text font-serif text-xs tabular-nums mt-1">{getEffectiveScore(r, group.results)} نقطة · {r.time}</p>
                                <button
                                  onClick={() => { onSetLiveDisplay(r, 'podium', rank, 'round'); onNavigate('live-display') }}
                                  className="mt-3 w-full rounded-lg bg-charcoal py-2 text-xs font-black text-ivory hover:opacity-85"
                                >
                                  عرض المركز {rank}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-2 px-5 py-3 text-muted-text/70 text-xs font-serif uppercase bg-sand/30 border-b border-line">
                        <div className="col-span-1">رقم</div><div className="col-span-3">اللاعب</div>
                        <div className="col-span-2">الجولة</div><div className="col-span-2">الوقت</div>
                        <div className="col-span-1">أخطاء</div><div className="col-span-1">نقاط</div><div className="col-span-2">الحالة</div>
                      </div>

                      {sortRoundResults(group.results).map((r, i) => {
                        const displayScore = getEffectiveScore(r, tResults)
                        return (
                          <div key={r.id} className={`grid grid-cols-12 gap-2 px-5 py-3 items-center text-sm ${i < group.results.length - 1 ? 'border-b border-line/60' : ''} hover:bg-sand/20`}>
                            <div className="col-span-1 text-muted-text font-serif">{r.competitionNumber}</div>
                            <div className="col-span-3 text-charcoal font-semibold truncate">{r.playerName}</div>
                            <div className="col-span-2 text-muted-text text-xs">{r.roundName}</div>
                            <div className="col-span-2 text-warm-gray font-serif tabular-nums">{r.time}</div>
                            <div className="col-span-1 text-muted-text">{r.faults.reduce((s, f) => s + f.count, 0)}</div>
                            <div className="col-span-1 text-brand font-black">{displayScore}</div>
                            <div className="col-span-2">
                              {r.status === 'pending' && <Chip label="انتظار" color="amber" />}
                              {r.status === 'approved' && <Chip label="معتمدة" color="green" />}
                              {r.status === 'rejected' && <Chip label="مرفوضة" color="red" />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })

                return rows
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── RANKING ── */}
      {tab === 'ranking' && (() => {
        const allTournamentResults = tResults.filter((r) => r.tournamentId === localTournament.id)
        const activeRoundResults = allTournamentResults.filter((r) => r.status === 'approved' || r.status === 'pending')
        const rounds = localRounds.sort((a, b) => a.number - b.number)
        const maxScore = Math.max(localTournament.totalRounds || rounds.length || 0, 0) * 4
        const baseResults = activeRoundResults.length > 0 ? activeRoundResults : allTournamentResults

        /* Compute rank-based points per round using the same logic as the result log */
        const rankScore = (roundId: string, playerId: string): number | null => {
          const roundNumber = rounds.find((r) => r.id === roundId)?.number
          const roundResults = baseResults.filter((r) => r.roundId === roundId || (roundNumber !== undefined && r.roundNumber === roundNumber))
          const entry = roundResults.find((r) => r.playerId === playerId)
          if (!entry) return null
          return getEffectiveScore(entry, roundResults)
        }

        /* Build player totals */
        const playerMap = new Map<string, { name: string; compNum: string; roundScores: (number | null)[]; totalTimeMs: number | null }>()
        localParticipants.forEach((p) => {
          const player = players.find((pl) => pl.id === p.playerId)
          playerMap.set(p.competitionNumber, {
            name: player?.name ?? p.playerId,
            compNum: p.competitionNumber,
            roundScores: rounds.map((r) => rankScore(r.id, p.playerId)),
            totalTimeMs: getTotalElapsedTime(baseResults.filter((result) => result.playerId === p.playerId)),
          })
        })
        const rows = Array.from(playerMap.values())
          .map((p) => ({ ...p, total: p.roundScores.reduce<number>((s, v) => s + (v ?? 0), 0) }))
          .sort((a, b) => compareTotalScoreAndTime(
            { totalScore: a.total, totalTimeMs: a.totalTimeMs, competitionNumber: a.compNum },
            { totalScore: b.total, totalTimeMs: b.totalTimeMs, competitionNumber: b.compNum },
          ))

        if (rows.length === 0) return (
          <p className="text-muted-text text-sm py-4">لا توجد نتائج معتمدة بعد.</p>
        )

        const allRoundsComplete = rounds.every((r) => r.status === 'completed')

        return (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted-text text-xs font-serif uppercase tracking-widest">
                {allRoundsComplete ? 'الترتيب النهائي' : 'الترتيب الحالي (جارٍ)'}
              </p>
              <p className="text-muted-text/60 text-xs font-serif">الحد الأعلى: {maxScore} نقطة</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-text/70 text-xs font-serif border-b border-line">
                    <th className="text-right py-3 pr-0 pl-4 w-10">#</th>
                    <th className="text-right py-3 px-2">اللاعب</th>
                    <th className="text-right py-3 px-2 w-8">رقم</th>
                    {rounds.map((r) => (
                      <th key={r.id} className="text-center py-3 px-2 w-12">ج{r.number}</th>
                    ))}
                    <th className="text-center py-3 px-2 w-24">إجمالي الوقت</th>
                    <th className="text-center py-3 px-2 w-20">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const prevTotal = i > 0 ? rows[i - 1].total : null
                    const previousRow = i > 0 ? rows[i - 1] : null
                    const isTied = previousRow !== null
                      && prevTotal === row.total
                      && previousRow.totalTimeMs === row.totalTimeMs
                    return (
                      <tr key={row.compNum} className={`border-b border-line/40 hover:bg-sand/30 ${i < 3 && !isTied ? 'font-semibold' : ''}`}>
                        <td className="py-3 pr-0 pl-4">
                          {isTied ? (
                            <span className="text-amber-500 text-xs font-serif">تعادل</span>
                          ) : (
                            <span className={`font-serif text-lg font-light tabular-nums ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700/70' : 'text-muted-text/30'}`}>{i + 1}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-charcoal">{row.name}</td>
                        <td className="py-3 px-2 text-muted-text font-serif tabular-nums text-center">{row.compNum}</td>
                        {row.roundScores.map((score, ri) => (
                          <td key={ri} className="py-3 px-2 text-center tabular-nums font-serif">
                            {score === null
                              ? <span className="text-line">—</span>
                              : <span className={score === 4 ? 'text-brand font-black' : score === 0 ? 'text-muted-text/40' : 'text-charcoal'}>{score}</span>
                            }
                          </td>
                        ))}
                        <td className="py-3 px-2 text-center text-muted-text font-serif tabular-nums">
                          {row.totalTimeMs === null ? '—' : formatElapsedTime(row.totalTimeMs)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="text-brand font-black tabular-nums">{row.total}</span>
                          <span className="text-muted-text/50 text-xs font-serif"> / {maxScore}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!allRoundsComplete && (
              <p className="text-muted-text/60 text-xs font-serif mt-4 text-center">
                * المجموع الحالي — لم تكتمل جميع الجولات بعد
              </p>
            )}
          </div>
        )
      })()}

      {/* ── APPEALS ── */}
      {tab === 'appeals' && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <p className="text-muted-text text-xs font-serif uppercase tracking-widest">اعتراضات المشاركين</p>
            <span className="text-xs font-serif text-muted-text/60">{tournamentAppeals.filter((a) => a.status === 'pending').length} بانتظار المراجعة</span>
          </div>
          {tournamentAppeals.length === 0 ? (
            <p className="text-muted-text text-sm text-center py-10">لا توجد اعتراضات مقدَّمة بعد</p>
          ) : (
            <div className="space-y-3">
              {tournamentAppeals.map((a) => (
                <div key={a.id} className="bg-surface border border-line rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-charcoal font-bold">{a.playerName}</p>
                      <p className="text-muted-text text-xs font-serif">رقم {a.competitionNumber} · {a.submittedAt}</p>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border shrink-0 ${
                      a.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                      a.status === 'reviewed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {a.status === 'pending' ? 'بانتظار المراجعة' : a.status === 'reviewed' ? 'تمت المراجعة' : 'مرفوض'}
                    </span>
                  </div>
                  <p className="text-charcoal text-sm bg-sand/50 rounded-lg p-3 mb-3 font-serif">{a.text}</p>
                  {a.adminResponse && (
                    <div className="border border-brand/20 bg-brand/5 rounded-lg p-3 mb-3">
                      <p className="text-brand text-xs font-bold mb-1">رد الإدارة:</p>
                      <p className="text-charcoal text-sm font-serif">{a.adminResponse}</p>
                    </div>
                  )}
                  {a.status === 'pending' && (
                    <AppealResponseForm appealId={a.id} onUpdateAppeal={onUpdateAppeal} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === 'settings-tab' && (
        <div className="space-y-3">
          {([
            { label: 'اسم البطولة', key: 'name' as const },
            { label: 'المكان', key: 'location' as const },
            { label: 'التاريخ', key: 'date' as const },
            { label: 'النوع', key: 'type' as const },
          ]).map((s) => (
            <div key={s.label} className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-muted-text text-xs mb-1 font-serif">{s.label}</p>
                <p className="text-charcoal font-semibold text-sm">{localTournament[s.key] as string}</p>
              </div>
              {!isLocked && <button onClick={() => setEditingField({ label: s.label, key: s.key, val: localTournament[s.key] as string })}
                className="text-brand/60 text-xs hover:text-brand transition-colors font-bold">تعديل</button>
              }
            </div>
          ))}
          <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
            <div>
              <p className="text-muted-text text-xs mb-1 font-serif">شعار هذه البطولة فقط</p>
              <ImageUploadField value={tournamentLogo} onChange={setTournamentLogo} label="رفع شعار البطولة" />
            </div>
            <LogoPlacementEditor logoUrl={tournamentLogo} x={logoX} y={logoY} size={Number(logoSize) || 96} onMove={(x, y) => { setLogoX(x); setLogoY(y) }} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-muted-text text-xs">حجم الشعار
                <input type="number" min={48} max={320} value={logoSize} onChange={(e) => setLogoSize(e.target.value)} className="mt-1 w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div>
              <p className="text-muted-text text-xs mb-2 font-serif">رعاة هذه البطولة</p>
              <div className="space-y-3">
                {tournamentSponsors.map((sponsor, index) => (
                  <div key={sponsor.id} className="rounded-lg border border-line bg-ivory p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={sponsor.name} onChange={(e) => setTournamentSponsors((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} placeholder="اسم الراعي" className="flex-1 bg-surface border border-line text-charcoal rounded-lg px-3 py-2 text-sm" />
                      <button type="button" onClick={() => setTournamentSponsors((current) => current.filter((_, i) => i !== index))} className="px-3 text-red-500">حذف</button>
                    </div>
                    <ImageUploadField value={sponsor.logoUrl ?? ''} onChange={(url) => setTournamentSponsors((current) => current.map((item, i) => i === index ? { ...item, logoUrl: url } : item))} label="رفع شعار الراعي" />
                  </div>
                ))}
                <button type="button" onClick={() => setTournamentSponsors((current) => [...current, { id: `SP${Date.now()}`, name: '' }])} className="w-full border border-dashed border-brand/40 text-brand text-sm font-semibold py-2.5 rounded-lg">+ إضافة راعٍ</button>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => void saveTournamentBranding()} className="bg-brand text-ivory font-black text-sm px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors">حفظ هوية شاشة العرض</button>
              {brandingMessage && <span className="text-muted-text text-xs">{brandingMessage}</span>}
            </div>
          </div>
          <div className="border-t border-line pt-5 mt-4 flex gap-3">
            {(localTournament.status === 'active' || localTournament.status === 'completed') && (
              <button onClick={() => setShowArchiveConfirm(true)}
                className="border border-line text-muted-text text-sm px-5 py-2.5 rounded-lg hover:bg-sand/60 transition-colors">
                أرشفة البطولة
              </button>
            )}
            {(localTournament.status === 'not_started' || localTournament.status === 'active') && (
              <button onClick={() => setShowCancelConfirm(true)}
                className="border border-red-500/30 text-red-400 text-sm px-5 py-2.5 rounded-lg hover:bg-red-500/10 transition-colors">
                إلغاء البطولة
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'website-settings' && (
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-lg p-4 space-y-4">
            <div>
              <label className="text-muted-text text-xs font-serif mb-2 block">عنوان البطولة في الموقع</label>
              <input value={websiteTitle} onChange={(event) => setWebsiteTitle(event.target.value)} placeholder={localTournament.name} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
            </div>
            <div>
              <label className="text-muted-text text-xs font-serif mb-2 block">وصف البطولة للزوار</label>
              <textarea value={websiteDescription} onChange={(event) => setWebsiteDescription(event.target.value)} rows={5} placeholder="اكتب نبذة عن البطولة ومواعيدها..." className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 resize-y" />
            </div>
            <div>
              <label className="text-muted-text text-xs font-serif mb-2 block">موعد البطولة (التاريخ والوقت)</label>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3" dir="rtl">
                <input aria-label="تاريخ البطولة" type="date" value={websiteDateTimeParts.date} onChange={(event) => {
                  const nextParts = { ...websiteDateTimeParts, date: event.target.value }
                  setWebsiteDateTimeParts(nextParts)
                  setWebsiteTargetDate(serializeWebsiteDateTime(nextParts))
                }} className="sm:col-span-2 bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
                <select aria-label="الساعة" value={websiteDateTimeParts.hour} onChange={(event) => {
                  const nextParts = { ...websiteDateTimeParts, hour: event.target.value }
                  setWebsiteDateTimeParts(nextParts)
                  setWebsiteTargetDate(serializeWebsiteDateTime(nextParts))
                }} className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50">
                  {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <select aria-label="الدقيقة" value={websiteDateTimeParts.minute} onChange={(event) => {
                    const nextParts = { ...websiteDateTimeParts, minute: event.target.value }
                    setWebsiteDateTimeParts(nextParts)
                    setWebsiteTargetDate(serializeWebsiteDateTime(nextParts))
                  }} className="min-w-0 bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50">
                    {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                  </select>
                  <select aria-label="الفترة" value={websiteDateTimeParts.period} onChange={(event) => {
                    const nextParts = { ...websiteDateTimeParts, period: event.target.value as WebsiteDateTimeParts['period'] }
                    setWebsiteDateTimeParts(nextParts)
                    setWebsiteTargetDate(serializeWebsiteDateTime(nextParts))
                  }} className="min-w-0 bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50">
                    <option value="AM">صباحاً</option>
                    <option value="PM">مساءً</option>
                  </select>
                </div>
              </div>
              <p className="text-muted-text text-xs mt-1">اختر الوقت بنظام 12 ساعة. يظهر الموعد في صفحة البطولة العامة.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-muted-text text-xs font-serif mb-2">صورة غلاف البطولة</p>
                <ImageUploadField value={websiteHeroImage} onChange={setWebsiteHeroImage} label="رفع صورة الغلاف" />
              </div>
              <div>
                <p className="text-muted-text text-xs font-serif mb-2">صورة قسم عن البطولة</p>
                <ImageUploadField value={websiteAboutImage} onChange={setWebsiteAboutImage} label="رفع صورة القسم" />
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-lg p-4">
            <p className="text-muted-text text-xs font-serif mb-3">صور معرض البطولة</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              {websiteImages.map((image, index) => (
                <div key={image} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
                  <img src={image} alt={`صورة البطولة ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setWebsiteImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute top-2 left-2 bg-charcoal/80 text-ivory text-xs px-2 py-1 rounded">حذف</button>
                </div>
              ))}
            </div>
            <MultiImageUploadField onChange={(urls) => setWebsiteImages((current) => [...current, ...urls.filter((url) => !current.includes(url))])} onUploadingChange={setUploadingWebsiteImages} label="اختيار صور للمعرض" />
          </div>

          <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
            <p className="text-charcoal font-semibold text-sm">الأقسام الظاهرة للزوار</p>
            {[
              ['عرض الفرسان المشاركين', websiteShowParticipants, setWebsiteShowParticipants],
              ['عرض جولات البطولة', websiteShowRounds, setWebsiteShowRounds],
              ['عرض الرعاة', websiteShowSponsors, setWebsiteShowSponsors],
            ].map(([label, checked, setChecked]) => (
              <label key={label as string} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={checked as boolean} onChange={(event) => (setChecked as (value: boolean) => void)(event.target.checked)} className="h-5 w-5 accent-brand" />
                <span className="text-charcoal text-sm">{label as string}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" disabled={uploadingWebsiteImages} onClick={async () => {
              setWebsiteMessage('جارٍ الحفظ...')
              const updated = { ...localTournament, websiteTitle: websiteTitle.trim(), websiteDescription: websiteDescription.trim(), websiteTargetDate, websiteHeroImage, websiteAboutImage, websiteImages, websiteShowParticipants, websiteShowRounds, websiteShowSponsors }
              try {
                await apiPut(`/tournaments/${tournamentId}`, { website_title: updated.websiteTitle, website_description: updated.websiteDescription, website_target_date: websiteTargetDate, website_hero_image: websiteHeroImage, website_about_image: websiteAboutImage, websiteImages, website_show_participants: websiteShowParticipants, website_show_rounds: websiteShowRounds, website_show_sponsors: websiteShowSponsors })
                setLocalTournament(updated)
                onSetTournaments(tournaments.map((tournament) => tournament.id === tournamentId ? updated : tournament))
                setWebsiteMessage('تم حفظ إعدادات الموقع')
              } catch (error) {
                console.error('Failed to save website settings', error)
                setWebsiteMessage('تعذر حفظ إعدادات الموقع')
              }
            }} className="bg-brand text-ivory font-black text-sm px-6 py-2.5 rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50">{uploadingWebsiteImages ? 'انتظر اكتمال رفع الصور...' : 'حفظ إعدادات الموقع'}</button>
            {websiteMessage && <p className="text-muted-text text-xs">{websiteMessage}</p>}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-0 border border-line rounded-lg overflow-hidden">
          {tournamentAudit.length === 0 && <p className="text-muted-text text-sm text-center py-12">لا توجد تعديلات مسجلة لهذه البطولة.</p>}
          {tournamentAudit.map((entry, index) => (
            <div key={entry.id} className={`flex items-start gap-4 px-5 py-4 ${index < tournamentAudit.length - 1 ? 'border-b border-line/60' : ''}`}>
              <Chip label={entry.category} />
              <div className="flex-1 min-w-0">
                <p className="text-charcoal text-sm font-semibold">{entry.action}</p>
                <p className="text-muted-text text-xs mt-1">{entry.description}</p>
              </div>
              <div className="text-left shrink-0">
                <p className="text-charcoal text-xs font-semibold">{entry.userName}</p>
                <p className="text-muted-text/60 text-[10px] mt-1">{entry.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF Print Modal */}
      {printParticipantId && (() => {
        const printList = printParticipantId === 'all'
          ? localParticipants
          : localParticipants.filter((p) => p.id === printParticipantId)
        const appealUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/#/appeal`
        return (
          <div className="print-modal fixed inset-0 bg-charcoal/70 z-50 flex items-center justify-center p-4" onClick={() => setPrintParticipantId(null)}>
            <div className="print-dialog bg-surface rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-charcoal font-black">بطاقات المشاركين</h2>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="bg-brand text-ivory text-sm font-bold px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors">طباعة / حفظ PDF</button>
                  <button onClick={() => setPrintParticipantId(null)} className="border border-line text-muted-text text-sm px-3 py-2 rounded-lg hover:bg-sand">إغلاق</button>
                </div>
              </div>
              <div id="print-area" className="space-y-6">
                {printList.map((p) => {
                  const pl = players.find((x) => x.id === p.playerId)
                  const horseName = horses.find((horse) => horse.id === p.horseId)?.name || '—'
                  return (
                    <div key={p.id} className="border-2 border-line rounded-xl p-6 print-card">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="font-serif text-[10px] tracking-[0.3em] uppercase text-muted-text mb-1">{localTournament.name} · {localTournament.date}</p>
                          <p className="text-charcoal font-black text-2xl">{pl?.name ?? p.playerId}</p>
                          {horseName && horseName !== '—' && <p className="text-muted-text text-sm font-serif mt-0.5">{horseName}</p>}
                        </div>
                        <div className="text-center">
                          <p className="font-serif text-5xl text-brand/30 font-light tabular-nums">{p.competitionNumber}</p>
                          <p className="text-muted-text text-[10px] font-serif">رقم المشاركة</p>
                        </div>
                      </div>
                      <div className="border-t border-line pt-4 flex items-center justify-between gap-6">
                        <div>
                          <p className="text-muted-text text-[10px] font-serif uppercase tracking-widest mb-2">رمز الاعتراض</p>
                          <p className="font-mono text-charcoal font-black text-xl tracking-[0.25em] bg-sand border border-line rounded-lg px-3 py-2">
                            {p.appealCode ?? '—'}
                          </p>
                          <p className="text-muted-text/60 text-[10px] font-serif mt-1.5">أدخل هذا الرمز في بوابة الاعتراضات</p>
                          <p className="text-muted-text/50 text-[10px] font-serif mt-0.5 break-all">{appealUrl}</p>
                        </div>
                        <div className="shrink-0 text-center">
                          <QRCodeSVG value={`${appealUrl}?code=${p.appealCode ?? ''}`} size={80} level="M" />
                          <p className="text-muted-text/50 text-[9px] font-serif mt-1">امسح للاعتراض</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function AppealResponseForm({ appealId, onUpdateAppeal }: { appealId: string; onUpdateAppeal?: (id: string, patch: Partial<Appeal>) => void }) {
  const [response, setResponse] = useState('')
  return (
    <div className="border-t border-line pt-3 mt-1">
      <p className="text-muted-text text-xs font-serif mb-2">رد الإدارة</p>
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={2}
        placeholder="اكتب ردك على الاعتراض..."
        className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand/60 transition-colors resize-none mb-2"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onUpdateAppeal?.(appealId, { status: 'reviewed', adminResponse: response.trim() || undefined, reviewedAt: new Date().toLocaleString('ar-IQ'), reviewedBy: 'المدير' })}
          className="bg-brand text-ivory text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors"
        >
          اعتماد الرد
        </button>
        <button
          onClick={() => onUpdateAppeal?.(appealId, { status: 'dismissed', reviewedAt: new Date().toLocaleString('ar-IQ'), reviewedBy: 'المدير' })}
          className="border border-red-300 text-red-500 text-xs px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
        >
          رفض الاعتراض
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CREATE TOURNAMENT WIZARD
═══════════════════════════════════════════════════════════ */
function CreateTournamentWizard({ onDone, onBack }: { onDone: (date: string, rounds: number, venue?: string, description?: string) => void; onBack: () => void }) {
  const [date, setDate] = useState('')
  const [rounds, setRounds] = useState('4')
  const [venue, setVenue] = useState('')
  const [description, setDescription] = useState('')

  const roundsNum = Math.max(1, Math.min(20, parseInt(rounds) || 0))
  const isValid = date.trim() && roundsNum >= 1

  return (
    <div className="p-8 max-w-lg">
      <button onClick={onBack} className="text-muted-text text-xs hover:text-warm-gray transition-colors mb-6">← البطولات</button>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">بطولة الكر والفر</p>
      <h1 className="text-charcoal text-2xl font-black mb-2">بدء بطولة جديدة</h1>
      <p className="text-muted-text text-sm font-serif mb-8">القوانين والأخطاء تأتي تلقائياً من قالب الكر والفر. حدد التاريخ وعدد الجولات.</p>

      <div className="bg-brand/5 border border-brand/15 rounded-xl p-4 mb-6">
        <p className="text-brand text-xs font-bold uppercase tracking-wider mb-2">قالب مخصص</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'الأخطاء المُعتمدة', val: '0' },
            { label: 'النظام', val: 'مخصص' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-charcoal font-black text-xl">{s.val}</p>
              <p className="text-muted-text text-[10px] font-serif">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div>
          <label className="text-muted-text text-xs block mb-2">تاريخ البطولة <span className="text-brand">*</span></label>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="مثال: 25 / 09 / 2026"
            className="w-full bg-surface border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>
        <div>
          <label className="text-muted-text text-xs block mb-2">عدد الجولات <span className="text-brand">*</span></label>
          <input
            type="number"
            min={1}
            max={20}
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
            placeholder="4"
            className="w-full bg-surface border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand/50 transition-colors"
          />
          {roundsNum >= 1 && (
            <p className="text-muted-text/60 text-[11px] font-serif mt-1.5">
              سيتم إنشاء {roundsNum} جولات — الحد الأعلى للنقاط: {roundsNum * 4} نقطة
            </p>
          )}
        </div>
        <div>
          <label className="text-muted-text text-xs block mb-2">المكان <span className="text-muted-text/40">(اختياري)</span></label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="ملعب الفروسية الدولي، بغداد"
            className="w-full bg-surface border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>
        <div>
          <label className="text-muted-text text-xs block mb-2">وصف <span className="text-muted-text/40">(اختياري)</span></label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر..."
            className="w-full bg-surface border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          disabled={!isValid}
          onClick={() => onDone(date.trim(), roundsNum, venue.trim() || undefined, description.trim() || undefined)}
          className="flex-1 bg-brand text-ivory py-3.5 font-black text-sm rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          إنشاء البطولة ←
        </button>
        <button onClick={onBack} className="border border-line text-muted-text text-sm px-5 py-3 rounded-xl hover:bg-sand transition-colors">
          رجوع
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PLAYERS VIEW
═══════════════════════════════════════════════════════════ */
function AddPlayerModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Player) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', dob: '', phone: '', club: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const valid = form.name.trim().length > 1

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-charcoal font-black text-lg">إضافة لاعب جديد</h3>
          <button onClick={onClose} className="text-muted-text text-xl hover:text-warm-gray">×</button>
        </div>
        <div className="space-y-3">
          {[
            { label: 'الاسم الكامل *', key: 'name', placeholder: 'محمد أحمد الكريم' },
            { label: 'تاريخ الميلاد', key: 'dob', placeholder: '١٩٩٢-٠٣-١٥' },
            { label: 'رقم الهاتف', key: 'phone', placeholder: '٠٧٧٠١٢٣٤٥٦٧' },
            { label: 'النادي', key: 'club', placeholder: 'نادي الفروسية الملكي، بغداد' },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-muted-text text-xs block mb-1">{f.label}</label>
              <input
                value={form[f.key as keyof typeof form]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button
            disabled={!valid}
            onClick={async () => {
              const newP: Player = {
                id: `P${Date.now()}`,
                name: form.name.trim(),
                dob: form.dob || '—',
                phone: form.phone || '—',
                club: form.club || '—',
                status: 'active',
              }
              setSaving(true)
              setError('')
              try {
                await onSave(newP)
                onClose()
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ اللاعب على الخادم')
              } finally {
                setSaving(false)
              }
            }}
            disabled={!valid || saving}
            className="flex-1 bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ اللاعب'}
          </button>
          <button onClick={onClose} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}

function PlayersView({ players, onSetPlayers, onSelectPlayer }: { players: Player[]; onSetPlayers: (p: Player[]) => void; onSelectPlayer: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const filtered = players.filter((p) => p.name.includes(search) || p.club.includes(search))

  return (
    <div className="p-8 max-w-5xl">
      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} onSave={async (p) => {
        try {
          const created = await apiPost<{ id: string }>('/players', {
            name: p.name,
            country: '',
            club: p.club,
            horse: '',
            category: 'عام',
            tournament_id: null,
          })
          onSetPlayers([...players, { ...p, id: created.id, club: p.club || '—' }])
        } catch (error) {
          console.error('Failed to save player to database', error)
          // Do not create a fake local player when the server rejected the save.
          throw error
        }
      }} />}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">السجلات</p>
          <h1 className="text-charcoal text-3xl font-black">قاعدة اللاعبين</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة لاعب</button>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو النادي..."
        className="w-full bg-surface border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand/40 transition-colors mb-5"
      />
      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 text-muted-text/70 text-xs font-serif uppercase bg-sand/40">
          <div className="col-span-1">ID</div>
          <div className="col-span-4">الاسم</div>
          <div className="col-span-4">النادي</div>
          <div className="col-span-2">الحالة</div>
          <div className="col-span-1" />
        </div>
        {filtered.map((p, i) => (
          <div
            key={p.id}
            className={`grid grid-cols-12 gap-3 px-5 py-3.5 items-center cursor-pointer hover:bg-sand/40 transition-colors ${i < filtered.length - 1 ? 'border-b border-line/60' : ''}`}
            onClick={() => onSelectPlayer(p.id)}
          >
            <div className="col-span-1 text-muted-text/50 text-xs font-serif">{p.id}</div>
            <div className="col-span-4 text-charcoal font-semibold text-sm">{p.name}</div>
            <div className="col-span-4 text-muted-text text-sm">{p.club}</div>
            <div className="col-span-2">
              {p.status === 'active' ? <Chip label="نشط" color="green" /> : <Chip label="محظور" color="red" />}
            </div>
            <div className="col-span-1 text-brand/50 text-xs hover:text-brand transition-colors text-center">عرض</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Player Profile */
function PlayerProfileView({ playerId, players, onSetPlayers, onBack }: { playerId: string; players: Player[]; onSetPlayers: (p: Player[]) => void; onBack: () => void }) {
  const [profileTab, setProfileTab] = useState<'info' | 'tournaments' | 'results'>('info')
  const [editing, setEditing] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [showBanModal, setShowBanModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const player = players.find((p) => p.id === playerId)
  if (!player) return null

  const [editForm, setEditForm] = useState({ name: player.name, dob: player.dob, phone: player.phone, club: player.club })
  const participated: { id: string; competitionNumber: string; tournamentId: string; status: string }[] = []

  const saveEdit = async () => {
    try {
      await apiPut(`/players/${playerId}`, editForm)
      onSetPlayers(players.map((p) => p.id === playerId ? { ...p, ...editForm } : p))
      setEditing(false)
    } catch (error) {
      console.error('Failed to update player', error)
    }
  }

  const toggleBan = async (ban: boolean, reason?: string) => {
    const bannedAt = ban ? new Date().toLocaleDateString('ar-IQ') : undefined
    try {
      await apiPut(`/players/${playerId}`, { status: ban ? 'banned' : 'active', banned_reason: reason ?? '', banned_at: bannedAt ?? '' })
      onSetPlayers(players.map((p) => p.id === playerId
        ? { ...p, status: ban ? 'banned' : 'active', bannedReason: reason, bannedAt }
        : p
      ))
      setShowBanModal(false)
    } catch (error) {
      console.error('Failed to update player ban status', error)
    }
  }

  const deletePlayer = async () => {
    try {
      await apiDelete(`/players/${playerId}`)
      onSetPlayers(players.filter((p) => p.id !== playerId))
      onBack()
    } catch (error) {
      console.error('Failed to delete player', error)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <button onClick={onBack} className="text-muted-text text-sm hover:text-warm-gray transition-colors mb-6">← قاعدة اللاعبين</button>

      {/* Header */}
      <div className="flex items-start gap-5 mb-6">
        <div className="w-16 h-16 rounded-lg bg-sand border border-line flex items-center justify-center shrink-0">
          <span className="text-charcoal/40 text-2xl font-black">{player.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-charcoal text-2xl font-black">{player.name}</h1>
            {player.status === 'active' ? <Chip label="نشط" color="green" /> : <Chip label="محظور" color="red" />}
          </div>
          <p className="text-muted-text text-sm font-serif">{player.club} · {player.id}</p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => { setEditForm({ name: player.name, dob: player.dob, phone: player.phone, club: player.club }); setEditing(true) }}
            className="border border-line text-muted-text text-sm px-3 py-2 rounded-lg hover:bg-sand hover:text-charcoal transition-colors"
          >
            تعديل
          </button>
          {player.status === 'active'
            ? <button onClick={() => setShowBanModal(true)} className="border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors">حظر</button>
            : <button onClick={() => toggleBan(false)} className="border border-green-500/30 text-green-600 text-sm px-3 py-2 rounded-lg hover:bg-green-500/10 transition-colors">رفع الحظر</button>
          }
          <button onClick={() => setShowDeleteModal(true)} className="border border-red-500/20 text-red-400/60 text-sm px-3 py-2 rounded-lg hover:bg-red-500/8 hover:text-red-500 transition-colors">حذف</button>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4" onClick={() => setEditing(false)}>
          <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-charcoal font-black text-lg">تعديل بيانات اللاعب</h3>
              <button onClick={() => setEditing(false)} className="text-muted-text text-xl hover:text-warm-gray">×</button>
            </div>
            <div className="space-y-3">
              {([
                { label: 'الاسم الكامل', key: 'name' as const },
                { label: 'تاريخ الميلاد', key: 'dob' as const },
                { label: 'رقم الهاتف', key: 'phone' as const },
                { label: 'النادي', key: 'club' as const },
              ]).map((f) => (
                <div key={f.key}>
                  <label className="text-muted-text text-xs block mb-1">{f.label}</label>
                  <input
                    value={editForm[f.key]}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={saveEdit}
                disabled={!editForm.name.trim()}
                className="flex-1 bg-brand text-ivory py-2.5 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
              >
                حفظ التعديلات
              </button>
              <button onClick={() => setEditing(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Ban modal */}
      {showBanModal && (
        <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4" onClick={() => setShowBanModal(false)}>
          <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-charcoal font-black mb-1">حظر اللاعب</h3>
            <p className="text-muted-text text-xs font-serif mb-4">{player.name}</p>
            <label className="text-muted-text text-xs block mb-1">سبب الحظر</label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الحظر..."
              className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => toggleBan(true, banReason)} className="flex-1 bg-red-600 text-white py-2.5 font-black text-sm rounded-lg hover:bg-red-700 transition-colors">تأكيد الحظر</button>
              <button onClick={() => setShowBanModal(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-charcoal font-black mb-1">حذف اللاعب</h3>
            <p className="text-muted-text text-sm font-serif mb-1">هل أنت متأكد من حذف <strong className="text-charcoal">{player.name}</strong>؟</p>
            <p className="text-red-400/70 text-xs mb-5">هذا الإجراء لا يمكن التراجع عنه.</p>
            <div className="flex gap-3">
              <button onClick={deletePlayer} className="flex-1 bg-red-600 text-white py-2.5 font-black text-sm rounded-lg hover:bg-red-700 transition-colors">حذف نهائي</button>
              <button onClick={() => setShowDeleteModal(false)} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-line mb-6">
        {(['info', 'tournaments', 'results'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setProfileTab(t)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${profileTab === t ? 'text-brand border-brand' : 'text-muted-text border-transparent hover:text-warm-gray'}`}
          >
            {t === 'info' ? 'المعلومات' : t === 'tournaments' ? 'البطولات' : 'النتائج'}
          </button>
        ))}
      </div>

      {profileTab === 'info' && (
        <div className="space-y-2">
          {[
            { label: 'الاسم الكامل', val: player.name },
            { label: 'تاريخ الميلاد', val: player.dob },
            { label: 'رقم الهاتف', val: player.phone },
            { label: 'النادي', val: player.club },
            { label: 'رقم اللاعب', val: player.id },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-line rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-muted-text text-xs font-serif">{s.label}</span>
              <span className="text-charcoal text-sm font-semibold">{s.val}</span>
            </div>
          ))}
          {player.status === 'banned' && (
            <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-4 mt-3">
              <p className="text-red-500 font-semibold text-sm mb-1">محظور</p>
              <p className="text-muted-text text-xs">{player.bannedReason ?? '—'}</p>
              {player.bannedAt && <p className="text-muted-text/60 text-xs mt-1 font-serif">{player.bannedAt}</p>}
            </div>
          )}
        </div>
      )}

      {profileTab === 'tournaments' && (
        <div className="space-y-2">
          {participated.length === 0 && <p className="text-muted-text text-sm py-4">لا توجد مشاركات مسجلة لهذا اللاعب.</p>}
          {participated.map((pa) => {
            return (
              <div key={pa.id} className="bg-surface border border-line rounded-lg px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-charcoal text-sm font-semibold">{pa.tournamentId}</p>
                  <p className="text-muted-text text-xs mt-0.5 font-serif">رقم المشاركة: {pa.competitionNumber}</p>
                </div>
                <Chip label={pa.status === 'active' ? 'نشط' : pa.status === 'disqualified' ? 'مستبعد' : 'منسحب'} color={pa.status === 'active' ? 'green' : 'red'} />
              </div>
            )
          })}
        </div>
      )}

      {profileTab === 'results' && (
        <p className="text-muted-text text-sm py-4">يتطلب ربطاً بقاعدة النتائج.</p>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   HORSES VIEW
═══════════════════════════════════════════════════════════ */
function HorsesView({ horses, onChange }: { horses: Horse[]; onChange: (horses: Horse[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ name: '', registrationNo: '', breed: '', age: '', gender: '', color: '', owner: '' })

  const addHorse = async () => {
    if (!draft.name.trim() || saving) return
    setSaving(true)
    setError('')
    const payload = {
      name: draft.name.trim(),
      registration_no: draft.registrationNo.trim(),
      breed: draft.breed.trim(),
      age: Number(draft.age) || 0,
      gender: draft.gender.trim(),
      color: draft.color.trim(),
      owner: draft.owner.trim(),
    }
    try {
      const { id } = await apiPost<{ id: string }>('/horses', payload)
      onChange([...horses, normalizeHorse({ ...payload, id })])
      setDraft({ name: '', registrationNo: '', breed: '', age: '', gender: '', color: '', owner: '' })
      setShowForm(false)
    } catch (saveError) {
      setError('تعذر حفظ الخيل. تحقق من الاتصال والصلاحيات ثم حاول مجدداً.')
      console.error('Failed to save horse', saveError)
    } finally {
      setSaving(false)
    }
  }

  const removeHorse = async (horse: Horse) => {
    if (!window.confirm(`حذف الخيل «${horse.name}»؟`)) return
    try {
      await apiDelete(`/horses/${horse.id}`)
      onChange(horses.filter((item) => item.id !== horse.id))
    } catch (deleteError) {
      setError('تعذر حذف الخيل. تحقق من الاتصال والصلاحيات ثم حاول مجدداً.')
      console.error('Failed to delete horse', deleteError)
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">السجلات</p>
          <h1 className="text-charcoal text-3xl font-black">الخيول</h1>
        </div>
        <button onClick={() => setShowForm((visible) => !visible)} className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors">{showForm ? 'إلغاء' : '+ إضافة خيل'}</button>
      </div>
      {showForm && <div className="bg-surface border border-line rounded-lg p-5 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="اسم الخيل *" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.registrationNo} onChange={(event) => setDraft({ ...draft, registrationNo: event.target.value })} placeholder="رقم التسجيل" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.breed} onChange={(event) => setDraft({ ...draft, breed: event.target.value })} placeholder="السلالة" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value.replace(/[^0-9]/g, '') })} placeholder="العمر" inputMode="numeric" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })} placeholder="الجنس" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} placeholder="اللون" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm" />
          <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="المالك" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm sm:col-span-2" />
        </div>
        <button onClick={() => void addHorse()} disabled={!draft.name.trim() || saving} className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ الخيل'}</button>
      </div>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="border border-line rounded-lg overflow-hidden bg-surface">
        {horses.length === 0 ? <div className="px-5 py-8 text-center text-muted-text text-sm">لا توجد خيول مسجلة حالياً.</div> : horses.map((horse) => (
          <div key={horse.id} className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line last:border-b-0">
            <div className="min-w-0">
              <p className="text-charcoal font-bold">{horse.name}</p>
              <p className="text-muted-text text-xs">{[horse.breed, horse.registrationNo, horse.owner].filter(Boolean).join(' · ') || 'لا توجد تفاصيل إضافية'}</p>
            </div>
            <button onClick={() => void removeHorse(horse)} className="text-red-500 text-xs font-bold shrink-0">حذف</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   JUDGES VIEW
═══════════════════════════════════════════════════════════ */
function JudgesView({ onNavigate, onOpenUsers, users, onDeleteUser }: { onNavigate: (page: string) => void; onOpenUsers: () => void; users: SystemUser[]; onDeleteUser?: (id: string) => Promise<void> }) {
  const judges = users.filter((u) => u.role === 'judge')
  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">السجلات</p>
          <h1 className="text-charcoal text-3xl font-black">الحكام</h1>
        </div>
        <button onClick={onOpenUsers} className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة حكم</button>
      </div>
      <div className="space-y-2">
        {judges.map((j) => {
          const assignedTournaments = j.assignedTournaments
          return (
            <div key={j.id} className="bg-surface border border-line rounded-lg p-5 flex items-center justify-between">
              <div>
                <p className="text-charcoal font-bold mb-1">{j.name}</p>
                <p className="text-muted-text text-xs">@{j.username} · {assignedTournaments.join('، ')}</p>
                <p className="text-muted-text/50 text-xs mt-0.5 font-serif">آخر دخول: {j.lastLogin}</p>
              </div>
              <div className="flex items-center gap-3">
                <Chip label={j.userStatus === 'active' ? 'نشط' : 'موقوف'} color={j.userStatus === 'active' ? 'green' : 'red'} />
                <button onClick={() => onNavigate('judge')} className="bg-brand/10 border border-brand/30 text-brand text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand/20 transition-colors">
                  فتح واجهة الحكم
                </button>
                <button onClick={() => void onDeleteUser?.(j.id)} className="text-red-400/60 hover:text-red-500 text-xs transition-colors">حذف</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   USERS VIEW
═══════════════════════════════════════════════════════════ */
function UsersView({ users, onAddUser, onUpdateUser, onDeleteUser }: {
  users: SystemUser[]
  onAddUser?: (u: Omit<SystemUser, 'id' | 'lastLogin'>) => void
  onUpdateUser?: (id: string, patch: Partial<SystemUser>) => void
  onDeleteUser?: (id: string) => Promise<void>
}) {
  const [filterRole, setFilterRole] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<SystemUser['role']>('judge')
  const [addError, setAddError] = useState('')

  const roleList: Array<SystemUser['role']> = ['super_admin', 'admin', 'tournament_manager', 'data_entry', 'judge', 'result_reviewer', 'screen_controller']
  const filtered = filterRole === 'all' ? users : users.filter((u) => u.role === filterRole)

  const resetModal = () => {
    setNewName(''); setNewUsername(''); setNewPassword(''); setNewEmail('')
    setNewRole('judge'); setAddError(''); setShowAddModal(false)
  }

  const handleAdd = () => {
    if (!newName.trim() || !newUsername.trim() || !newPassword.trim()) {
      setAddError('يرجى ملء الحقول المطلوبة'); return
    }
    if (users.some((u) => u.username === newUsername.trim())) {
      setAddError('اسم المستخدم مستخدم مسبقاً'); return
    }
    onAddUser?.({ name: newName.trim(), username: newUsername.trim(), password: newPassword, email: newEmail.trim(), role: newRole, userStatus: 'active', assignedTournaments: [] })
    resetModal()
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">النظام</p>
          <h1 className="text-charcoal text-3xl font-black">المستخدمون</h1>
        </div>
        <button onClick={() => setShowAddModal(true)} className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors">+ إضافة مستخدم</button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {(['all', ...roleList] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${filterRole === r ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted-text hover:border-charcoal/30'}`}
          >
            {r === 'all' ? 'الكل' : EMPTY_ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-3 text-muted-text/70 text-xs font-serif uppercase bg-sand/40">
          <div className="col-span-3">الاسم</div>
          <div className="col-span-2">اسم المستخدم</div>
          <div className="col-span-2">الدور</div>
          <div className="col-span-2">الحالة</div>
          <div className="col-span-2">آخر دخول</div>
          <div className="col-span-1 text-center">إجراءات</div>
        </div>
        {filtered.length === 0 && (
          <div className="px-5 py-8 text-center text-muted-text text-sm font-serif">لا يوجد مستخدمون</div>
        )}
        {filtered.map((u, i) => (
          <div key={u.id} className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center text-sm ${i < filtered.length - 1 ? 'border-b border-line/60' : ''} hover:bg-sand/40 transition-colors`}>
            <div className="col-span-3">
              <p className="text-charcoal font-semibold">{u.name}</p>
              <p className="text-muted-text text-xs font-serif">{u.email}</p>
            </div>
            <div className="col-span-2 text-muted-text font-serif text-xs">@{u.username}</div>
            <div className="col-span-2"><Chip label={EMPTY_ROLE_LABELS[u.role] ?? u.role} color={u.role === 'super_admin' ? 'brand' : u.role === 'judge' ? 'blue' : 'gray'} /></div>
            <div className="col-span-2">{u.userStatus === 'active' ? <Chip label="نشط" color="green" /> : <Chip label="موقوف" color="red" />}</div>
            <div className="col-span-2 text-muted-text/70 text-xs font-serif">{u.lastLogin}</div>
            <div className="col-span-1 flex items-center justify-center gap-2">
              <button
                onClick={() => onUpdateUser?.(u.id, { userStatus: u.userStatus === 'active' ? 'suspended' : 'active' })}
                className={`text-xs px-2 py-1 rounded border transition-colors ${u.userStatus === 'active' ? 'border-red-200 text-red-400 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
              >
                {u.userStatus === 'active' ? 'إيقاف' : 'تفعيل'}
              </button>
              <button onClick={() => void onDeleteUser?.(u.id)} className="text-red-400/60 hover:text-red-500 text-xs transition-colors">حذف</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add user modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-charcoal font-black text-xl">إضافة مستخدم جديد</h2>
              <button onClick={resetModal} className="text-muted-text hover:text-charcoal text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-muted-text text-xs font-serif block mb-1.5">الاسم الكامل *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="أحمد محمد" className="w-full border border-line rounded-lg px-3 py-2.5 text-sm text-charcoal bg-ivory focus:outline-none focus:border-brand/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-text text-xs font-serif block mb-1.5">اسم المستخدم *</label>
                  <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="ahmed.m" dir="ltr" className="w-full border border-line rounded-lg px-3 py-2.5 text-sm text-charcoal bg-ivory focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-muted-text text-xs font-serif block mb-1.5">كلمة المرور *</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full border border-line rounded-lg px-3 py-2.5 text-sm text-charcoal bg-ivory focus:outline-none focus:border-brand/50" />
                </div>
              </div>
              <div>
                <label className="text-muted-text text-xs font-serif block mb-1.5">البريد الإلكتروني</label>
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@hr-ride.com" dir="ltr" className="w-full border border-line rounded-lg px-3 py-2.5 text-sm text-charcoal bg-ivory focus:outline-none focus:border-brand/50" />
              </div>
              <div>
                <label className="text-muted-text text-xs font-serif block mb-1.5">الدور</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as SystemUser['role'])} className="w-full border border-line rounded-lg px-3 py-2.5 text-sm text-charcoal bg-ivory focus:outline-none focus:border-brand/50">
                  {roleList.map((r) => <option key={r} value={r}>{EMPTY_ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAdd} className="flex-1 bg-brand text-ivory font-bold py-2.5 rounded-lg hover:bg-brand-hover transition-colors text-sm">إضافة المستخدم</button>
              <button onClick={resetModal} className="border border-line text-muted-text text-sm px-4 py-2.5 rounded-lg hover:bg-sand transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ROLES & PERMISSIONS
═══════════════════════════════════════════════════════════ */
function RolesView({ rolePerms: rolePermsProp, onSaveRolePerms }: {
  rolePerms?: Record<string, string[]>
  onSaveRolePerms?: (role: string, perms: string[]) => void
}) {
  const roles = ['admin', 'tournament_manager', 'data_entry', 'judge', 'result_reviewer', 'screen_controller']
  const allPerms = [
    'عرض البطولات', 'إنشاء بطولة', 'تعديل بطولة', 'حذف بطولة',
    'إضافة لاعب', 'تعديل لاعب', 'إضافة مشارك',
    'إدخال نتيجة', 'تعديل نتيجة', 'اعتماد نتيجة', 'رفض نتيجة',
    'استبعاد لاعب', 'حظر لاعب', 'إزالة حظر',
    'إدارة الموقع', 'إدارة العرض المباشر', 'إدارة المستخدمين', 'مشاهدة سجل العمليات',
  ]
  const defaultPerms: Record<string, string[]> = {
    admin: allPerms.filter((p) => p !== 'حذف بطولة' && p !== 'إدارة المستخدمين'),
    tournament_manager: ['عرض البطولات', 'تعديل بطولة', 'إضافة مشارك', 'اعتماد نتيجة', 'رفض نتيجة', 'استبعاد لاعب'],
    data_entry: ['عرض البطولات', 'إضافة لاعب', 'تعديل لاعب', 'إضافة مشارك'],
    judge: ['إدخال نتيجة', 'استبعاد لاعب', 'حظر لاعب'],
    result_reviewer: ['عرض البطولات', 'اعتماد نتيجة', 'رفض نتيجة'],
    screen_controller: ['عرض البطولات', 'إدارة العرض المباشر'],
  }
  const [selectedRole, setSelectedRole] = useState('admin')
  const [perms, setPerms] = useState<Record<string, string[]>>(rolePermsProp ?? defaultPerms)
  const [saved, setSaved] = useState(false)
  const lastSyncedPermsRef = useRef<string | null>(null)
  const isEditingPermsRef = useRef(false)

  useEffect(() => {
    const nextPermsValue = JSON.stringify(rolePermsProp ?? {})
    if (!rolePermsProp || isEditingPermsRef.current || nextPermsValue === lastSyncedPermsRef.current) return

    setPerms({
      ...defaultPerms,
      ...rolePermsProp,
    })
    lastSyncedPermsRef.current = nextPermsValue
  }, [rolePermsProp])

  const handleSave = async () => {
    isEditingPermsRef.current = false
    try {
      await onSaveRolePerms?.(selectedRole, perms[selectedRole] ?? [])
      lastSyncedPermsRef.current = JSON.stringify({
        ...defaultPerms,
        ...rolePermsProp,
        [selectedRole]: perms[selectedRole] ?? [],
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaved(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">النظام</p>
      <h1 className="text-charcoal text-3xl font-black mb-6">الأدوار والصلاحيات</h1>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-3">الأدوار</p>
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={`w-full text-right px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${selectedRole === r ? 'bg-brand/10 text-brand border border-brand/30' : 'text-muted-text hover:bg-sand/60 hover:text-charcoal border border-transparent'}`}
              >
                {EMPTY_ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-muted-text text-xs font-serif uppercase tracking-widest">صلاحيات — {EMPTY_ROLE_LABELS[selectedRole]}</p>
            <button
              onClick={handleSave}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-semibold ${saved ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-brand/40 text-brand hover:bg-brand/8'}`}
            >
              {saved ? '✓ تم الحفظ' : 'حفظ التغييرات'}
            </button>
          </div>
          <div className="space-y-1.5">
            {allPerms.map((perm) => {
              const checked = perms[selectedRole]?.includes(perm)
              return (
                <button
                  key={perm}
                  onClick={() => {
                    isEditingPermsRef.current = true
                    setPerms((prev) => ({
                      ...prev,
                      [selectedRole]: checked
                        ? prev[selectedRole].filter((p) => p !== perm)
                        : [...(prev[selectedRole] ?? []), perm],
                    }))
                  }}
                  className={`w-full text-right px-4 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors ${checked ? 'bg-brand/8 border border-brand/20 text-charcoal' : 'bg-surface border border-line/60 text-muted-text'}`}
                >
                  <span>{perm}</span>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'border-brand bg-brand text-ivory' : 'border-line'}`}>
                    {checked && <span className="text-xs leading-none">✓</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   RESULTS APPROVAL
═══════════════════════════════════════════════════════════ */
function ResultsApprovalView({ judgeResults, tournaments, appeals = [], currentUser, onAudit, onUpdateResultStatus, onPublishResult }: {
  judgeResults: JudgeResult[]
  tournaments: Tournament[]
  appeals?: Appeal[]
  currentUser?: SystemUser | null
  onAudit: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => void
  onUpdateResultStatus: Props['onUpdateResultStatus']
  onPublishResult: Props['onPublishResult']
}) {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [editingResult, setEditingResult] = useState<JudgeResult | null>(null)
  const [editSaveError, setEditSaveError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [statusError, setStatusError] = useState('')

  const openTournamentIds = new Set(tournaments.filter((t) => ['active', 'registration', 'upcoming', 'not_started'].includes(t.status)).map((t) => t.id))
  const visibleResults = judgeResults.filter((result) => openTournamentIds.has(result.tournamentId))
  const pending = visibleResults.filter((r) => r.status === 'pending')
  const approved = visibleResults.filter((r) => r.status === 'approved')
  const rejected = visibleResults.filter((r) => r.status === 'rejected')
  const listed = tab === 'pending' ? pending : tab === 'approved' ? approved : rejected

  const reviewing = reviewingId ? judgeResults.find((r) => r.id === reviewingId) : null
  const canEditResults = currentUser?.username === 'hs'
  const hasAppeal = (result: JudgeResult) => appeals.some((appeal) =>
    appeal.tournamentId === result.tournamentId &&
    (appeal.playerId === result.playerId || appeal.competitionNumber === result.competitionNumber)
  )

  return (
    <div className="p-8 max-w-4xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة البطولات</p>
      <h1 className="text-charcoal text-3xl font-black mb-6">اعتماد النتائج</h1>
      {statusError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{statusError}</p>}

      <div className="flex gap-0 border-b border-line mb-6">
        {([['pending', 'بانتظار الاعتماد', pending.length], ['approved', 'معتمدة', approved.length], ['rejected', 'مرفوضة', rejected.length]] as const).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${tab === id ? 'text-brand border-brand' : 'text-muted-text border-transparent hover:text-warm-gray'}`}
          >
            {label}
            {count > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${tab === id && id === 'pending' ? 'bg-brand/20 text-brand' : 'bg-white/10 text-muted-text'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Review modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-charcoal/40 z-50 flex items-center justify-end" onClick={() => { setReviewingId(null); setRejectReason('') }}>
          <div className="w-full max-w-md h-full bg-surface border-r border-line p-8 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-charcoal font-black text-lg">مراجعة النتيجة</h3>
              <button onClick={() => { setReviewingId(null); setRejectReason('') }} className="text-muted-text hover:text-warm-gray transition-colors text-xl">×</button>
            </div>
            <div className="space-y-3 mb-6">
              {[
                { label: 'اللاعب', val: reviewing.playerName },
                { label: 'رقم المشاركة', val: reviewing.competitionNumber },
                { label: 'البطولة', val: reviewing.tournamentName },
                { label: 'الجولة', val: reviewing.roundName },
                { label: 'الحكم', val: reviewing.judgeName },
                { label: 'الوقت', val: reviewing.time },
                { label: 'الأخطاء', val: reviewing.faults.length === 0 ? 'لا أخطاء' : reviewing.faults.map((f) => `${f.name} × ${f.count}`).join('، ') },
                { label: 'النقاط المحسوبة', val: String(getEffectiveScore(reviewing, judgeResults)) },
                { label: 'وقت الإرسال', val: reviewing.submittedAt },
              ].map((s) => (
                <div key={s.label} className="flex justify-between py-2 border-b border-line/60">
                  <span className="text-muted-text text-sm">{s.label}</span>
                  <span className="text-charcoal text-sm font-semibold">{s.val}</span>
                </div>
              ))}
            </div>
            {statusError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{statusError}</p>}
            {reviewing.status === 'pending' && (
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    setStatusError('')
                    try {
                      await onUpdateResultStatus(reviewing.id, 'approved', { approvedBy: currentUser?.name ?? '' })
                      setReviewingId(null)
                    } catch (error) {
                      setStatusError(error instanceof Error ? error.message : 'تعذر اعتماد النتيجة')
                    }
                  }}
                  className="w-full bg-green-600 text-charcoal py-3 font-black rounded-lg hover:bg-green-700 transition-colors"
                >
                  اعتماد النتيجة
                </button>
                <div>
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="سبب الرفض..."
                    className="w-full bg-ivory border border-line text-charcoal rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500/40 mb-2"
                  />
                  <button
                    onClick={async () => {
                      setStatusError('')
                      try {
                        await onUpdateResultStatus(reviewing.id, 'rejected', { rejectedReason: rejectReason })
                        setReviewingId(null)
                        setRejectReason('')
                      } catch (error) {
                        setStatusError(error instanceof Error ? error.message : 'تعذر رفض النتيجة')
                      }
                    }}
                    disabled={!rejectReason.trim()}
                    className="w-full border border-red-500/30 text-red-400 py-3 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    رفض النتيجة
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editingResult && (
        <div className="fixed inset-0 bg-charcoal/40 z-50 flex items-center justify-center px-4" onClick={() => setEditingResult(null)}>
          <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-charcoal font-black text-lg">تعديل نتيجة باعتراض</h3>
              <button type="button" onClick={() => setEditingResult(null)} className="text-muted-text text-xl">×</button>
            </div>
            <p className="text-muted-text text-sm mb-4">{editingResult.playerName} · {editingResult.roundName}</p>
            <label className="text-muted-text text-xs block mb-1">الوقت</label>
            <input
              value={editingResult.time}
              onChange={(event) => setEditingResult({ ...editingResult, time: event.target.value })}
              className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm mb-5 focus:outline-none focus:border-brand/50"
              placeholder="00:00.00"
            />
            <p className="text-muted-text text-xs mb-2">الأخطاء</p>
            <div className="space-y-2 mb-5">
              {editingResult.faults.length === 0 && <p className="text-muted-text/60 text-sm">لا توجد أخطاء</p>}
              {editingResult.faults.map((fault) => (
                <div key={fault.faultId} className="flex items-center justify-between border border-line rounded-lg px-3 py-2">
                  <span className="text-charcoal text-sm">{fault.name} × {fault.count}</span>
                  <button type="button" onClick={() => setEditingResult({ ...editingResult, faults: editingResult.faults.filter((item) => item.faultId !== fault.faultId) })} className="text-red-500 text-xs">إزالة</button>
                </div>
              ))}
            </div>
            {editSaveError && <p className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 mb-4 text-xs">{editSaveError}</p>}
            <button
              type="button"
              disabled={savingEdit}
              onClick={async () => {
                if (parseTimeValue(editingResult.time) === null) {
                  setEditSaveError('أدخل وقتًا صحيحًا أكبر من صفر قبل حفظ التصحيح.')
                  return
                }
                setSavingEdit(true)
                setEditSaveError('')
                try {
                  await apiPut(`/results/${editingResult.id}`, { time: editingResult.time, faults: editingResult.faults })
                  await apiPut(`/results/${editingResult.id}/status`, { status: 'pending' })
                  onAudit({ tournamentId: editingResult.tournamentId, action: 'تعديل نتيجة', description: `قام ${currentUser?.name ?? 'المستخدم'} بتعديل وقت/أخطاء ${editingResult.playerName} في ${editingResult.roundName}`, category: 'نتائج' })
                  setEditingResult(null)
                } catch (error) {
                  setEditSaveError(error instanceof Error ? error.message : 'تعذر حفظ التعديل على الخادم.')
                } finally {
                  setSavingEdit(false)
                }
              }}
              className="w-full bg-brand text-ivory py-3 font-black rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {savingEdit ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {listed.length === 0 && (
          <div className="text-center py-12 text-muted-text/70 text-sm">لا توجد نتائج</div>
        )}
        {[...listed]
          .sort((a, b) => a.roundNumber - b.roundNumber || (parseTimeValue(a.time) ?? Infinity) - (parseTimeValue(b.time) ?? Infinity))
          .map((r, index, sortedResults) => {
            const previous = sortedResults[index - 1]
            const startsRound = !previous || previous.roundNumber !== r.roundNumber
            return (
              <Fragment key={r.id}>
                {startsRound && (
                  <div className="pt-4 pb-1 first:pt-0">
                    <p className="text-charcoal font-black text-sm">نتائج {r.roundName || `الجولة ${r.roundNumber}`}</p>
                    <div className="h-px bg-line mt-2" />
                  </div>
                )}
                <div className="bg-surface border border-line rounded-lg p-5 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-serif text-2xl text-muted-text/40 font-light">{r.competitionNumber}</span>
                <div>
                  <p className="text-charcoal font-bold text-sm">{r.playerName}</p>
                  <p className="text-muted-text text-xs font-serif">{r.roundName} · الحكم: {r.judgeName}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-warm-gray font-serif tabular-nums">{r.time}</span>
                <span className="text-muted-text">{r.faults.reduce((s, f) => s + f.count, 0)} أخطاء</span>
                <span className="text-brand font-black">{getEffectiveScore(r, judgeResults)} نقطة</span>
              </div>
              {r.rejectedReason && <p className="text-red-400/70 text-xs mt-1">{r.rejectedReason}</p>}
              <p className="text-muted-text/50 text-xs mt-1 font-serif">{r.submittedAt}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {r.status === 'pending' && (
                <>
                  <button onClick={() => setReviewingId(r.id)} className="border border-line text-muted-text text-xs px-3 py-2 rounded-lg hover:bg-sand/60 transition-colors">مراجعة</button>
                  <button onClick={async () => {
                    setStatusError('')
                    try { await onUpdateResultStatus(r.id, 'approved', { approvedBy: currentUser?.name ?? '' }) }
                    catch (error) { setStatusError(error instanceof Error ? error.message : 'تعذر اعتماد النتيجة') }
                  }} className="bg-green-600/80 text-charcoal text-xs px-3 py-2 rounded-lg hover:bg-green-600 transition-colors font-bold">اعتماد</button>
                  <button onClick={async () => {
                    setStatusError('')
                    try { await onUpdateResultStatus(r.id, 'rejected', { rejectedReason: 'مرفوضة' }) }
                    catch (error) { setStatusError(error instanceof Error ? error.message : 'تعذر رفض النتيجة') }
                  }} className="border border-red-500/30 text-red-400/70 text-xs px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors">رفض</button>
                </>
              )}
              {r.status === 'approved' && (
                <div className="flex items-center gap-2">
                  <Chip label="معتمدة" color="green" />
                  {canEditResults && hasAppeal(r) && (
                    <button onClick={() => setEditingResult({ ...r, faults: [...r.faults] })} className="border border-brand/30 text-brand text-xs px-3 py-1.5 rounded-lg hover:bg-brand/8 transition-colors font-semibold">تعديل</button>
                  )}
                  {r.published
                    ? <Chip label="منشورة" color="brand" />
                    : (
                      <button
                        onClick={() => onPublishResult(r.id, true)}
                        className="border border-brand/30 text-brand text-xs px-3 py-1.5 rounded-lg hover:bg-brand/8 transition-colors font-semibold"
                      >
                        نشر
                      </button>
                    )
                  }
                </div>
              )}
              {r.status === 'rejected' && (
                <div className="flex items-center gap-2">
                  <Chip label="مرفوضة" color="red" />
                  {canEditResults && (
                    <button onClick={() => setEditingResult({ ...r, faults: [...r.faults] })} className="border border-brand/30 text-brand text-xs px-3 py-1.5 rounded-lg hover:bg-brand/8 transition-colors font-semibold">تصحيح</button>
                  )}
                </div>
              )}
            </div>
                </div>
              </Fragment>
            )
          })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   LIVE CONTROL
═══════════════════════════════════════════════════════════ */
function LiveControlView({ judgeResults, liveState, onSetLiveDisplay, onPublishResult, onNavigate, tournaments, screenOnly = false }: {
  judgeResults: JudgeResult[]
  liveState: LiveDisplayState
  onSetLiveDisplay: Props['onSetLiveDisplay']
  onPublishResult: Props['onPublishResult']
  onNavigate: (page: string) => void
  tournaments: Tournament[]
  screenOnly?: boolean
}) {
  const [liveActionKey, setLiveActionKey] = useState<string | null>(null)
  const activeTournamentIds = new Set(tournaments.filter((t) => ['active', 'registration', 'upcoming', 'not_started'].includes(t.status)).map((t) => t.id))
  const incoming = judgeResults.filter((r) => r.status === 'pending' && activeTournamentIds.has(r.tournamentId))
  const readyToDisplay = screenOnly
    ? tournaments.flatMap((tournament) => {
        if (!activeTournamentIds.has(tournament.id)) return []
        const rounds = tournament.rounds ?? []
        const displayRound = rounds.find((round) => round.status === 'active')
          ?? [...rounds]
            .filter((round) => round.status === 'closed' || round.status === 'completed')
            .sort((left, right) => right.number - left.number)[0]
        if (!displayRound) return []
        return sortRoundResults(judgeResults.filter((result) =>
          result.status === 'approved' &&
          result.tournamentId === tournament.id &&
          (result.roundId === displayRound.id || result.roundNumber === displayRound.number),
        )).slice(0, 3)
      })
    : judgeResults.filter((r) => {
        if (r.status !== 'approved' || !activeTournamentIds.has(r.tournamentId)) return false
        const tournament = tournaments.find((item) => item.id === r.tournamentId)
        const round = tournament?.rounds?.find((item) => item.id === r.roundId || item.number === r.roundNumber)
        return !round || !['closed', 'completed'].includes(round.status)
      })

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة البطولات</p>
          <h1 className="text-charcoal text-3xl font-black">التحكم المباشر</h1>
        </div>
        <button
          onClick={() => onNavigate('live-display')}
          className="bg-brand text-ivory text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors"
        >
          فتح الشاشة العامة ←
        </button>
      </div>

      <div className={`grid grid-cols-12 gap-4 ${screenOnly ? 'lg:grid-cols-8' : ''}`}>
        {/* Column A: Incoming results */}
        {!screenOnly && <div className="col-span-12 lg:col-span-4">
          <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-3">
            A — النتائج الواردة
            {incoming.length > 0 && <span className="ms-2 bg-amber-500/20 text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded">{incoming.length}</span>}
          </p>
          <div className="space-y-2">
            {incoming.length === 0 && <p className="text-muted-text/50 text-sm text-center py-6 border border-dashed border-line rounded-lg">لا نتائج جديدة</p>}
            {groupResultsByRound(incoming).map(([roundNumber, roundResults]) => (
              <div key={`incoming-round-${roundNumber}`} className="space-y-2">
                <p className="text-charcoal text-xs font-black pt-2">نتائج الجولة {roundNumber}</p>
                {sortRoundResults(roundResults).map((r) => <div key={r.id} className="bg-surface border border-amber-500/15 rounded-lg p-4">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-charcoal font-bold text-sm">{r.playerName}</p>
                  <span className="font-serif text-xl text-muted-text/40">{r.competitionNumber}</span>
                </div>
                <p className="text-muted-text font-serif text-sm tabular-nums mb-1">{r.time}</p>
                <p className="text-muted-text/70 text-xs mb-3">الحكم: {r.judgeName} · {r.submittedAt}</p>
                <Chip label="بانتظار الاعتماد" color="amber" />
                </div>)}
              </div>
            ))}
          </div>
        </div>}

        {/* Column B: Approved queue */}
        <div className={`col-span-12 ${screenOnly ? 'lg:col-span-6' : 'lg:col-span-4'}`}>
          <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-3">{screenOnly ? 'المراكز الجاهزة للعرض' : 'B — معتمدة — جاهزة للنشر'}</p>
          <div className="space-y-2">
            {readyToDisplay.length === 0 && <p className="text-muted-text/50 text-sm text-center py-6 border border-dashed border-line rounded-lg">لا نتائج معتمدة</p>}
            {groupResultsByRound(readyToDisplay).map(([roundNumber, roundResults]) => <div key={`ready-round-${roundNumber}`} className="space-y-2">
              <p className="text-charcoal text-xs font-black pt-2">مراكز الجولة {roundNumber}</p>
              {sortRoundResults(roundResults).slice(0, screenOnly ? 3 : 8).map((r, rankIndex) => {
              const isLive = liveState.result?.id === r.id
              return (
                <div key={r.id} className={`border rounded-lg p-4 transition-colors ${isLive ? 'bg-brand/8 border-brand/30' : 'bg-surface border-line'}`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-charcoal font-bold text-sm">{screenOnly ? `المركز ${rankIndex + 1} — ` : ''}{r.playerName}</p>
                    <span className="font-serif text-xl text-muted-text/40">{r.competitionNumber}</span>
                  </div>
                  {!screenOnly && <p className="text-warm-gray font-serif text-sm tabular-nums mb-1">{r.time} · {getEffectiveScore(r, judgeResults)} نقطة</p>}
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {isLive && <Chip label="على الشاشة" color="brand" />}
                    {r.published && <Chip label="منشور" color="green" />}
                  </div>
                  <div className="flex gap-2">
                    {isLive ? (
                      <button
                        onClick={async () => { if (liveActionKey) return; setLiveActionKey(`stop:${r.id}`); try { await onSetLiveDisplay(null, 'waiting') } finally { setLiveActionKey(null) } }}
                        disabled={Boolean(liveActionKey)}
                        className="flex-1 border border-line text-muted-text text-[11px] font-semibold py-1.5 rounded-md hover:bg-sand transition-colors"
                      >
                        إيقاف الشاشة
                      </button>
                    ) : (
                      <div className="flex flex-1 gap-2">
                        <button
                          onClick={async () => { if (liveActionKey) return; setLiveActionKey(`result:${r.id}`); try { await onSetLiveDisplay(r, 'result') } finally { setLiveActionKey(null) } }}
                          disabled={Boolean(liveActionKey)}
                          className="flex-1 bg-charcoal text-ivory text-[11px] font-black py-1.5 rounded-md hover:opacity-80 transition-opacity"
                        >
                          عرض النتيجة
                        </button>
                        <button
                          onClick={async () => { if (liveActionKey) return; setLiveActionKey(`podium:${r.id}`); try { await onSetLiveDisplay(r, 'podium') } finally { setLiveActionKey(null) } }}
                          disabled={Boolean(liveActionKey)}
                          className="flex-1 bg-brand text-ivory text-[11px] font-black py-1.5 rounded-md hover:bg-brand-hover transition-colors"
                        >
                          عرض podium
                        </button>
                      </div>
                    )}
                    {!screenOnly && (r.published ? (
                      <button
                        onClick={() => onPublishResult(r.id, false)}
                        className="flex-1 border border-line text-muted-text text-[11px] font-semibold py-1.5 rounded-md hover:bg-sand transition-colors"
                      >
                        إلغاء النشر
                      </button>
                    ) : (
                      <button
                        onClick={() => onPublishResult(r.id, true)}
                        className="flex-1 bg-brand text-ivory text-[11px] font-black py-1.5 rounded-md hover:bg-brand-hover transition-colors"
                      >
                        نشر في الموقع
                      </button>
                    ))}
                  </div>
                </div>
              )
              })}
            </div>)}
          </div>
        </div>

        {/* Column C: Preview */}
        <div className={`col-span-12 ${screenOnly ? 'lg:col-span-2' : 'lg:col-span-4'}`}>
          <p className="text-muted-text text-xs font-serif uppercase tracking-widest mb-3">C — المعروض حالياً</p>
          <div className="bg-charcoal rounded-lg p-6 min-h-64">
            {liveState.displayState === 'waiting' && (
              <div className="text-center py-8">
                <p className="text-white/30 text-sm mb-2">بانتظار المتسابق</p>
                <p className="text-white/15 text-xs font-serif">{liveState.tournamentName}</p>
              </div>
            )}
            {liveState.displayState === 'result' && liveState.result && (
              <div>
                <p className="text-white/30 text-xs font-serif mb-4">يُعرض الآن</p>
                <p className="text-white/15 font-serif text-5xl font-light mb-2">{liveState.result.competitionNumber}</p>
                <p className="text-white font-black text-lg mb-3">{liveState.result.playerName}</p>
                <p className="text-brand font-serif text-3xl font-light tabular-nums mb-2">{liveState.result.time}</p>
                <div className="flex gap-4 text-sm">
                  <div><p className="text-white/25 text-xs">أخطاء</p><p className="text-white font-black">{liveState.result.faults.reduce((s, f) => s + f.count, 0)}</p></div>
                  <div><p className="text-white/25 text-xs">نقاط</p><p className="text-white font-black">{getEffectiveScore(liveState.result, judgeResults)}</p></div>
                </div>
              </div>
            )}
            {liveState.displayState === 'podium' && (
              <div className="text-center py-8">
                <p className="text-white/30 text-sm mb-2">عرض المراكز الثلاثة</p>
                <p className="text-white/70 text-xs font-serif">podium final</p>
              </div>
            )}
            {liveState.displayState === 'break' && (
              <div className="text-center py-8">
                <p className="text-white/30 text-sm">استراحة</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-white/10 flex gap-2 flex-wrap">
              <button onClick={() => onSetLiveDisplay(null, 'waiting')} className="border border-white/15 text-white/40 text-xs px-3 py-2 rounded-lg hover:bg-white/8 transition-colors">إيقاف العرض</button>
              <button onClick={() => onSetLiveDisplay(liveState.result, 'break')} className="border border-white/15 text-white/40 text-xs px-3 py-2 rounded-lg hover:bg-white/8 transition-colors">شاشة استراحة</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SITE MANAGEMENT
═══════════════════════════════════════════════════════════ */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-brand' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow ${on ? 'left-6' : 'left-0.5'}`} />
    </button>
  )
}

/* ───── helpers ───── */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted-text text-xs font-serif block mb-1.5 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}
function TextInput({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const cls = "w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50 transition-colors"
  if (multiline) return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls + " resize-none"} />
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
}
function SaveBtn({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <button onClick={onClick} className={`mt-5 text-sm font-black px-6 py-2.5 rounded-lg transition-colors ${saved ? 'bg-emerald-500 text-white' : 'bg-brand text-ivory hover:bg-brand-hover'}`}>
      {saved ? '✓ تم الحفظ' : 'حفظ التغييرات'}
    </button>
  )
}
function useSaved() {
  const [saved, setSaved] = useState(false)
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  return { saved, flash }
}

/* ═══════════════════════════════════════════════════════════
   SITE VIEW  — comprehensive content manager
═══════════════════════════════════════════════════════════ */
type SiteSection = 'visibility' | 'hero' | 'upcoming' | 'heritage' | 'gallery' | 'champions' | 'news' | 'sponsors' | 'footer'

function SiteView({ liveResultsEnabled, onSetLiveResultsEnabled, siteSettings, onUpdateSiteSettings }: {
  liveResultsEnabled: boolean
  onSetLiveResultsEnabled: (v: boolean) => void
  siteSettings: SiteSettings
  onUpdateSiteSettings: (s: SiteSettings) => Promise<void>
}) {
  const [activeSection, setActiveSection] = useState<SiteSection>('visibility')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const upd = (patch: Partial<SiteSettings>) => {
    setSaveStatus('saving')
    return onUpdateSiteSettings({ ...siteSettings, ...patch }).then(() => setSaveStatus('saved')).catch((error) => {
      setSaveStatus('error')
      console.error('Failed to save site settings', error)
      throw error
    })
  }

  const navItems: { id: SiteSection; icon: string; label: string }[] = [
    { id: 'visibility', icon: '⊡', label: 'الأقسام المرئية' },
    { id: 'hero', icon: '▣', label: 'بانر الرئيسية' },
    { id: 'upcoming', icon: '◷', label: 'البطولة القادمة' },
    { id: 'heritage', icon: '◈', label: 'عن رايد إكس' },
    { id: 'gallery', icon: '◫', label: 'معرض الصور' },
    { id: 'champions', icon: '◎', label: 'الأبطال' },
    { id: 'news', icon: '◻', label: 'الأخبار' },
    { id: 'sponsors', icon: '◇', label: 'الرعاة' },
    { id: 'footer', icon: '◉', label: 'الفوتر' },
  ]

  return (
    <div className="flex h-full min-h-0">
      {/* Left nav */}
      <div className="w-52 shrink-0 border-l border-line bg-sand/30 p-3 space-y-0.5">
        <p className="text-muted-text text-[10px] font-serif uppercase tracking-widest px-3 py-2">إدارة الموقع</p>
        {navItems.map((n) => (
          <button
            key={n.id}
            onClick={() => setActiveSection(n.id)}
            className={`w-full text-right flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${activeSection === n.id ? 'bg-brand/10 text-brand font-semibold' : 'text-muted-text hover:bg-sand hover:text-charcoal'}`}
          >
            <span className="text-xs opacity-60">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex-1 p-8 overflow-y-auto max-w-3xl">
        {saveStatus !== 'idle' && <p role="status" className={`mb-4 text-sm ${saveStatus === 'error' ? 'text-red-600' : saveStatus === 'saved' ? 'text-emerald-700' : 'text-muted-text'}`}>
          {saveStatus === 'saving' ? 'جارٍ حفظ التغييرات...' : saveStatus === 'saved' ? 'تم حفظ التغييرات في قاعدة البيانات' : 'تعذر الحفظ في قاعدة البيانات'}
        </p>}
        {activeSection === 'visibility' && <VisibilityPanel siteSettings={siteSettings} liveResultsEnabled={liveResultsEnabled} onSetLiveResultsEnabled={onSetLiveResultsEnabled} upd={upd} />}
        {activeSection === 'hero' && <HeroPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'upcoming' && <UpcomingPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'heritage' && <HeritagePanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'gallery' && <GalleryPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'champions' && <ChampionsPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'news' && <NewsPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'sponsors' && <SponsorsPanel siteSettings={siteSettings} upd={upd} />}
        {activeSection === 'footer' && <FooterPanel siteSettings={siteSettings} upd={upd} />}
      </div>
    </div>
  )
}

/* ── Visibility ── */
function VisibilityPanel({ siteSettings, liveResultsEnabled, onSetLiveResultsEnabled, upd }: { siteSettings: SiteSettings; liveResultsEnabled: boolean; onSetLiveResultsEnabled: (v: boolean) => void; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const toggle = (id: keyof SiteSettings['sections'], val: boolean) => {
    void upd({ sections: { ...siteSettings.sections, [id]: val } }).catch(() => undefined)
  }

  const sections: { id: keyof SiteSettings['sections']; label: string; desc: string }[] = [
    { id: 'hero', label: 'بانر الرئيسية', desc: 'الشريحة الرئيسية مع صور وعنوان' },
    { id: 'news', label: 'الأخبار والفعاليات', desc: 'آخر الأخبار والتغطيات' },
    { id: 'gallery', label: 'معرض الصور', desc: 'صور رايد إكس' },
    { id: 'champions', label: 'الأبطال', desc: 'قائمة أبطال البطولات' },
    { id: 'sponsors', label: 'الرعاة والشركاء', desc: 'شركاء رايد إكس' },
  ]

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">الأقسام المرئية</h2>
      <div className="space-y-2">
        <div className="bg-surface border border-brand/20 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-charcoal font-semibold text-sm">النتائج المباشرة للجمهور</p>
              {liveResultsEnabled && <span className="inline-flex items-center gap-1 bg-brand text-ivory text-[9px] font-black px-1.5 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-ivory animate-pulse" />LIVE</span>}
            </div>
            <p className="text-muted-text text-xs">{liveResultsEnabled ? 'مفعّل — صفحة النتائج ظاهرة مع علامة LIVE' : 'موقف — صفحة النتائج مخفية عن الجمهور'}</p>
          </div>
          <Toggle on={liveResultsEnabled} onChange={onSetLiveResultsEnabled} />
        </div>
        {sections.map((s) => (
          <div key={s.id} className="bg-surface border border-line rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-charcoal font-semibold text-sm">{s.label}</p>
              <p className="text-muted-text text-xs">{s.desc}</p>
            </div>
            <Toggle on={siteSettings.sections[s.id]} onChange={(v) => toggle(s.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hero Slides ── */
function HeroPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const slides = siteSettings.heroSlides ?? []
  const [sel, setSel] = useState(0)
  const { saved, flash } = useSaved()
  const [form, setForm] = useState<HeroSlide>(slides[0] ?? { id: '', imageUrl: '', tag: '', headline: '', subheadline: '', ctaText: '' })

  const selectSlide = (i: number) => { setSel(i); setForm(slides[i]) }
  const save = () => {
    const next = slides.map((s, i) => i === sel ? { ...form } : s)
    void upd({ heroSlides: next }).then(flash).catch(() => undefined)
  }
  const addSlide = () => {
    const ns: HeroSlide = { id: `HS${Date.now()}`, imageUrl: '', tag: '', headline: '', subheadline: '', ctaText: '' }
    const next = [...slides, ns]
    void upd({ heroSlides: next }).then(() => { setSel(next.length - 1); setForm(ns) }).catch(() => undefined)
  }
  const removeSlide = (i: number) => {
    if (slides.length <= 1) return
    const next = slides.filter((_, idx) => idx !== i)
    void upd({ heroSlides: next }).then(() => { setSel(0); setForm(next[0]) }).catch(() => undefined)
  }

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">بانر الرئيسية</h2>

      {/* Slide tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {slides.map((s, i) => (
          <button key={s.id} onClick={() => selectSlide(i)} className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${sel === i ? 'bg-brand text-ivory border-brand' : 'border-line text-muted-text hover:border-charcoal'}`}>
            شريحة {i + 1}
          </button>
        ))}
        <button onClick={addSlide} className="px-4 py-2 text-xs font-semibold rounded-lg border border-dashed border-brand/40 text-brand hover:bg-brand/5 transition-colors">+ إضافة شريحة</button>
      </div>

      {slides[sel] && (
        <div className="space-y-4 bg-surface border border-line rounded-xl p-5">
          {/* Preview thumbnail */}
          {form.imageUrl && (
            <div className="w-full h-32 rounded-lg overflow-hidden bg-sand border border-line">
              <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          )}
          <ImageUploadField value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="رفع صورة الشريحة" />
          <FieldRow label="التاغ (نص صغير فوق العنوان)">
            <TextInput value={form.tag} onChange={(v) => setForm((f) => ({ ...f, tag: v }))} placeholder="موسم ٢٠٢٦" />
          </FieldRow>
          <FieldRow label="العنوان الرئيسي">
            <TextInput value={form.headline} onChange={(v) => setForm((f) => ({ ...f, headline: v }))} placeholder="الفروسية العراقية" />
          </FieldRow>
          <FieldRow label="العنوان الفرعي">
            <TextInput value={form.subheadline} onChange={(v) => setForm((f) => ({ ...f, subheadline: v }))} placeholder="وصف تحت العنوان..." />
          </FieldRow>
          <FieldRow label="نص الزر (CTA)">
            <TextInput value={form.ctaText} onChange={(v) => setForm((f) => ({ ...f, ctaText: v }))} placeholder="استكشف البطولات" />
          </FieldRow>
          <div className="flex gap-3">
            <SaveBtn onClick={save} saved={saved} />
            {slides.length > 1 && (
              <button onClick={() => removeSlide(sel)} className="mt-5 text-sm font-semibold px-4 py-2.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">حذف الشريحة</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Upcoming Tournament ── */
function UpcomingPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [form, setForm] = useState({
    upcomingTitle: siteSettings.upcomingTitle ?? '',
    upcomingDate: siteSettings.upcomingDate ?? '',
    upcomingLocation: siteSettings.upcomingLocation ?? '',
    upcomingDescription: siteSettings.upcomingDescription ?? '',
    upcomingTargetDate: siteSettings.upcomingTargetDate ?? '',
    upcomingImageUrl: siteSettings.upcomingImageUrl ?? '',
  })
  const save = () => { void upd(form).then(flash).catch(() => undefined) }

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">البطولة القادمة</h2>
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        {form.upcomingImageUrl && (
          <div className="w-full h-32 rounded-lg overflow-hidden bg-sand border border-line">
            <img src={form.upcomingImageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        )}
        <ImageUploadField value={form.upcomingImageUrl} onChange={(url) => setForm((f) => ({ ...f, upcomingImageUrl: url }))} label="رفع صورة الخلفية" />
        <FieldRow label="اسم البطولة">
          <TextInput value={form.upcomingTitle} onChange={(v) => setForm((f) => ({ ...f, upcomingTitle: v }))} placeholder="بطولة رايد إكس الدولية" />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="التاريخ (نص عرض)">
            <TextInput value={form.upcomingDate} onChange={(v) => setForm((f) => ({ ...f, upcomingDate: v }))} placeholder="١٥ أكتوبر ٢٠٢٦" />
          </FieldRow>
          <FieldRow label="الموقع">
            <TextInput value={form.upcomingLocation} onChange={(v) => setForm((f) => ({ ...f, upcomingLocation: v }))} placeholder="بغداد، العراق" />
          </FieldRow>
        </div>
        <FieldRow label="وصف البطولة">
          <TextInput value={form.upcomingDescription} onChange={(v) => setForm((f) => ({ ...f, upcomingDescription: v }))} placeholder="٦٤ فارساً من ١٨ دولة..." multiline />
        </FieldRow>
        <FieldRow label="موعد العد التنازلي">
          <input type="datetime-local" value={form.upcomingTargetDate.slice(0, 16)} onChange={(event) => setForm((f) => ({ ...f, upcomingTargetDate: event.target.value }))} className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand/50" />
        </FieldRow>
        <p className="text-muted-text text-xs">لن يظهر العد التنازلي على الموقع إذا تركت الموعد فارغاً.</p>
        <SaveBtn onClick={save} saved={saved} />
      </div>
    </div>
  )
}

/* ── Heritage ── */
function HeritagePanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [form, setForm] = useState({
    heritageTitle: siteSettings.heritageTitle ?? '',
    heritageSubtitle: siteSettings.heritageSubtitle ?? '',
    heritageBody: siteSettings.heritageBody ?? '',
    heritageImageUrl: siteSettings.heritageImageUrl ?? '',
  })
  const save = () => { void upd(form).then(flash).catch(() => undefined) }

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">قسم الإرث والهوية</h2>
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        {form.heritageImageUrl && (
          <div className="w-full h-40 rounded-lg overflow-hidden bg-sand border border-line">
            <img src={form.heritageImageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        )}
        <ImageUploadField value={form.heritageImageUrl} onChange={(url) => setForm((f) => ({ ...f, heritageImageUrl: url }))} label="رفع صورة الإرث والهوية" />
        <FieldRow label="تاغ فوق العنوان">
          <TextInput value={form.heritageSubtitle} onChange={(v) => setForm((f) => ({ ...f, heritageSubtitle: v }))} placeholder="قصة" />
        </FieldRow>
        <FieldRow label="العنوان الرئيسي">
          <TextInput value={form.heritageTitle} onChange={(v) => setForm((f) => ({ ...f, heritageTitle: v }))} placeholder="إرث عراقي عريق" />
        </FieldRow>
        <FieldRow label="نص المحتوى">
          <TextInput value={form.heritageBody} onChange={(v) => setForm((f) => ({ ...f, heritageBody: v }))} placeholder="من أرض الرافدين..." multiline />
        </FieldRow>
        <SaveBtn onClick={save} saved={saved} />
      </div>
    </div>
  )
}

/* ── Gallery ── */
function GalleryPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const images = siteSettings.galleryImages ?? []
  const [items, setItems] = useState<GalleryImage[]>(images)
  const [uploadingImages, setUploadingImages] = useState(false)
  const save = () => { void upd({ galleryImages: items }).then(flash).catch(() => undefined) }
  const add = () => setItems((prev) => [...prev, { id: `G${Date.now()}`, url: '', alt: '' }])
  const remove = (id: string) => setItems((prev) => prev.filter((g) => g.id !== id))
  const change = (id: string, field: keyof GalleryImage, val: string) =>
    setItems((prev) => prev.map((g) => g.id === id ? { ...g, [field]: val } : g))

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-2">معرض الصور</h2>
      <p className="text-muted-text text-xs font-serif mb-6">{items.length} صورة في المعرض</p>
      <div className="mb-4">
        <MultiImageUploadField
          label="رفع صور المعرض دفعة واحدة"
          onUploadingChange={setUploadingImages}
          onChange={(urls) => setItems((current) => [...current, ...urls.map((url) => ({ id: `G${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, alt: '' }))])}
        />
      </div>
      <div className="space-y-3">
        {items.map((img) => (
          <div key={img.id} className="bg-surface border border-line rounded-xl p-4 flex gap-3 items-start">
            <div className="w-16 h-12 rounded-lg overflow-hidden bg-sand border border-line shrink-0">
              {img.url && <img src={img.url} alt={img.alt} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
            </div>
            <div className="flex-1 space-y-2">
              <ImageUploadField value={img.url} onChange={(url) => change(img.id, 'url', url)} label="رفع صورة المعرض" />
              <input value={img.alt} onChange={(e) => change(img.id, 'alt', e.target.value)} placeholder="وصف الصورة" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand/50" />
            </div>
            <button onClick={() => remove(img.id)} className="text-red-400 hover:text-red-600 text-lg leading-none mt-0.5">×</button>
          </div>
        ))}
        <button disabled={uploadingImages} onClick={add} className="w-full border border-dashed border-brand/40 text-brand text-sm font-semibold py-3 rounded-xl hover:bg-brand/5 transition-colors disabled:opacity-50">+ إضافة صورة</button>
      </div>
      <SaveBtn onClick={save} saved={saved} />
    </div>
  )
}

/* ── Champions ── */
function ChampionsPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [items, setItems] = useState<ChampionEntry[]>(siteSettings.champions ?? [])
  const save = () => { void upd({ champions: items }).then(flash).catch(() => undefined) }
  const add = () => setItems((prev) => [...prev, { id: `C${Date.now()}`, name: '', tournament: '', year: '', country: 'العراق', imageUrl: '' }])
  const remove = (id: string) => setItems((prev) => prev.filter((c) => c.id !== id))
  const change = (id: string, field: keyof ChampionEntry, val: string) =>
    setItems((prev) => prev.map((c) => c.id === id ? { ...c, [field]: val } : c))

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">قسم الأبطال</h2>
      <div className="space-y-4">
        {items.map((c, i) => (
          <div key={c.id} className="bg-surface border border-line rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-text text-xs font-serif">بطل {i + 1}</span>
              <button onClick={() => remove(c.id)} className="text-red-400 hover:text-red-600 text-sm">حذف</button>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-sand border border-line shrink-0">
                {c.imageUrl && <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
              </div>
              <div className="flex-1">
                <ImageUploadField value={c.imageUrl} onChange={(url) => change(c.id, 'imageUrl', url)} label="رفع صورة الفارس" />
                <input value={c.name} onChange={(e) => change(c.id, 'name', e.target.value)} placeholder="اسم الفارس" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand/50" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={c.tournament} onChange={(e) => change(c.id, 'tournament', e.target.value)} placeholder="اسم البطولة" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand/50 col-span-2" />
              <input value={c.year} onChange={(e) => change(c.id, 'year', e.target.value)} placeholder="السنة" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand/50" />
            </div>
          </div>
        ))}
        <button onClick={add} className="w-full border border-dashed border-brand/40 text-brand text-sm font-semibold py-3 rounded-xl hover:bg-brand/5 transition-colors">+ إضافة بطل</button>
      </div>
      <SaveBtn onClick={save} saved={saved} />
    </div>
  )
}

/* ── News ── */
function NewsPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [items, setItems] = useState<NewsItem[]>(siteSettings.newsItems ?? [])
  const save = () => { void upd({ newsItems: items }).then(flash).catch(() => undefined) }
  const add = () => setItems((prev) => [...prev, { id: `N${Date.now()}`, title: '', category: 'أخبار', date: '', imageUrl: '' }])
  const remove = (id: string) => setItems((prev) => prev.filter((n) => n.id !== id))
  const change = (id: string, field: keyof NewsItem, val: string) =>
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, [field]: val } : n))

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">الأخبار والفعاليات</h2>
      <div className="space-y-4">
        {items.map((n, i) => (
          <div key={n.id} className="bg-surface border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-text text-xs font-serif">خبر {i + 1}</span>
              <button onClick={() => remove(n.id)} className="text-red-400 hover:text-red-600 text-sm">حذف</button>
            </div>
            <div className="flex gap-3">
              <div className="w-20 h-14 rounded-lg overflow-hidden bg-sand border border-line shrink-0">
                {n.imageUrl && <img src={n.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
              </div>
              <div className="flex-1">
                <ImageUploadField value={n.imageUrl} onChange={(url) => change(n.id, 'imageUrl', url)} label="رفع صورة الخبر" />
                <input value={n.title} onChange={(e) => change(n.id, 'title', e.target.value)} placeholder="عنوان الخبر" className="w-full bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={n.category} onChange={(e) => change(n.id, 'category', e.target.value)} placeholder="التصنيف (أخبار، بطولات...)" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand/50" />
              <input value={n.date} onChange={(e) => change(n.id, 'date', e.target.value)} placeholder="التاريخ" className="bg-ivory border border-line text-charcoal rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand/50" />
            </div>
          </div>
        ))}
        <button onClick={add} className="w-full border border-dashed border-brand/40 text-brand text-sm font-semibold py-3 rounded-xl hover:bg-brand/5 transition-colors">+ إضافة خبر</button>
      </div>
      <SaveBtn onClick={save} saved={saved} />
    </div>
  )
}

/* ── Sponsors ── */
function SponsorsPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [items, setItems] = useState<SponsorEntry[]>(siteSettings.sponsors ?? [])
  const save = () => { void upd({ sponsors: items }).then(flash).catch(() => undefined) }
  const add = () => setItems((prev) => [...prev, { id: `SP${Date.now()}`, name: '' }])
  const remove = (id: string) => setItems((prev) => prev.filter((s) => s.id !== id))

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">الرعاة والشركاء</h2>
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="bg-surface border border-line rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <input
                value={s.name}
                onChange={(e) => setItems((prev) => prev.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))}
                placeholder="اسم الجهة الراعية"
                className="flex-1 bg-transparent text-charcoal text-sm focus:outline-none"
              />
              <button onClick={() => remove(s.id)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
            <ImageUploadField
              value={s.logoUrl ?? ''}
              onChange={(url) => setItems((prev) => prev.map((x) => x.id === s.id ? { ...x, logoUrl: url } : x))}
              label="رفع شعار الشريك"
            />
          </div>
        ))}
        <button onClick={add} className="w-full border border-dashed border-brand/40 text-brand text-sm font-semibold py-3 rounded-xl hover:bg-brand/5 transition-colors">+ إضافة راعٍ</button>
      </div>
      <SaveBtn onClick={save} saved={saved} />
    </div>
  )
}

/* ── Footer ── */
function FooterPanel({ siteSettings, upd }: { siteSettings: SiteSettings; upd: (p: Partial<SiteSettings>) => Promise<void> }) {
  const { saved, flash } = useSaved()
  const [form, setForm] = useState({
    footerEmail: !siteSettings.footerEmail || siteSettings.footerEmail === 'info@hr-ride.com' ? 'business@hr-ride.com' : siteSettings.footerEmail,
    footerCity: siteSettings.footerCity ?? '',
    footerOrganization: siteSettings.footerOrganization ?? '',
  })
  const save = () => { void upd(form).then(flash).catch(() => undefined) }

  return (
    <div>
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">إدارة الموقع</p>
      <h2 className="text-charcoal text-2xl font-black mb-6">الفوتر</h2>
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        <FieldRow label="البريد الإلكتروني">
          <TextInput value={form.footerEmail} onChange={(v) => setForm((f) => ({ ...f, footerEmail: v }))} placeholder="business@hr-ride.com" />
        </FieldRow>
        <FieldRow label="المدينة والدولة">
          <TextInput value={form.footerCity} onChange={(v) => setForm((f) => ({ ...f, footerCity: v }))} placeholder="بغداد، جمهورية العراق" />
        </FieldRow>
        <FieldRow label="اسم المنظمة">
          <TextInput value={form.footerOrganization} onChange={(v) => setForm((f) => ({ ...f, footerOrganization: v }))} placeholder="الاتحاد العراقي للفروسية" />
        </FieldRow>
        <SaveBtn onClick={save} saved={saved} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   AUDIT LOG
═══════════════════════════════════════════════════════════ */
function AuditLogView({ auditEntries }: { auditEntries: AuditEntry[] }) {
  const [filterCat, setFilterCat] = useState('all')
  const cats = ['all', 'نتائج', 'بطولات', 'مشاركون', 'لاعبون', 'عرض مباشر']
  const filtered = filterCat === 'all' ? auditEntries : auditEntries.filter((e) => e.category === filterCat)

  return (
    <div className="p-8 max-w-5xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">النظام</p>
      <h1 className="text-charcoal text-3xl font-black mb-6">سجل العمليات</h1>
      <div className="flex gap-2 mb-5 flex-wrap">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${filterCat === c ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted-text hover:border-white/25'}`}
          >
            {c === 'all' ? 'الكل' : c}
          </button>
        ))}
      </div>
      <div className="space-y-0 border border-line rounded-lg overflow-hidden">
        {filtered.map((entry, i) => (
          <div key={entry.id} className={`flex items-start gap-5 px-5 py-4 ${i < filtered.length - 1 ? 'border-b border-line/60' : ''}`}>
            <div className="shrink-0 pt-0.5">
              <Chip label={entry.category} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-charcoal text-sm font-semibold mb-0.5">{entry.action}</p>
              <p className="text-muted-text text-xs">{entry.description}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-muted-text text-xs">{entry.userName}</p>
              <p className="text-muted-text/50 text-xs font-serif mt-0.5">{entry.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS VIEW
═══════════════════════════════════════════════════════════ */
function SettingsView() {
  return (
    <div className="p-8 max-w-3xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">النظام</p>
      <h1 className="text-charcoal text-3xl font-black mb-6">الإعدادات</h1>
      <div className="space-y-4">
        {[
          { label: 'اسم المنصة', val: 'رايد إكس' },
          { label: 'البريد الرسمي', val: 'business@hr-ride.com' },
          { label: 'المنطقة الزمنية', val: 'Asia/Baghdad (UTC+3)' },
          { label: 'اللغة الافتراضية', val: 'العربية' },
        ].map((s) => (
          <div key={s.label} className="bg-surface border border-line rounded-lg px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-muted-text text-xs mb-1">{s.label}</p>
              <p className="text-charcoal text-sm font-semibold">{s.val}</p>
            </div>
            <button className="text-brand/60 text-xs hover:text-brand transition-colors">تعديل</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ROOT ADMIN DASHBOARD
═══════════════════════════════════════════════════════════ */
export default function AdminDashboard({ onNavigate, judgeResults, onUpdateResultStatus, onPublishResult, liveState, onSetLiveDisplay, liveResultsEnabled, onSetLiveResultsEnabled, siteSettings, onUpdateSiteSettings, players, onSetPlayers, tournaments, onSetTournaments, template: _template, onAddEdition, onStartEdition, onCancelEdition, onCompleteEdition, currentUser, onLogout, appeals, onUpdateAppeal, users: usersProp, onAddUser, onUpdateUser, onDeleteUser, rolePerms: rolePermsProp, onSaveRolePerms, auditEntries, onAudit }: Props & { auditEntries: AuditEntry[] }) {
  const isScreenController = currentUser?.role === 'screen_controller'
  const [view, setView] = useState<AdminView>(isScreenController ? 'live-control' : 'overview')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(() => tournaments[0]?.id ?? '')
  const [horses, setHorses] = useState<Horse[]>([])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    void apiGet<Array<Record<string, unknown>>>('/horses')
      .then((rows) => setHorses(rows.map(normalizeHorse)))
      .catch((error) => console.error('Failed to load horses', error))
  }, [])

  const pendingCount = judgeResults.filter((r) => r.status === 'pending').length

  const goView = (v: AdminView) => {
    setView(v)
    setMobileNavOpen(false)
    if (v !== 'player-profile') setSelectedPlayerId(null)
  }

  const rawPermissions = rolePermsProp?.[currentUser?.role ?? '']
  const permissions = isScreenController
    ? ['إدارة العرض المباشر']
    : Array.isArray(rawPermissions) ? rawPermissions : []
  const isSuperAdmin = currentUser?.role === 'super_admin'
  const canView = (view: AdminView) => isSuperAdmin || !viewPermissions[view] || permissions.includes(viewPermissions[view] as string)
  const visibleNavItems = navItems.filter((item) => canView(item.id))
  let groups: string[] = []
  visibleNavItems.forEach((item) => { if (item.group && !groups.includes(item.group)) groups.push(item.group) })

  return (
    <div className="dashboard-shell flex min-h-screen bg-[#f4f1eb]">
      {mobileNavOpen && <button aria-label="إغلاق القائمة" onClick={() => setMobileNavOpen(false)} className="dashboard-mobile-overlay fixed inset-0 z-40 bg-[#17212b]/45" />}
      {/* Sidebar */}
      <aside className={`dashboard-mobile-sidebar w-52 sm:w-60 shrink-0 bg-charcoal border-l border-white/10 flex flex-col sticky top-0 h-screen ${mobileNavOpen ? 'dashboard-mobile-open' : ''}`}>
        <div className="p-5 border-b border-white/10">
          <HRRideLogo variant="horizontal" color="white" markSize={28} />
          <p className="text-white/25 text-[10px] mt-2 font-serif">لوحة الإدارة</p>
        </div>

        <nav className="flex-1 py-5 overflow-y-auto">
          {/* Overview */}
          {!isScreenController && <div className="px-3 mb-1">
            <button
              onClick={() => goView('overview')}
              className={`w-full text-right px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${view === 'overview' ? 'bg-brand text-white' : 'text-white/55 hover:text-white hover:bg-white/8'}`}
            >
              نظرة عامة
            </button>
          </div>}

          {groups.map((group) => (
            <div key={group} className="mt-6 mb-1">
              <p className="px-6 text-[10px] font-serif uppercase tracking-widest text-white/25 mb-2">{group}</p>
              {visibleNavItems.filter((item) => item.group === group).map((item) => (
                <div key={item.id} className="px-3">
                  <button
                    onClick={() => goView(item.id)}
                    className={`w-full text-right px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-between ${view === item.id || (view === 'tournament-workspace' && item.id === 'tournaments') ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/8'}`}
                  >
                    <span>{item.label}</span>
                    {item.id === 'results-approval' && pendingCount > 0 && (
                      <span className="bg-brand text-ivory text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0">{pendingCount}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-white/50 text-xs truncate">{currentUser?.name ?? 'سارة الموسوي'}</p>
          <p className="text-white/25 text-[10px] font-serif mb-2 truncate">{currentUser?.username ?? 'admin'}</p>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-white/20 hover:text-white/50 text-[11px] font-serif transition-colors"
            >
              تسجيل خروج ←
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="dashboard-mobile-toolbar fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-[#d9e0e5] bg-[#f7f8f8]/95 px-4 py-3 backdrop-blur">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-xl bg-[#17212b] px-3 py-2 text-sm font-bold text-white">☰</button>
          <div className="text-right"><p className="text-[10px] font-bold tracking-[.18em] text-[#a44327]">رايد إكس</p><p className="text-sm font-black text-[#17212b]">لوحة الإدارة</p></div>
        </div>
        {view === 'overview'            && <OverviewView judgeResults={judgeResults} tournaments={tournaments} onNavigate={goView} onOpenTournament={(id) => { setSelectedTournamentId(id); goView('tournament-workspace') }} />}
        {view === 'tournaments'         && <TournamentsView tournaments={tournaments} onSelectTournament={(id) => { setSelectedTournamentId(id); goView('tournament-workspace') }} onCreateTournament={() => goView('create-tournament')} canCreate={isSuperAdmin || permissions.includes('إنشاء بطولة')} />}
        {view === 'tournament-workspace' && <TournamentWorkspace judgeResults={judgeResults} tournaments={tournaments} tournamentId={selectedTournamentId} players={players} horses={horses} users={usersProp ?? []} auditEntries={auditEntries} onAudit={onAudit ?? (() => undefined)} onSetPlayers={onSetPlayers} onSetTournaments={onSetTournaments} onStartEdition={onStartEdition} onCancelEdition={onCancelEdition} onCompleteEdition={onCompleteEdition} onSetLiveDisplay={onSetLiveDisplay} onNavigate={onNavigate} appeals={appeals} onUpdateAppeal={onUpdateAppeal} onBack={() => goView('tournaments')} />}
        {view === 'create-tournament'   && <CreateTournamentWizard onDone={async (date, rounds, venue, desc) => { await onAddEdition?.(date, rounds, venue, desc); goView('tournaments') }} onBack={() => goView('tournaments')} />}
        {view === 'players' && !selectedPlayerId && <PlayersView players={players} onSetPlayers={onSetPlayers} onSelectPlayer={(id) => { setSelectedPlayerId(id); setView('player-profile') }} />}
        {view === 'player-profile' && selectedPlayerId && <PlayerProfileView playerId={selectedPlayerId} players={players} onSetPlayers={onSetPlayers} onBack={() => { setSelectedPlayerId(null); setView('players') }} />}
        {view === 'horses'              && <HorsesView horses={horses} onChange={setHorses} />}
        {view === 'judges'              && <JudgesView onNavigate={onNavigate} onOpenUsers={() => goView('users')} users={usersProp ?? []} onDeleteUser={onDeleteUser} />}
        {view === 'users'               && <UsersView users={usersProp ?? []} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} />}
        {view === 'roles'               && <RolesView rolePerms={rolePermsProp} onSaveRolePerms={onSaveRolePerms} />}
        {view === 'results-approval'    && <ResultsApprovalView judgeResults={judgeResults} tournaments={tournaments} appeals={appeals} currentUser={currentUser} onAudit={onAudit ?? (() => undefined)} onUpdateResultStatus={onUpdateResultStatus} onPublishResult={onPublishResult} />}
        {view === 'live-control'        && <LiveControlView judgeResults={judgeResults} liveState={liveState} onSetLiveDisplay={onSetLiveDisplay} onPublishResult={onPublishResult} onNavigate={onNavigate} tournaments={tournaments} screenOnly={isScreenController} />}
        {view === 'site'                && <SiteView liveResultsEnabled={liveResultsEnabled} onSetLiveResultsEnabled={onSetLiveResultsEnabled} siteSettings={siteSettings} onUpdateSiteSettings={onUpdateSiteSettings} />}
        {view === 'audit-log'           && <AuditLogView auditEntries={auditEntries} />}
        {view === 'settings'            && <SettingsView />}
        {view === 'archive'             && <TournamentArchiveView tournaments={tournaments} judgeResults={judgeResults} players={players} appeals={appeals} />}
      </main>
    </div>
  )
}
