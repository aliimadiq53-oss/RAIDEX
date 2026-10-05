const colors = [
  { name: 'Brand Primary', swatch: '#7B3120', cls: 'bg-brand', hex: '#7B3120', use: 'Primary CTA, Active States, Accents' },
  { name: 'Brand Hover', swatch: '#6A2919', cls: 'bg-brand-hover', hex: '#6A2919', use: 'Hover State for Brand' },
  { name: 'Ivory', swatch: '#F5F0E8', cls: 'bg-ivory', hex: '#F5F0E8', use: 'Page Background (65–75%)' },
  { name: 'Sand', swatch: '#ECE4D3', cls: 'bg-sand', hex: '#ECE4D3', use: 'Secondary Surfaces (15–20%)' },
  { name: 'Beige', swatch: '#E3D9C8', cls: 'bg-beige', hex: '#E3D9C8', use: 'Tertiary Surfaces, Dividers' },
  { name: 'Surface', swatch: '#FDFAF5', cls: 'bg-surface', hex: '#FDFAF5', use: 'Cards, Panels, White Areas' },
  { name: 'Charcoal', swatch: '#1C1A17', cls: 'bg-charcoal', hex: '#1C1A17', use: 'Primary Text (5–10%)' },
  { name: 'Warm Gray', swatch: '#6B5D4F', cls: 'bg-warm-gray', hex: '#6B5D4F', use: 'Secondary Text' },
  { name: 'Muted', swatch: '#9E8E7E', cls: 'bg-muted-text', hex: '#9E8E7E', use: 'Captions, Labels' },
  { name: 'Line', swatch: '#DDD5C5', cls: 'bg-line', hex: '#DDD5C5', use: 'Borders, Hairlines' },
  { name: 'Dark Surface', swatch: '#17140F', cls: 'bg-dark-surface', hex: '#17140F', use: 'Footer, Dark Sections' },
  { name: 'Dark Mid', swatch: '#201D19', cls: 'bg-dark-mid', hex: '#201D19', use: 'Dark Cards, Overlays' },
]

const typeScale = [
  { name: 'Display XL', cls: 'text-8xl font-black', size: '96px / weight 900', sample: 'HR RIDE' },
  { name: 'Display L', cls: 'text-7xl font-black', size: '72px / weight 900', sample: 'بطولات HR RIDE' },
  { name: 'H1', cls: 'text-6xl font-black', size: '60px / weight 900', sample: 'البطولة الكبرى الدولية' },
  { name: 'H2', cls: 'text-5xl font-bold', size: '48px / weight 700', sample: 'إرثٌ يمتد عبر الأجيال' },
  { name: 'H3', cls: 'text-3xl font-bold', size: '30px / weight 700', sample: 'بطولة HR RIDE للفروسية' },
  { name: 'Body Large', cls: 'text-xl font-medium', size: '20px / weight 500', sample: 'منصة فروسية راقية تجمع بين الأصالة والابتكار في المنطقة.' },
  { name: 'Body', cls: 'text-base font-medium', size: '16px / weight 500', sample: 'كل بطولة قصة. كل فارس إرث. كل حصان يستحق أن يُرى.' },
  { name: 'Small', cls: 'text-sm font-medium', size: '14px / weight 500', sample: 'الرياض، المملكة العربية السعودية · ١٥ سبتمبر ٢٠٢٦' },
  { name: 'Label', cls: 'text-xs font-semibold tracking-widest uppercase font-serif', size: '11px / Thmanyah Sans', sample: 'HR RIDE · EQUESTRIAN' },
  { name: 'Caption', cls: 'text-xs text-muted-text font-medium', size: '11px / weight 500', sample: 'HR RIDE · ٢٠٢٦' },
  { name: 'Numeric Display', cls: 'font-serif text-6xl font-medium tabular-nums', size: 'Thmanyah Sans / Medium', sample: '01  22  45' },
]

const radius = [
  { name: 'Sharp', val: '0', note: 'Images, full-bleed sections' },
  { name: 'Subtle (sm)', val: '4px', note: 'Status badges, tags' },
  { name: 'Base', val: '8px', note: 'Buttons, inputs' },
  { name: 'Medium', val: '12px', note: 'Cards, panels (sparingly)' },
  { name: 'Large', val: '16px', note: 'Modal dialogs' },
  { name: 'Full', val: '9999px', note: 'Pills, only when appropriate' },
]

const spacingScale = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128]

