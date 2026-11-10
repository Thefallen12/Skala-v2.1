'use client'

import { FormLabel } from '@/components/ui/label'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { signIn } from 'next-auth/react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import LoadingOverlay from '@/components/ui/loading-overlay'

const loginSchema = z.object({
  identifier: z.string().min(1, 'Masukkan alamat email.').email('Masukkan alamat email yang valid.').trim(),
  password: z.string().min(1, 'Password harus diisi.'),
})

type LoginFormValues = z.infer<typeof loginSchema>
const LOGIN_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export const Login = () => {
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const router = useRouter()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  })

  const performSignIn = async (identifier: string, password: string) => {
    setError('')
    setIsAuthenticating(true)
    try {
      const outcome = await withTimeout(
        (async () => {
          const result = await signIn('credentials', {
            identifier: identifier.trim().toLowerCase(),
            password,
            redirect: false,
            redirectTo: '/',
          })
          if (!result?.ok || result.error) {
            return {
              type: 'credentials-error' as const,
              errorCode: typeof result?.error === 'string' ? result.error : result?.code,
            }
          }
          return { type: 'success' as const }
        })(),
        LOGIN_TIMEOUT_MS,
      )

      if (outcome.type === 'credentials-error') {
        setIsAuthenticating(false)
        setError('Email atau kata sandi tidak sesuai. Silakan periksa kembali.')
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      console.error('Sign-in exception:', err)
      setIsAuthenticating(false)
      setError('Terjadi kendala saat menghubungkan ke akun. Silakan coba kembali.')
    }
  }

  const handleCredentialsSubmit = form.handleSubmit(async ({ identifier, password }) => {
    await performSignIn(identifier, password)
  })

  return (
    <main className='relative min-h-screen bg-slate-100 font-sans text-slate-800 lg:grid lg:grid-cols-12'>
      {isAuthenticating && (
        <LoadingOverlay
          label='Memverifikasi hak akses dan memuat modul operasional...'
        />
      )}

      {/* Brand Hero Panel */}
      <section className='relative hidden flex-col justify-between overflow-hidden bg-[#0F2C59] p-10 text-white lg:col-span-5 lg:flex xl:p-14'>
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-[#0F2C59] to-[#0A192F]'
        />

        <div className='relative z-10 flex items-center gap-3.5'>
          <div className='flex size-11 items-center justify-center rounded-xl bg-white p-2 shadow-sm'>
            <Image
              src='/images/logos/logo-notag-full-color.svg'
              alt='Skala Prioritas Logo'
              width={36}
              height={36}
              priority
              className='size-full object-contain'
            />
          </div>
          <div>
            <div className='text-sm font-bold tracking-tight text-white uppercase'>
              Skala Prioritas Engineering
            </div>
            <div className='text-xs text-slate-300'>Integrated Construction & Logistics ERP</div>
          </div>
        </div>

        <div className='relative z-10 my-auto py-12'>
          <div className='mb-4 inline-flex items-center gap-2 rounded-lg bg-[#F26522]/20 px-3 py-1 text-xs font-semibold tracking-wide text-orange-200 border border-orange-400/30'>
            <ShieldCheck className='size-3.5' aria-hidden='true' />
            Sistem Terpadu Multi-Peran
          </div>
          <h1 className='text-3xl font-extrabold tracking-tight text-white sm:text-4xl xl:text-5xl leading-tight'>
            Bekerja Terarah,
            <span className='block text-[#F26522]'>Membangun Presisi.</span>
          </h1>
          <p className='mt-4 max-w-md text-sm leading-relaxed text-slate-300'>
            Portal manajemen konstruksi lapangan terpadu: perizinan direksi, keuangan proyek, gudang dan logistik, verifikasi QR dokumen, hingga gambar kerja DED.
          </p>

          <div className='mt-8 grid grid-cols-2 gap-3 text-xs'>
            <div className='rounded-lg bg-white/5 p-3 border border-white/10'>
              <div className='font-bold text-white'>Akses Multi-Peran</div>
              <div className='text-slate-400 mt-0.5'>Hak akses terproteksi dan terenkripsi</div>
            </div>
            <div className='rounded-lg bg-white/5 p-3 border border-white/10'>
              <div className='font-bold text-white'>Real-Time Sync</div>
              <div className='text-slate-400 mt-0.5'>Sinkronisasi data lapangan & kantor</div>
            </div>
          </div>
        </div>

        <div className='relative z-10 border-t border-white/10 pt-4 text-xs text-slate-400 flex items-center justify-between'>
          <span>© {new Date().getFullYear()} PT Skala Prioritas Engineering</span>
          <span>v2.1 Enterprise</span>
        </div>
      </section>

      {/* Main Interactive Login Panel */}
      <section className='flex min-h-screen flex-col items-center justify-center p-5 sm:p-8 lg:col-span-7 lg:p-12'>
        <div className='w-full max-w-md'>
          {/* Header Mobile Brand */}
          <div className='mb-6 flex items-center gap-3 lg:hidden'>
            <Image
              src='/images/logos/logo-notag-full-color.svg'
              alt='Skala Prioritas'
              width={38}
              height={38}
              priority
              className='size-9 object-contain'
            />
            <div>
              <span className='text-sm font-bold tracking-tight text-[#0F2C59]'>
                PT Skala Prioritas Engineering
              </span>
              <p className='text-xs text-slate-500'>Sistem Operasional Terpadu</p>
            </div>
          </div>

          <div className='rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8'>
            <div className='border-b border-slate-100 pb-4 mb-6'>
              <h2 className='text-xl font-bold tracking-tight text-slate-900'>
                Masuk ke Sistem
              </h2>
              <p className='text-xs text-slate-500 mt-1'>
                Masukkan email dan kata sandi Anda untuk mengakses akun
              </p>
            </div>

            {error && (
              <div
                className='mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive'
                role='alert'
              >
                {error}
              </div>
            )}

            <form onSubmit={handleCredentialsSubmit} noValidate className='space-y-4'>
              <Controller
                control={form.control}
                name='identifier'
                render={({ field }) => (
                  <div className='space-y-1.5'>
                    <FormLabel
                      htmlFor='identifier'
                      className='text-xs font-semibold text-slate-700'
                    >
                      Email Pengguna
                    </FormLabel>
                    <div className='relative'>
                      <Mail
                        aria-hidden='true'
                        className='pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400'
                      />
                      <Input
                        id='identifier'
                        type='email'
                        autoComplete='email'
                        placeholder='nama@skalaprioritas.com'
                        disabled={form.formState.isSubmitting || isAuthenticating}
                        className='h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm focus-visible:border-[#F26522] focus-visible:bg-white focus-visible:ring-orange-500/20'
                        {...field}
                      />
                    </div>
                    {form.formState.errors.identifier && (
                      <p className='text-xs text-destructive' role='alert'>
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
                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between'>
                      <FormLabel
                        htmlFor='password'
                        className='text-xs font-semibold text-slate-700'
                      >
                        Kata Sandi
                      </FormLabel>
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
                        disabled={form.formState.isSubmitting || isAuthenticating}
                        className='h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-10 text-sm focus-visible:border-[#F26522] focus-visible:bg-white focus-visible:ring-orange-500/20'
                        {...field}
                      />
                      <button
                        type='button'
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        className='absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-600 focus:outline-none'
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                      </button>
                    </div>
                    {form.formState.errors.password && (
                      <p className='text-xs text-destructive' role='alert'>
                        {form.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                )}
              />

              <Button
                className='h-11 w-full rounded-xl bg-[#F26522] text-sm font-semibold text-white shadow-sm hover:bg-[#d65214] mt-2'
                type='submit'
                disabled={form.formState.isSubmitting || isAuthenticating}
              >
                {form.formState.isSubmitting || isAuthenticating ? (
                  <>
                    <LoaderCircle className='size-4 animate-spin mr-2' />
                    Memverifikasi...
                  </>
                ) : (
                  <>
                    Masuk ke Sistem
                    <ArrowRight className='size-4 ml-1.5' />
                  </>
                )}
              </Button>
            </form>

            <div className='mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400'>
              Autentikasi Aman · PT Skala Prioritas Engineering
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Login
