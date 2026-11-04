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
}: {
  canManageUsers: boolean;
  profilePhotoUrl: string | null;
  userName: string;
  userRole: UserRole;
}) => {
  return (
    <div className='relative group/menu shrink-0 border-l border-border pl-3 sm:pl-4'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span className='flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1 text-foreground transition hover:bg-accent'>
            <Avatar className='size-[35px] border border-border'>
              <AvatarImage src={profilePhotoUrl ?? undefined} alt='' />
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
            <span className='hidden min-w-0 flex-col text-left xl:flex'>
              <span className='max-w-40 truncate text-sm font-medium text-foreground'>
                {userName}
              </span>
              <span className='text-xs text-muted-foreground'>{roleLabels[userRole]}</span>
            </span>
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align='end'
          className='w-[250px] overflow-hidden rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-lg'>
          <div className='border-b border-border px-4 py-4 text-center'>
            <p className='truncate text-base font-bold text-popover-foreground'>{userName}</p>
            <span className='mt-2 inline-flex max-w-full truncate rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground'>
              {roleLabels[userRole]}
            </span>
          </div>
          <SimpleBar>
            {canManageUsers && (
              <DropdownMenuItem asChild>
                <Link
                  href='/apps/settings?tab=users'
                  className='px-4 py-2 flex items-center group/link w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
                >
                  <div className='flex items-center gap-3 w-full'>
                    <Icon
                      icon='tabler:user-plus'
                      className='text-lg text-muted-foreground group-hover/link:text-accent-foreground'
                    />
                    <h5 className='mb-0 text-sm text-muted-foreground group-hover/link:text-accent-foreground'>
                      Kelola Akun
                    </h5>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}
            {profileData.profileDD
              .filter(
                (item) =>
                  item.url !== '/apps/settings' ||
                  SETTINGS_MENU_ROLES.includes(userRole),
              )
              .map((item, index) => (
              <DropdownMenuItem key={index} asChild>
                <Link
                  href={item.url}
                  className='px-4 py-2 flex justify-between items-center group/link w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'>
                  <div className='flex items-center gap-3 w-full'>
                    <Icon
                      icon={item.icon}
                      className='text-lg text-muted-foreground group-hover/link:text-accent-foreground'
                    />
                    <h5 className='mb-0 text-sm text-muted-foreground group-hover/link:text-accent-foreground'>
                      {item.title}
                    </h5>
                  </div>
                </Link>
              </DropdownMenuItem>
              ))}
          </SimpleBar>

          <DropdownMenuSeparator className='my-2 bg-border' />

          <form action={logout} className='px-4 pb-4'>
            <Button
              type='submit'
              variant='outline'
              className='w-full rounded-md border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground'>
              Keluar
            </Button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default Profile
