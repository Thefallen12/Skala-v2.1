'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.isNativePlatform()) return true

  const capWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
    SkalaNativeBridge?: unknown
    SkalaNativeUpdater?: unknown
  }

  if (capWindow.Capacitor?.isNativePlatform?.()) return true

  return Boolean(
    capWindow.SkalaNativeBridge ||
      capWindow.SkalaNativeUpdater ||
      /SkalaApp\//i.test(navigator.userAgent),
  )
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (isCapacitorNative()) {
      // Skip registrasi & reload SW di dalam WebView APK; bersihkan SW lama bila sempat terdaftar
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => {})
      return
    }

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
