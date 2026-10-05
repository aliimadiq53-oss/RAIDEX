const footerColumns = [
  {
    title: 'الموقع',
    links: ['الرئيسية', 'عن رايد إكس', 'البطولات', 'الفعاليات والأخبار'],
  },
  {
    title: 'اكتشف',
    links: ['معرض الصور', 'أبطال البطولات', 'الرعاة والشركاء', 'تواصل معنا'],
  },
]

interface SiteFooterProps {
  email?: string
  city?: string
  organization?: string
}

export default function SiteFooter({ email, city = 'بغداد، جمهورية العراق', organization = 'رايد إكس' }: SiteFooterProps) {
  const configuredEmail = email?.trim()
  const displayEmail = !configuredEmail || configuredEmail === 'info@hr-ride.com'
    ? 'business@hr-ride.com'
    : configuredEmail
  const displayOrganization = !organization || organization === 'HR RIDE Equestrian Platform'
    ? 'رايد إكس'
    : organization

  return (
    <footer className="relative bg-dark-surface text-ivory/60 pt-20 pb-16 overflow-hidden">
      <div className="relative max-w-screen-xl mx-auto px-5 sm:px-8 lg:px-16">
        <div className="flex flex-col lg:flex-row justify-between gap-10 sm:gap-14 pb-10 sm:pb-14 border-b border-white/8">
          {/* Brand */}
          <div className="max-w-xs">
            <img src="/ridex-logo.svg" alt="رايد إكس" className="mb-6 h-20 w-32 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            <p className="text-sm leading-loose text-ivory/40">
              منصة فروسية عراقية راقية — رايد إكس تحمل إرث الرافدين وتطلعات الفارس العراقي نحو العالمية.
            </p>
            <p className="text-sm text-ivory/30 mt-3">
              تحت إشراف الاتحاد العراقي للفروسية
            </p>
          </div>

          {/* Nav */}
          <div className="flex gap-8 sm:gap-16">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h4 className="text-ivory text-sm font-semibold mb-5 tracking-wide">{col.title}</h4>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-ivory/40 hover:text-ivory transition-colors duration-200">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Social + Contact */}
          <div>
            <h4 className="text-ivory text-sm font-semibold mb-5">تابعنا</h4>
            <div className="flex gap-2 mb-7">
              {['X', 'IG', 'YT', 'TK'].map((s) => (
                <a
                  key={s}
                  href="#"
                  className="w-9 h-9 rounded-full border border-white/12 flex items-center justify-center text-[10px] font-bold text-ivory/40 hover:border-white/50 hover:text-ivory transition-all duration-200"
                >
                  {s}
                </a>
              ))}
            </div>
            <p className="text-sm text-ivory/35 mb-1">{displayEmail}</p>
            <p className="text-sm text-ivory/25 mt-3 text-xs">{displayOrganization}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8">
          <p className="text-xs text-ivory/20">© ٢٠٢٦ رايد إكس — جميع الحقوق محفوظة</p>
          <img src="/ridex-logo.svg" alt="رايد إكس" className="h-10 w-20 object-contain opacity-70" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
      </div>
    </footer>
  )
}
