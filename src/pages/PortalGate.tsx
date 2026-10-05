import { useState } from 'react'
import HRRideLogo, { HRRideWatermark } from '../components/HRRideLogo'
import type { SystemUser } from '../lib/types'

const ADMIN_ROLES = ['super_admin', 'admin', 'tournament_manager', 'result_reviewer', 'data_entry']
const JUDGE_ROLES = ['judge']

interface Props {
  onLogin: (user: SystemUser, portal: 'admin' | 'judge' | 'display' | 'public') => void
}

type ActiveForm = 'none' | 'public' | 'admin' | 'judge' | 'display'

interface LoginFormProps {
  portal: 'admin' | 'judge'
  title: string
  hint: { username: string; password: string; name: string }[]
  onSuccess: (user: SystemUser) => void
  onBack: () => void
}

function LoginForm({ portal, title, hint, onSuccess, onBack }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const allowedRoles = portal === 'admin' ? ADMIN_ROLES : JUDGE_ROLES

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setTimeout(() => {
      setError('يجب تسجيل الدخول عبر النظام الرسمي فقط. لا توجد بيانات تجريبية في هذا المشهد.');
      setLoading(false)
    }, 300)
  }

  const fillDemo = (u: { username: string; password: string }) => {
    setUsername(u.username); setPassword(u.password); setError('')
  }

  return (
    <div className="min-h-screen bg-dark-surface flex flex-col" dir="rtl">
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
        <button onClick={onBack} className="text-white/30 text-sm hover:text-white/60 transition-colors flex items-center gap-2">
          ← العودة
        </button>
        <HRRideLogo variant="mark" color="white" markSize={32} />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-white/30 mb-3 text-center">
            {portal === 'admin' ? 'domain.com/admin' : 'domain.com/judge'}
          </p>
          <h1 className="text-white text-2xl font-black text-center mb-8">{title}</h1>

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <label className="text-white/40 text-xs font-serif block mb-2">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError('') }}
                placeholder={portal === 'admin' ? 'ahmed.k' : 'hussein.e'}
                autoComplete="username"
                className="w-full bg-dark-mid border border-white/10 text-white rounded-lg px-4 py-3.5 text-sm focus:outline-none focus:border-brand/50 transition-colors placeholder:text-white/20"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs font-serif block mb-2">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-dark-mid border border-white/10 text-white rounded-lg px-4 py-3.5 text-sm focus:outline-none focus:border-brand/50 transition-colors placeholder:text-white/20"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 text-xs transition-colors"
                >
                  {showPass ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full bg-brand text-ivory py-4 font-black text-base rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'جارٍ التحقق...' : 'دخول'}
            </button>
          </form>

          <div className="border border-white/8 rounded-lg p-4 text-center">
            <p className="text-white/25 text-[10px] font-serif uppercase tracking-widest mb-2">إدخالات النظام</p>
            <p className="text-white/55 text-xs">يتم التحقق من المستخدمين من قاعدة البيانات الرسمية فقط.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PortalGate({ onLogin }: Props) {
  const [activeForm, setActiveForm] = useState<ActiveForm>('none')

  if (activeForm === 'admin') {
    return (
      <LoginForm
        portal="admin"
        title="دخول الإدارة"
        hint={[
          { name: 'أحمد الكناني — مدير عام', username: 'ahmed.k', password: 'admin123' },
          { name: 'سارة الموسوي — مسؤول', username: 'sara.m', password: 'admin123' },
        ]}
        onSuccess={(user) => onLogin(user, 'admin')}
        onBack={() => setActiveForm('none')}
      />
    )
  }

  if (activeForm === 'judge') {
    return (
      <LoginForm
        portal="judge"
        title="دخول الحكم"
        hint={[
          { name: 'حسين العبيدي — حكم', username: 'hussein.e', password: 'judge123' },
          { name: 'فاطمة النجار — حكم', username: 'fatima.n', password: 'judge123' },
        ]}
        onSuccess={(user) => onLogin(user, 'judge')}
        onBack={() => setActiveForm('none')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-dark-surface flex flex-col" dir="rtl">
      {/* Watermark */}
      <div className="absolute top-0 left-0 pointer-events-none">
        <HRRideWatermark color="#ffffff" size={500} opacity={0.025} />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Logo */}
        <div className="mb-12 text-center">
          <HRRideLogo variant="horizontal" color="white" markSize={52} />
          <p className="text-white/25 text-xs font-serif mt-3 tracking-widest">نظام إدارة البطولات الفروسية</p>
        </div>

        {/* Portal cards */}
        <div className="w-full max-w-lg space-y-3">

          {/* Public site */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/50 text-lg">🌐</span>
                <p className="text-white font-bold text-sm">الموقع العام</p>
              </div>
              <p className="text-white/25 text-xs font-mono">hr-ride.com</p>
            </div>
            <button
              onClick={() => onLogin({ id: '', name: '', username: '', email: '', role: 'super_admin', userStatus: 'active', assignedTournaments: [], lastLogin: '' }, 'public')}
              className="bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              فتح الموقع ←
            </button>
          </div>

          {/* Judge portal */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white/50 text-lg">⚖️</span>
                  <p className="text-white font-bold text-sm">بوابة الحكم</p>
                </div>
                <p className="text-white/25 text-xs font-mono">hr-ride.com/judge</p>
              </div>
              <span className="text-[10px] text-white/20 font-serif">يتطلب تسجيل دخول</span>
            </div>
            <div className="bg-dark-surface rounded-lg p-3 mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30 font-serif">المستخدم</span>
                <span className="text-white/60 font-mono">hussein.e</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30 font-serif">كلمة المرور</span>
                <span className="text-white/60 font-mono">judge123</span>
              </div>
            </div>
            <button
              onClick={() => setActiveForm('judge')}
              className="w-full bg-brand text-ivory py-3 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors"
            >
              دخول الحكم
            </button>
          </div>

          {/* Admin portal */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white/50 text-lg">⚙️</span>
                  <p className="text-white font-bold text-sm">بوابة الإدارة</p>
                </div>
                <p className="text-white/25 text-xs font-mono">hr-ride.com/admin</p>
              </div>
              <span className="text-[10px] text-white/20 font-serif">يتطلب تسجيل دخول</span>
            </div>
            <div className="bg-dark-surface rounded-lg p-3 mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30 font-serif">المستخدم</span>
                <span className="text-white/60 font-mono">ahmed.k</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30 font-serif">كلمة المرور</span>
                <span className="text-white/60 font-mono">admin123</span>
              </div>
              <div className="border-t border-white/5 pt-1.5 mt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/20 font-serif">أو</span>
                  <span className="text-white/40 font-mono">sara.m / admin123</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveForm('admin')}
              className="w-full bg-charcoal hover:bg-charcoal/70 border border-white/15 text-white py-3 font-black text-sm rounded-lg transition-colors"
            >
              دخول الإدارة
            </button>
          </div>

          {/* Live display */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/50 text-lg">📺</span>
                <p className="text-white font-bold text-sm">شاشة الملعب</p>
              </div>
              <p className="text-white/25 text-xs font-mono">hr-ride.com/display</p>
              <p className="text-white/20 text-[11px] mt-1 font-serif">لا تتطلب تسجيل دخول</p>
            </div>
            <button
              onClick={() => onLogin({ id: '', name: '', username: '', email: '', role: 'super_admin', userStatus: 'active', assignedTournaments: [], lastLogin: '' }, 'display')}
              className="bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              فتح الشاشة ←
            </button>
          </div>
        </div>

        <p className="text-white/12 text-xs font-serif mt-12 text-center">
          منصة رايد إكس لإدارة البطولات الفروسية
        </p>
      </div>
    </div>
  )
}
