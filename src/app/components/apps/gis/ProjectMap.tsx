"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import L, {
  type FeatureGroup as LeafletFeatureGroup,
  type Layer,
  type PathOptions,
} from "leaflet";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import {
  FeatureGroup,
  GeoJSON,
  MapContainer,
  ScaleControl,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel, Label } from "@/components/ui/label";
import {
  Compass,
  Check,
  Layers3,
  Map as MapIcon,
  MapPin,
  MousePointer2,
  Pentagon,
  Pencil,
  Route,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import {
  measureSurveyGeoJSON,
  type SurveyGeoJSON,
} from "@/lib/field-survey-geojson";
import type {
  GlobalPolygonFeature,
  SurveyDrawRequest,
  SurveyDrawTool,
  SurveyLayerVisibility,
} from "./ProjectMapLoader";
import styles from "./ProjectMap.module.css";

type Basemap =
  | "streets"
  | "dark"
  | "satellite"
  | "terrain"
  | "google-satellite"
  | "google-earth"
  | "google-hybrid";
type ActiveMapTool = SurveyDrawTool;
type ActiveDrawHandler = {
  disable: () => void;
  save?: () => void;
  completeShape?: () => void;
};
type FeatureWithLocalId = Feature<Geometry, GeoJsonProperties> & {
  properties: Record<string, unknown> | null;
};

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

const drawMarkerIcon = L.divIcon({
  className: "survey-map-marker",
  html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:#f97316;box-shadow:0 1px 5px #0008"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

L.Draw.Marker.prototype.setOptions({ icon: drawMarkerIcon });

function collectionFromFeatures(features: FeatureWithLocalId[]): SurveyGeoJSON {
  return { type: "FeatureCollection", features };
}

function getLocalId(layer: Layer): string | null {
  const feature = (layer as Layer & { feature?: FeatureWithLocalId }).feature;
  const id = feature?.properties?.__surveyLayerId;
  return typeof id === "string" ? id : null;
}

function layerToFeature(layer: Layer): FeatureWithLocalId {
  const geoJsonLayer = layer as Layer & {
    toGeoJSON: () => Feature<Geometry, GeoJsonProperties>;
  };
  return geoJsonLayer.toGeoJSON() as FeatureWithLocalId;
}

function getGeometryKinds(geometry: Geometry): Set<"polygon" | "line" | "point"> {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.reduce<Set<"polygon" | "line" | "point">>(
      (kinds, nested) => new Set([...kinds, ...getGeometryKinds(nested)]),
      new Set(),
    );
  }
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return new Set(["polygon"]);
  }
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    return new Set(["line"]);
  }
  return new Set(["point"]);
}

function featureIsVisible(
  feature: Feature<Geometry, GeoJsonProperties>,
  visibility: SurveyLayerVisibility,
) {
  if (!feature.geometry) return false;
  return [...getGeometryKinds(feature.geometry)].some((kind) => visibility[kind]);
}

function geometryStyle(feature?: Feature<Geometry, GeoJsonProperties>): PathOptions {
  const kinds = feature?.geometry ? getGeometryKinds(feature.geometry) : new Set();
  if (kinds.has("polygon")) {
    return {
      color: "#f97316",
      weight: 2,
      fillColor: "#f97316",
      fillOpacity: 0.22,
    };
  }

  return { color: "#38bdf8", weight: 4, opacity: 0.9 };
}

function globalPolygonStyle(status: string): PathOptions {
  const isRunning = ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(status);
  return {
    color: isRunning ? "#0f2c59" : "#facc15",
    weight: 3,
    fillColor: isRunning ? "#0f2c59" : "#facc15",
    fillOpacity: 0.28,
  };
}

function formatDistance(value: number) {
  return value >= 1_000
    ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value / 1_000)} km`
    : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)} m`;
}

