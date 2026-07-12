import { useState, useEffect } from 'react'

export function useDevice() {
  const [device, setDevice] = useState('web')
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const checkDevice = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
      const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const isNarrow = window.innerWidth < 768

      setIsStandalone(standalone)
      setDevice(standalone || (isMobileUA && isNarrow) ? 'mobile' : 'web')
    }

    checkDevice()
    window.addEventListener('resize', checkDevice)
    return () => window.removeEventListener('resize', checkDevice)
  }, [])

  return {
    isMobile: device === 'mobile',
    isWeb: device === 'web',
    isStandalone,
  }
}
