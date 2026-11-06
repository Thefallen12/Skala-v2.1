'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let disposed = false
    let refreshing = false
    const reloadOnControllerChange = () => {
      if (disposed || refreshing) return
      refreshing = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      reloadOnControllerChange,
    )

    void navigator.serviceWorker
      .register('/sw.js', {
        updateViaCache: 'none',
        scope: '/',
      })
      .then(async (registration) => {
        await registration.update()
      })
      .catch((error: unknown) => {
        console.error('Service worker update failed:', error)
      })

    return () => {
      disposed = true
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        reloadOnControllerChange,
      )
    }
  }, [])

  return null
}
