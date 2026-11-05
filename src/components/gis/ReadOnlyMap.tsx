"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { area, centerOfMass } from "@turf/turf";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";

import "leaflet/dist/leaflet.css";

type GeoJsonLike =
  | FeatureCollection<Geometry, GeoJsonProperties>
  | Feature<Geometry, GeoJsonProperties>
  | null
  | undefined;

function clampPoint(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeFeatureCollection(data: GeoJsonLike): FeatureCollection<Geometry, GeoJsonProperties> | null {
  if (!data) return null;

  if (data.type === "FeatureCollection") {
    return data;
  }

  if (data.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [data],
    };
  }

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function ReadOnlyMapInner({
  data,
  className = "",
  onAddPoint,
}: {
  data?: GeoJsonLike;
  className?: string;
  onAddPoint?: () => void;
}) {
  const featureCollection = useMemo(
    () => normalizeFeatureCollection(data),
    [data],
  );

  const summary = useMemo(() => {
    if (!featureCollection || featureCollection.features.length === 0) {
      return {
        areaHa: 0,
        center: { lat: -6.2, lng: 106.8 },
      };
    }

    const areaSqm = featureCollection.features.reduce((total, feature) => {
      if (!feature.geometry) return total;
      try {
        return total + area(feature as never);
      } catch {
        return total;
      }
    }, 0);

    let centerPoint = { lat: -6.2, lng: 106.8 };
    try {
      const centroid = centerOfMass(featureCollection as never);
      const [lng, lat] = centroid.geometry.coordinates as [number, number];
      centerPoint = {
        lat: clampPoint(lat, -6.2),
        lng: clampPoint(lng, 106.8),
      };
    } catch {
      // keep default fallback for empty or legacy geometries
    }

    return {
      areaHa: areaSqm / 10000,
      center: centerPoint,
    };
  }, [featureCollection]);

  if (typeof window === "undefined") {
      return null;
  }

  return (
    <div className={className}>
      <div className="h-[280px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-inner">
        {featureCollection && featureCollection.features.length > 0 ? (
          <MapContainer
            center={[summary.center.lat, summary.center.lng]}
            zoom={14}
            scrollWheelZoom={false}
            dragging={true}
            attributionControl={false}
            className="h-full w-full"
          >
            <MapResizeHandler />
            <TileLayer
              attribution="&copy; Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <GeoJSON
              data={featureCollection}
              style={() => ({
                color: "#fbbf24",
                weight: 2,
                opacity: 1,
                fillColor: "#fbbf24",
                fillOpacity: 0.2,
              })}
            />
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
            Belum ada geometri survei untuk ditampilkan.
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-300">
        <div className="flex flex-col text-left">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Luas Area
          </span>
          <span className="mt-1 font-semibold text-white">
            {summary.areaHa.toLocaleString("id-ID", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} Ha
          </span>
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Koordinat Pusat
          </span>
          <span className="mt-1 font-semibold text-white">
            {summary.center.lat.toFixed(5)}, {summary.center.lng.toFixed(5)}
          </span>
        </div>
      </div>

      {onAddPoint ? (
        <Button
          type="button"
          variant="link"
          className="mt-3 h-auto p-0 text-[11px] font-semibold text-orange-300 hover:text-orange-200"
          onClick={onAddPoint}
        >
          <MapPinned className="mr-1.5 size-3.5" />
          + Tambah Titik/Koordinat
        </Button>
      ) : null}
    </div>
  );
}

const DynamicReadOnlyMap = dynamic(() => Promise.resolve(ReadOnlyMapInner), {
  ssr: false,
});

export default DynamicReadOnlyMap;
export { ReadOnlyMapInner };
