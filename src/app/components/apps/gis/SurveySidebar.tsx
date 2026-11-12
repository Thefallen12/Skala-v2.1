"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import {
  AlertCircle,
  Check,
  Clock3,
  FileUp,
  MapPinned,
  MapPin,
  Pencil,
  Pentagon,
  Route,
  Ruler,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  loadFieldSurveyGeoJSON,
  saveFieldSurvey,
} from "@/app/actions/field-surveys";
import {
  isSurveyGeoJSON,
  measureSurveyGeoJSON,
  type SurveyGeoJSON,
} from "@/lib/field-survey-geojson";
import { readSpatialUpload } from "./geojson-upload";
import type { SurveyDrawTool } from "./ProjectMapLoader";

export type SurveyProjectOption = {
  id: string;
  code: string;
  title: string;
  vendor: string;
  status: ProjectStatus;
  location?: string | null;
  fieldPicName?: string | null;
  landArea?: string | null;
};

export type FieldSurveyFeatureSummary = {
  id: string;
  featureCategory: string;
  name: string;
  description: string | null;
  geometryType: string;
  geoJsonData: SurveyGeoJSON["features"][number];
  areaSqm: number | null;
  lengthM: number | null;
  photoUrls: string[];
};

export type FieldSurveyPhotoSummary = {
  id?: string;
  url: string;
  caption: string;
};

export type FieldSurveySummary = {
  id: string;
  projectId: string | null;
  projectName: string;
  locationName: string;
  responsibleName: string;
  surveyorName: string;
  surveyName?: string;
  projectCode?: string | null;
  objectCategory?: string;
  vegetationType?: string | null;
  topography?: string | null;
  landOwnership?: string | null;
  documentationUrls?: string[];
  photos?: FieldSurveyPhotoSummary[];
  areaSqm: number | null;
  lengthM: number | null;
  perimeterM: number | null;
  geoJsonData?: SurveyGeoJSON;
  notes: string | null;
  createdAt: string;
  surveyType?: string;
  features?: FieldSurveyFeatureSummary[];
};

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(value);
}

function formatArea(value: number) {
  return `${formatNumber(value / 10_000, 2)} Ha`;
}

function formatDistance(value: number) {
  return value >= 1_000
    ? `${formatNumber(value / 1_000, 2)} km · ${formatNumber(value)} m`
    : `${formatNumber(value)} m`;
}

function mergeSurveyData(
  importedData: SurveyGeoJSON | null,
  drawnData: SurveyGeoJSON,
): SurveyGeoJSON {
  return {
    type: "FeatureCollection",
    features: [...(importedData?.features ?? []), ...drawnData.features],
  };
}

