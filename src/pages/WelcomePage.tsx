import { useEffect } from 'react'

interface WelcomePageProps {
  onEnter: () => void
}

export default function WelcomePage({ onEnter }: WelcomePageProps) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'ridex-enter') onEnter()
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onEnter])

  return (
    <main className="relative h-screen overflow-hidden bg-[#0b0908]">
      <iframe
        title="RIDEX welcome"
        src="/ridex-welcome.html"
        className="absolute inset-0 h-full w-full border-0"
      />
    </main>
  )
}