'use client'
import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import SidebarContent, { MenuItem, ChildItem } from '../sidebar/sidebaritems'
import SimpleBar from 'simplebar-react'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface SearchResult {
  name: string
  subtitle?: string
  url: string
  path: string | undefined
  icon?: string
}

function searchItems(
  items: (MenuItem | ChildItem)[],
  q: string,
  parentPath = ''
): SearchResult[] {
  let results: SearchResult[] = []

  items.forEach((item) => {
    const label = (item as MenuItem).heading || item.name || ''
    const currentPath = parentPath ? `${parentPath} → ${label}` : label
    const subtitle = (item as ChildItem).subtitle ?? ''

    if (
      (item.name?.toLowerCase().includes(q.toLowerCase()) ||
        subtitle.toLowerCase().includes(q.toLowerCase())) &&
      item.url
    ) {
      results.push({
        name: item.name ?? '',
        subtitle,
        url: item.url,
        path: parentPath,
        icon: item.icon,
      })
    }

    if (item.children) {
      results = [...results, ...searchItems(item.children, q, currentPath)]
    }
  })

  return results
}

function Search() {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query.trim()) return []
    return searchItems(SidebarContent, query)
  }, [query])

  return (
    <div className='relative w-full'>
      <div className='relative flex items-center'>
        <Icon
          icon='solar:magnifer-linear'
          width={16}
          height={16}
          className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'
        />

        <Input
          placeholder='Cari modul (Proyek, PO, Tiket, Kas)...'
          className='h-9 rounded-lg border-border bg-card pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/25'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type='button'
            onClick={() => setQuery('')}
            className='absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground'
          >
            ✕
          </button>
        )}
      </div>

      {Boolean(query.trim()) && (
        <div className='absolute start-0 top-11 z-40 w-80 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl'>
          <SimpleBar className='max-h-72 p-2.5'>
            {results.length > 0 ? (
              <div className='space-y-1'>
                {results.map((item, i) => (
                  <Link
                    key={i}
                    href={item.url}
                    onClick={() => setQuery('')}
                    className='flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-accent hover:text-accent-foreground'
                  >
                    <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                      <Icon
                        icon={item.icon ?? 'solar:widget-2-bold-duotone'}
                        width={17}
                        height={17}
                      />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-xs font-semibold text-foreground'>
                        {item.name}
                      </p>
                      <p className='truncate text-[11px] text-muted-foreground'>
                        {item.subtitle || item.path}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className='py-6 text-center text-xs text-muted-foreground'>
                Modul &ldquo;{query}&rdquo; tidak ditemukan.
              </div>
            )}
          </SimpleBar>
        </div>
      )}
    </div>
  )
}

export default Search
