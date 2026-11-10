'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Header from './layout/header/Header'
import Sidebar from './layout/sidebar/Sidebar'
import { MobileBottomNav } from './layout/mobile/MobileBottomNav'
import type { DashboardNotification } from './layout/header/Notifications'
import { useNotificationFeed } from './layout/header/useNotificationFeed'
import type { NotificationFeedItem } from './layout/header/useNotificationFeed'
import type { UserRole } from '@prisma/client'
import { getMaintenancePageForLocation } from '@/lib/config/maintenance-pages'
import { MaintenanceProvider } from '@/components/maintenance/MaintenanceContext'
import { UnderProductionState } from '@/components/ui/under-production-state'

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
  const [incomingNotification, setIncomingNotification] =
    useState<NotificationFeedItem | null>(null)
  const pageUnderMaintenance = getMaintenancePageForLocation(
    pathname,
    new URLSearchParams(searchParams.toString()),
    maintenancePageKeys,
  )
  const { data, error, mutate } = useNotificationFeed()
  const sidebarCounts = data?.sidebarCounts ?? {
    executive: 0,
    logistics: 0,
    finance: 0,
  }

  useEffect(() => {
    if (!data) return

    const currentIds = new Set(data.notifications.map(({ id }) => id))
    if (seenNotificationIds.current === null) {
      seenNotificationIds.current = currentIds
      return
    }

    const newestIncoming = data.notifications.find(
      ({ id, isRead }) => !isRead && !seenNotificationIds.current?.has(id),
    )
    seenNotificationIds.current = currentIds
    if (newestIncoming) setIncomingNotification(newestIncoming)
  }, [data])

  useEffect(() => {
    if (!incomingNotification) return

    const timeoutId = window.setTimeout(
      () => setIncomingNotification(null),
      8_000,
    )
    return () => window.clearTimeout(timeoutId)
  }, [incomingNotification])

  return (
    <MaintenanceProvider enabledKeys={maintenancePageKeys}>
      <div className='flex min-h-screen w-full min-w-0'>
        {incomingNotification && (
          <div
            role='status'
            aria-live='polite'
            className='fixed left-3 right-3 top-4 z-[9999] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl backdrop-blur-md sm:left-auto sm:right-4 sm:top-20 sm:w-96'
          >
            <div className='flex items-start justify-between gap-2'>
              <p className='font-semibold text-sm leading-tight text-foreground'>
                {incomingNotification.title}
              </p>
              <button
                type='button'
                className='-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:text-foreground'
                onClick={() => setIncomingNotification(null)}
                aria-label='Tutup'
              >
                ✕
              </button>
            </div>
            <p className='mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-3'>
              {incomingNotification.message}
            </p>
            <div className='mt-3 flex items-center justify-end gap-2 border-t border-border/50 pt-2'>
              <button
                type='button'
                className='px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
                onClick={() => setIncomingNotification(null)}
              >
                Abaikan
              </button>
              {incomingNotification.actionUrl && (
                <button
                  type='button'
                  className='rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90'
                  onClick={() => {
                    const actionUrl = incomingNotification.actionUrl
                    if (actionUrl) router.push(actionUrl)
                    setIncomingNotification(null)
                  }}
                >
                  Buka Dokumen
                </button>
              )}
            </div>
          </div>
        )}
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
          <div className='body-wrapper flex min-w-0 flex-1 flex-col pt-16 md:pt-0'>
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
            <div className='mx-auto w-full max-w-[1600px] flex-1 min-w-0 px-3.5 pb-20 pt-4 sm:px-6 sm:pb-24 sm:pt-6 xl:pb-8'>
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
