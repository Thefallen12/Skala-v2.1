'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Search as SearchIcon, X } from 'lucide-react'
import SimpleBar from 'simplebar-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

import SidebarContent, {
  isMenuItemAllowed,
  type ChildItem,
  type MenuAccessFlags,
  type MenuItem,
} from '../sidebar/sidebaritems'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SearchResult {
  name: string
  subtitle?: string
  url: string
  path: string | undefined
  icon?: string
}

function SearchResultRow({
  item,
  onSelect,
}: {
  item: SearchResult
  onSelect: () => void
}) {
  return (
    <Link
      href={item.url}
      onClick={onSelect}
      className='flex min-h-11 w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
        <Icon
          icon={item.icon ?? 'solar:widget-2-bold-duotone'}
          width={17}
          height={17}
        />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='type-p2 truncate font-semibold text-foreground'>
          {item.name}
        </p>
        <p className='type-p3 truncate text-muted-foreground'>
          {item.subtitle || item.path}
        </p>
      </div>
    </Link>
  )
}

function SearchResultsList({
  items,
  query,
  onSelect,
}: {
  items: SearchResult[]
  query: string
  onSelect: () => void
}) {
  if (items.length === 0) {
    return (
      <div className='type-p3 py-6 text-center text-muted-foreground'>
        Modul &ldquo;{query}&rdquo; tidak ditemukan atau tidak tersedia untuk
        peran Anda.
      </div>
    )
  }

  return (
    <div className='space-y-1'>
      {!query.trim() && (
        <p className='type-p3 px-2 pb-1 font-bold uppercase tracking-wider text-muted-foreground'>
          Pintasan Modul
        </p>
      )}
      {items.map((item) => (
        <SearchResultRow key={item.url} item={item} onSelect={onSelect} />
      ))}
    </div>
  )
}

function collectAllowedItems(
  items: (MenuItem | ChildItem)[],
  permissions: MenuAccessFlags,
  parentPath = ''
): SearchResult[] {
  let results: SearchResult[] = []

  items.forEach((item) => {
    const label = (item as MenuItem).heading || item.name || ''
    const currentPath = parentPath ? `${parentPath} → ${label}` : label

    if (item.url && isMenuItemAllowed(item as ChildItem, permissions)) {
      results.push({
        name: item.name ?? '',
        subtitle: (item as ChildItem).subtitle ?? '',
        url: item.url,
        path: parentPath,
        icon: item.icon,
      })
    }

    if (item.children) {
      results = [
        ...results,
        ...collectAllowedItems(item.children, permissions, currentPath),
      ]
    }
  })

  return results
}

