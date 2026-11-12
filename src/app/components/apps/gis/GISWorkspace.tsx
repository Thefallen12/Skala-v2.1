"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { center } from "@turf/turf";
import {
  ArrowUpRight,
  Download,
  Eye,
  FileUp,
  MapPinned,
  MapPin,
  Plus,
  Route,
  Shapes,
  Pencil,
  Upload,
  FileText,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  loadFieldSurveyGeoJSON,
  saveFieldSurveyPhotoUrls,
} from "@/app/actions/field-surveys";
import {
  measureSurveyGeoJSON,
  type SurveyGeoJSON,
} from "@/lib/field-survey-geojson";
import SurveyForm from "./SurveyForm";
import SurveyMapControls from "./SurveyMapControls";
import { readSpatialUpload } from "./geojson-upload";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "./SurveySidebar";
import ProjectMapLoader, {
  type SurveyFeatureMetadata,
  type SurveyDrawRequest,
  type SurveyLayerVisibility,
  type GlobalPolygonFeature,
} from "./ProjectMapLoader";
import SurveyDetailModal from "@/components/gis/SurveyDetailModal";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { useMaintenanceEnabled } from "@/components/maintenance/MaintenanceContext";
import { UnderProductionState } from "@/components/ui/under-production-state";

function emptyCollection(): SurveyGeoJSON {
  return { type: "FeatureCollection", features: [] };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
}

function readFeatureText(
  properties: Record<string, unknown> | null,
  key: string,
) {
  const value = properties?.[key];
  return typeof value === "string" ? value : "";
}

function getDefaultFeatureTitle(geometryType: string | undefined) {
  if (geometryType?.includes("Polygon")) return "Area survei";
  if (geometryType?.includes("Line")) return "Jalur survei";
  return "Titik survei";
}

const REPORT_PAGE_WIDTH = (210 * 96) / 25.4;
const REPORT_PAGE_HEIGHT = (297 * 96) / 25.4;

