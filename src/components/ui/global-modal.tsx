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
          "bg-background/80 backdrop-blur-sm",
          overlayClassName,
        )}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-popover p-0 text-popover-foreground shadow-2xl",
          "[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-lg [&>button:last-child]:bg-muted [&>button:last-child]:p-2 [&>button:last-child]:text-muted-foreground [&>button:last-child]:hover:bg-accent [&>button:last-child]:hover:text-accent-foreground",
          className,
        )}
      >
        <DialogHeader
          className={cn(
            "shrink-0 flex-row items-start justify-between gap-4 space-y-0 border-b border-border bg-muted px-6 py-5 pr-16",
            hideHeader && "hidden",
          )}
        >
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              {icon ?? <FolderOpen aria-hidden="true" className="size-5" />}
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain space-y-5 p-6",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 flex flex-col items-center justify-between gap-4 border-t border-border bg-muted px-6 py-5 sm:flex-row">
            {footerNote ? (
              <span className="text-center text-[10px] font-medium leading-normal text-muted-foreground sm:text-left">
                {footerNote}
              </span>
            ) : null}
            <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
              {footer}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
