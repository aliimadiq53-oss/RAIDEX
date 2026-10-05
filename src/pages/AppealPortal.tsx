import { useState } from 'react'
import type { Appeal, Tournament, Player } from '../lib/types'

interface Props {
  tournaments: Tournament[]
  players: Player[]
  appeals: Appeal[]
  onAddAppeal: (appeal: Omit<Appeal, 'id' | 'submittedAt' | 'status'>) => void
}

export default function AppealPortal({ tournaments, players, onAddAppeal }: Props) {
  const initialCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('code') ?? '' : ''
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [found, setFound] = useState<{
    participant: NonNullable<Tournament['participants']>[0]
    player: Player
    tournament: Tournament
  } | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [appealText, setAppealText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSearch = () => {
    const normalized = code.trim().toUpperCase()
    setNotFound(false)
    setFound(null)
    for (const t of tournaments) {
      const p = (t.participants ?? []).find((pa) => pa.appealCode === normalized)
      if (p) {
        const player = players.find((pl) => pl.id === p.playerId)
        if (player) { setFound({ participant: p, player, tournament: t }); return }
      }
    }
    setNotFound(true)
  }

  const handleSubmit = async () => {
    if (!found || !appealText.trim()) return
    try {
      await onAddAppeal({
        tournamentId: found.tournament.id,
        participantId: found.participant.id,
        playerId: found.player.id,
        competitionNumber: found.participant.competitionNumber,
        playerName: found.player.name,
        text: appealText.trim(),
      })
      setSubmitted(true)
      setAppealText('')
    } catch {
      setNotFound(true)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-ivory flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/ridex-logo.svg" alt="رايد إكس" className="h-14 w-28 mx-auto mb-4 object-contain" />
          <h1 className="text-charcoal text-2xl font-black mb-1">بوابة الاعتراضات</h1>
          <p className="text-muted-text text-sm font-serif">أدخل رمز المشارك للاطلاع على بياناتك وتقديم اعتراض</p>
        </div>

        {/* Code input */}
        {!found && (
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <label className="text-muted-text text-xs block mb-2 font-serif uppercase tracking-widest">رمز المشاركة</label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setNotFound(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="مثال: AB3D7XQ2"
              maxLength={10}
              className="w-full bg-ivory border border-line text-charcoal text-center font-serif text-2xl tracking-[0.3em] rounded-xl px-4 py-4 focus:outline-none focus:border-brand/60 transition-colors mb-4"
            />
            {notFound && (
              <p className="text-red-400 text-sm text-center mb-4 font-serif">رمز غير صحيح أو غير مسجّل في أي بطولة</p>
            )}
            <button
              onClick={handleSearch}
              disabled={code.trim().length < 6}
              className="w-full bg-brand text-ivory py-3.5 font-black rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-40"
            >
              بحث
            </button>
          </div>
        )}

        {/* Player found */}
        {found && !submitted && (
          <div className="space-y-4">
            {/* Player card */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-charcoal font-black text-xl">{found.player.name}</p>
                <span className="font-serif text-3xl text-line font-light">{found.participant.competitionNumber}</span>
              </div>
              <p className="text-muted-text text-xs font-serif mb-3">{found.tournament.name} · {found.tournament.date}</p>
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                  found.participant.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  found.participant.status === 'disqualified' ? 'bg-red-50 border-red-200 text-red-600' :
                  'bg-sand border-line text-muted-text'
                }`}>
                  {found.participant.status === 'active' ? 'مشارك' : found.participant.status === 'disqualified' ? 'مستبعد' : 'منسحب'}
                </span>
                <span className="text-xs font-serif text-muted-text px-3 py-1.5 bg-sand border border-line rounded-full">
                  الفئة: {found.participant.category || 'عام'}
                </span>
              </div>
            </div>

            {/* Appeal form */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
              <h2 className="text-charcoal font-black mb-1">تقديم اعتراض</h2>
              <p className="text-muted-text text-xs font-serif mb-4">اشرح اعتراضك بوضوح. سيتم مراجعته من قِبل إدارة البطولة.</p>
              <textarea
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                rows={5}
                placeholder="اكتب اعتراضك هنا..."
                className="w-full bg-ivory border border-line text-charcoal rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand/60 transition-colors resize-none mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={!appealText.trim()}
                  className="flex-1 bg-brand text-ivory py-3 font-black text-sm rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-40"
                >
                  إرسال الاعتراض
                </button>
                <button
                  onClick={() => { setFound(null); setCode('') }}
                  className="border border-line text-muted-text text-sm px-5 py-3 rounded-xl hover:bg-sand transition-colors"
                >
                  رجوع
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submitted */}
        {submitted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center mx-auto mb-4">
              <span className="text-emerald-600 text-2xl">✓</span>
            </div>
            <h2 className="text-charcoal font-black text-xl mb-2">تم إرسال الاعتراض</h2>
            <p className="text-muted-text text-sm font-serif mb-6">سيتم مراجعة اعتراضك من قِبل إدارة البطولة والرد عليه في أقرب وقت.</p>
            <button
              onClick={() => { setSubmitted(false); setFound(null); setCode('') }}
              className="border border-line text-muted-text text-sm px-6 py-2.5 rounded-xl hover:bg-sand transition-colors"
            >
              تقديم اعتراض آخر
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