function formatCoordinates(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function googleApiErrorMessage(result: unknown): string | null {
  if (
    typeof result !== "object" ||
    result === null ||
    !("error" in result) ||
    typeof result.error !== "object" ||
    result.error === null ||
    !("message" in result.error) ||
    typeof result.error.message !== "string"
  ) {
    return null;
  }
  return result.error.message;
}

function MapViewport({
  data,
  signature,
}: {
  data: SurveyGeoJSON | null;
  signature: string;
}) {
  const map = useMap();
  const lastFittedSignatureRef = useRef<string>("");

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (!data?.features.length) {
      lastFittedSignatureRef.current = "";
      return;
    }
    if (lastFittedSignatureRef.current === signature) return;
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
      lastFittedSignatureRef.current = signature;
    }
  }, [data, map, signature]);

  return null;
}

function DrawToolController({
  request,
  featureGroupRef,
  activeToolRef,
  measurementLayerRef,
  mapRef,
  activeHandlerRef,
}: {
  request: SurveyDrawRequest | null;
  featureGroupRef: RefObject<LeafletFeatureGroup | null>;
  activeToolRef: MutableRefObject<ActiveMapTool | null>;
  measurementLayerRef: MutableRefObject<Layer | null>;
  mapRef: MutableRefObject<L.Map | null>;
  activeHandlerRef: MutableRefObject<ActiveDrawHandler | null>;
}) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);

  useEffect(() => {
    if (!request) return;
    activeHandlerRef.current?.disable();
    activeHandlerRef.current = null;
    activeToolRef.current = request.tool;
    if (request.tool !== "select") {
      measurementLayerRef.current?.remove();
      measurementLayerRef.current = null;
    }

    if (request.tool === "select" || request.tool === "clear") return;
    const drawMap = map as L.DrawMap;
    const featureGroup = featureGroupRef.current;
    if (
      (request.tool === "edit" || request.tool === "delete") &&
      !featureGroup
    ) {
      activeToolRef.current = null;
      return;
    }

    let handler:
      | L.Draw.Marker
      | L.Draw.Polygon
      | L.Draw.Polyline
      | L.EditToolbar.Edit
      | L.EditToolbar.Delete;
    if (request.tool === "point") {
      handler = new L.Draw.Marker(drawMap, { icon: drawMarkerIcon });
    } else if (request.tool === "polygon") {
      handler = new L.Draw.Polygon(drawMap, {
        allowIntersection: false,
        showArea: true,
        shapeOptions: { color: "#f97316", fillOpacity: 0.22 },
      });
    } else if (request.tool === "line" || request.tool === "ruler") {
      handler = new L.Draw.Polyline(drawMap, {
        shapeOptions: {
          color: request.tool === "ruler" ? "#facc15" : "#38bdf8",
          weight: 4,
          dashArray: request.tool === "ruler" ? "7 6" : undefined,
        },
      });
    } else if (request.tool === "edit") {
      if (!featureGroup) return;
      let editableFeatureGroup = featureGroup;
      if (request.featureId) {
        editableFeatureGroup = new L.FeatureGroup();
        featureGroup.eachLayer((layer) => {
          if (getLocalId(layer) === request.featureId) {
            editableFeatureGroup.addLayer(layer);
          }
        });
        if (editableFeatureGroup.getLayers().length === 0) return;
      }
      handler = new L.EditToolbar.Edit(drawMap, {
        featureGroup: editableFeatureGroup,
      });
    } else {
      if (!featureGroup) return;
      handler = new L.EditToolbar.Delete(drawMap, { featureGroup });
    }

    const handlerController = {
      disable: () => handler.disable(),
      save: "save" in handler ? () => handler.save() : undefined,
    };
    activeHandlerRef.current = {
      ...handlerController,
      completeShape:
        "completeShape" in handler ? () => handler.completeShape() : undefined,
    };
    handler.enable();
    return () => {
      if (request.tool === "edit" || request.tool === "delete") {
        handlerController.save?.();
      }
      handlerController.disable();
      activeHandlerRef.current = null;
      activeToolRef.current = null;
    };
  }, [activeHandlerRef, activeToolRef, featureGroupRef, map, measurementLayerRef, request]);

  return null;
}

