interface HRRideLogoProps {
  variant?: 'main' | 'horizontal' | 'mark'
  color?: 'brand' | 'white' | 'dark'
  className?: string
  markSize?: number
}

export function HRRideWatermark({ size = 400, opacity = 0.06, color = '#8D381F' }: { size?: number; opacity?: number; color?: string }) {
  return <img aria-hidden="true" src="/ridex-logo.svg" alt="" className="object-contain" style={{ width: size, height: size, opacity, filter: color === '#ffffff' ? 'brightness(0) invert(1)' : undefined }} />
}

export default function HRRideLogo({ variant = 'main', color = 'brand', className = '', markSize = 48 }: HRRideLogoProps) {
  const height = variant === 'mark' ? markSize : markSize * 1.15
  return (
    <img
      src="/ridex-logo.svg"
      alt="رايد إكس"
      className={`object-contain ${className}`}
      style={{ width: height * 2.9, height, maxWidth: '100%', filter: color === 'white' ? 'brightness(0) invert(1)' : undefined }}
    />
  )
}