"use client";

import React, { useState } from "react";
import { X, Trash2, Plus, HelpCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface MaterialAnalysisItem {
  id: string;
  materialName: string;
  unit: string;
  coefficient: number;
  wastePercent: number; // susut %
}

interface AnalisaMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemTitle: string;
  itemVolume: number;
  itemUnit: string;
  initialMaterials?: MaterialAnalysisItem[];
  availableMaterials?: { name: string; unit: string }[];
  onSave?: (materials: MaterialAnalysisItem[]) => void;
}

const DEFAULT_MATERIALS = [
  { name: "Cat tembok 25 kg (contoh)", unit: "pail" },
  { name: "Semen Portland 50 kg", unit: "sak" },
  { name: "Pasir Pasang", unit: "m3" },
  { name: "Batu Split 2/3", unit: "m3" },
  { name: "Keramik 60x60 Polish", unit: "dus" },
  { name: "Besi Beton Ulir 13mm", unit: "btg" },
  { name: "Pipa PVC AW 3/4 inch", unit: "btg" },
  { name: "Kabel NYM 2x1.5mm", unit: "roll" },
];

export default function AnalisaMaterialModal({
  isOpen,
  onClose,
  itemTitle,
  itemVolume,
  itemUnit,
  initialMaterials,
  availableMaterials = DEFAULT_MATERIALS,
  onSave,
}: AnalisaMaterialModalProps) {
  const [materials, setMaterials] = useState<MaterialAnalysisItem[]>(() => {
    if (initialMaterials && initialMaterials.length > 0) return initialMaterials;
    return [
      {
        id: "1",
        materialName: availableMaterials[0]?.name || "Cat tembok 25 kg (contoh)",
        unit: availableMaterials[0]?.unit || "pail",
        coefficient: 1.75,
        wastePercent: 2,
      },
    ];
  });

  const [templateName, setTemplateName] = useState("");
  const [savedTemplate, setSavedTemplate] = useState(false);

  if (!isOpen) return null;

  const handleAddMaterial = () => {
    const defaultMat = availableMaterials[0] || { name: "Material baru", unit: "unit" };
    setMaterials((prev) => [
      ...prev,
      {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        materialName: defaultMat.name,
        unit: defaultMat.unit,
        coefficient: 1,
        wastePercent: 2,
      },
    ]);
  };

  const handleRemoveMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdate = (
    id: string,
    field: keyof MaterialAnalysisItem,
    value: string | number
  ) => {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (field === "materialName") {
          const found = availableMaterials.find((a) => a.name === value);
          return {
            ...m,
            materialName: String(value),
            unit: found ? found.unit : m.unit,
          };
        }
        return { ...m, [field]: value };
      })
    );
  };

  const handleSave = () => {
    onSave?.(materials);
    onClose();
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    setSavedTemplate(true);
    setTimeout(() => setSavedTemplate(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-5 pb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Analisa material · {itemTitle || "Pekerjaan"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-lg">
              Kebutuhan material per 1 {itemUnit || "M2"} pekerjaan. Rencana = volume{" "}
              {itemVolume || 100} {itemUnit || "M2"} × koefisien × (1 + susut). Pakai angka analisa
              perusahaan Anda sendiri.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <HelpCircle className="size-3.5" />
              <span>Panduan</span>
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-4">
          <div className="space-y-3">
            {materials.map((mat) => {
              // Rencana = itemVolume * coefficient * (1 + waste/100)
              const vol = itemVolume > 0 ? itemVolume : 100;
              const plannedTotal = vol * (mat.coefficient || 0) * (1 + (mat.wastePercent || 0) / 100);
              const formattedPlan = plannedTotal.toLocaleString("id-ID", {
                maximumFractionDigits: 2,
              });

              return (
                <div
                  key={mat.id}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-2.5"
                >
                  {/* Select material */}
                  <select
                    value={mat.materialName}
                    onChange={(e) => handleUpdate(mat.id, "materialName", e.target.value)}
                    className="h-9 flex-1 min-w-[180px] rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  >
                    {availableMaterials.map((a, idx) => (
                      <option key={idx} value={a.name}>
                        {a.name} ({a.unit})
                      </option>
                    ))}
                  </select>

                  {/* Koefisien input */}
                  <div className="w-20">
                    <Input
                      type="number"
                      step="0.01"
                      value={mat.coefficient}
                      onChange={(e) =>
                        handleUpdate(mat.id, "coefficient", parseFloat(e.target.value) || 0)
                      }
                      placeholder="Koef"
                      className="h-9 text-xs text-center"
                    />
                  </div>

                  {/* Susut % input */}
                  <div className="w-16">
                    <Input
                      type="number"
                      step="0.5"
                      value={mat.wastePercent}
                      onChange={(e) =>
                        handleUpdate(mat.id, "wastePercent", parseFloat(e.target.value) || 0)
                      }
                      placeholder="Susut %"
                      className="h-9 text-xs text-center"
                    />
                  </div>

                  {/* Result label */}
                  <div className="w-36 text-xs text-muted-foreground whitespace-nowrap pl-1">
                    Rencana <span className="font-semibold text-foreground">{formattedPlan}</span>{" "}
                    {mat.unit}
                  </div>

                  {/* Delete button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMaterial(mat.id)}
                    className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddMaterial}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <Plus className="size-3.5" />
            <span>Tambah material</span>
          </Button>

          {/* Template saving section */}
          <div className="pt-2 flex flex-wrap sm:flex-nowrap items-center gap-2 border-t border-border/50">
            <Input
              type="text"
              placeholder="Simpan sebagai analisa, mis. B"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="h-8 text-xs flex-1 max-w-xs rounded-lg"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveTemplate}
              className="h-8 text-xs rounded-lg"
            >
              {savedTemplate ? (
                <>
                  <Check className="size-3.5 text-success mr-1" />
                  <span>Tersimpan</span>
                </>
              ) : (
                "Simpan ke analisa perusahaan"
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/10 p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 px-4 text-xs rounded-lg"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-9 px-4 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            Simpan analisa
          </Button>
        </div>
      </div>
    </div>
  );
}