export default function GISWorkspace({
  projects,
  surveys,
  surveyorName,
  captureTime,
  initialProjectId,
  initialView = "map",
  onViewChange,
  onOpenProjects,
  onProjectChange,
}: {
  projects: SurveyProjectOption[];
  surveys: FieldSurveySummary[];
  surveyorName: string;
  captureTime: string;
  initialProjectId?: string | null;
  initialView?: "map" | "details";
  onViewChange?: (view: "map" | "details") => void;
  onOpenProjects?: () => void;
  onProjectChange?: (projectId: string) => void;
}) {
  const [importedData, setImportedData] = useState<SurveyGeoJSON | null>(null);
  const [importedDataVersion, setImportedDataVersion] = useState(0);
  const [drawnData, setDrawnData] = useState<SurveyGeoJSON>(emptyCollection);
  const [newSurveyRequest, setNewSurveyRequest] = useState(0);
  const [confirmNewSurvey, setConfirmNewSurvey] = useState(false);
  const [featureEditorOpen, setFeatureEditorOpen] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [featureMetadata, setFeatureMetadata] = useState<SurveyFeatureMetadata>({
    title: "",
    category: "Area Rehab Sawah",
    photoUrls: "",
    projectTitle: "",
    desa: "",
    kecamatan: "",
    kabupaten: "",
    vendor: "",
    surveyorName,
    description: "",
  });
  const [featureFormError, setFeatureFormError] = useState("");
  const activeProjectId = initialProjectId ?? projects[0]?.id ?? "";
  const activeView = initialView;
  const isSurveyLocationUnderMaintenance =
    useMaintenanceEnabled("survey-location");
  const isSurveyDetailsUnderMaintenance =
    useMaintenanceEnabled("survey-details");
  const isSurveyViewUnderMaintenance =
    isSurveyDetailsUnderMaintenance ||
    (activeView === "map" && isSurveyLocationUnderMaintenance);
  const [importMessage, setImportMessage] = useState("");
  const [visibility, setVisibility] = useState<SurveyLayerVisibility>({
    polygon: true,
    line: true,
    point: true,
  });
  const [drawRequest, setDrawRequest] = useState<SurveyDrawRequest | null>(null);
  const [reportSurveyId, setReportSurveyId] = useState<string | null>(surveys[0]?.id ?? null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [detailSurveyId, setDetailSurveyId] = useState<string | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(true);
  const [surveySearch, setSurveySearch] = useState("");
  const reportFrameRef = useRef<HTMLIFrameElement>(null);
  const reportViewerRef = useRef<HTMLDivElement>(null);
  const [reportFitScale, setReportFitScale] = useState(1);
  const reportScale = reportFitScale;
  const reportPageSize = {
    width: REPORT_PAGE_WIDTH * reportScale,
    height: REPORT_PAGE_HEIGHT * reportScale,
  };
  const selectedReportSurvey =
    surveys.find((survey) => survey.id === reportSurveyId) ?? null;
  const selectedReportProject = selectedReportSurvey?.projectId
    ? projects.find((project) => project.id === selectedReportSurvey.projectId)
    : null;

  useEffect(() => {
    const viewer = reportViewerRef.current;
    if (!viewer) return;

    const updateFitScale = (availableWidth: number) => {
      setReportFitScale(
        Math.min(1, Math.max(0.1, (availableWidth - 16) / REPORT_PAGE_WIDTH)),
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateFitScale(entry.contentRect.width);
    });
    observer.observe(viewer);
    updateFitScale(viewer.clientWidth);

    return () => observer.disconnect();
  }, [reportPreviewOpen]);

  const detailSurvey =
    detailSurveyId === null
      ? null
      : surveys.find((survey) => survey.id === detailSurveyId) ?? null;
  const detailProject =
    detailSurvey === null
      ? null
      : projects.find((project) => project.id === detailSurvey.projectId) ?? null;

  const combinedData = useMemo<SurveyGeoJSON>(
    () => ({
      type: "FeatureCollection",
      features: [...(importedData?.features ?? []), ...drawnData.features],
    }),
    [drawnData.features, importedData],
  );
  const globalPolygons = useMemo<GlobalPolygonFeature[]>(
    () =>
      surveys.flatMap((survey) =>
        (survey.features?.length
          ? survey.features
          : (survey.geoJsonData?.features ?? []).map((feature, index) => ({
              id: `${survey.id}-legacy-${index}`,
              featureCategory: "Batas Area Proyek (Polygon)",
              name: `${survey.locationName} · Polygon ${index + 1}`,
              description: null,
              geometryType: feature.geometry?.type ?? "",
              geoJsonData: feature,
              areaSqm: null,
              lengthM: null,
              photoUrls: [],
            })))
          .filter((feature) =>
            ["Polygon", "MultiPolygon"].includes(feature.geometryType),
          )
          .map((feature) => {
            const project = projects.find((item) => item.id === survey.projectId);
            return {
              projectId: survey.projectId ?? "",
              projectTitle: project?.title ?? survey.projectName,
              status: project?.status ?? "PENDING",
              surveyName: survey.surveyName ?? survey.locationName,
              feature: feature.geoJsonData,
            };
          }),
      ),
    [projects, surveys],
  );
  const displayedGlobalPolygons = useMemo(
    () =>
      showAllProjects
        ? globalPolygons
        : globalPolygons.filter(
            (polygon) => polygon.projectId === activeProjectId,
          ),
    [activeProjectId, globalPolygons, showAllProjects],
  );
  const measurements = useMemo(
    () => measureSurveyGeoJSON(combinedData),
    [combinedData],
  );
  const featureCount = combinedData.features.length;
  const geometryKinds = useMemo(
    () =>
      [
        ...new Set(
          combinedData.features.flatMap((feature) =>
            feature.geometry ? [feature.geometry.type] : [],
          ),
        ),
      ],
    [combinedData],
  );
  const centerCoordinate = useMemo(() => {
    const featuresWithGeometry = combinedData.features.filter(
      (feature) => feature.geometry,
    );
    if (featuresWithGeometry.length === 0) return null;
    const [longitude = 0, latitude = 0] = center({
      type: "FeatureCollection",
      features: featuresWithGeometry,
    }).geometry.coordinates;
    return { longitude, latitude };
  }, [combinedData]);
  const coordinateLabel = centerCoordinate
    ? `${Math.abs(centerCoordinate.latitude).toFixed(4)}° ${
        centerCoordinate.latitude >= 0 ? "N" : "S"
      }, ${Math.abs(centerCoordinate.longitude).toFixed(4)}° ${
        centerCoordinate.longitude >= 0 ? "E" : "W"
      }`
    : "—";
  const geometryLabel =
    geometryKinds.length > 0
      ? geometryKinds
          .map((kind) =>
            kind.includes("Polygon")
              ? "Polygon / Area Proyek"
              : kind.includes("Line")
                ? "Line / Jalur"
                : kind.includes("Point")
                  ? "Point / Temuan"
                  : kind,
          )
          .join(", ")
      : "—";

  if (isSurveyViewUnderMaintenance) {
    return (
      <UnderProductionState
        className="w-full"
        footerText={`MAINTENANCE · ${isSurveyDetailsUnderMaintenance ? "PETA & SURVEI LAPANGAN" : "LOKASI & SURVEI PROYEK"}`}
      />
    );
  }

  const updateImportedData = (data: SurveyGeoJSON | null) => {
    setImportedData(data);
    setImportedDataVersion((version) => version + 1);
  };

  const startNewSurvey = () => {
    setConfirmNewSurvey(true);
  };

  const changeView = (view: "map" | "details") => {
    onViewChange?.(view);
  };

  const changeProject = (projectId: string) => {
    onProjectChange?.(projectId);
  };

  const openFeatureEditor = (
    featureId: string,
    newFeature?: SurveyGeoJSON["features"][number],
  ) => {
    const feature =
      newFeature ??
      drawnData.features.find(
        (candidate) =>
          candidate.properties?.__surveyLayerId === featureId,
      );
    if (!feature) return;

    const properties = feature.properties;
    const project = projects.find((item) => item.id === activeProjectId);
    setEditingFeatureId(featureId);
    setFeatureMetadata({
      title:
        readFeatureText(properties, "title") ||
        getDefaultFeatureTitle(feature.geometry?.type),
      category:
        readFeatureText(properties, "featureCategory") ||
        (feature.geometry?.type?.includes("Line")
          ? "Saluran Irigasi Tersier"
          : feature.geometry?.type?.includes("Point")
            ? "Titik Kerusakan"
            : "Area Rehab Sawah"),
      photoUrls: readFeatureText(properties, "photoUrls"),
      projectTitle:
        readFeatureText(properties, "projectTitle") || project?.title || "",
      desa: readFeatureText(properties, "desa"),
      kecamatan: readFeatureText(properties, "kecamatan"),
      kabupaten: readFeatureText(properties, "kabupaten"),
      vendor:
        readFeatureText(properties, "vendor") || project?.vendor || "",
      surveyorName,
      description: readFeatureText(properties, "description"),
    });
    setFeatureFormError("");
    setFeatureEditorOpen(true);
  };

  const saveFeatureMetadata = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !featureMetadata.title.trim() ||
      !featureMetadata.projectTitle.trim() ||
      !featureMetadata.desa.trim() ||
      !featureMetadata.kecamatan.trim() ||
      !featureMetadata.kabupaten.trim()
    ) {
      setFeatureFormError(
        "Judul fitur, judul proyek, desa, kecamatan, dan kabupaten wajib diisi.",
      );
      return;
    }

    if (!editingFeatureId) return;
    setDrawnData((currentData) => ({
      ...currentData,
      features: currentData.features.map((feature) => {
        if (feature.properties?.__surveyLayerId !== editingFeatureId) {
          return feature;
        }
        return {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            ...featureMetadata,
            title: featureMetadata.title.trim(),
            featureCategory: featureMetadata.category.trim(),
            photoUrls: featureMetadata.photoUrls.trim(),
            projectTitle: featureMetadata.projectTitle.trim(),
            desa: featureMetadata.desa.trim(),
            kecamatan: featureMetadata.kecamatan.trim(),
            kabupaten: featureMetadata.kabupaten.trim(),
            vendor: featureMetadata.vendor.trim(),
            surveyorName,
            description: featureMetadata.description.trim(),
          },
        };
      }),
    }));
    setFeatureEditorOpen(false);
    setEditingFeatureId(null);
  };

  const confirmStartNewSurvey = () => {
    updateImportedData(null);
    setDrawnData(emptyCollection());
    setDrawRequest((request) => ({
      tool: "clear",
      requestId: (request?.requestId ?? 0) + 1,
    }));
    setNewSurveyRequest((request) => request + 1);
    changeProject(projects[0]?.id ?? "");
    setImportMessage("");
    setConfirmNewSurvey(false);
  };

  const importSpatialFile = async (file: File | undefined) => {
    if (!file) return;
    setImportMessage("");
    try {
      const data = await readSpatialUpload(file);
      const importedStats = measureSurveyGeoJSON(data);
      const areaHa = importedStats.areaSqm / 10_000;
      updateImportedData(data);
      setDrawnData(emptyCollection());
      setImportMessage(
        areaHa > 0
          ? `${formatNumber(data.features.length)} fitur (${areaHa.toFixed(2)} Ha) berhasil diimpor.`
          : `${formatNumber(data.features.length)} fitur berhasil diimpor.`,
      );
    } catch (error) {
      console.error("Importing survey geometry failed:", error);
      setImportMessage(
        error instanceof Error
          ? error.message
          : "Berkas spasial gagal dimuat.",
      );
    }
  };

  const loadSavedSurvey = async (survey: FieldSurveySummary) => {
    const result = await loadFieldSurveyGeoJSON(survey.id);
    if (!result.success || !result.data) {
      throw new Error(result.message);
    }
    changeProject(survey.projectId ?? "");
    setDrawnData(emptyCollection());
    updateImportedData(result.data);
  };

  const downloadGeoJSON = () => {
    if (featureCount === 0) return;
    const blob = new Blob([JSON.stringify(combinedData, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "survei-lokasi.geojson";
    link.click();
    URL.revokeObjectURL(url);
  };

  const openSurveyReport = (id: string | null) => {
    if (!id) return;
    window.open(
      `/apps/projects/map/report/${encodeURIComponent(id)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card className="flex min-w-0 flex-col gap-2 border-border bg-card px-2 py-2 shadow-sm sm:px-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-500">
            <MapPinned className="size-4" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-background p-1">
            <Button
              type="button"
              size="sm"
              variant={activeView === "map" ? "default" : "ghost"}
              className="h-8 min-w-0 whitespace-nowrap rounded px-2 text-[11px] sm:px-3 sm:text-xs"
              onClick={() => changeView("map")}
            >
              Lokasi &amp; Survei Project
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 min-w-0 whitespace-nowrap rounded px-2 text-[11px] sm:px-3 sm:text-xs"
              onClick={() => onOpenProjects?.()}
              title="Buka halaman semua project"
            >
              Semua Project
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end lg:shrink-0">
          <div className="hidden items-center gap-2.5">
            <div className="flex items-center gap-1 border-r border-border pr-2">
              <Shapes className="size-3.5 text-orange-500" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">{measurements.polygonCount}</span>
              <span className="hidden text-[9px] text-muted-foreground sm:inline">Area Polygon</span>
            </div>
            <div className="flex items-center gap-1 border-r border-border pr-2">
              <Route className="size-3.5 text-sky-500" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">{measurements.lineCount}</span>
              <span className="hidden text-[9px] text-muted-foreground sm:inline">Jalur Line</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPinned className="size-3.5 text-secondary" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">{measurements.pointCount}</span>
              <span className="hidden text-[9px] text-muted-foreground sm:inline">Titik Point</span>
            </div>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="h-8 bg-orange-600 px-2.5 text-[10px] text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 sm:h-7"
              onClick={() => {
                if (activeView === "map") changeView("details");
                startNewSurvey();
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Tambah Survei Baru
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-[10px] sm:h-7"
              asChild
            >
              <FormLabel className="cursor-pointer">
                <FileUp className="size-4" aria-hidden="true" />
                <span>Upload SHP/GeoJSON</span>
                <Input
                  type="file"
                  accept=".zip,.geojson,.json"
                  className="sr-only"
                  onChange={(event) => {
                    void importSpatialFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </FormLabel>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="col-span-2 h-8 px-2.5 text-[10px] sm:h-7 sm:inline-flex"
              onClick={downloadGeoJSON}
              disabled={featureCount === 0}
            >
              <Download className="mr-1.5 size-4" />
              Unduh GeoJSON
            </Button>
          </div>
        </div>
      </Card>

      <section
        className={`grid min-w-0 flex-none items-start gap-4 ${
          activeView === "map"
            ? "min-h-0 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1.2fr)]"
            : "min-h-[640px] lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.55fr)]"
        }`}
      >
        {activeView === "map" && (
          <div className="hidden">
          <SurveyMapControls
            projects={projects}
            activeProjectId={activeProjectId}
            surveys={surveys}
            drawnData={drawnData}
            importedData={importedData}
            measurements={measurements}
            visibility={visibility}
            importMessage={importMessage}
            onProjectChange={changeProject}
            onDrawToolSelect={(tool) =>
              setDrawRequest((request) => ({
                tool,
                requestId: (request?.requestId ?? 0) + 1,
              }))
            }
            onVisibilityChange={setVisibility}
            onEditFeatureMetadata={openFeatureEditor}
            onEditFeaturePosition={(featureId) =>
              setDrawRequest((request) => ({
                tool: "edit",
                requestId: (request?.requestId ?? 0) + 1,
                featureId,
              }))
            }
            onImportFile={(file) => void importSpatialFile(file)}
            onDownloadGeoJSON={downloadGeoJSON}
            onShowDetails={() => changeView("details")}
          />
          </div>
        )}
        <div
          className={`flex min-w-0 min-h-0 flex-col gap-3 ${
            activeView === "details" ? "lg:col-start-2" : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">
              Peta Interaktif Sebaran Polygon (
              {showAllProjects ? "Semua Proyek" : "Proyek Aktif"})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Pilih proyek aktif pada peta"
                value={activeProjectId}
                onChange={(event) => changeProject(event.target.value)}
                className="h-7 max-w-[230px] rounded-md border border-input bg-background px-2 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {projects.length === 0 ? (
                  <option value="">Belum ada proyek</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} — {project.title}
                    </option>
                  ))
                )}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setShowAllProjects((value) => !value)}
              >
                {showAllProjects ? "Filter Project" : "Lihat Semua Project"}
              </Button>
            </div>
          </div>
          {activeView === "map" && importMessage && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-sm"
            >
              <span>{importMessage}</span>
              <div className="flex items-center gap-2">
                {importedData && importedData.features.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => changeView("details")}
                  >
                    Simpan ke Detail Survei
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setImportMessage("")}
                >
                  Tutup
                </Button>
              </div>
            </div>
          )}
          <Card className="h-[500px] min-h-0 w-full max-w-full overflow-hidden p-1.5 shadow-sm">
            <ProjectMapLoader
              importedData={importedData}
              importedDataVersion={importedDataVersion}
              drawnData={drawnData}
              visibility={visibility}
              drawRequest={drawRequest}
              onVisibilityChange={setVisibility}
              onDrawnDataChange={setDrawnData}
              onDrawToolSelect={(tool, featureId) =>
                setDrawRequest((request) => ({
                  tool,
                  requestId: (request?.requestId ?? 0) + 1,
                  ...(featureId ? { featureId } : {}),
                }))
              }
              onFeatureCreated={(feature) => {
                changeView("details");
              }}
              onFeatureSelected={() => {
                changeView("details");
              }}
              globalPolygons={displayedGlobalPolygons}
            />
          </Card>
          <Card className={`${activeView === "map" ? "hidden" : ""} border-slate-800 bg-slate-900/50 p-4 text-slate-300`}>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-xs text-slate-400">
                Tipe Geometri{" "}
                <span className="block font-medium text-slate-100">
                  {geometryLabel}
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Koordinat Pusat{" "}
                <span className="block font-medium text-slate-100">
                  {coordinateLabel}
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Jarak Keliling{" "}
                <span className="block font-medium text-slate-100">
                  {measurements.perimeterM > 0
                    ? `${formatNumber(measurements.perimeterM)} meter`
                    : "—"}
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Waktu Pengambilan{" "}
                <span className="block font-medium text-slate-100">
                  {captureTime}
                </span>
              </p>
            </div>
            {importMessage && (
              <p
                role="status"
                className="mt-3 rounded-md border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300"
              >
                {importMessage}
              </p>
            )}
            {drawnData.features.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                <h2 className="text-xs font-semibold text-slate-200">
                  Fitur pada peta
                </h2>
                <ul className="space-y-1.5">
                  {drawnData.features.map((feature, index) => {
                    const featureId = feature.properties?.__surveyLayerId;
                    if (typeof featureId !== "string") return null;
                    const title =
                      readFeatureText(feature.properties, "title") ||
                      `Fitur ${index + 1}`;
                    return (
                      <li
                        key={featureId}
                        className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/30 px-2 py-1.5"
                      >
                        <MapPin className="size-3.5 shrink-0 text-orange-400" />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                          {title}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-slate-300 hover:bg-slate-800"
                          aria-label={`Edit detail ${title}`}
                          onClick={() => openFeatureEditor(featureId)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-slate-300 hover:bg-slate-800"
                          aria-label={`Edit posisi ${title}`}
                          onClick={() =>
                            setDrawRequest((request) => ({
                              tool: "edit",
                              requestId: (request?.requestId ?? 0) + 1,
                              featureId,
                            }))
                          }
                        >
                          <MapPinned className="size-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        </div>
        {activeView === "map" && (
          <Card className="min-w-0 self-start border-border bg-card p-4 shadow-sm lg:min-h-[547px]">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
                Detail Project Aktif
              </h2>
              <span className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-500">
                {projects.find((project) => project.id === activeProjectId)?.code ?? "—"}
              </span>
            </div>
            {(() => {
              const activeProject = projects.find((project) => project.id === activeProjectId);
              const activeSurvey = surveys.find((survey) => survey.projectId === activeProjectId) ?? null;
              const resolvedLocation =
                activeSurvey?.locationName ?? activeProject?.location ?? "—";
              const resolvedArea = activeSurvey?.areaSqm
                ? `${(activeSurvey.areaSqm / 10000).toFixed(2)} Ha`
                : measurements.areaSqm > 0
                  ? `${(measurements.areaSqm / 10000).toFixed(2)} Ha (draft)`
                  : activeProject?.landArea
                    ? `${activeProject.landArea} Ha`
                    : "—";
              const resolvedSurveyor =
                activeSurvey?.surveyorName ?? activeProject?.fieldPicName ?? "—";
              const resolvedNotes =
                activeSurvey?.notes ??
                (activeSurvey
                  ? "Belum ada keterangan."
                  : "Belum ada data survei lapangan.");
              return (
                <>
                  <div className="grid grid-cols-[90px_10px_1fr] gap-y-3 text-xs">
                    <span className="font-semibold text-muted-foreground">Project ID</span><span>:</span><span>{activeProject?.code ?? activeSurvey?.projectCode ?? "—"}</span>
                    <span className="font-semibold text-muted-foreground">Nama Project</span><span>:</span><span>{activeProject?.title ?? activeSurvey?.projectName ?? "—"}</span>
                    <span className="font-semibold text-muted-foreground">Lokasi</span><span>:</span><span>{resolvedLocation}</span>
                    <span className="font-semibold text-muted-foreground">Luas</span><span>:</span><span>{resolvedArea}</span>
                    <span className="font-semibold text-muted-foreground">Tanggal Survei</span><span>:</span><span>{activeSurvey?.createdAt ? new Date(activeSurvey.createdAt).toLocaleDateString("id-ID") : "—"}</span>
                    <span className="font-semibold text-muted-foreground">Surveyor</span><span>:</span><span>{resolvedSurveyor}</span>
                    <span className="font-semibold text-muted-foreground">Keterangan</span><span>:</span><span>{resolvedNotes}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                    <ActionIconButton
                      type="button"
                      label="Edit data survei"
                      tooltip="Edit data survei"
                      icon={Pencil}
                      onClick={() => changeView("details")}
                    />
                    {activeSurvey && (
                      <ActionIconButton
                        type="button"
                        label="Tampilkan PDF laporan survei"
                        tooltip="Tampilkan PDF"
                        icon={FileText}
                        onClick={() => {
                          setReportSurveyId(activeSurvey.id);
                          setReportPreviewOpen(true);
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Legenda</p>
                    <div className="space-y-2 text-xs">
                      <p><span className="mr-2 inline-block size-3 rounded-sm bg-[#0f2c59]" />Project sedang berjalan</p>
                      <p><span className="mr-2 inline-block size-3 rounded-sm bg-[#facc15]" />Polygon survei project</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </Card>
        )}
        <div className={activeView === "details" ? "min-h-0" : "hidden"}>
          <SurveyForm
            key={newSurveyRequest}
            projects={projects}
            surveys={surveys}
            surveyorName={surveyorName}
            initialProjectId={activeProjectId}
            geoJsonData={combinedData}
            geometryType={geometryKinds.join(", ")}
            centerCoordinate={
              centerCoordinate
                ? `${centerCoordinate.latitude.toFixed(6)}, ${centerCoordinate.longitude.toFixed(6)}`
                : ""
            }
            perimeterM={measurements.perimeterM}
            captureTime={captureTime}
            onProjectChange={changeProject}
            onCancel={startNewSurvey}
            onLoadSurvey={loadSavedSurvey}
            onSavedSurvey={setReportSurveyId}
          />
        </div>
      </section>
      {activeView === "map" && (
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
              Tabel Data Hasil Survei Lapangan
            </h2>
            <Input
              className="h-8 max-w-[260px] text-xs"
              placeholder="Cari project, lokasi, atau surveyor..."
              value={surveySearch}
              onChange={(event) => setSurveySearch(event.target.value)}
            />
          </div>
          <NativeDataTable itemLabel="survei">
            <table className="app-data-table min-w-[900px] text-left text-xs">
              <thead className="bg-muted/70 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  {["No", "ID Project / No. SPK", "Nama Project", "Lokasi / Kategori", "Luas (Ha)", "Tanggal Survei", "Tim & Koordinator", "Status", "Aksi"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const keyword = surveySearch.trim().toLowerCase();
                  const surveyedProjectIds = new Set(
                    surveys.map((survey) => survey.projectId).filter(Boolean),
                  );
                  type SurveyTableRow =
                    | {
                        kind: "survey";
                        key: string;
                        survey: FieldSurveySummary;
                        project: SurveyProjectOption | undefined;
                      }
                    | {
                        kind: "project";
                        key: string;
                        project: SurveyProjectOption;
                      };
                  const combinedRows: SurveyTableRow[] = [
                    ...surveys.map((survey) => ({
                      kind: "survey" as const,
                      key: `survey-${survey.id}`,
                      survey,
                      project: projects.find((item) => item.id === survey.projectId),
                    })),
                    ...projects
                      .filter((project) => !surveyedProjectIds.has(project.id))
                      .map((project) => ({
                        kind: "project" as const,
                        key: `project-${project.id}`,
                        project,
                      })),
                  ];
                  const filteredRows = combinedRows.filter((row) => {
                    if (!keyword) return true;
                    if (row.kind === "survey") {
                      const code = row.project?.code ?? row.survey.projectCode ?? "";
                      const title = row.project?.title ?? row.survey.projectName;
                      const location = row.survey.locationName;
                      const surveyor = row.survey.surveyorName;
                      return [code, title, location, surveyor]
                        .join(" ")
                        .toLowerCase()
                        .includes(keyword);
                    }
                    return [
                      row.project.code,
                      row.project.title,
                      row.project.location ?? "",
                      row.project.fieldPicName ?? "",
                      "belum survei",
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(keyword);
                  });

                  if (filteredRows.length === 0) {
                    return (
                      <tr className="border-t border-border">
                        <td
                          colSpan={9}
                          className="px-3 py-6 text-center text-xs text-muted-foreground"
                        >
                          Tidak ada data proyek atau survei yang cocok dengan pencarian.
                        </td>
                      </tr>
                    );
                  }

                  return filteredRows.map((row, index) => {
                    if (row.kind === "survey") {
                      const { survey, project } = row;
                      const running = ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(
                        project?.status ?? "",
                      );
                      return (
                        <tr
                          key={row.key}
                          className={`border-t border-border ${
                            survey.projectId === activeProjectId
                              ? "bg-orange-500/5"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="px-3 py-3">{index + 1}</td>
                          <td className="px-3 py-3 font-semibold">
                            {project?.code ?? survey.projectCode ?? "—"}
                          </td>
                          <td className="px-3 py-3">
                            {project?.title ?? survey.projectName}
                          </td>
                          <td className="px-3 py-3">
                            {survey.locationName}
                            <span className="block text-[10px] text-muted-foreground">
                              {survey.objectCategory ?? "Polygon"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {survey.areaSqm ? (survey.areaSqm / 10000).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {new Date(survey.createdAt).toLocaleDateString("id-ID")}
                          </td>
                          <td className="px-3 py-3">{survey.surveyorName}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${
                                running
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : "bg-amber-500/15 text-amber-500"
                              }`}
                            >
                              <span
                                className={`size-2 rounded-full ${
                                  running ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                              />
                              {running ? "Aktif" : "Menunggu Setup"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <ActionIconButton
                              type="button"
                              label={`Lihat detail survei ${project?.code ?? survey.projectCode ?? ""}`}
                              tooltip="Lihat Detail"
                              icon={Eye}
                              onClick={() => {
                                if (survey.projectId) changeProject(survey.projectId);
                                if (isSurveyDetailsUnderMaintenance) {
                                  changeView("details");
                                  return;
                                }
                                setDetailSurveyId(survey.id);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    }

                    const { project } = row;
                    return (
                      <tr
                        key={row.key}
                        className={`border-t border-border ${
                          project.id === activeProjectId
                            ? "bg-orange-500/5"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="px-3 py-3">{index + 1}</td>
                        <td className="px-3 py-3 font-semibold">{project.code}</td>
                        <td className="px-3 py-3">{project.title}</td>
                        <td className="px-3 py-3">
                          {project.location ?? "—"}
                          <span className="block text-[10px] text-muted-foreground">
                            Belum ada data spasial
                          </span>
                        </td>
                        <td className="px-3 py-3">{project.landArea ?? "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">—</td>
                        <td className="px-3 py-3">
                          {project.fieldPicName ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                            <span className="size-2 rounded-full bg-muted-foreground/60" />
                            Belum Survei
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <ActionIconButton
                            type="button"
                            label={`Input survei proyek ${project.code}`}
                            tooltip="Input Survei"
                            icon={FileUp}
                            onClick={() => {
                              changeProject(project.id);
                              changeView("details");
                            }}
                          />
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </NativeDataTable>
        </Card>
      )}

      <p className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>Skala Prioritas · Dashboard GIS & Survei Lapangan</span>
        <span className="inline-flex items-center gap-1">
          {surveys.length} survei terbaru · {formatNumber(featureCount)} fitur aktif
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </span>
      </p>
      <SurveyDetailModal
        open={detailSurvey !== null}
        onClose={() => setDetailSurveyId(null)}
        survey={detailSurvey}
        project={detailProject}
        savePhotoToDatabase={(surveyId, photos) =>
          saveFieldSurveyPhotoUrls({ surveyId, photos })
        }
        onEditData={() => {
          setDetailSurveyId(null);
        }}
        onAddInformation={() => {
          setDetailSurveyId(null);
        }}
        onAddPhoto={() => {
          setDetailSurveyId(null);
        }}
      />
      <GlobalModal
        isOpen={reportPreviewOpen && reportSurveyId !== null}
        onClose={() => setReportPreviewOpen(false)}
        title="Pratinjau PDF: Rekap Hasil Survei Lapangan"
        description="Laporan mengikuti template A4. Gunakan cetak untuk menyimpan sebagai PDF."
        hideHeader
        footerNote=""
        className="z-[2100] h-[min(90dvh,900px)] w-[calc(100vw-24px)] max-w-5xl rounded-lg"
        overlayClassName="z-[2099]"
        bodyClassName="!flex !flex-col !space-y-0 !overflow-hidden !p-0 bg-[#303030]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-700 bg-[#3f4145] shadow-inner">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-600 bg-[#25272b] px-3 py-2 text-slate-100">
              <span className="mr-auto min-w-0 flex-1 basis-40 truncate text-sm font-medium">
                Vendor: {selectedReportProject?.vendor || "Belum ditentukan"}
              </span>
              <Button
                type="button"
                size="sm"
                className="h-9 bg-secondary px-3 text-secondary-foreground hover:bg-secondaryemphasis"
                onClick={() => reportFrameRef.current?.contentWindow?.print()}
              >
                <Download className="mr-1.5 size-4" />
                <span className="whitespace-nowrap">Unduh / Download</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-primary px-3 text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => reportFrameRef.current?.contentWindow?.print()}
              >
                <Printer className="mr-1.5 size-4" />
                <span className="whitespace-nowrap">Cetak / Print</span>
              </Button>
            </div>
            <div
              ref={reportViewerRef}
              className="flex min-h-0 flex-1 justify-center overflow-auto p-3 sm:p-6"
            >
              <div
                className="relative mx-auto shrink-0"
                style={reportPageSize}
              >
                <iframe
                  ref={reportFrameRef}
                  title="Laporan survei A4"
                  src={
                    reportSurveyId
                      ? `/report/${encodeURIComponent(reportSurveyId)}`
                      : undefined
                  }
                  className="absolute left-0 top-0 h-[297mm] w-[210mm] origin-top-left border-0 bg-white shadow-2xl"
                  style={{ transform: `scale(${reportScale})` }}
                />
              </div>
            </div>
          </div>
        </div>
      </GlobalModal>
      <GlobalModal
        isOpen={featureEditorOpen}
        onClose={() => {
          setFeatureEditorOpen(false);
          setEditingFeatureId(null);
        }}
        title="Detail fitur survei"
        description="Lengkapi informasi lokasi dan keterangan untuk fitur yang baru digambar. Nama surveyor diambil dari akun yang sedang digunakan."
        className="z-[2001] max-h-[calc(100vh-2rem)] sm:max-w-2xl"
        overlayClassName="z-[2000]"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeatureEditorOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="feature-metadata-form"
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              Simpan detail fitur
            </Button>
          </>
        }
      >
          <form
            id="feature-metadata-form"
            onSubmit={saveFeatureMetadata}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="feature-title">Judul fitur</Label>
                <Input
                  id="feature-title"
                  value={featureMetadata.title}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  maxLength={160}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-category">Kategori fitur rehab sawah</Label>
                <select
                  id="feature-category"
                  value={featureMetadata.category}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option>Saluran Irigasi Primer</option>
                  <option>Saluran Irigasi Sekunder</option>
                  <option>Saluran Irigasi Tersier</option>
                  <option>Area Rehab Sawah</option>
                  <option>Tanggul Rusak</option>
                  <option>Titik Kerusakan</option>
                  <option>Lainnya</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-project-title">Judul proyek</Label>
                <Input
                  id="feature-project-title"
                  value={featureMetadata.projectTitle}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      projectTitle: event.target.value,
                    }))
                  }
                  maxLength={160}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-desa">Desa</Label>
                <Input
                  id="feature-desa"
                  value={featureMetadata.desa}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      desa: event.target.value,
                    }))
                  }
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-kecamatan">Kecamatan</Label>
                <Input
                  id="feature-kecamatan"
                  value={featureMetadata.kecamatan}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      kecamatan: event.target.value,
                    }))
                  }
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-kabupaten">Kabupaten</Label>
                <Input
                  id="feature-kabupaten"
                  value={featureMetadata.kabupaten}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      kabupaten: event.target.value,
                    }))
                  }
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feature-vendor">Vendor</Label>
                <Input
                  id="feature-vendor"
                  value={featureMetadata.vendor}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      vendor: event.target.value,
                    }))
                  }
                  placeholder="Nama vendor (opsional)"
                  maxLength={180}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="feature-surveyor">Surveyor (akun aktif)</Label>
                <Input
                  id="feature-surveyor"
                  value={surveyorName}
                  readOnly
                  aria-readonly="true"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="feature-description">Keterangan fitur</Label>
                <Textarea
                  id="feature-description"
                  value={featureMetadata.description}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Catatan untuk titik, jalur, atau area ini..."
                  maxLength={2000}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="feature-photo-urls">Foto fitur (URL Cloudinary, pisahkan dengan koma)</Label>
                <Input
                  id="feature-photo-urls"
                  value={featureMetadata.photoUrls}
                  onChange={(event) =>
                    setFeatureMetadata((current) => ({
                      ...current,
                      photoUrls: event.target.value,
                    }))
                  }
                  placeholder="https://res.cloudinary.com/.../foto.jpg"
                />
                <p className="text-[10px] text-slate-400">
                  Masukkan URL foto manual untuk referensi fitur. Unggah foto dokumentasi utama dilakukan pada modal detail survei.
                </p>
              </div>
            </div>
            {featureFormError && (
              <p role="alert" className="text-sm text-destructive">
                {featureFormError}
              </p>
            )}
          </form>
      </GlobalModal>
      <AlertDialog open={confirmNewSurvey} onOpenChange={setConfirmNewSurvey}>
        <AlertDialogContent
          className="z-[2001]"
          overlayClassName="z-[2000]"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Mulai survei baru?</AlertDialogTitle>
            <AlertDialogDescription>
              Data gambar, hasil impor, dan metadata yang belum disimpan pada
              survei saat ini akan dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={confirmStartNewSurvey}
            >
              Mulai Survei Baru
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
