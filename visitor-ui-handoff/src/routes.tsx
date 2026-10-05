import { createHashRouter, Navigate, useNavigate } from 'react-router'
import { Root, useApp } from './context/AppContext'
import AdminDashboard from './pages/AdminDashboard'
import JudgeProfile from './pages/JudgeProfile'
import LiveDisplay from './pages/LiveDisplay'
import HomePage from './pages/HomePage'
import HeritagePage from './pages/HeritagePage'
import TournamentListing from './pages/TournamentListing'
import TournamentDetail from './pages/TournamentDetail'
import LiveResults from './pages/LiveResults'
import AppealPortal from './pages/AppealPortal'
import LoginPage from './pages/LoginPage'
import WelcomePage from './pages/WelcomePage'
import { useLayoutEffect, useState } from 'react'

/* ── /login ── */
function LoginRoute() {
  const ctx = useApp()
  const navigate = useNavigate()
  if (ctx.currentUser) {
    return <Navigate to={ctx.currentUser.role === 'judge' ? '/h' : '/admin'} replace />
  }
  return (
    <LoginPage
      onLogin={ctx.login}
      onSuccess={(user) => navigate(user.role === 'judge' ? '/h' : '/admin', { replace: true })}
    />
  )
}

/* ── /admin ── */
function AdminRoute() {
  const ctx = useApp()
  const navigate = useNavigate()

  if (!ctx.currentUser) return <Navigate to="/login" replace />
  if (ctx.currentUser.role === 'judge') return <Navigate to="/judge" replace />

  return (
    <div dir="rtl">
      <AdminDashboard
        onNavigate={(p) => {
          if (p === 'home' || p === 'tournament' || p === 'live-results') navigate('/public')
          else if (p === 'live-display') navigate('/display')
          else if (p === 'judge') navigate('/judge')
        }}
        judgeResults={ctx.judgeResults}
        onUpdateResultStatus={ctx.updateResultStatus}
        onPublishResult={ctx.publishResult}
        liveState={ctx.liveState}
        onSetLiveDisplay={ctx.setLiveDisplay}
        liveResultsEnabled={ctx.liveResultsEnabled}
        onSetLiveResultsEnabled={ctx.setLiveResultsEnabled}
        siteSettings={ctx.siteSettings}
        onUpdateSiteSettings={ctx.setSiteSettings}
        players={ctx.players}
        onSetPlayers={ctx.setPlayers}
        tournaments={ctx.tournaments}
        onSetTournaments={ctx.setTournaments}
        template={ctx.template}
        onAddEdition={(date, rounds, venue, desc) => ctx.addEdition(date, rounds, venue, desc)}
        appeals={ctx.appeals}
        onUpdateAppeal={ctx.updateAppeal}
        onStartEdition={ctx.startEdition}
        onCancelEdition={ctx.cancelEdition}
        onCompleteEdition={ctx.completeEdition}
        currentUser={ctx.currentUser}
        onLogout={() => { ctx.logout(); navigate('/login') }}
        users={ctx.users}
        onAddUser={ctx.addUser}
        onUpdateUser={ctx.updateUser}
        onDeleteUser={ctx.deleteUser}
        rolePerms={ctx.rolePerms}
        onSaveRolePerms={ctx.saveRolePerms}
        auditEntries={ctx.auditEntries}
        onAudit={ctx.addAuditEntry}
      />
    </div>
  )
}

/* ── /judge ── */
function JudgeRoute() {
  const ctx = useApp()
  if (!ctx.currentUser) return <Navigate to="/login" replace />
  return <Navigate to={ctx.currentUser.role === 'judge' ? '/h' : '/admin'} replace />
}

