'use client'

import { useState } from 'react'
import { DialogFooter } from '@/components/ui/dialog'
import { GlobalModal } from '@/components/ui/global-modal'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TbCheck } from 'react-icons/tb'

interface Color {
  disp: string
}

interface Props {
  colors: Color[]
  addNote: (note: { title: string; color: string }) => Promise<boolean>
}

const colorClassMap: Record<string, string> = {
  primary: 'bg-lightprimary',
  warning: 'bg-lightwarning',
  error: 'bg-lighterror',
  success: 'bg-lightsuccess',
  secondary: 'bg-lightsecondary',
}

const AddNotes = ({ colors, addNote }: Props) => {
  const [openNoteModal, setOpenNoteModal] = useState(false)
  const [scolor, setScolor] = useState<string>('primary')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const setColor = (e: string) => setScolor(e)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (await addNote({ title: title.trim(), color: scolor })) {
        setOpenNoteModal(false)
        setTitle('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size='sm' className='rounded-lg' onClick={() => setOpenNoteModal(true)}>
        + Catatan Baru
      </Button>
      <GlobalModal
        isOpen={openNoteModal}
        onClose={() => setOpenNoteModal(false)}
        title='Tambah Catatan Baru'
        description='Simpan catatan singkat operasional atau pengingat kerja.'
        className='sm:max-w-lg'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setOpenNoteModal(false)}
            >
              Batal
            </Button>
            <Button
              disabled={!title.trim() || saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Menyimpan...' : 'Simpan Catatan'}
            </Button>
          </>
        }
      >
        <div className='space-y-3'>
          <Textarea
            rows={5}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className='w-full'
            placeholder='Tulis catatan Anda di sini...'
          />
          <div>
            <h6 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>
              Pilih Warna Label
            </h6>
            <div className='flex gap-2.5 items-center'>
              {colors?.map((color) => (
                <div
                  key={color.disp}
                  onClick={() => setColor(color.disp)}
                  className={`h-7 w-7 flex justify-center items-center rounded-full cursor-pointer ${
                    scolor === color.disp ? 'ring-2 ring-primary ring-offset-2' : ''
                  } ${colorClassMap[color.disp] ?? colorClassMap.primary}`}
                >
                  {scolor === color.disp && (
                    <TbCheck size={16} className='text-foreground' />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlobalModal>
    </>
  )
}

export default AddNotes
