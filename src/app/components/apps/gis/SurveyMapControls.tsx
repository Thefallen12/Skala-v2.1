"use client";

import {
  Download,
  FileUp,
  MapPin,
  MapPinned,
  MousePointer2,
  Pentagon,
  Pencil,
  Route,
  Ruler,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SurveyGeoJSON, SurveyMeasurements } from "@/lib/field-survey-geojson";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "./SurveySidebar";
import type {
  SurveyDrawTool,
  SurveyLayerVisibility,
} from "./ProjectMapLoader";

const drawTools: {
  id: SurveyDrawTool;
  label: string;
  icon: typeof MapPin;
}[] = [
  { id: "select", label: "Pilih", icon: MousePointer2 },
  { id: "point", label: "Point", icon: MapPin },
  { id: "line", label: "Line", icon: Route },
  { id: "polygon", label: "Polygon", icon: Pentagon },
  { id: "ruler", label: "Ukur", icon: Ruler },
];

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
  }).format(value);
}

export default function SurveyMapControls({
  projects,
  activeProjectId,
  surveys,
  drawnData,
  importedData,
  measurements,
  visibility,
  importMessage,
  onProjectChange,
  onDrawToolSelect,
  onVisibilityChange,
  onEditFeatureMetadata,
  onEditFeaturePosition,
  onImportFile,
  onDownloadGeoJSON,
  onShowDetails,
}: {
  projects: SurveyProjectOption[];
  activeProjectId: string;
  surveys: FieldSurveySummary[];
  drawnData: SurveyGeoJSON;
  importedData: SurveyGeoJSON | null;
  measurements: SurveyMeasurements;
  visibility: SurveyLayerVisibility;
  importMessage: string;
  onProjectChange: (projectId: string) => void;
  onDrawToolSelect: (tool: SurveyDrawTool) => void;
  onVisibilityChange: (visibility: SurveyLayerVisibility) => void;
  onEditFeatureMetadata: (featureId: string) => void;
  onEditFeaturePosition: (featureId: string) => void;
  onImportFile: (file: File | undefined) => void;
  onDownloadGeoJSON: () => void;
  onShowDetails: () => void;
}) {
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectSurveys = surveys.filter(
    (survey) =>
      (activeProjectId
        ? survey.projectId === activeProjectId
        : survey.projectId === null),
  );
  const visibleLayers: {
    key: keyof SurveyLayerVisibility;
    label: string;
  }[] = [
    { key: "polygon", label: "Batas Area Proyek (Polygon)" },
    { key: "line", label: "Jalur Logistik (Line)" },
    { key: "point", label: "Titik Survei (Point)" },
  ];

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-border bg-card/90">
      <div className="space-y-4 overflow-y-auto p-4">
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Alat Pemetaan
            </h2>
            <p className="text-xs text-muted-foreground">Pilih objek untuk digambar</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {drawTools.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                className="h-auto min-w-0 flex-col gap-1.5 px-2 py-2 text-xs"
                onClick={() => onDrawToolSelect(id)}
              >
                <Icon className="size-4 text-secondary" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <Label htmlFor="map-survey-project" className="text-sm font-semibold">
            Proyek berkontrak terkait (opsional)
          </Label>
          <Select
            value={activeProjectId || "preproject"}
            onValueChange={(value) =>
              onProjectChange(value === "preproject" ? "" : value)
            }
          >
            <SelectTrigger id="map-survey-project">
              <SelectValue placeholder="Pilih proyek" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preproject">
                Survei Pra-Proyek · belum terikat kontrak
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.code ? `${project.code} · ` : ""}
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeProject && (
            <p className="text-xs text-muted-foreground">
              Vendor: {activeProject.vendor || "Belum ditentukan"}
            </p>
          )}
          {!activeProject && (
            <p className="text-xs text-muted-foreground">
              Survei ini belum dikaitkan dengan proyek berkontrak.
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-foreground">
            Unggah SHP / GeoJSON
          </h2>
          <Label
            htmlFor="survey-map-upload"
            className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-center hover:bg-muted"
          >
            <FileUp className="size-5 text-secondary" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">
              Pilih ZIP Shapefile atau GeoJSON
            </span>
            <span className="text-[11px] text-muted-foreground">
              ZIP maks. 25 MB · WGS84
            </span>
            <Input
              id="survey-map-upload"
              type="file"
              accept=".zip,.geojson,.json"
              className="sr-only"
              onChange={(event) => {
                onImportFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </Label>
          {importedData && (
            <p className="text-xs text-muted-foreground">
              {formatNumber(importedData.features.length, 0)} fitur hasil impor
            </p>
          )}
          {importMessage && (
            <p role="status" className="text-xs text-muted-foreground">
              {importMessage}
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-foreground">
            Daftar Layer Proyek
          </h2>
          <div className="space-y-2">
            {visibleLayers.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`survey-layer-${key}`}
                  checked={visibility[key]}
                  onCheckedChange={(checked) =>
                    onVisibilityChange({
                      ...visibility,
                      [key]: checked === true,
                    })
                  }
                />
                <Label
                  htmlFor={`survey-layer-${key}`}
                  className="cursor-pointer text-xs font-normal text-muted-foreground"
                >
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-foreground">
            Kalkulator GIS (Luas & Jarak)
          </h2>
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Area terhitung</span>
              <span className="text-right font-medium text-foreground">
                {measurements.areaSqm > 0
                  ? `${formatNumber(measurements.areaSqm / 10_000, 2)} Ha`
                  : "—"}
              </span>
            </p>
            <p className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Panjang jalur</span>
              <span className="font-medium text-foreground">
                {measurements.lengthM > 0
                  ? `${formatNumber(measurements.lengthM)} m`
                  : "—"}
              </span>
            </p>
            <p className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Keliling</span>
              <span className="font-medium text-foreground">
                {measurements.perimeterM > 0
                  ? `${formatNumber(measurements.perimeterM)} m`
                  : "—"}
              </span>
            </p>
            <div className="grid grid-cols-3 border-t border-border pt-2 text-center">
              <p className="text-xs">
                <span className="block font-semibold text-foreground">
                  {measurements.polygonCount}
                </span>
                <span className="text-[10px] text-muted-foreground">Polygon</span>
              </p>
              <p className="text-xs">
                <span className="block font-semibold text-foreground">
                  {measurements.lineCount}
                </span>
                <span className="text-[10px] text-muted-foreground">Line</span>
              </p>
              <p className="text-xs">
                <span className="block font-semibold text-foreground">
                  {measurements.pointCount}
                </span>
                <span className="text-[10px] text-muted-foreground">Point</span>
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPinned className="size-4 text-secondary" aria-hidden="true" />
            Survei tersimpan
          </h2>
          {projectSurveys.length ? (
            <ul className="space-y-1.5">
              {projectSurveys.slice(0, 5).map((survey) => (
                <li
                  key={survey.id}
                  className="truncate rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground"
                  title={`${survey.locationName} · ${survey.surveyorName}`}
                >
                  {survey.locationName}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Belum ada survei yang tersimpan untuk proyek ini.
            </p>
          )}
        </section>

            {drawnData.features.length > 0 && (
              <section className="space-y-2 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Fitur pada peta
                </h2>
                <ul className="space-y-1.5">
                  {drawnData.features.map((feature, index) => {
                    const rawId = feature.properties?.__surveyLayerId;
                    if (typeof rawId !== "string") return null;
                    const title =
                      typeof feature.properties?.title === "string" &&
                      feature.properties.title.trim()
                        ? feature.properties.title
                        : `Fitur ${index + 1}`;
                    return (
                      <li
                        key={rawId}
                        className="flex items-center gap-1.5 rounded-md border border-border p-2"
                      >
                        <MapPin className="size-3.5 shrink-0 text-orange-500" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {title}
                        </span>
                        <ActionIconButton
                          label={`Edit detail ${title}`}
                          tooltip={`Edit detail ${title}`}
                          icon={Pencil}
                          onClick={() => onEditFeatureMetadata(rawId)}
                          variant="ghost"
                        />
                        <ActionIconButton
                          label={`Edit posisi ${title}`}
                          tooltip={`Edit posisi ${title}`}
                          icon={MapPinned}
                          onClick={() => onEditFeaturePosition(rawId)}
                          variant="ghost"
                        />
                      </li>
                    );
                  })}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onDrawToolSelect("delete")}
                >
                  <Trash2 className="mr-2 size-4" aria-hidden="true" />
                  Hapus fitur pada peta
                </Button>
              </section>
            )}
          </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border bg-muted/30 p-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onDownloadGeoJSON}
          disabled={drawnData.features.length === 0 && !importedData}
        >
          <Download className="mr-2 size-4" aria-hidden="true" />
          Unduh GeoJSON
        </Button>
        <Button
          type="button"
          className="flex-1 bg-orange-600 text-white hover:bg-orange-700"
          onClick={onShowDetails}
        >
          <Pencil className="mr-2 size-4" aria-hidden="true" />
          Input Detail
        </Button>
      </div>
    </Card>
  );
}
