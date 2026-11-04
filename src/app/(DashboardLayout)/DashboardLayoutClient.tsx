'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Header from './layout/header/Header'
import Sidebar from './layout/sidebar/Sidebar'
import type { DashboardNotification } from './layout/header/Notifications'
import { useNotificationFeed } from './layout/header/useNotificationFeed'
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
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

  return (
    <MaintenanceProvider enabledKeys={maintenancePageKeys}>
      <div className='flex min-h-screen w-full min-w-0'>
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
