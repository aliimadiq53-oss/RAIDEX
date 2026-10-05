import { useState } from 'react'
import type { SystemUser } from '../lib/types'
import HRRideLogo from '../components/HRRideLogo'

interface Props {
  onLogin: (username: string, password: string) => Promise<SystemUser | null>
  onSuccess: (user: SystemUser) => void
}

export default function LoginPage({ onLogin, onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    try {
      const user = await onLogin(username.trim(), password)
      if (!user) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
      onSuccess(user)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'تعذر تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#ebe5dc] px-4 py-6 text-charcoal sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100svh-3rem)] w-full max-w-5xl overflow-hidden rounded-3xl border border-[#d7ccbd] bg-[#fffdf9] shadow-2xl shadow-[#3b2618]/10 lg:grid-cols-[.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-[#211914] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-[#e8bd82]/15" />
          <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full border border-[#e8bd82]/10" />
          <div className="relative">
            <img src="/ridex-logo.svg" alt="رايد إكس" className="h-28 w-44 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            <div className="mt-10 h-px w-12 bg-[#e8bd82]" />
            <p className="mt-5 text-xs font-bold tracking-[.25em] text-[#e8bd82]">منصة رايد إكس</p>
            <h2 className="mt-4 max-w-xs text-4xl font-black leading-tight">إدارة البطولة تبدأ من هنا.</h2>
            <p className="mt-5 max-w-xs text-sm leading-8 text-white/55">تحكم بالبطولات، النتائج، الحكام، والمشاركين من مساحة عمل واحدة.</p>
          </div>
          <div className="relative text-xs text-white/35">بوابة الإدارة والتحكيم · ٢٠٢٦</div>
        </aside>

        <main className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <img src="/ridex-logo.svg" alt="رايد إكس" className="mx-auto h-24 w-40 object-contain" />
              <p className="mt-3 text-xs font-bold tracking-[.2em] text-brand">بوابة الإدارة</p>
            </div>
            <div className="mb-8">
              <p className="mb-2 text-xs font-bold tracking-[.2em] text-brand">مرحباً بعودتك</p>
              <h1 className="text-3xl font-black text-charcoal sm:text-4xl">تسجيل الدخول</h1>
              <p className="mt-3 text-sm leading-7 text-muted-text">أدخل بيانات حسابك للوصول إلى مساحة إدارة البطولة.</p>
            </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold text-warm-gray">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError('') }}
                placeholder="ahmed.k"
                autoComplete="username"
                className="w-full rounded-xl border border-line bg-[#f8f4ee] px-4 py-3.5 text-sm text-charcoal placeholder:text-muted-text/50 transition-colors focus:border-brand focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-warm-gray">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-line bg-[#f8f4ee] px-4 py-3.5 pe-12 text-sm text-charcoal placeholder:text-muted-text/50 transition-colors focus:border-brand focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 left-3 flex items-center text-muted-text hover:text-brand transition-colors"
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="mt-2 min-h-13 w-full rounded-xl bg-brand py-3.5 font-black text-ivory transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-ivory/40 border-t-ivory rounded-full animate-spin" />
                  جاري التحقق...
                </span>
              ) : 'دخول'}
            </button>
          </form>
            <p className="mt-8 text-center text-xs text-muted-text/60">© ٢٠٢٦ رايد إكس · جميع الحقوق محفوظة</p>
          </div>
        </main>
      </div>
    </div>
  )
}
