"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";

const subscribeToMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function LoadingOverlay({ label }: { label: string }) {
  const isMounted = useSyncExternalStore(
    subscribeToMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  if (!isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-background/75 backdrop-blur-sm"
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <MorphingInfinity size={64} className="text-orange-500" />
        <p className="text-sm font-medium text-primary dark:text-white">{label}</p>
        <span className="sr-only">Harap tunggu.</span>
      </div>
    </div>,
    document.body,
  );
}