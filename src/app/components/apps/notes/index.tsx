'use client'

import { useEffect, useState } from 'react'
import CardBox from '@/app/components/shared/CardBox'
import NotesSidebar from '@/app/components/apps/notes/NotesSidebar'
import NoteContent from '@/app/components/apps/notes/NoteContent'
import { Icon } from '@iconify/react'
import { NotesType } from '@/app/(DashboardLayout)/types/apps/notes'
import AddNotes from './AddNotes'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'

interface ColorType {
  id: number
  disp: string
  lineColor?: string
}

const NotesApp = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState<NotesType[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const handleClose = () => setIsOpen(false)

  const fetchNotes = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/notes')
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.msg || `Load notes failed with status ${response.status}.`)
      }
      setNotes(result.data)
    } catch (err) {
      console.error('Failed to fetch notes:', err)
      setErrorMessage('Catatan gagal dimuat. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const deleteNote = async (id: string) => {
    try {
      const response = await fetch('/api/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.msg || `Delete note failed with status ${response.status}.`)
      }

      setNotes(prev => prev.filter(note => note.id !== id))
      if (selectedNoteId === id) setSelectedNoteId(null)
      setErrorMessage('')
    } catch (err) {
      console.error('Failed to delete note:', err)
      setErrorMessage('Catatan gagal dihapus. Silakan coba lagi.')
    }
  }

  const colorVariation: ColorType[] = [
    { id: 1, lineColor: 'warning', disp: 'warning' },
    { id: 2, lineColor: 'primary', disp: 'primary' },
    { id: 3, lineColor: 'error', disp: 'error' },
    { id: 4, lineColor: 'success', disp: 'success' },
    { id: 5, lineColor: 'secondary', disp: 'secondary' },
  ]

  useEffect(() => {
    // The async request updates component state after its response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotes()
  }, [])

  const updateNote = async (id: string, title: string, color: string) => {
    try {
      const response = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, color }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.msg || `Update note failed with status ${response.status}.`)
      }
      setNotes(prev => [result.data, ...prev.filter(note => note.id !== id)])
      setErrorMessage('')
    } catch (err) {
      console.error('Failed to update note:', err)
      setErrorMessage('Catatan gagal diperbarui. Silakan coba lagi.')
    }
  }

  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? notes[0] ?? null

  const addNote = async (note: { title: string; color: string }): Promise<boolean> => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.msg || `Create note failed with status ${response.status}.`)
      }
      const newNote: NotesType = result.data
      setNotes(prev => [newNote, ...prev])
      setSelectedNoteId(newNote.id)
      setErrorMessage('')
      return true
    } catch (err) {
      console.error('Failed to add note:', err)
      setErrorMessage('Catatan gagal disimpan. Silakan coba lagi.')
      return false
    }
  }

  return (
    <CardBox className='p-0 overflow-hidden'>
      <div className='flex'>
        {/* Sidebar */}
        <div>
          <Sheet open={isOpen} onOpenChange={handleClose}>
            <SheetContent
              side='left'
              className='max-w-[320px] sm:max-w-[320px] w-full h-full lg:hidden block'
            >
              <NotesSidebar
                notes={notes}
                loading={loading}
                selectedNoteId={selectedNoteId}
                onSelectNote={(id: string) => setSelectedNoteId(id)}
                onDeleteNote={deleteNote}
              />
            </SheetContent>
          </Sheet>
          <div className='max-w-[320px] h-auto lg:block hidden'>
            <NotesSidebar
              notes={notes}
              loading={loading}
              selectedNoteId={selectedNoteId}
              onSelectNote={(id: string) => setSelectedNoteId(id)}
              onDeleteNote={deleteNote}
            />
          </div>
        </div>

        {/* Content */}
        <div className='w-full'>
          <div className='flex justify-between items-center border-b border-ld py-4 px-6'>
            <div className='flex gap-3 items-center'>
              <Button
                color={'lightprimary'}
                onClick={() => setIsOpen(true)}
                className='btn-circle p-0 lg:!hidden flex'
              >
                <Icon icon='tabler:menu-2' height={18} />
              </Button>
              <h6 className='text-base'>Edit Note</h6>
            </div>
            <AddNotes colors={colorVariation} addNote={addNote} />
          </div>

          {errorMessage && (
            <p role='alert' className='px-6 pt-4 text-sm text-destructive'>
              {errorMessage}
            </p>
          )}
          <NoteContent
            key={selectedNote?.id ?? 'empty'}
            note={selectedNote}
            updateNote={updateNote}
          />
        </div>
      </div>
    </CardBox>
  )
}

export default NotesApp