function MapCoordinates() {
  const map = useMap();
  const [coordinates, setCoordinates] = useState(() =>
    formatCoordinates(map.getCenter().lat, map.getCenter().lng),
  );

  useEffect(() => {
    const updateCenterCoordinates = () => {
      const position = map.getCenter();
      setCoordinates(formatCoordinates(position.lat, position.lng));
    };
    const updateMouseCoordinates = (event: L.LeafletMouseEvent) => {
      const position = event.latlng;
      setCoordinates(formatCoordinates(position.lat, position.lng));
    };
    updateCenterCoordinates();
    map.on("mousemove", updateMouseCoordinates);
    map.on("moveend", updateCenterCoordinates);
    return () => {
      map.off("mousemove", updateMouseCoordinates);
      map.off("moveend", updateCenterCoordinates);
    };
  }, [map]);

  return (
    <div className="pointer-events-none absolute bottom-12 right-2 z-[1000] rounded border border-border bg-card/90 px-2 py-1 font-mono text-[9px] text-card-foreground shadow">
      Lat/Lng: {coordinates}
    </div>
  );
}

function GoogleMapAttribution({
  session,
  apiKey,
  onCopyrightChange,
  onError,
}: {
  session: string;
  apiKey: string;
  onCopyrightChange: (copyright: string) => void;
  onError: (message: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestTimer: number | undefined;

    const updateCopyright = () => {
      controller?.abort();
      controller = new AbortController();
      const bounds = map.getBounds();
      const params = new URLSearchParams({
        session,
        key: apiKey,
        zoom: String(Math.floor(map.getZoom())),
        north: String(bounds.getNorth()),
        south: String(bounds.getSouth()),
        east: String(bounds.getEast()),
        west: String(bounds.getWest()),
      });

      void fetch(`https://tile.googleapis.com/tile/v1/viewport?${params}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const result: unknown = await response.json();
            const detail = googleApiErrorMessage(result);
            throw new Error(
              detail ??
                `Google Maps gagal memuat atribusi data (HTTP ${response.status}).`,
            );
          }
          const result: unknown = await response.json();
          if (
            typeof result !== "object" ||
            result === null ||
            !("copyright" in result) ||
            typeof result.copyright !== "string"
          ) {
            throw new Error("Google Maps tidak mengembalikan atribusi data.");
          }
          onCopyrightChange(result.copyright);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("Loading Google Maps viewport attribution failed:", error);
          onError(
            error instanceof Error
              ? error.message
              : "Atribusi Google Maps gagal dimuat.",
          );
        });
    };

    const scheduleUpdate = () => {
      window.clearTimeout(requestTimer);
      requestTimer = window.setTimeout(updateCopyright, 180);
    };

    scheduleUpdate();
    map.on("moveend", scheduleUpdate);

    return () => {
      window.clearTimeout(requestTimer);
      map.off("moveend", scheduleUpdate);
      controller?.abort();
    };
  }, [apiKey, map, onCopyrightChange, onError, session]);

  return null;
}

export default function ProjectMap({
  importedData,
  importedDataVersion,
  drawnData,
  visibility,
  drawRequest,
  onVisibilityChange,
  onDrawnDataChange,
  onDrawToolSelect,
  onFeatureCreated,
  onFeatureSelected,
  globalPolygons,
}: {
  importedData: SurveyGeoJSON | null;
  importedDataVersion: number;
  drawnData: SurveyGeoJSON;
  visibility: SurveyLayerVisibility;
  drawRequest: SurveyDrawRequest | null;
  onVisibilityChange: (visibility: SurveyLayerVisibility) => void;
  onDrawnDataChange: (data: SurveyGeoJSON) => void;
  onDrawToolSelect: (tool: SurveyDrawTool, featureId?: string) => void;
  onFeatureCreated: (feature: SurveyGeoJSON["features"][number]) => void;
  onFeatureSelected: (feature: SurveyGeoJSON["features"][number]) => void;
  globalPolygons: GlobalPolygonFeature[];
}) {
  const featureGroupRef = useRef<LeafletFeatureGroup>(null);
  const activeToolRef = useRef<ActiveMapTool | null>(null);
  const measurementLayerRef = useRef<Layer | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const activeHandlerRef = useRef<ActiveDrawHandler | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [googleSession, setGoogleSession] = useState<string | null>(null);
  const [googleCopyright, setGoogleCopyright] = useState("");
  const [googleMapRequestError, setGoogleMapRequestError] = useState<string | null>(null);
  const [googleSessionAttempt, setGoogleSessionAttempt] = useState(0);

  useEffect(() => {
    if (basemap !== "google-satellite") return;
    if (!googleMapsApiKey) return;

    const controller = new AbortController();

    void fetch(
      `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(googleMapsApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapType: "satellite",
          language: "id",
          region: "ID",
        }),
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          const result: unknown = await response.json();
          const detail = googleApiErrorMessage(result);
          throw new Error(
            `${detail ?? `Google Maps gagal membuat sesi basemap (HTTP ${response.status}).`} Periksa API key, pembatasan key, Map Tiles API, dan billing.`,
          );
        }
        const result: unknown = await response.json();
        if (
          typeof result !== "object" ||
          result === null ||
          !("session" in result) ||
          typeof result.session !== "string"
        ) {
          throw new Error("Google Maps tidak mengembalikan token sesi.");
        }
        setGoogleSession(result.session);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Creating Google Maps satellite session failed:", error);
        setGoogleMapRequestError(
          error instanceof Error
            ? error.message
            : "Basemap Google Maps gagal dimuat.",
        );
      });

    return () => controller.abort();
  }, [basemap, googleSessionAttempt]);

  const visibleImportedData = useMemo(() => {
    if (!importedData) return null;
    return {
      ...importedData,
      features: importedData.features.filter((feature) =>
        featureIsVisible(feature, visibility),
      ),
    };
  }, [importedData, visibility]);

  useEffect(() => {
    if (drawnData.features.length === 0) {
      featureGroupRef.current?.clearLayers();
      return;
    }
    featureGroupRef.current?.eachLayer((layer) => {
      const localId = getLocalId(layer);
      const currentFeature = drawnData.features.find(
        (candidate) =>
          candidate.properties?.__surveyLayerId === localId,
      ) as FeatureWithLocalId | undefined;
      if (currentFeature) {
        (layer as Layer & { feature?: FeatureWithLocalId }).feature =
          currentFeature;
      }
      const feature = currentFeature ?? (layer as Layer & { feature?: Feature<Geometry> }).feature;
      const visible =
        feature?.geometry !== null &&
        feature?.geometry !== undefined &&
        [...getGeometryKinds(feature.geometry)].some((kind) => visibility[kind]);
      if (layer instanceof L.Marker) {
        layer.setOpacity(visible ? 1 : 0);
        const element = layer.getElement();
        if (element) element.style.pointerEvents = visible ? "auto" : "none";
      } else if ("setStyle" in layer && typeof layer.setStyle === "function") {
        layer.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 0.22 : 0 });
      }
    });
  }, [drawnData, visibility]);

  useEffect(() => {
    if (importedData?.features.length || drawnData.features.length) return;
    measurementLayerRef.current?.remove();
    measurementLayerRef.current = null;
  }, [drawnData.features.length, importedData]);

  const updateDrawnFeature = (layer: Layer) => {
    const feature = layerToFeature(layer);
    const localId = getLocalId(layer);
    if (!localId) return null;
    feature.properties = {
      ...(feature.properties ?? {}),
      __surveyLayerId: localId,
    };
    (layer as Layer & { feature?: FeatureWithLocalId }).feature = feature;
    return feature;
  };

  const googleMapError =
    basemap === "google-satellite" && !googleMapsApiKey
      ? "Tambahkan NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ke .env, lalu aktifkan Map Tiles API dan billing di Google Cloud."
      : googleMapRequestError;
  const useGoogleSatellite =
    basemap === "google-satellite" &&
    Boolean(googleSession) &&
    !googleMapError;
  const googleTileAttribution = googleCopyright
    ? `Google Maps · ${googleCopyright}`
    : "Google Maps";
  const visibleGlobalPolygons = globalPolygons;
  const viewportData = useMemo<SurveyGeoJSON | null>(() => {
    if (importedData?.features.length) return importedData;
    if (visibleGlobalPolygons.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: visibleGlobalPolygons.map((polygon) => polygon.feature),
    };
  }, [importedData, visibleGlobalPolygons]);
  const viewportSignature = useMemo(() => {
    if (importedData?.features.length) {
      return `import:${importedDataVersion}:${importedData.features.length}`;
    }
    if (visibleGlobalPolygons.length === 0) return "";
    return `global:${visibleGlobalPolygons
      .map((polygon) => `${polygon.projectId}:${polygon.surveyName}`)
      .join("|")}`;
  }, [importedData, importedDataVersion, visibleGlobalPolygons]);

  return (
    <div
      className={`${styles.mapCanvas} ${
        basemap === "satellite" || basemap === "google-satellite"
          ? styles.satelliteCanvas
          : ""
      } relative isolate z-0 h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-border`}
    >
      <MapContainer
        center={[4.625, 96.84]}
        zoom={12}
        maxZoom={24}
        zoomControl={false}
        scrollWheelZoom={false}
        className="h-full min-h-[420px] w-full"
      >
        {basemap === "streets" && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {basemap === "dark" && (
          <TileLayer
            attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
        )}
        {basemap === "terrain" && (
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Sources: Esri, Garmin, USGS, NOAA"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {basemap === "google-earth" && (
          <TileLayer
            attribution="&copy; Google Maps"
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            maxNativeZoom={21}
            maxZoom={24}
          />
        )}
        {basemap === "google-hybrid" && (
          <TileLayer
            attribution="&copy; Google Maps"
            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            maxNativeZoom={21}
            maxZoom={24}
          />
        )}
        {(basemap === "satellite" ||
          (basemap === "google-satellite" && !useGoogleSatellite)) && (
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {useGoogleSatellite && googleSession && (
          <>
            <TileLayer
              key={googleSession}
              attribution={googleTileAttribution}
              url={`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(googleSession)}&key=${encodeURIComponent(googleMapsApiKey)}`}
              maxZoom={22}
              eventHandlers={{
                tileerror: () =>
                  setGoogleMapRequestError(
                    "Tile citra Google gagal dimuat. Periksa API key, pembatasan key, dan billing di Google Cloud.",
                  ),
              }}
            />
            <GoogleMapAttribution
              session={googleSession}
              apiKey={googleMapsApiKey}
              onCopyrightChange={setGoogleCopyright}
              onError={setGoogleMapRequestError}
            />
          </>
        )}

        {visibleGlobalPolygons.map((polygon, index) => (
          <GeoJSON
            key={`${polygon.projectId}-${polygon.surveyName}-${index}`}
            data={polygon.feature as never}
            style={() => globalPolygonStyle(polygon.status)}
            onEachFeature={(_feature, layer) => {
              layer.bindTooltip(`${polygon.projectTitle} · ${polygon.surveyName}`);
            }}
          />
        ))}

        {visibleImportedData && (
          <GeoJSON
            key={`${importedDataVersion}-${visibility.polygon}-${visibility.line}-${visibility.point}`}
            data={visibleImportedData}
            style={(feature) => geometryStyle(feature as Feature<Geometry>)}
            pointToLayer={(_feature, latLng) =>
              L.circleMarker(latLng, {
                radius: 7,
                color: "#c2410c",
                fillColor: "#f97316",
                fillOpacity: 0.95,
                weight: 2,
              })
            }
            onEachFeature={(feature, layer) => {
              layer.on("click", () =>
                onFeatureSelected(feature as SurveyGeoJSON["features"][number]),
              );
            }}
          />
        )}

        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topleft"
            onCreated={(event) => {
              const layer = event.layer;
              const feature = layerToFeature(layer);
              if (activeToolRef.current === "ruler" && layer instanceof L.Polyline) {
                featureGroupRef.current?.removeLayer(layer);
                measurementLayerRef.current?.remove();
                const measurement = measureSurveyGeoJSON({
                  type: "FeatureCollection",
                  features: [feature],
                });
                layer.setStyle({ color: "#facc15", weight: 3, dashArray: "7 6" });
                layer.bindTooltip(`Panjang: ${formatDistance(measurement.lengthM)}`, {
                  permanent: true,
                  direction: "center",
                  className: styles.measurementTooltip,
                });
                mapRef.current?.addLayer(layer);
                measurementLayerRef.current = layer;
                onDrawToolSelect("select");
                return;
              }
              const localId = crypto.randomUUID();
              feature.properties = {
                ...(feature.properties ?? {}),
                __surveyLayerId: localId,
              };
              (layer as Layer & { feature?: FeatureWithLocalId }).feature = feature;
              layer.on("click", () => onFeatureSelected(feature));
              onDrawnDataChange(
                collectionFromFeatures([
                  ...(drawnData.features as FeatureWithLocalId[]),
                  feature,
                ]),
              );
              onFeatureCreated(feature);
              onDrawToolSelect("select");
            }}
            onEdited={(event) => {
              const updates = new Map<string, FeatureWithLocalId>();
              event.layers.eachLayer((layer) => {
                const feature = updateDrawnFeature(layer);
                const localId = getLocalId(layer);
                if (feature && localId) updates.set(localId, feature);
              });
              onDrawnDataChange(
                collectionFromFeatures(
                  (drawnData.features as FeatureWithLocalId[]).map(
                    (feature) =>
                      updates.get(String(feature.properties?.__surveyLayerId)) ??
                      feature,
                  ),
                ),
              );
            }}
            onDeleted={(event) => {
              const removed = new Set<string>();
              event.layers.eachLayer((layer) => {
                const localId = getLocalId(layer);
                if (localId) removed.add(localId);
              });
              onDrawnDataChange(
                collectionFromFeatures(
                  (drawnData.features as FeatureWithLocalId[]).filter(
                    (feature) =>
                      !removed.has(String(feature.properties?.__surveyLayerId)),
                  ),
                ),
              );
            }}
            draw={{
              polygon: false,
              polyline: false,
              marker: false,
              rectangle: false,
              circle: false,
              circlemarker: false,
            }}
            edit={{ edit: false, remove: false }}
          />
        </FeatureGroup>
        <DrawToolController
          request={drawRequest}
          featureGroupRef={featureGroupRef}
          activeToolRef={activeToolRef}
          measurementLayerRef={measurementLayerRef}
          mapRef={mapRef}
          activeHandlerRef={activeHandlerRef}
        />
        <ZoomControl position="bottomleft" />
        <ScaleControl position="bottomright" metric imperial={false} />
        <MapViewport data={viewportData} signature={viewportSignature} />
        <MapCoordinates />
      </MapContainer>

      <div className="absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] items-center overflow-x-auto rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        {(
          [
            ["select", "Pilih / Batalkan", MousePointer2],
            ["point", "Tambah titik", MapPin],
            ["line", "Gambar jalur", Route],
            ["polygon", "Gambar polygon", Pentagon],
            ["ruler", "Ukur jarak", Ruler],
            ["edit", "Edit fitur gambar", Pencil],
            ["delete", "Hapus fitur gambar", Trash2],
          ] as const
        ).map(([tool, title, Icon]) => (
          <button
            key={tool}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={
              (drawRequest?.tool === "clear" ? "select" : drawRequest?.tool ?? "select") ===
              tool
            }
            onClick={() => onDrawToolSelect(tool)}
            className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors ${
              (drawRequest?.tool === "clear" ? "select" : drawRequest?.tool ?? "select") ===
              tool
                ? "bg-orange-500/20 text-orange-300"
                : "text-card-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
        {(drawRequest?.tool === "line" ||
          drawRequest?.tool === "polygon" ||
          drawRequest?.tool === "ruler") && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              title="Selesaikan gambar"
              aria-label="Selesaikan gambar"
              onClick={() => activeHandlerRef.current?.completeShape?.()}
              className="grid size-8 shrink-0 place-items-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <Check className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Batalkan gambar"
              aria-label="Batalkan gambar"
              onClick={() => onDrawToolSelect("select")}
              className="grid size-8 shrink-0 place-items-center rounded-md text-rose-600 transition-colors hover:bg-rose-500/15 dark:text-rose-300"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] items-start gap-2">
        <details className="group relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card/95 px-3 text-xs font-medium text-card-foreground shadow-lg backdrop-blur [&::-webkit-details-marker]:hidden">
            <Layers3 className="size-4 text-muted-foreground" aria-hidden="true" />
            Layers
          </summary>
          <div className="absolute right-0 top-11 flex min-w-32 flex-col gap-2 rounded-lg border border-border bg-card p-3 text-xs text-card-foreground shadow-lg">
            {(
              [
                ["polygon", "Area"],
                ["line", "Jalur"],
                ["point", "Titik"],
              ] as const
            ).map(([type, label]) => (
              <Label
                key={type}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <Checkbox
                  checked={visibility[type]}
                  onCheckedChange={(checked) =>
                    onVisibilityChange({
                      ...visibility,
                      [type]: checked === true,
                    })
                  }
                  aria-label={`Tampilkan layer ${label}`}
                  className="size-3.5"
                />
                {label}
              </Label>
            ))}
          </div>
        </details>
        <FormLabel className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/95 px-3 text-xs font-medium text-card-foreground shadow-lg backdrop-blur">
          <MapIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden sm:inline">Basemap</span>
          <select
            aria-label="Pilih basemap"
            value={basemap}
            onChange={(event) => {
              const nextBasemap = event.target.value as Basemap;
              if (nextBasemap === "google-satellite") {
                setGoogleMapRequestError(null);
                setGoogleSession(null);
                setGoogleCopyright("");
              }
              setBasemap(nextBasemap);
            }}
            className="max-w-28 rounded border-0 bg-transparent py-0.5 text-xs text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="satellite">Satelit</option>
            <option value="terrain">Terrain</option>
            <option value="dark">Gelap</option>
            <option value="google-earth">Google Earth (High Res)</option>
            <option value="google-hybrid">
              Google Hybrid (Satelit + Label Jalan)
            </option>
            <option value="google-satellite">Google Satellite (API Key)</option>
            <option value="streets">OpenStreetMap</option>
          </select>
        </FormLabel>
        <div
          aria-label="Arah utara"
          title="Utara"
          className="absolute right-0 top-12 grid size-9 place-items-center rounded-full border border-border bg-card/90 text-secondary shadow-lg backdrop-blur"
        >
          <Compass className="size-5" aria-hidden="true" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-14 z-[1000] rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
        {drawnData.features.length +
          (importedData?.features.length ?? 0) +
          visibleGlobalPolygons.length}{" "}
        fitur · WGS84
      </div>
      {basemap === "google-satellite" && !googleMapError && !googleSession && (
        <div className="absolute bottom-3 left-1/2 z-[1001] -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-card-foreground shadow-md">
          Menghubungkan ke Google Satellite...
        </div>
      )}
      {basemap === "google-satellite" && googleMapError && (
        <div
          role="alert"
          className="absolute bottom-3 left-1/2 z-[1001] flex max-w-[min(34rem,calc(100%-1rem))] -translate-x-1/2 items-center gap-3 rounded-lg border border-destructive/30 bg-card/95 px-3 py-2 text-xs text-card-foreground shadow-lg backdrop-blur"
        >
          <span>{googleMapError}</span>
          {googleMapsApiKey && (
            <button
              type="button"
              className="shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setGoogleSession(null);
                setGoogleSessionAttempt((attempt) => attempt + 1);
                setGoogleMapRequestError(null);
              }}
            >
              Coba lagi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
