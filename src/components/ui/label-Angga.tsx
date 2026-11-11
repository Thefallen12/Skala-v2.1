"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

function renderLabelChildren(children: React.ReactNode) {
  return React.Children.map(children, (child) =>
    typeof child === "string" && child.trim() ? (
      <span data-slot="label-text">{child}</span>
    ) : (
      child
    )
  )
}

function Label({
  className,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex text-link dark:text-white items-center gap-2 text-sm leading-none font-semibold select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {renderLabelChildren(children)}
    </LabelPrimitive.Root>
  )
}

function FormLabel({
  children,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label {...props} data-slot="label">
      {renderLabelChildren(children)}
    </label>
  )
}

export { FormLabel, Label }
