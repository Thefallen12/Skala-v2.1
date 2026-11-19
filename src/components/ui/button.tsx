import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ring-offset-background transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:cursor-pointer select-none active:scale-[0.98] touch-manipulation',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primaryemphasis',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground',
        outlinesecondary:
          'border border-secondary text-secondary bg-transparent hover:bg-secondary hover:text-white',
        outlinesuccess:
          'border border-success bg-transparent hover:bg-success text-success hover:text-white',
        outlinewarning:
          'border border-warning bg-transparent hover:bg-warning text-warning hover:text-white',
        outlineinfo:
          'border border-info bg-transparent hover:bg-info text-info hover:text-white',
        outlineerror:
          'border border-error bg-transparent hover:bg-error text-error hover:text-white',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondaryemphasis font-semibold',
        success: 'bg-success text-white hover:bg-successemphasis dark:text-slate-950 font-semibold',
        warning: 'bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300 font-semibold',
        info: 'bg-info text-white hover:bg-infoemphasis dark:text-slate-950 font-semibold',
        error: 'bg-error text-white hover:bg-erroremphasis dark:text-slate-950 font-semibold',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        ghostprimary: 'hover:bg-lightprimary hover:text-primary text-primary',
        ghostsecondary:
          'hover:bg-lightsecondary hover:text-secondary text-secondary',
        ghostsuccess: 'hover:bg-lightsuccess hover:text-success text-success',
        ghostwarning: 'hover:bg-lightwarning hover:text-warning text-warning',
        ghosterror: 'hover:bg-lighterror hover:text-error text-error',
        ghostinfo: 'hover:bg-lightinfo hover:text-info text-info',
        link: 'text-primary underline-offset-4 hover:underline',
        lightprimary:
          'bg-lightprimary text-primary hover:bg-primary hover:text-primary-foreground',
        lightsecondary:
          'bg-lightsecondary text-secondary hover:bg-secondary hover:text-secondary-foreground',
        lightsuccess:
          'bg-lightsuccess text-success hover:bg-success hover:text-white',
        lightwarning:
          'bg-lightwarning text-warning hover:bg-warning hover:text-white',
        lightinfo: 'bg-lightinfo text-info hover:bg-info hover:text-white',
        lighterror: 'bg-lighterror text-error hover:bg-error hover:text-white',
      },
      size: {
        default: 'h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-[13px]',
        xs: 'h-7 rounded px-2 text-[11px] [&_svg]:size-3.5',
        sm: 'h-8 rounded-md px-2.5 text-xs',
        lg: 'h-10 rounded-md px-5 text-xs sm:h-11 sm:px-6 sm:text-sm',
        icon: 'size-8 p-0 sm:size-9',
      },
      shape: {
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        data-slot="button"
        data-size={size || 'default'}
        className={cn(buttonVariants({ variant, size, shape, className }))}
        ref={ref}
        // Ekstensi browser (autofill/password manager) menyisipkan atribut
        // seperti fdprocessedid sebelum hidrasi; abaikan mismatch atribut tombol.
        suppressHydrationWarning
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
