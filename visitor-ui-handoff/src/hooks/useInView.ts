import { useEffect, useRef, useState } from 'react'

export function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}

export function useCountdown(target: Date | null) {
  const targetTime = target?.getTime() ?? null
  const [time, setTime] = useState(() => targetTime === null || !Number.isFinite(targetTime) ? null : calcTime(new Date(targetTime)))

  useEffect(() => {
    if (targetTime === null || !Number.isFinite(targetTime)) {
      setTime(null)
      return
    }
    const update = () => setTime(calcTime(new Date(targetTime)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [targetTime])

  return time
}

function calcTime(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now())
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000)  / 60_000),
    seconds: Math.floor((diff % 60_000)     / 1000),
  }
}
