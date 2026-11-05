'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { getSession, signIn } from 'next-auth/react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getRoleHomePath } from '@/lib/role-home'

const loginSchema = z.object({
  identifier: z.email('Masukkan alamat email yang valid.').trim(),
  password: z.string().min(6, 'Password minimal 6 karakter.'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export const Login = () => {
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  })

  const handleCredentialsSubmit = form.handleSubmit(async ({ identifier, password }) => {
    setError('')
    try {
      const result = await signIn('credentials', {
        identifier: identifier.trim().toLowerCase(),
        password,
        redirect: false,
        redirectTo: '/',
      })
      if (!result?.ok || result.error) {
        const errorCode =
          typeof result?.error === 'string' ? result.error : result?.code
        setError(
          errorCode === 'database-unavailable'
            ? 'Server login tidak dapat terhubung ke database. Coba lagi nanti atau hubungi administrator.'
            : 'Email atau kata sandi tidak sesuai.',
        )
        return
      }

      const session = await getSession()
      if (!session?.user?.role) {
        setError('Login berhasil, tetapi sesi belum dapat diverifikasi. Muat ulang halaman.')
        return
      }

      router.replace(getRoleHomePath(session.user.role))
      router.refresh()
    } catch (error) {
      console.error(
        'Password sign-in request failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      setError('Server login tidak merespons. Muat ulang halaman atau hubungi administrator.')
    }
  })

  return (
    <main className='grid min-h-screen grid-cols-1 font-sans antialiased text-slate-800 lg:grid-cols-2'>
      <section className='relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#102a4d] p-10 text-white lg:flex xl:p-12'>
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay'
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1600&q=85')",
          }}
        />
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-gradient-to-t from-slate-950 via-[#102a4d]/80 to-[#102a4d]/45'
        />

        <div className='relative z-10 flex items-center gap-3'>
          <div className='flex size-12 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm'>
            <Image
              src='/images/logos/logo-notag-full-color.svg'
              alt=''
              width={40}
              height={40}
              priority
              className='size-full object-contain'
            />
          </div>
          <div className='text-xs font-bold uppercase leading-relaxed tracking-[0.14em] text-slate-100 sm:text-sm'>
            PT Skala Prioritas
            <br />
            Engineering
          </div>
        </div>

        <div className='relative z-10 my-auto max-w-xl py-16'>
          <span className='mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-200'>
            <ShieldCheck className='size-4' aria-hidden='true' />
            Portal Operasional Internal
          </span>
          <h1 className='mb-6 text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl'>
            Bekerja Terarah,
            <span className='block bg-gradient-to-r from-orange-300 to-amber-200 bg-clip-text text-transparent'>
              Membangun Lebih Baik.
            </span>
          </h1>
          <p className='max-w-lg text-base leading-relaxed text-slate-200 sm:text-lg'>
            Satu akses untuk mendukung koordinasi proyek, logistik, dan administrasi
            PT Skala Prioritas Engineering secara tertib dan terintegrasi.
          </p>
        </div>

        <div className='relative z-10 border-t border-white/15 pt-5 text-xs leading-relaxed text-slate-300'>
          <p>© {new Date().getFullYear()} PT Skala Prioritas Engineering.</p>
          <p className='mt-1 text-slate-400'>Sistem internal perusahaan. Akses hanya untuk pengguna terdaftar.</p>
        </div>
      </section>

      <section className='flex min-h-screen flex-col items-center justify-center bg-slate-50 p-5 sm:p-8 lg:p-12'>
        <div className='mb-8 flex w-full max-w-[440px] items-center gap-3 lg:hidden'>
          <Image
            src='/images/logos/logo-notag-full-color.svg'
            alt=''
            width={42}
            height={42}
            priority
            className='size-11 object-contain'
          />
          <span className='text-xs font-bold uppercase leading-relaxed tracking-[0.12em] text-[#102a4d]'>
            PT Skala Prioritas
            <br />
            Engineering
          </span>
        </div>

        <div className='w-full max-w-[440px] rounded-2xl bg-white p-7 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/70 sm:p-9'>
          <div className='mb-8'>
            <p className='mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#e87524]'>
              Akses sistem
            </p>
            <h2 className='text-2xl font-extrabold tracking-tight text-slate-950 sm:text-[1.75rem]'>
              Selamat Datang Kembali
            </h2>
            <p className='mt-2 text-sm leading-relaxed text-slate-500'>
              Masuk untuk melanjutkan pekerjaan Anda di portal Skala Prioritas Engineering.
            </p>
          </div>

          <form onSubmit={handleCredentialsSubmit} noValidate className='space-y-5'>
            <Controller
              control={form.control}
              name='identifier'
              render={({ field }) => (
                <div className='space-y-2'>
                  <label
                    htmlFor='identifier'
                    className='text-xs font-bold uppercase tracking-wider text-slate-700 dark:!text-slate-700'
                  >
                    Email
                  </label>
                  <div className='relative'>
                    <Mail
                      aria-hidden='true'
                      className='pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400'
                    />
                    <Input
                      id='identifier'
                      type='email'
                      autoComplete='email'
                      placeholder='nama@perusahaan.com'
                      aria-invalid={!!form.formState.errors.identifier}
                      aria-describedby={
                        form.formState.errors.identifier ? 'identifier-error' : undefined
                      }
                      disabled={form.formState.isSubmitting}
                      variant='gray'
                      className='h-12 rounded-xl border-slate-200 bg-slate-50 pl-11 text-sm text-slate-800 placeholder:text-slate-400 dark:!bg-slate-50 dark:!text-slate-800 dark:placeholder:!text-slate-400 focus-visible:border-orange-500 focus-visible:bg-white focus-visible:ring-orange-500/20'
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value ?? ''}
                    />
                  </div>
                  {form.formState.errors.identifier && (
                    <p id='identifier-error' className='text-sm text-destructive' role='alert'>
                      {form.formState.errors.identifier.message}
                    </p>
                  )}
                </div>
              )}
            />

            <Controller
              control={form.control}
              name='password'
              render={({ field }) => (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <label
                      htmlFor='password'
                      className='text-xs font-bold uppercase tracking-wider text-slate-700 dark:!text-slate-700'
                    >
                      Kata Sandi
                    </label>
                    <span className='text-right text-xs text-slate-500'>
                      Lupa kata sandi? Hubungi administrator.
                    </span>
                  </div>
                  <div className='relative'>
                    <LockKeyhole
                      aria-hidden='true'
                      className='pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400'
                    />
                    <Input
                      id='password'
                      type={showPassword ? 'text' : 'password'}
                      autoComplete='current-password'
                      placeholder='Masukkan kata sandi'
                      aria-invalid={!!form.formState.errors.password}
                      aria-describedby={
                        form.formState.errors.password ? 'password-error' : undefined
                      }
                      disabled={form.formState.isSubmitting}
                      variant='gray'
                      className='h-12 rounded-xl border-slate-200 bg-slate-50 pl-11 pr-11 text-sm text-slate-800 placeholder:text-slate-400 dark:!bg-slate-50 dark:!text-slate-800 dark:placeholder:!text-slate-400 focus-visible:border-orange-500 focus-visible:bg-white focus-visible:ring-orange-500/20'
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value ?? ''}
                    />
                    <button
                      type='button'
                      className='absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={form.formState.isSubmitting}
                    >
                      {showPassword ? (
                        <EyeOff className='size-4' aria-hidden='true' />
                      ) : (
                        <Eye className='size-4' aria-hidden='true' />
                      )}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p id='password-error' className='text-sm text-destructive' role='alert'>
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
              )}
            />

            {error && (
              <p
                className='rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
                role='alert'
              >
                {error}
              </p>
            )}

            <Button
              className='h-12 w-full rounded-xl bg-[#f26522] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#df581a] focus-visible:ring-orange-500 focus-visible:ring-offset-2'
              type='submit'
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <LoaderCircle className='size-4 animate-spin' aria-hidden='true' />
                  Memeriksa akun...
                </>
              ) : (
                <>
                  Masuk ke Portal
                  <ArrowRight className='size-4' aria-hidden='true' />
                </>
              )}
            </Button>
          </form>

          <div className='mt-8 border-t border-slate-100 pt-5 text-center'>
            <p className='text-xs leading-relaxed text-slate-500'>
              Belum memiliki akses? Hubungi administrator perusahaan untuk bantuan.
            </p>
          </div>
        </div>

        <div className='mt-6 flex items-center gap-2 text-slate-400'>
          <ShieldCheck className='size-4 text-[#e87524]' aria-hidden='true' />
          <span className='text-[11px] font-medium tracking-wide'>
            Akses aman untuk pengguna terdaftar
          </span>
        </div>
      </section>
    </main>
  )
}
