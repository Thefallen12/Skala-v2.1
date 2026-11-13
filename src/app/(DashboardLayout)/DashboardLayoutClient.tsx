'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { NotificationType, type UserRole } from '@prisma/client'
import Header from './layout/header/Header'
import Sidebar from './layout/sidebar/Sidebar'
import { MobileBottomNav } from './layout/mobile/MobileBottomNav'
import type { DashboardNotification } from './layout/header/Notifications'
import { useNotificationFeed } from './layout/header/useNotificationFeed'
import type { NotificationFeedItem } from './layout/header/useNotificationFeed'
import { getMaintenancePageForLocation } from '@/lib/config/maintenance-pages'
import { MaintenanceProvider } from '@/components/maintenance/MaintenanceContext'
import { UnderProductionState } from '@/components/ui/under-production-state'
import WhatsAppNotificationPopup from '@/app/components/notifications/WhatsAppNotificationPopup'
import DevicePermissionsDialog from '@/app/components/notifications/DevicePermissionsDialog'
import {
  cancelNativeNotification,
  consumePendingNativeNotificationAction,
  getNotificationSoundEnabled,
  setNotificationSoundEnabled,
  setupAudioUnlockListeners,
  showNativeWhatsAppNotification,
  syncNativeSeenNotificationIds,
  triggerIncomingNotificationFeedback,
} from '@/lib/native-bridge'

const SESSION_ALERTED_IDS_KEY = 'skala_alerted_notif_ids'
const RECENT_INITIAL_POPUP_WINDOW_MS = 30_000
const MAX_STORED_ALERT_IDS = 120

function readStoredAlertedIds(): Set<string> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_ALERTED_IDS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return null
  }
}

function writeStoredAlertedIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    const list = Array.from(ids).slice(-MAX_STORED_ALERT_IDS)
    window.sessionStorage.setItem(SESSION_ALERTED_IDS_KEY, JSON.stringify(list))
  } catch {
    // Ignore storage quota or restriction
  }
}

function resolveNotificationCategoryLabel(item: NotificationFeedItem): string {
  const url = item.actionUrl ?? ''
  if (item.type === NotificationType.APPROVAL || url.startsWith('/apps/approvals')) {
    return 'Otorisasi Direksi'
  }
  if (url.startsWith('/apps/finance')) return 'Keuangan'
  if (url.startsWith('/apps/logistics') || url.startsWith('/apps/orders')) {
    return 'Logistik & Armada'
  }
  if (item.type === NotificationType.WARNING) return 'Perhatian Operasional'
  if (item.type === NotificationType.SUCCESS) return 'Konfirmasi Selesai'
  return 'Skala Prioritas'
}

