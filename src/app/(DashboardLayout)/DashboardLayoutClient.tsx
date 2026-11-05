'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Header from './layout/header/Header'
import Sidebar from './layout/sidebar/Sidebar'
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
            className='fixed right-4 top-20 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-4 text-foreground shadow-lg'
          >
            <p className='font-semibold'>{incomingNotification.title}</p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {incomingNotification.message}
            </p>
            <div className='mt-3 flex justify-end gap-2'>
              <button
                type='button'
                className='text-sm text-muted-foreground hover:text-foreground'
                onClick={() => setIncomingNotification(null)}
              >
                Tutup
              </button>
              {incomingNotification.actionUrl && (
                <button
                  type='button'
                  className='text-sm font-medium text-primary hover:underline'
                  onClick={() => {
                    const actionUrl = incomingNotification.actionUrl
                    if (actionUrl) router.push(actionUrl)
                    setIncomingNotification(null)
                  }}
                >
                  Buka
                </button>
              )}
            </div>
          </div>
        )}
        <div className='page-wrapper flex min-w-0 flex-1'>
          <div className='hidden xl:block xl:w-0 xl:shrink-0'>
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
            />
          </div>
          <div className='body-wrapper min-w-0 flex-1'>
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
              sidebarCounts={sidebarCounts}
              notificationFeed={data ?? null}
              notificationLoadFailed={Boolean(error)}
              refreshNotifications={mutate}
            />
            <div className='container mx-auto w-full min-w-0 px-4 py-8 sm:px-6 sm:py-10 xl:py-30'>
              {pageUnderMaintenance ? (
                <UnderProductionState
                  className='mx-auto w-full max-w-[1200px]'
                  footerText={`MAINTENANCE · ${pageUnderMaintenance.name}`}
                />
              ) : (
                children
              )}
            </div>
          </div>
        </div>
      </div>
    </MaintenanceProvider>
  )
}
