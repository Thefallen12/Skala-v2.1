"use client";

import { useEffect, useState } from "react";

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
  | { status: "error"; message: string };

const toDms = (value: number, positive: string, negative: string) => {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesValue);
  const seconds = ((minutesValue - minutes) * 60).toFixed(1);
  const direction = value < 0 ? negative : positive;

  return `${degrees}°${String(minutes).padStart(2, "0")}′${String(seconds).padStart(4, "0")}″${direction}`;
};

const CurrentLocation = () => {
  const [location, setLocation] = useState<LocationState>({
    status: "loading",
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      const timer = window.setTimeout(
        () => setLocation({ status: "error", message: "GPS tidak didukung" }),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
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
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak"
            : error.code === error.TIMEOUT
              ? "Lokasi belum ditemukan"
              : "Lokasi tidak tersedia";
        setLocation({ status: "error", message });
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    );
  }, []);

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

  return (
    <div
      className="mt-1 flex min-w-0 flex-col items-end leading-tight"
      aria-label={`Lokasi terkini: ${placeName}${coordinates ? `, ${coordinates}` : ""}`}
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
