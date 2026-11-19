"use client";

import {
  useEffect,
  useId,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
const CLOSE_TOP_MODAL_EVENT = "skala:close-top-modal";
const openGlobalModalStack: string[] = [];

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
  /**
   * On phones (<640px):
   * - "sheet" (default): non-draggable bottom/full sheet safe for long forms & Android IME
   * - "drawer": Vaul swipe-to-close drawer for short confirmations
   * - "dialog": centered modal dialog
   */
  mobileBehavior?: "drawer" | "sheet" | "dialog";
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
  mobileBehavior = "sheet",
}: GlobalModalProps) {
  const isMobileViewport = useSyncExternalStore(
    subscribeMobileMedia,
    getMobileMediaSnapshot,
    getServerMobileMediaSnapshot,
  );
  const modalId = useId();

  useEffect(() => {
    if (!isOpen) return;

    openGlobalModalStack.push(modalId);

    const closeModal = () => {
      if (onOpenChange) {
        onOpenChange(false);
        return;
      }
      onClose();
    };

    const handleCloseEvent = (event: Event) => {
      if (openGlobalModalStack[openGlobalModalStack.length - 1] !== modalId) {
        return;
      }

      const selfNode = Array.from(
        document.querySelectorAll("[data-skala-modal-id]"),
      ).find((el) => el.getAttribute("data-skala-modal-id") === modalId);
      const openLayers = document.querySelectorAll(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
      );
      if (
        selfNode &&
        openLayers.length > 0 &&
        openLayers[openLayers.length - 1] !== selfNode &&
        !selfNode.contains(openLayers[openLayers.length - 1])
      ) {
        return;
      }

      event.preventDefault();
      closeModal();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      handleCloseEvent(event);
    };

    window.addEventListener(CLOSE_TOP_MODAL_EVENT, handleCloseEvent);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(CLOSE_TOP_MODAL_EVENT, handleCloseEvent);
      window.removeEventListener("keydown", handleKeyDown);
      const index = openGlobalModalStack.lastIndexOf(modalId);
      if (index !== -1) {
        openGlobalModalStack.splice(index, 1);
      }
    };
  }, [isOpen, modalId, onClose, onOpenChange]);

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
          data-skala-modal-id={modalId}
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
                  <DrawerTitle className="type-h2 flex items-center gap-2 text-foreground">
                    {title}
                  </DrawerTitle>
                  {description ? (
                    <DrawerDescription className="type-p3 line-clamp-2 text-muted-foreground">
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
            <DrawerFooter className="mt-0 shrink-0 border-t border-border bg-muted/60 px-3.5 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end [&>*:only-child]:col-span-2 [&>*:last-child:nth-child(odd)]:col-span-2 [&>*]:w-full sm:[&>*]:w-auto">
                {footer}
              </div>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  const isMobileSheet = isMobileViewport && mobileBehavior === "sheet";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-skala-modal-id={modalId}
        overlayClassName={cn(
          "bg-black/60 backdrop-blur-xs",
          overlayClassName,
        )}
        className={cn(
          "flex flex-col gap-0 overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-2xl",
          isMobileSheet
            ? "inset-x-0 bottom-0 left-0 top-auto max-h-[94dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-x-0 border-b-0 zoom-in-100 zoom-out-100 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
            : "max-h-[94dvh] w-[calc(100vw-1rem)] max-w-4xl rounded-2xl sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)]",
          "[&>button:last-child]:right-3.5 [&>button:last-child]:top-3.5 [&>button:last-child]:rounded-lg [&>button:last-child]:bg-muted [&>button:last-child]:p-2 [&>button:last-child]:text-muted-foreground [&>button:last-child]:hover:bg-accent [&>button:last-child]:hover:text-accent-foreground sm:[&>button:last-child]:right-4 sm:[&>button:last-child]:top-4",
          isMobileSheet ? stripDrawerLayoutClasses(className) : className,
        )}
      >
        <DialogHeader
          className={cn(
            "sticky top-0 z-10 shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-border bg-muted/60 px-3.5 py-2.5 pr-12 backdrop-blur-sm sm:px-6 sm:py-4 sm:pr-14",
            hideHeader && "hidden",
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-10">
              {icon ?? <FolderOpen aria-hidden="true" className="size-4 sm:size-5" />}
            </span>
            <div className="min-w-0 space-y-0.5">
              <DialogTitle className="type-h2 flex items-center gap-2 text-foreground">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="type-p3 line-clamp-2 text-muted-foreground">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain space-y-3.5 p-3.5 sm:space-y-5 sm:p-6",
            isMobileSheet &&
              !footer &&
              "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "sticky bottom-0 z-10 shrink-0 flex flex-col-reverse items-stretch justify-between gap-2 border-t border-border bg-muted/60 px-3.5 pt-2.5 backdrop-blur-sm sm:flex-row sm:items-center sm:px-6 sm:py-4 sm:gap-2.5",
              isMobileSheet
                ? "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
                : "pb-2.5 sm:pb-4",
            )}
          >
            {footerNote ? (
              <span className="type-p3 hidden font-medium text-muted-foreground sm:inline">
                {footerNote}
              </span>
            ) : null}
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end [&>*:only-child]:col-span-2 [&>*:last-child:nth-child(odd)]:col-span-2 [&>*]:w-full sm:[&>*]:w-auto">
              {footer}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
