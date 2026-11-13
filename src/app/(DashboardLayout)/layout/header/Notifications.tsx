'use client'

import { Icon } from '@iconify/react'
import Link from 'next/link'
import SimpleBar from 'simplebar-react'
import 'simplebar-react/dist/simplebar.min.css'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BellTaskReminder } from '@/lib/notification-types'

export type DashboardNotification = BellTaskReminder

const Notifications = ({
  notifications,
}: {
  notifications: DashboardNotification[]
}) => {
  return (
    <div className='relative group/menu px-15'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            aria-label='Notifikasi'
            className='relative rounded-full text-foreground dark:text-muted-foreground hover:text-primary dark:hover:text-primary'
          >
            <span className='relative after:absolute after:w-10 after:h-10 after:rounded-full after:-top-1/2 hover:after:bg-lightprimary dark:hover:after:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:after:bg-lightprimary group-hover/menu:text-primary'>
              <Icon icon='tabler:bell-ringing' height={20} />
            </span>
            {notifications.length > 0 && (
              <span
                aria-hidden='true'
                className='rounded-full absolute -end-[6px] -top-[5px] text-[10px] h-2 w-2 bg-primary'
              />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align='end'
          className='w-screen sm:w-[300px] py-6 rounded-sm border border-border'>
          <div className='flex items-center px-6 justify-between'>
            <h3 className='mb-0 text-lg font-semibold'>Notifikasi</h3>
            <Badge color={'primary'}>{notifications.length} pembaruan</Badge>
          </div>
          <SimpleBar className='max-h-80 mt-3'>
            {notifications.length > 0 ? notifications.map((item) => (
              <DropdownMenuItem
                className='px-6 py-3 flex justify-between items-center bg-hover group/link w-full'
                key={item.id}
                asChild>
                <Link href={item.href} className='w-full'>
                  <div className='flex w-full items-center'>
                    <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-lightprimary text-primary'>
                      <Icon
                        icon={
                          item.category === 'habit'
                            ? 'tabler:checklist'
                            : item.category === 'task'
                              ? 'tabler:calendar-event'
                              : 'tabler:ticket'
                        }
                        height={20}
                      />
                    </span>
                    <div className='min-w-0 ps-4'>
                      <h5 className='mb-1 truncate text-sm group-hover/link:text-primary'>
                        {item.title}
                      </h5>
                      <span className='block truncate text-xs text-muted-foreground'>
                        {item.description}
                      </span>
                      <span className='mt-1 block text-[10px] text-muted-foreground'>
                        {item.time}
                      </span>
                    </div>
                  </div>
                </Link>
              </DropdownMenuItem>
            )) : (
              <p className='px-6 py-8 text-center text-sm text-muted-foreground'>
                Belum ada pembaruan tiket.
              </p>
            )}
          </SimpleBar>
          <div className='px-6 pt-5'>
            <Button asChild variant='outline' className='w-full'>
              <Link href='/apps/tickets'>
                Lihat semua tiket
              </Link>
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default Notifications