function Search({
  canManageUsers = false,
  canAccessLogistics = false,
  canAccessExecutive = false,
  canAccessFinance = false,
  canAccessProjects = false,
  canAccessDrafter = false,
  isMover = false,
  allowedMenuKeys,
}: MenuAccessFlags = {}) {
  const [query, setQuery] = useState('')
  const [desktopFocused, setDesktopFocused] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)

  const allowedItems = useMemo(() => {
    const items = collectAllowedItems(SidebarContent, {
      canManageUsers,
      canAccessLogistics,
      canAccessExecutive,
      canAccessFinance,
      canAccessProjects,
      canAccessDrafter,
      isMover,
      allowedMenuKeys,
    })

    items.push({
      name: 'Profil',
      subtitle: 'Akun & Preferensi',
      url: '/user-profile',
      path: 'Akun',
      icon: 'solar:user-circle-bold-duotone',
    })

    return items
  }, [
    allowedMenuKeys,
    canAccessDrafter,
    canAccessExecutive,
    canAccessFinance,
    canAccessLogistics,
    canAccessProjects,
    canManageUsers,
    isMover,
  ])

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return allowedItems.slice(0, 8)
    return allowedItems.filter(
      (item) =>
        item.name.toLowerCase().includes(trimmed) ||
        (item.subtitle ?? '').toLowerCase().includes(trimmed) ||
        (item.path ?? '').toLowerCase().includes(trimmed)
    )
  }, [allowedItems, query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const inlineEl = inlineInputRef.current
        if (inlineEl && inlineEl.offsetParent !== null) {
          inlineEl.focus()
          inlineEl.select()
          setDesktopFocused(true)
        } else {
          setDialogOpen(true)
        }
        return
      }

      if (event.key === 'Escape' && desktopFocused) {
        setDesktopFocused(false)
        setQuery('')
        inlineInputRef.current?.blur()
      }
    }

    const onOpenSearchModal = () => {
      setDialogOpen(true)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('skala:open-search', onOpenSearchModal)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('skala:open-search', onOpenSearchModal)
    }
  }, [desktopFocused])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDesktopFocused(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (!dialogOpen) return
    const timer = window.setTimeout(() => {
      modalInputRef.current?.focus()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [dialogOpen])

  const showDesktopDropdown =
    desktopFocused && (Boolean(query.trim()) || allowedItems.length > 0)

  const handleSelectItem = () => {
    setQuery('')
    setDesktopFocused(false)
    setDialogOpen(false)
  }

  return (
    <>
      <div ref={containerRef} className='relative w-full'>
        <div className='relative flex items-center'>
          <SearchIcon
            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />

          <Input
            ref={inlineInputRef}
            type='search'
            aria-label='Cari modul atau halaman'
            placeholder='Cari modul (Proyek, Tiket, Kas)...'
            className='type-p2 h-9 rounded-lg border-border bg-card pl-9 pr-16 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25'
            value={query}
            onFocus={() => setDesktopFocused(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setDesktopFocused(true)
            }}
          />

          {query ? (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              data-compact='true'
              aria-label='Hapus kata kunci pencarian'
              onClick={() => {
                setQuery('')
                inlineInputRef.current?.focus()
              }}
              className='absolute right-2 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground'
            >
              <X className='size-3.5' aria-hidden='true' />
            </Button>
          ) : (
            <kbd className='pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground xl:inline-flex'>
              Ctrl+K
            </kbd>
          )}
        </div>

        {showDesktopDropdown && (
          <div className='absolute start-0 top-11 z-40 w-80 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl'>
            <SimpleBar className='max-h-72 p-2.5'>
              <SearchResultsList
                items={results}
                query={query}
                onSelect={handleSelectItem}
              />
            </SimpleBar>
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen)
          if (!nextOpen) setQuery('')
        }}
      >
        <DialogContent className='top-6 translate-y-0 sm:top-1/2 sm:-translate-y-1/2 sm:max-w-md'>
          <DialogHeader className='pr-8'>
            <DialogTitle className='type-h2'>Cari Modul</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>
                Cari dan buka halaman yang diizinkan untuk peran Anda.
              </DialogDescription>
            </VisuallyHidden>
          </DialogHeader>

          <div className='relative flex items-center'>
            <SearchIcon
              className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
              aria-hidden='true'
            />
            <Input
              ref={modalInputRef}
              type='search'
              aria-label='Cari modul atau halaman'
              placeholder='Ketik nama modul (Proyek, Logistik, Kas)...'
              className='type-p1 h-10 rounded-lg border-border bg-card pl-9 pr-9 text-foreground placeholder:text-muted-foreground'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                data-compact='true'
                aria-label='Hapus kata kunci pencarian'
                onClick={() => {
                  setQuery('')
                  modalInputRef.current?.focus()
                }}
                className='absolute right-2 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground'
              >
                <X className='size-3.5' aria-hidden='true' />
              </Button>
            )}
          </div>

          <SimpleBar className='max-h-[55dvh] pr-1'>
            <SearchResultsList
              items={results}
              query={query}
              onSelect={handleSelectItem}
            />
          </SimpleBar>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default Search
