"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  icon?: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  overlayClassName?: string;
  footerNote?: string;
  hideHeader?: boolean;
}

export function GlobalModal({
  isOpen,
  onClose,
  onOpenChange,
  title,
  icon,
  description,
  children,
  footer,
  className,
  bodyClassName,
  overlayClassName,
  footerNote = "* Pastikan data yang dimasukkan telah sesuai.",
  hideHeader = false,
}: GlobalModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (onOpenChange) {
          onOpenChange(open);
          return;
        }
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName={cn(
          "bg-black/60 backdrop-blur-xs",
          overlayClassName,
        )}
        className={cn(
          "flex max-h-[calc(100dvh-1.25rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-popover p-0 text-popover-foreground shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:w-[calc(100vw-2rem)]",
          "[&>button:last-child]:right-3.5 [&>button:last-child]:top-3.5 [&>button:last-child]:rounded-lg [&>button:last-child]:bg-muted [&>button:last-child]:p-2 [&>button:last-child]:text-muted-foreground [&>button:last-child]:hover:bg-accent [&>button:last-child]:hover:text-accent-foreground sm:[&>button:last-child]:right-4 sm:[&>button:last-child]:top-4",
          className,
        )}
      >
        <DialogHeader
          className={cn(
            "shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-border bg-muted/60 px-4 py-3.5 pr-12 sm:px-6 sm:py-4 sm:pr-14",
            hideHeader && "hidden",
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-10">
              {icon ?? <FolderOpen aria-hidden="true" className="size-4 sm:size-5" />}
            </span>
            <div className="min-w-0 space-y-0.5">
              <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground sm:text-lg">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain space-y-4 p-4 sm:space-y-5 sm:p-6",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 flex flex-col-reverse items-stretch justify-between gap-2.5 border-t border-border bg-muted/60 px-4 py-3.5 sm:flex-row sm:items-center sm:px-6 sm:py-4">
            {footerNote ? (
              <span className="hidden text-[11px] font-medium leading-normal text-muted-foreground sm:inline">
                {footerNote}
              </span>
            ) : null}
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-initial">
              {footer}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