export default function DashboardLayoutClient({
  children,
  canManageUsers,
  canAccessLogistics,
  canAccessExecutive,
  canAccessFinance,
  canAccessProjects,
  canAccessDrafter,
  isMover,
  allowedMenuKeys,
  maintenancePageKeys,
  profilePhotoUrl,
  userName,
  userRole,
  notifications,
  androidDownloadUrl,
}: Readonly<{
  children: React.ReactNode
  canManageUsers: boolean
  canAccessLogistics: boolean
  canAccessExecutive: boolean
  canAccessFinance: boolean
  canAccessProjects: boolean
  canAccessDrafter: boolean
  isMover: boolean
  allowedMenuKeys: string[]
  maintenancePageKeys: string[]
  profilePhotoUrl: string | null
  userName: string
  userRole: UserRole
  notifications: DashboardNotification[]
  androidDownloadUrl: string | null
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const seenNotificationIds = useRef<Set<string> | null>(null)
  const activeFeedIdsRef = useRef<Set<string>>(new Set())
  const hasMountedNotificationsRef = useRef(false)
  const [incomingQueue, setIncomingQueue] = useState<NotificationFeedItem[]>([])
  const [popupPaused, setPopupPaused] = useState(false)
  const [popupBusy, setPopupBusy] = useState(false)
  const [soundEnabled, setSoundEnabledState] = useState(true)

  const pageUnderMaintenance = getMaintenancePageForLocation(
    pathname,
    new URLSearchParams(searchParams.toString()),
    maintenancePageKeys,
  )
  const { data, error, mutate } = useNotificationFeed()

  useEffect(() => {
    if (!hasMountedNotificationsRef.current) {
      hasMountedNotificationsRef.current = true
      return
    }
    void mutate()
  }, [notifications, mutate])
  const sidebarCounts = data?.sidebarCounts ?? {
    executive: 0,
    logistics: 0,
    finance: 0,
  }

  const activeIncoming = incomingQueue[0] ?? null

  const enqueueIncomingItems = useCallback((items: NotificationFeedItem[]) => {
    if (!items.length) return
    setIncomingQueue((prev) => {
      const existing = new Set(prev.map((entry) => entry.id))
      const fresh = items.filter((entry) => !existing.has(entry.id))
      if (!fresh.length) return prev
      return [...prev, ...fresh].slice(-5)
    })
  }, [])

  const triggerTestWhatsAppPopup = useCallback(() => {
    const sampleItem: NotificationFeedItem = {
      id: `test-${Date.now()}`,
      title: 'Simulasi Pesan Masuk · Tiket & Persetujuan',
      message:
        'Ini adalah contoh popup notifikasi masuk bergaya WhatsApp lengkap dengan suara, getar, dan tombol buka langsung.',
      type: NotificationType.APPROVAL,
      isRead: false,
      actionUrl: '/apps/tickets',
      createdAt: new Date().toISOString(),
    }

    triggerIncomingNotificationFeedback()
    enqueueIncomingItems([sampleItem])
    showNativeWhatsAppNotification({
      id: sampleItem.id,
      title: sampleItem.title,
      message: sampleItem.message,
      categoryLabel: 'Simulasi Notifikasi',
      actionUrl: sampleItem.actionUrl,
      timestampMs: Date.now(),
      forceHeadsUp: true,
    })
  }, [enqueueIncomingItems])

  useEffect(() => {
    const detachUnlock = setupAudioUnlockListeners()
    let active = true
    Promise.resolve().then(() => {
      if (active) setSoundEnabledState(getNotificationSoundEnabled())
    })

    const onSoundPrefChanged = (event: Event) => {
      const custom = event as CustomEvent<boolean>
      if (typeof custom.detail === 'boolean') {
        setSoundEnabledState(custom.detail)
      }
    }

    const onTestPopupEvent = () => {
      triggerTestWhatsAppPopup()
    }

    const onRefreshNotifications = () => {
      void mutate()
    }

    window.addEventListener('skala:sound-pref-changed', onSoundPrefChanged)
    window.addEventListener('skala:test-whatsapp-popup', onTestPopupEvent)
    window.addEventListener('skala:refresh-notifications', onRefreshNotifications)

    return () => {
      active = false
      detachUnlock()
      window.removeEventListener('skala:sound-pref-changed', onSoundPrefChanged)
      window.removeEventListener('skala:test-whatsapp-popup', onTestPopupEvent)
      window.removeEventListener('skala:refresh-notifications', onRefreshNotifications)
    }
  }, [mutate, triggerTestWhatsAppPopup])

  const openNotificationTarget = useCallback(
    async (id: string, fallbackActionUrl: string | null) => {
      setPopupBusy(true)
      try {
        cancelNativeNotification(id)
        if (!id.startsWith('test-')) {
          const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
            method: 'PATCH',
          })
          if (response.ok) {
            const result = (await response.json()) as { actionUrl?: string | null }
            void mutate()
            const target = result.actionUrl || fallbackActionUrl || '/apps/tickets'
            router.push(target)
            return
          }
        }
        if (fallbackActionUrl) {
          router.push(fallbackActionUrl)
        }
      } catch (err) {
        console.error('Failed to open notification action:', err)
        if (fallbackActionUrl) {
          router.push(fallbackActionUrl)
        }
      } finally {
        setPopupBusy(false)
        setIncomingQueue((prev) => prev.filter((item) => item.id !== id))
      }
    },
    [mutate, router],
  )

  useEffect(() => {
    const handleNativeAction = (detail: { id?: string; actionUrl?: string } | null) => {
      if (!detail?.actionUrl) return
      if (detail.id) {
        void openNotificationTarget(detail.id, detail.actionUrl)
      } else {
        router.push(detail.actionUrl)
      }
    }

    const pending = consumePendingNativeNotificationAction()
    if (pending) {
      Promise.resolve().then(() => handleNativeAction(pending))
    }

    const onOpenNotificationEvent = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string; actionUrl?: string }>
      handleNativeAction(custom.detail ?? null)
    }

    const onNativeReady = () => {
      const delayedPending = consumePendingNativeNotificationAction()
      if (delayedPending) {
        handleNativeAction(delayedPending)
      }
    }

    window.addEventListener('skala:open-notification', onOpenNotificationEvent)
    window.addEventListener('skala:native-ready', onNativeReady)
    return () => {
      window.removeEventListener('skala:open-notification', onOpenNotificationEvent)
      window.removeEventListener('skala:native-ready', onNativeReady)
    }
  }, [openNotificationTarget, router])

  useEffect(() => {
    if (!data) return

    const currentIds = data.notifications.map(({ id }) => id)
    const currentIdSet = new Set(currentIds)

    // Dismiss any lingering tray/floating notifications whose tasks were just completed.
    for (const previousId of activeFeedIdsRef.current) {
      if (!currentIdSet.has(previousId)) {
        cancelNativeNotification(previousId)
      }
    }
    activeFeedIdsRef.current = currentIdSet

    Promise.resolve().then(() => {
      setIncomingQueue((prev) =>
        prev.filter((entry) => entry.id.startsWith('test-') || currentIdSet.has(entry.id)),
      )
    })

    syncNativeSeenNotificationIds(currentIds)

    if (seenNotificationIds.current === null) {
      const storedIds = readStoredAlertedIds()
      const baselineSet = storedIds ?? new Set<string>(currentIds)

      if (storedIds === null) {
        writeStoredAlertedIds(baselineSet)
        seenNotificationIds.current = baselineSet

        const nowMs = Date.now()
        const veryRecentUnread = data.notifications
          .filter((item) => {
            if (item.isRead) return false
            const createdMs = Date.parse(item.createdAt)
            return Number.isFinite(createdMs) && nowMs - createdMs <= RECENT_INITIAL_POPUP_WINDOW_MS
          })
          .slice(0, 2)

        if (veryRecentUnread.length > 0) {
          Promise.resolve().then(() => {
            triggerIncomingNotificationFeedback()
            enqueueIncomingItems(veryRecentUnread)
          })
        }
        return
      }

      seenNotificationIds.current = baselineSet
    }

    const unseenUnread = data.notifications
      .filter(({ id, isRead }) => !isRead && !seenNotificationIds.current?.has(id))
      .slice(0, 4)

    for (const id of currentIds) {
      seenNotificationIds.current.add(id)
    }
    writeStoredAlertedIds(seenNotificationIds.current)

    if (unseenUnread.length === 0) return

    Promise.resolve().then(() => {
      triggerIncomingNotificationFeedback()
      enqueueIncomingItems(unseenUnread)

      const latest = unseenUnread[0]
      showNativeWhatsAppNotification({
        id: latest.id,
        title: latest.title,
        message: latest.message,
        categoryLabel: resolveNotificationCategoryLabel(latest),
        actionUrl: latest.actionUrl,
        timestampMs: Date.parse(latest.createdAt) || Date.now(),
        forceHeadsUp: false,
      })

      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        !window.SkalaNativeBridge &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const browserPopup = new Notification(latest.title, {
            body: latest.message,
            icon: '/icons/icon-192.png',
            tag: latest.id,
          })
          browserPopup.onclick = () => {
            window.focus()
            void openNotificationTarget(latest.id, latest.actionUrl)
            browserPopup.close()
          }
        } catch {
          // Notification constructor may not be supported on Android Chrome without SW
        }
      }
    })
  }, [data, enqueueIncomingItems, openNotificationTarget])

  useEffect(() => {
    if (!activeIncoming || popupPaused) return

    const timeoutId = window.setTimeout(() => {
      setIncomingQueue((prev) => prev.slice(1))
    }, 9_000)

    return () => window.clearTimeout(timeoutId)
  }, [activeIncoming, popupPaused])

  const handleDismissPopup = () => {
    if (!activeIncoming) return
    setIncomingQueue((prev) => prev.slice(1))
  }

  const handleMarkAsReadPopup = async (item: NotificationFeedItem) => {
    setPopupBusy(true)
    try {
      cancelNativeNotification(item.id)
      if (!item.id.startsWith('test-')) {
        const response = await fetch(`/api/notifications/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
        })
        if (response.ok) {
          void mutate()
        }
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err)
    } finally {
      setPopupBusy(false)
      setIncomingQueue((prev) => prev.filter((entry) => entry.id !== item.id))
    }
  }

  const handleToggleSound = () => {
    const next = !soundEnabled
    setSoundEnabledState(next)
    setNotificationSoundEnabled(next)
    window.dispatchEvent(new CustomEvent('skala:sound-pref-changed', { detail: next }))
  }

  return (
    <MaintenanceProvider enabledKeys={maintenancePageKeys}>
      <div className='flex min-h-screen w-full min-w-0'>
        <WhatsAppNotificationPopup
          notification={activeIncoming}
          queuedCount={Math.max(0, incomingQueue.length - 1)}
          soundEnabled={soundEnabled}
          busy={popupBusy}
          onToggleSound={handleToggleSound}
          onDismiss={handleDismissPopup}
          onMarkAsRead={(item) => void handleMarkAsReadPopup(item)}
          onOpen={(item) => void openNotificationTarget(item.id, item.actionUrl)}
          onPauseTimer={setPopupPaused}
        />
        <DevicePermissionsDialog onTestPopup={triggerTestWhatsAppPopup} />
        <div className='page-wrapper flex min-w-0 flex-1 bg-background'>
          <div className='hidden xl:block xl:w-[272px] xl:shrink-0'>
            <Sidebar
              canManageUsers={canManageUsers}
              canAccessLogistics={canAccessLogistics}
              canAccessExecutive={canAccessExecutive}
              canAccessFinance={canAccessFinance}
              canAccessProjects={canAccessProjects}
              canAccessDrafter={canAccessDrafter}
              isMover={isMover}
              allowedMenuKeys={allowedMenuKeys}
              sidebarCounts={sidebarCounts}
              androidDownloadUrl={androidDownloadUrl}
            />
          </div>
          <div className='body-wrapper flex min-w-0 flex-1 flex-col pt-[68px] md:pt-0'>
            <Header
              canManageUsers={canManageUsers}
              canAccessLogistics={canAccessLogistics}
              canAccessExecutive={canAccessExecutive}
              canAccessFinance={canAccessFinance}
              canAccessProjects={canAccessProjects}
              canAccessDrafter={canAccessDrafter}
              isMover={isMover}
              allowedMenuKeys={allowedMenuKeys}
              profilePhotoUrl={profilePhotoUrl}
              userName={userName}
              userRole={userRole}
              notifications={notifications}
              androidDownloadUrl={androidDownloadUrl}
              sidebarCounts={sidebarCounts}
              notificationFeed={data ?? null}
              notificationLoadFailed={Boolean(error)}
              refreshNotifications={mutate}
            />
            <div className='mx-auto w-full max-w-[1600px] flex-1 min-w-0 px-3.5 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-8'>
              {pageUnderMaintenance ? (
                <UnderProductionState
                  className='mx-auto w-full max-w-[1200px]'
                  footerText={`MAINTENANCE · ${pageUnderMaintenance.name}`}
                />
              ) : (
                children
              )}
            </div>
            <MobileBottomNav userRole={userRole} />
          </div>
        </div>
      </div>
    </MaintenanceProvider>
  )
}
