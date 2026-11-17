'use client'

import Link from 'next/link'
import { Icon } from '@iconify/react'
import * as profileData from './data'
import SimpleBar from 'simplebar-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { logout } from '@/app/actions/auth'
import { UserRole } from '@prisma/client'
import { SETTINGS_MENU_ROLES } from '@/lib/config/menus'
import { ANDROID_APK } from '@/lib/apk-config'
import { handleApkLinkClick } from '@/lib/apk-update-client'
import { openDevicePermissionsDialog } from '@/lib/native-bridge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const roleLabels: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: 'Direktur',
  [UserRole.DEPUTY_DIRECTOR]: 'Wakil Direktur',
  [UserRole.DRAFTER]: 'Drafter',
  [UserRole.FINANCE]: 'Keuangan',
  [UserRole.LOGISTICS]: 'Koordinator Logistik',
  [UserRole.KOORDINATOR]: 'Koordinator Lapangan',
  [UserRole.FIELD_TEAM]: 'Tim Lapangan',
  [UserRole.MOVER]: 'Mover',
  [UserRole.ADMINISTRATIONS]: 'Administrasi',
}

const Profile = ({
  canManageUsers,
  profilePhotoUrl,
  userName,
  userRole,
  allowedMenuKeys,
  androidDownloadUrl,
}: {
  canManageUsers: boolean;
  profilePhotoUrl: string | null;
  userName: string;
  userRole: UserRole;
  allowedMenuKeys?: string[];
  androidDownloadUrl?: string | null;
}) => {
  const canOpenSettings =
    SETTINGS_MENU_ROLES.includes(userRole) &&
    (!allowedMenuKeys || allowedMenuKeys.includes('settings'))
  const canOpenNotes = !allowedMenuKeys || allowedMenuKeys.includes('notes')

  return (
    <div className='relative group/menu shrink-0 border-l border-border pl-2 sm:pl-4'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            suppressHydrationWarning
            className='flex cursor-pointer items-center gap-2 rounded-xl px-1.5 py-1 text-left text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:px-2'>
            <Avatar className='size-[35px] border border-border'>
              <AvatarImage src={profilePhotoUrl ?? undefined} alt='' className='object-cover' />
              <AvatarFallback className='text-xs font-semibold'>
                {userName
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className='sr-only xl:hidden'>
              Menu profil {userName} ({roleLabels[userRole]})
            </span>
            <span className='hidden min-w-0 flex-col text-left xl:flex'>
              <span className='max-w-40 truncate text-sm font-semibold text-foreground'>
                {userName}
              </span>
              <span className='text-xs text-muted-foreground'>{roleLabels[userRole]}</span>
            </span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align='end'
          className='w-[280px] overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl'>
          <div className='border-b border-border bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3.5 text-center'>
            <p className='truncate text-sm font-bold text-popover-foreground'>{userName}</p>
            <span className='mt-1 inline-flex max-w-full truncate rounded-md bg-[#0F2C59] px-2.5 py-0.5 text-[11px] font-medium text-white dark:bg-slate-800'>
              {roleLabels[userRole]}
            </span>
          </div>

          <SimpleBar className='max-h-[380px]'>
            <div className='p-1'>
              {canManageUsers && (
                <DropdownMenuItem asChild>
                  <Link
                    href='/apps/settings?tab=users'
                    className='px-3 py-1.5 flex items-center group/link w-full text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  >
                    <div className='flex items-center gap-2.5 w-full'>
                      <Icon
                        icon='tabler:user-plus'
                        className='text-base text-muted-foreground group-hover/link:text-accent-foreground'
                      />
                      <span>Kelola Akun</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              )}
              {profileData.profileDD
                .filter((item) => {
                  if (item.url === '/apps/settings') return canOpenSettings
                  if (item.url === '/apps/notes') return canOpenNotes
                  return true
                })
                .map((item, index) => (
                  <DropdownMenuItem key={index} asChild>
                    <Link
                      href={item.url}
                      className='px-3 py-1.5 flex items-center group/link w-full text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground'>
                      <div className='flex items-center gap-2.5 w-full'>
                        <Icon
                          icon={item.icon}
                          className='text-base text-muted-foreground group-hover/link:text-accent-foreground'
                        />
                        <span>
                          {item.url === '/apps/settings' ? 'Pengaturan Sistem' : item.title}
                        </span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem
                onSelect={() => openDevicePermissionsDialog()}
                className='px-3 py-1.5 flex items-center group/link w-full cursor-pointer text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground'>
                <div className='flex items-center gap-2.5 w-full'>
                  <Icon
                    icon='tabler:bell-cog'
                    className='text-base text-muted-foreground group-hover/link:text-accent-foreground'
                  />
                  <span>Izin &amp; Suara Notifikasi</span>
                </div>
              </DropdownMenuItem>
              {androidDownloadUrl && (
                <DropdownMenuItem asChild>
                  <a
                    href={androidDownloadUrl}
                    download={ANDROID_APK.fileName}
                    onClick={(event) => {
                      handleApkLinkClick(event, androidDownloadUrl)
                    }}
                    className='px-3 py-1.5 flex items-center justify-between group/link w-full text-xs text-primary hover:bg-accent hover:text-accent-foreground'>
                    <span className='flex items-center gap-2.5'>
                      <Icon
                        icon='tabler:device-mobile-down'
                        className='text-base text-primary'
                      />
                      <span className='font-medium'>Unduh APK Android</span>
                    </span>
                    <span className='rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary'>
                      {ANDROID_APK.label}
                    </span>
                  </a>
                </DropdownMenuItem>
              )}
            </div>
          </SimpleBar>

          <DropdownMenuSeparator className='my-1 bg-border' />

          <form action={logout} className='p-2'>
            <Button
              type='submit'
              variant='outline'
              size='sm'
              className='w-full rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10'>
              Keluar
            </Button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default Profile
