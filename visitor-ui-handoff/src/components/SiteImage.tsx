import { useState } from 'react'

interface SiteImageProps {
  src?: string | null
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
}

export default function SiteImage({ src, alt, className = '', loading = 'lazy' }: SiteImageProps) {
  const source = src?.trim() ?? ''
  const [failedSource, setFailedSource] = useState('')

  if (!source || failedSource === source) return null

  return (
    <img
      src={source}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailedSource(source)}
    />
  )
}