export default function DesignSystem() {
  return (
    <div className="bg-ivory min-h-screen pb-32">
      {/* Header */}
      <div className="bg-dark-surface text-ivory px-8 lg:px-16 py-16">
        <p className="font-serif text-[11px] tracking-[0.35em] uppercase text-ivory/30 mb-4">Design System</p>
        <h1 className="text-6xl font-black mb-3">نظام التصميم</h1>
        <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-ivory/30">HR RIDE — EQUESTRIAN PLATFORM</p>
      </div>

      <div className="max-w-screen-xl mx-auto px-8 lg:px-16">
        {/* ─── COLORS ────── */}
        <section className="py-20 border-b border-line">
          <h2 className="text-3xl font-black text-charcoal mb-3">الألوان</h2>
          <p className="text-warm-gray text-sm mb-12">النظام اللوني يعكس هوية HR RIDE للفروسية.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {colors.map((c) => (
              <div key={c.name} className="bg-surface border border-line rounded-sm overflow-hidden">
                <div className="h-16" style={{ backgroundColor: c.swatch }} />
                <div className="p-4">
                  <p className="text-sm font-bold text-charcoal mb-0.5">{c.name}</p>
                  <p className="font-serif text-xs text-muted-text mb-2">{c.hex}</p>
                  <p className="text-xs text-warm-gray leading-snug">{c.use}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Color ratio guide */}
          <div className="mt-10 p-6 bg-surface border border-line rounded-sm">
            <p className="text-sm font-bold text-charcoal mb-4">توزيع الألوان المرجعي</p>
            <div className="flex h-5 rounded overflow-hidden gap-px">
              <div className="bg-ivory border border-line" style={{ flex: '70' }} title="65–75% Ivory" />
              <div className="bg-sand" style={{ flex: '18' }} title="15–20% Sand" />
              <div className="bg-brand" style={{ flex: '7' }} title="5–10% Brand" />
              <div className="bg-charcoal" style={{ flex: '7' }} title="5–10% Charcoal" />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-text">
              <span>Ivory 65–75%</span>
              <span>Sand 15–20%</span>
              <span>Brand 5–10%</span>
              <span>Charcoal 5–10%</span>
            </div>
          </div>
        </section>

        {/* ─── TYPOGRAPHY ────── */}
        <section className="py-20 border-b border-line">
          <h2 className="text-3xl font-black text-charcoal mb-3">الطباعة</h2>
          <div className="flex gap-8 mb-12">
            <div className="bg-surface border border-line rounded-sm px-5 py-4 text-sm">
              <p className="font-bold text-charcoal mb-1">Thmanyah Sans</p>
              <p className="text-muted-text text-xs">الخط الأساسي لجميع النصوص العربية واللاتينية</p>
              <p className="text-muted-text text-xs">الأوزان: 300، 400، 500، 700، 900</p>
            </div>
            <div className="bg-surface border border-line rounded-sm px-5 py-4 text-sm">
              <p className="font-serif font-bold text-charcoal mb-1">Thmanyah Sans</p>
              <p className="text-muted-text text-xs">يُستخدم أيضاً للعناوين والأرقام</p>
              <p className="text-muted-text text-xs">الأوزان: 300، 400، 500، 700، 900</p>
            </div>
          </div>

          <div className="space-y-0 border-t border-line">
            {typeScale.map((t) => (
              <div key={t.name} className="flex gap-8 items-baseline py-7 border-b border-line/60">
                <div className="w-32 shrink-0">
                  <p className="text-xs font-bold text-charcoal">{t.name}</p>
                  <p className="text-xs text-muted-text mt-0.5">{t.size}</p>
                </div>
                <p className={`text-charcoal leading-none flex-1 ${t.cls}`}>{t.sample}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── BUTTONS ────── */}
        <section className="py-20 border-b border-line">
          <h2 className="text-3xl font-black text-charcoal mb-12">الأزرار</h2>
          <div className="flex flex-wrap gap-4 items-center mb-8">
            <button className="bg-brand text-ivory px-8 py-3.5 text-sm font-bold rounded-lg hover:bg-brand-hover transition-colors">
              اكتشف عالم HR RIDE
            </button>
            <button className="border border-brand text-brand px-8 py-3.5 text-sm font-bold rounded-lg hover:bg-brand/5 transition-colors">
              استكشف البطولات
            </button>
            <button className="text-brand text-sm font-semibold border-b border-brand/40 pb-0.5 hover:border-brand transition-colors">
              اقرأ المزيد ←
            </button>
            <button className="bg-charcoal text-ivory px-8 py-3.5 text-sm font-bold rounded-lg hover:bg-dark-surface transition-colors">
              تسجيل الدخول
            </button>
            <button className="border border-line text-warm-gray px-8 py-3.5 text-sm font-semibold rounded-lg hover:text-charcoal hover:border-charcoal transition-colors">
              إلغاء
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <button className="bg-brand text-ivory px-6 py-2.5 text-xs font-bold rounded-md hover:bg-brand-hover transition-colors">
              صغير — Small
            </button>
            <button className="bg-brand text-ivory px-8 py-3.5 text-sm font-bold rounded-lg hover:bg-brand-hover transition-colors">
              متوسط — Medium
            </button>
            <button className="bg-brand text-ivory px-10 py-5 text-base font-black rounded-xl hover:bg-brand-hover transition-colors">
              كبير — Large
            </button>
          </div>
        </section>

        {/* ─── INPUTS ────── */}
        <section className="py-20 border-b border-line">
          <h2 className="text-3xl font-black text-charcoal mb-12">حقول الإدخال</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold text-muted-text tracking-widest uppercase mb-2">الاسم الكامل</label>
              <input
                type="text"
                placeholder="أدخل اسمك الكامل"
                className="w-full bg-surface border border-line focus:border-brand outline-none rounded-lg px-5 py-3.5 text-sm text-charcoal placeholder:text-muted-text transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-text tracking-widest uppercase mb-2">البريد الإلكتروني</label>
              <input
                type="email"
                placeholder="name@hr-ride.com"
                className="w-full bg-surface border border-line focus:border-brand outline-none rounded-lg px-5 py-3.5 text-sm text-charcoal placeholder:text-muted-text transition-colors"
                dir="ltr"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-text tracking-widest uppercase mb-2">رقم المشاركة — حكم</label>
              <input
                type="number"
                placeholder="00"
                className="w-32 bg-surface border-2 border-line focus:border-brand outline-none rounded-xl px-6 py-5 text-5xl font-serif text-charcoal text-center placeholder:text-line transition-colors"
                style={{ fontFamily: 'Thmanyah Sans, sans-serif' }}
              />
            </div>
          </div>
        </section>

        {/* ─── RADIUS + SPACING ────── */}
        <section className="py-20 border-b border-line">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <h2 className="text-3xl font-black text-charcoal mb-12">الانحناء</h2>
              <div className="space-y-4">
                {radius.map((r) => (
                  <div key={r.name} className="flex items-center gap-6">
                    <div
                      className="w-14 h-14 bg-brand/15 border border-brand/30 shrink-0"
                      style={{ borderRadius: r.val }}
                    />
                    <div>
                      <p className="text-sm font-bold text-charcoal">{r.name}</p>
                      <p className="text-xs text-muted-text">{r.val} · {r.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-black text-charcoal mb-12">المسافات</h2>
              <div className="space-y-2">
                {spacingScale.map((s) => (
                  <div key={s} className="flex items-center gap-4">
                    <div className="bg-brand/30 h-4 shrink-0" style={{ width: `${Math.min(s * 1.5, 280)}px` }} />
                    <p className="text-xs text-muted-text font-serif">{s}px</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── BRAND MARK ────── */}
        <section className="py-20">
          <h2 className="text-3xl font-black text-charcoal mb-12">العلامة والهوية</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Light bg */}
            <div className="bg-ivory border border-line rounded-sm p-10 flex flex-col items-center justify-center gap-2">
              <p className="text-4xl font-black text-charcoal">HR RIDE</p>
              <p className="font-serif text-[9px] tracking-[0.3em] uppercase text-muted-text">EQUESTRIAN PLATFORM</p>
            </div>
            {/* Dark bg */}
            <div className="bg-dark-surface rounded-sm p-10 flex flex-col items-center justify-center gap-2">
              <p className="text-4xl font-black text-ivory">HR RIDE</p>
              <p className="font-serif text-[9px] tracking-[0.3em] uppercase text-ivory/30">EQUESTRIAN PLATFORM</p>
            </div>
            {/* Brand bg */}
            <div className="bg-brand rounded-sm p-10 flex flex-col items-center justify-center gap-2">
              <p className="text-4xl font-black text-ivory">HR RIDE</p>
              <p className="font-serif text-[9px] tracking-[0.3em] uppercase text-ivory/50">EQUESTRIAN PLATFORM</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
