"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { FolderOpen, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const MOBILE_MODAL_MEDIA_QUERY = "(max-width: 639px)";

function subscribeMobileMedia(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(MOBILE_MODAL_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getMobileMediaSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_MODAL_MEDIA_QUERY).matches;
}

function getServerMobileMediaSnapshot() {
  return false;
}

function stripDrawerLayoutClasses(className?: string): string {
  if (!className) return "";
  return className
    .split(/\s+/)
    .filter(
      (token) =>
        Boolean(token) &&
        !/^(?:sm:|md:|lg:|xl:|2xl:)?(?:max-w-|w-\[|max-h-|rounded-|p-\d|px-|py-)/.test(
          token,
        ),
    )
    .join(" ");
}

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
  /** On phones (<640px), automatically render a Vaul swipe-to-close bottom sheet. */
  mobileBehavior?: "drawer" | "dialog";
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
  mobileBehavior = "drawer",
}: GlobalModalProps) {
  const isMobileViewport = useSyncExternalStore(
    subscribeMobileMedia,
    getMobileMediaSnapshot,
    getServerMobileMediaSnapshot,
  );

  const handleOpenChange = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
      return;
    }
    if (!open) onClose();
  };

  if (isMobileViewport && mobileBehavior === "drawer") {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={handleOpenChange}
        direction="bottom"
        dismissible
        shouldScaleBackground={false}
      >
        <DrawerContent
          overlayClassName={cn(
            "bg-black/60 backdrop-blur-xs",
            overlayClassName,
          )}
          className={cn(
            "flex max-h-[92dvh] w-full flex-col gap-0 overflow-hidden rounded-t-2xl border-t border-border bg-popover p-0 text-popover-foreground shadow-2xl data-[vaul-drawer-direction=bottom]:mt-4 data-[vaul-drawer-direction=bottom]:max-h-[92dvh]",
            stripDrawerLayoutClasses(className),
          )}
        >
          {hideHeader ? (
            <>
              <DrawerTitle className="sr-only">
                {typeof title === "string" && title.trim() ? title : "Dialog"}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {description || "Konten modal"}
              </DrawerDescription>
            </>
          ) : (
            <DrawerHeader className="relative shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-border bg-muted/60 px-4 py-3 pr-12 text-left">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {icon ?? <FolderOpen aria-hidden="true" className="size-4" />}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <DrawerTitle className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
                    {title}
                  </DrawerTitle>
                  {description ? (
                    <DrawerDescription className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </DrawerDescription>
                  ) : null}
                </div>
              </div>
              <DrawerClose
                aria-label="Tutup"
                className="absolute right-3 top-3 rounded-lg bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </DrawerClose>
            </DrawerHeader>
          )}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-y-contain space-y-4 p-4",
              !footer && "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <DrawerFooter className="mt-0 shrink-0 border-t border-border bg-muted/60 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]">
              <div className="flex w-full flex-wrap items-center justify-end gap-2 [&>button]:flex-1">
                {footer}
              </div>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
