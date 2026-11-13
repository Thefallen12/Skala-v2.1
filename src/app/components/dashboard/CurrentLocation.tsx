"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  markLocationPermissionHint,
  openDevicePermissionsDialog,
} from "@/lib/native-bridge";

type LocationState =
  | { status: "loading" }
  | {
      status: "ready";
      latitude: number;
      longitude: number;
      placeName: string | null;
      isVillage: boolean;
      placeError: string | null;
    }
  | { status: "error"; message: string; permissionDenied: boolean };

const toDms = (value: number, positive: string, negative: string) => {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesValue);
  const seconds = ((minutesValue - minutes) * 60).toFixed(1);
  const direction = value < 0 ? negative : positive;

  return `${degrees}°${String(minutes).padStart(2, "0")}′${String(seconds).padStart(4, "0")}″${direction}`;
};

const CurrentLocation = ({
  variant = "default",
}: {
  variant?: "default" | "badge";
}) => {
  const [location, setLocation] = useState<LocationState>({
    status: "loading",
  });

  const fetchCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      Promise.resolve().then(() =>
        setLocation({
          status: "error",
          message: "GPS tidak didukung",
          permissionDenied: false,
        }),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        markLocationPermissionHint("granted");
        const { latitude, longitude } = coords;
        setLocation({
          status: "ready",
          latitude,
          longitude,
          placeName: null,
          isVillage: false,
          placeError: null,
        });
        const query = new URLSearchParams({
          lat: latitude.toFixed(4),
          lon: longitude.toFixed(4),
        });
        fetch(`/api/location/reverse?${query}`)
          .then(async (response) => {
            const result = (await response.json()) as {
              name?: string;
              isVillage?: boolean;
              message?: string;
            };
            if (!response.ok) {
              throw new Error(result.message ?? "Nama lokasi tidak tersedia.");
            }
            if (typeof result.name !== "string") {
              throw new Error("Nama lokasi tidak tersedia.");
            }
            return {
              name: result.name,
              isVillage: result.isVillage === true,
            };
          })
          .then(({ name, isVillage }) => {
            setLocation((current) =>
              current.status === "ready"
                ? { ...current, placeName: name, isVillage, placeError: null }
                : current,
            );
          })
          .catch((error: unknown) => {
            setLocation((current) =>
              current.status === "ready"
                ? {
                    ...current,
                    placeName: null,
                    isVillage: false,
                    placeError:
                      error instanceof Error
                        ? error.message
                        : "Nama lokasi tidak tersedia.",
                  }
                : current,
            );
          });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        if (denied) markLocationPermissionHint("denied");
        const message = denied
          ? "Izin lokasi ditolak"
          : error.code === error.TIMEOUT
            ? "Lokasi belum ditemukan"
            : "Lokasi tidak tersedia";
        setLocation({ status: "error", message, permissionDenied: denied });
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    );
  }, []);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      fetchCurrentLocation();
    }, 0);

    const handlePermissionUpdate = () => {
      fetchCurrentLocation();
    };

    window.addEventListener("skala:permissions-changed", handlePermissionUpdate);
    window.addEventListener("skala:native-ready", handlePermissionUpdate);

    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener(
        "skala:permissions-changed",
        handlePermissionUpdate,
      );
      window.removeEventListener("skala:native-ready", handlePermissionUpdate);
    };
  }, [fetchCurrentLocation]);

  const placeName =
    location.status === "ready"
      ? location.placeName
        ? `${location.isVillage ? "Desa " : ""}${location.placeName}`
        : location.placeError ?? "Mencari nama desa..."
      : location.status === "loading"
        ? "Mencari lokasi..."
        : location.message;
  const coordinates =
    location.status === "ready"
      ? `${toDms(location.latitude, "N", "S")} ${toDms(location.longitude, "E", "W")}`
      : null;
  const coordinateParts = coordinates?.split(" ") ?? [];

  const accessibleLabel = `Lokasi terkini: ${placeName}${coordinates ? `, ${coordinates}` : ""}`;

  if (variant === "badge") {
    const content = (
      <>
        <MapPin className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
        <div className="grid min-w-0 flex-1">
          <span
            className="line-clamp-2 max-w-full text-[10px] leading-tight sm:line-clamp-none sm:max-w-[13rem] sm:truncate sm:text-xs"
            title={placeName}
          >
            {placeName}
          </span>
          {coordinateParts.length === 2 && (
            <span className="flex flex-col text-[8px] font-medium leading-tight text-muted-foreground sm:flex-row sm:gap-1 sm:text-[10px] sm:leading-normal">
              <span className="whitespace-nowrap">{coordinateParts[0]}</span>
              <span className="whitespace-nowrap">{coordinateParts[1]}</span>
            </span>
          )}
        </div>
      </>
    );

    if (location.status === "error") {
      return (
        <button
          type="button"
          onClick={openDevicePermissionsDialog}
          title="Ketuk untuk mengatur izin lokasi"
          aria-label={`${accessibleLabel}. Ketuk untuk mengatur izin lokasi.`}
          className="inline-flex h-full min-h-14 w-full min-w-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-left text-xs font-medium text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300 sm:h-auto sm:w-auto sm:min-h-0 sm:gap-2 sm:px-3 sm:py-1.5"
        >
          {content}
        </button>
      );
    }

    return (
      <div
        className="inline-flex h-full min-h-14 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1 text-left text-xs font-medium text-foreground sm:h-auto sm:w-auto sm:min-h-0 sm:gap-2 sm:px-3 sm:py-1.5"
        aria-label={accessibleLabel}
        aria-live="polite"
      >
        {content}
      </div>
    );
  }

  if (location.status === "error") {
    return (
      <button
        type="button"
        onClick={openDevicePermissionsDialog}
        className="mt-1 flex min-w-0 flex-col items-end leading-tight text-right underline decoration-dotted underline-offset-2"
        aria-label={`${accessibleLabel}. Ketuk untuk mengatur izin lokasi.`}
      >
        <span className="max-w-full truncate text-[9px] font-semibold text-amber-600 dark:text-amber-400 sm:text-xs">
          {placeName} · Izinkan
        </span>
      </button>
    );
  }

  return (
    <div
      className="mt-1 flex min-w-0 flex-col items-end leading-tight"
      aria-label={accessibleLabel}
      aria-live="polite"
    >
      <span className="max-w-full truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
        {placeName}
      </span>
      {coordinates && (
        <span className="whitespace-nowrap text-[8px] font-medium text-slate-500 dark:text-slate-400 sm:text-[10px]">
          {coordinates}
        </span>
      )}
    </div>
  );
};

export default CurrentLocation;