/* ── /h — judge profile and read-only history ── */
function JudgeProfileRoute() {
  const ctx = useApp()
  const navigate = useNavigate()

  if (!ctx.currentUser) return <Navigate to="/login" replace />
  if (ctx.currentUser.role !== 'judge') return <Navigate to="/admin" replace />

  return (
    <JudgeProfile
      currentUser={ctx.currentUser}
      players={ctx.players}
      tournaments={ctx.tournaments}
      judgeResults={ctx.judgeResults}
      onSubmitResult={ctx.addJudgeResult}
      permissions={ctx.rolePerms.judge ?? []}
      onDisqualifyParticipant={ctx.disqualifyParticipant}
      onBanPlayer={ctx.banPlayer}
      onLogout={() => { ctx.logout(); navigate('/login') }}
    />
  )
}

/* ── /display ── */
function DisplayRoute() {
  const ctx = useApp()
  const navigate = useNavigate()
  return (
    <div dir="rtl">
      <LiveDisplay liveState={ctx.liveState} judgeResults={ctx.judgeResults} tournaments={ctx.tournaments} />
      <button
        onClick={() => navigate('/admin')}
        className="fixed top-4 left-4 z-50 bg-black/40 text-white/30 text-[10px] px-2 py-1 rounded hover:text-white/60 transition-colors"
      >
        ← لوحة الإدارة
      </button>
    </div>
  )
}

/* ── /public ── */
function PublicRoute() {
  const ctx = useApp()
  const [showWelcome, setShowWelcome] = useState(true)
  const [page, setPage] = useState<'home' | 'tournament-list' | 'tournament-detail' | 'live-results' | 'story'>('home')
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [page, selectedTournamentId])

  const handleNavigate = (p: string, tournamentId?: string) => {
    if (p === 'tournament') {
      setPage(tournamentId ? 'tournament-detail' : 'tournament-list')
      if (tournamentId) setSelectedTournamentId(tournamentId)
      return
    }
    if (p === 'home' || p === 'live-results' || p === 'story') {
      setPage(p as typeof page)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-ivory font-sans">
      {showWelcome && <WelcomePage onEnter={() => setShowWelcome(false)} />}
      {!showWelcome && page === 'home' && (
        <HomePage 
          onNavigate={(p) => handleNavigate(p)} 
          liveResultsEnabled={ctx.liveResultsEnabled} 
          siteSettings={ctx.siteSettings} 
          tournaments={ctx.tournaments}
          onSelectTournament={(id) => {
            setSelectedTournamentId(id)
            setPage('tournament-detail')
          }}
        />
      )}
      {!showWelcome && page === 'tournament-list' && <TournamentListing tournaments={ctx.tournaments} liveResultsEnabled={ctx.liveResultsEnabled} onNavigate={handleNavigate} onSelectTournament={(id) => { setSelectedTournamentId(id); setPage('tournament-detail') }} />}
      {!showWelcome && page === 'tournament-detail' && <TournamentDetail tournamentId={selectedTournamentId} onNavigate={(p) => handleNavigate(p)} />}
      {!showWelcome && page === 'story' && <HeritagePage siteSettings={ctx.siteSettings} onNavigate={handleNavigate} />}
      {!showWelcome && page === 'live-results' && (
        <LiveResults onNavigate={handleNavigate} judgeResults={ctx.judgeResults} liveState={ctx.liveState} liveResultsEnabled={ctx.liveResultsEnabled} tournaments={ctx.tournaments} />
      )}
    </div>
  )
}

function AppealRoute() {
  const ctx = useApp()
  return (
    <AppealPortal
      tournaments={ctx.tournaments}
      players={ctx.players}
      appeals={ctx.appeals}
      onAddAppeal={ctx.addAppeal}
    />
  )
}

export const router = createHashRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: () => <Navigate to="/public" replace /> },
      { path: 'login', Component: LoginRoute },
      { path: 'admin', Component: AdminRoute },
      { path: 'judge', Component: JudgeRoute },
      { path: 'h', Component: JudgeProfileRoute },
      { path: 'display', Component: DisplayRoute },
      { path: 'public', Component: PublicRoute },
      { path: 'appeal', Component: AppealRoute },
      { path: '*', Component: () => <Navigate to="/public" replace /> },
    ],
  },
])
