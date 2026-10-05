import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import SiteImage from '../components/SiteImage'
import type { SiteSettings } from '../context/AppContext'

interface HeritagePageProps {
  siteSettings: SiteSettings
  onNavigate: (page: string) => void
}

export default function HeritagePage({ siteSettings, onNavigate }: HeritagePageProps) {
  const title = siteSettings.heritageTitle || 'قصة رايد إكس'
  const body = siteSettings.heritageBody
  const storyText = body.replace(/([.!؟])\s+(?=[\u0600-\u06FF])/g, '$1\n\n')
  const paragraphs = storyText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)

  return (
    <div className="min-h-screen bg-ivory">
      <SiteHeader onNavigate={onNavigate} />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-24 sm:px-8 sm:pt-28">
        {siteSettings.heritageImageUrl && <div className="mb-8 aspect-[4/3] overflow-hidden rounded-3xl bg-sand sm:mb-12 sm:aspect-[16/8]">
          <SiteImage src={siteSettings.heritageImageUrl} alt={title} loading="eager" className="h-full w-full object-cover" />
        </div>}
        <button onClick={() => onNavigate('home')} className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-warm-gray">
          <span aria-hidden="true">→</span> العودة للرئيسية
        </button>
        <article className="rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-10">
          {siteSettings.heritageSubtitle && <p className="mb-3 text-sm font-bold text-brand">{siteSettings.heritageSubtitle}</p>}
          <h1 className="mb-6 text-3xl font-black leading-tight text-charcoal sm:text-5xl">{title}</h1>
          <div className="space-y-6 text-justify text-base font-medium leading-8 text-warm-gray sm:text-lg sm:leading-10">
            {(paragraphs.length ? paragraphs : [body]).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </article>
      </main>
      <SiteFooter email={siteSettings.footerEmail} city={siteSettings.footerCity} organization={siteSettings.footerOrganization} />
    </div>
  )
}