export default function SurveySidebar({
  projects,
  surveys,
  surveyorName,
  initialProjectId,
  importedData,
  drawnData,
  onProjectChange,
  onImportedDataChange,
  onDrawnDataChange,
  onDrawToolSelect,
  onEditFeatureMetadata,
  onEditFeaturePosition,
  newSurveyRequest,
}: {
  projects: SurveyProjectOption[];
  surveys: FieldSurveySummary[];
  surveyorName: string;
  initialProjectId: string;
  importedData: SurveyGeoJSON | null;
  drawnData: SurveyGeoJSON;
  onProjectChange: (projectId: string) => void;
  onImportedDataChange: (data: SurveyGeoJSON | null) => void;
  onDrawnDataChange: (data: SurveyGeoJSON) => void;
  onDrawToolSelect: (tool: SurveyDrawTool) => void;
  onEditFeatureMetadata: (featureId: string) => void;
  onEditFeaturePosition: (featureId: string) => void;
  newSurveyRequest: number;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [locationName, setLocationName] = useState("");
  const [responsibleName, setResponsibleName] = useState(surveyorName);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [loadingSurveyId, setLoadingSurveyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locationNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newSurveyRequest === 0) return;
    locationNameInputRef.current?.focus();
    locationNameInputRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [newSurveyRequest]);

  const combinedData = useMemo(
    () => mergeSurveyData(importedData, drawnData),
    [drawnData, importedData],
  );
  const measurements = useMemo(
    () => (isSurveyGeoJSON(combinedData) ? measureSurveyGeoJSON(combinedData) : null),
    [combinedData],
  );

  const changeProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    onProjectChange(nextProjectId);
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const data = await readSpatialUpload(file);
        onImportedDataChange(data);
        onDrawnDataChange({ type: "FeatureCollection", features: [] });
        setUploadName(file.name);
        setMessage({
          type: "success",
          text: `${formatNumber(data.features.length, 0)} fitur berhasil dimuat dari ${file.name}.`,
        });
      } catch (error) {
        console.error("Importing spatial survey file failed:", error);
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Berkas spasial gagal diproses.",
        });
      }
    });
  };

  const loadSurvey = async (survey: FieldSurveySummary) => {
    setLoadingSurveyId(survey.id);
    setMessage(null);
    try {
      const result = await loadFieldSurveyGeoJSON(survey.id);
      if (!result.success || !result.data) {
        setMessage({ type: "error", text: result.message });
        return;
      }
      onProjectChange(survey.projectId ?? "");
      setProjectId(survey.projectId ?? "");
      onDrawnDataChange({ type: "FeatureCollection", features: [] });
      onImportedDataChange(result.data);
      setLocationName(survey.locationName);
      setResponsibleName(survey.responsibleName);
      setNotes(survey.notes ?? "");
      setUploadName(`Survei tersimpan · ${survey.locationName}`);
      setMessage({ type: "success", text: "Data survei berhasil dimuat ke peta." });
    } catch (error) {
      console.error("Loading saved survey failed:", error);
      setMessage({ type: "error", text: "Survei gagal dimuat. Silakan coba kembali." });
    } finally {
      setLoadingSurveyId(null);
    }
  };

  const submitSurvey = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!projectId) {
      setMessage({ type: "error", text: "Pilih proyek terlebih dahulu." });
      return;
    }
    if (!isSurveyGeoJSON(combinedData)) {
      setMessage({
        type: "error",
        text: "Gambarkan atau unggah minimal satu fitur spasial sebelum menyimpan.",
      });
      return;
    }

    startTransition(async () => {
      const result = await saveFieldSurvey({
        projectId: projectId || null,
        locationName,
        responsibleName,
        notes,
        geoJsonData: combinedData,
      });
      setMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });
      if (result.success) {
        setLocationName("");
        setNotes("");
        const nextProjectId = projectId || "none";
        router.replace(
          `/apps/projects?section=surveys&view=details&projectId=${encodeURIComponent(nextProjectId)}`,
          { scroll: false },
        );
        router.refresh();
      }
    });
  };

  const projectName = projects.find((project) => project.id === projectId)?.title ?? "—";
  const objectTypes = [
    measurements && measurements.polygonCount > 0 ? "POLYGON" : null,
    measurements && measurements.lineCount > 0 ? "LINE" : null,
    measurements && measurements.pointCount > 0 ? "POINT" : null,
  ].filter(Boolean);
  const distance =
    measurements && measurements.lengthM > 0
      ? formatDistance(measurements.lengthM)
      : "—";
  const perimeter =
    measurements && measurements.perimeterM > 0
      ? formatDistance(measurements.perimeterM)
      : "—";
  return (
    <Card className="flex h-[min(74vh,720px)] min-h-[480px] flex-col overflow-hidden border-border/85 bg-card/55 p-0 xl:h-full xl:min-h-0">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-5 p-4">
          <section className="space-y-2">
            <h2 className="text-xs font-bold text-foreground">
              Alat Pemetaan (Draw Tools)
            </h2>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["point", "Point", MapPin],
                  ["line", "Line", Route],
                  ["polygon", "Polygon", Pentagon],
                  ["ruler", "Penggaris", Ruler],
                ] as const
              ).map(([tool, label, Icon]) => (
                <Button
                  key={tool}
                  type="button"
                  variant="outline"
                  className="h-auto min-w-0 flex-col gap-1 px-1 py-2 text-[10px] font-medium"
                  onClick={() => onDrawToolSelect(tool)}
                >
                  <Icon className="size-4 text-secondary" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <h2 className="text-xs font-bold text-foreground">
              Unggah File SHP/GeoJSON
            </h2>
            <Label
              htmlFor="survey-spatial-file"
              className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-background/30 px-3 py-3 text-center transition hover:border-secondary/60 hover:bg-muted/50"
            >
              <FileUp className="size-5 text-secondary" aria-hidden="true" />
              <span className="text-[10px] font-bold text-foreground">
                {uploadName || "Pilih ZIP Shapefile atau GeoJSON"}
              </span>
              <span className="text-[9px] text-muted-foreground">
                ZIP maks. 25 MB · sistem koordinat WGS84
              </span>
              <Input
                id="survey-spatial-file"
                type="file"
                accept=".zip,.geojson,.json"
                className="sr-only"
                disabled={isPending}
                onChange={(event) => {
                  importFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </Label>
            {importedData && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => {
                  onImportedDataChange(null);
                  setUploadName("");
                }}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Hapus layer impor
              </Button>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Estimasi Luasan & Jarak (Kalkulator GIS)
            </h2>
            <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  TIPE OBJEK
                </span>
                <span className="text-xs font-bold text-secondary">
                  {objectTypes.length > 0 ? objectTypes.join(" · ") : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  ESTIMASI LUAS
                </span>
                <span className="text-sm font-black text-foreground">
                  {measurements && measurements.areaSqm > 0
                    ? formatArea(measurements.areaSqm)
                    : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  PANJANG JALUR
                </span>
                <span className="text-xs font-bold text-foreground">{distance}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  KELILING POLYGON
                </span>
                <span className="text-xs font-bold text-foreground">{perimeter}</span>
              </div>
              <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
                {projectName} · {measurements?.polygonCount ?? 0} area ·{" "}
                {measurements?.lineCount ?? 0} jalur · {measurements?.pointCount ?? 0} titik
              </div>
            </div>
          </section>

          <form onSubmit={submitSurvey} className="flex flex-1 flex-col space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <MapPinned className="size-4 text-secondary" aria-hidden="true" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Atribut & Form Data Survei
              </h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="survey-project" className="text-[10px] font-bold uppercase text-muted-foreground">
                Proyek
              </Label>
              <Select value={projectId} onValueChange={changeProject}>
                <SelectTrigger id="survey-project" className="h-9 w-full bg-background text-xs">
                  <SelectValue placeholder="Pilih proyek" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada proyek yang dapat dipetakan untuk akun ini.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="survey-location-name" className="text-[10px] font-bold uppercase text-muted-foreground">
                Nama lokasi / proyek
              </Label>
              <Input
                id="survey-location-name"
                ref={locationNameInputRef}
                className="h-9 bg-background text-xs"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Contoh: Area proyek Bintang Kejora"
                maxLength={160}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="survey-responsible" className="text-[10px] font-bold uppercase text-muted-foreground">
                Penanggung jawab
              </Label>
              <Input
                id="survey-responsible"
                className="h-9 bg-background text-xs"
                value={responsibleName}
                onChange={(event) => setResponsibleName(event.target.value)}
                placeholder="Nama penanggung jawab survei"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="survey-notes" className="text-[10px] font-bold uppercase text-muted-foreground">
                Catatan lapangan / keterangan
              </Label>
              <Textarea
                id="survey-notes"
                className="resize-none bg-background text-xs"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Kondisi medan, akses, patok, atau informasi lapangan..."
                maxLength={5000}
                rows={3}
              />
            </div>
            {message && (
              <p
                role={message.type === "error" ? "alert" : "status"}
                className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                  message.type === "error"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {message.type === "error" ? (
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                )}
                {message.text}
              </p>
            )}
            <Button
              type="submit"
              className="mt-auto w-full bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
              disabled={
                isPending ||
                !projectId ||
                !locationName.trim() ||
                !responsibleName.trim() ||
                !isSurveyGeoJSON(combinedData)
              }
            >
              <Save className="mr-2 size-4" />
              {isPending ? "Menyimpan..." : "Simpan Atribut Data"}
            </Button>
          </form>

          {drawnData.features.length > 0 && (
            <section className="space-y-2 border-t border-border pt-4">
              <h2 className="text-sm font-semibold">Fitur Survei</h2>
              <ul className="space-y-2">
                {drawnData.features.map((feature, index) => {
                  const properties = feature.properties;
                  const featureId = properties?.__surveyLayerId;
                  const id = typeof featureId === "string" ? featureId : null;
                  const title =
                    typeof properties?.title === "string" &&
                    properties.title.trim()
                      ? properties.title
                      : `Fitur ${index + 1}`;
                  const geometryType = feature.geometry?.type ?? "Geometry";
                  const label =
                    geometryType.includes("Polygon")
                      ? "Polygon"
                      : geometryType.includes("Line")
                        ? "Line"
                        : "Point";

                  return (
                    <li
                      key={id ?? index}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {title}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {label}
                        </span>
                      </span>
                      {id && (
                        <>
                          <ActionIconButton
                            type="button"
                            label={`Edit data ${title}`}
                            tooltip={`Edit data ${title}`}
                            icon={Pencil}
                            onClick={() => onEditFeatureMetadata(id)}
                          />
                          <ActionIconButton
                            type="button"
                            label={`Edit posisi ${title}`}
                            tooltip={`Edit posisi ${title}`}
                            icon={MapPin}
                            onClick={() => onEditFeaturePosition(id)}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="space-y-2 border-t border-border pt-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-secondary" aria-hidden="true" />
              Survei Tersimpan
            </h2>
            {surveys.length === 0 ? (
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                Belum ada survei yang tersimpan untuk proyek yang dapat Anda akses.
              </p>
            ) : (
              <ul className="space-y-2">
                {surveys.map((survey) => (
                  <li key={survey.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                      disabled={loadingSurveyId !== null}
                      onClick={() => void loadSurvey(survey)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {survey.locationName}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {survey.projectName} · {survey.surveyorName}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                          {new Date(survey.createdAt).toLocaleDateString("id-ID")} ·{" "}
                          {formatNumber((survey.areaSqm ?? 0) / 10_000, 2)} Ha ·{" "}
                          {formatDistance(survey.lengthM ?? 0)}
                        </span>
                      </span>
                      {loadingSurveyId === survey.id ? (
                        <Upload className="size-4 animate-pulse" />
                      ) : (
                        <FileUp className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ScrollArea>
    </Card>
  );
}
