"use client";

import { useMemo, useState } from "react";
import { Calculator, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MaterialAnalysisItem {
  id: string;
  materialName: string;
  unit: string;
  coefficient: number;
  wastePercent: number;
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
  { name: "Batu Belah/Batu Kali/Batu Gunung", unit: "m3" },
  { name: "Pasir Pasang", unit: "m3" },
  { name: "Pasir Beton", unit: "m3" },
  { name: "Semen 40 kg", unit: "Zak" },
  { name: "Semen Portland 50 kg", unit: "sak" },
  { name: "Kerikil / Batu Split 2/3", unit: "m3" },
  { name: "Besi Beton Polos", unit: "kg" },
  { name: "Besi Beton Ulir 13mm", unit: "btg" },
  { name: "Kawat Ikat", unit: "kg" },
  { name: "Papan Kayu Kelas III", unit: "m3" },
  { name: "Kayu Kelas III", unit: "m3" },
  { name: "Multipleks 12 mm", unit: "Lembar" },
  { name: "Paku Kayu", unit: "kg" },
  { name: "Minyak Bekisting", unit: "Liter" },
  { name: 'Pipa Besi 12"', unit: "m" },
  { name: "Pipa PVC AW 3/4 inch", unit: "btg" },
  { name: "Bar Screen (Saringan Sedimen)", unit: "Unit" },
  { name: "Helm Safety", unit: "Unit" },
  { name: "Sepatu safety boot", unit: "Unit" },
  { name: "Kotak P3K", unit: "set" },
  { name: "Prasasti", unit: "bh" },
  { name: "Pekerja", unit: "OH" },
  { name: "Tukang Batu", unit: "OH" },
  { name: "Tukang Kayu", unit: "OH" },
  { name: "Tukang Besi", unit: "OH" },
  { name: "Kepala Tukang", unit: "OH" },
  { name: "Mandor", unit: "OH" },
  { name: "Molen", unit: "Hari" },
  { name: "Keramik 60x60 Polish", unit: "dus" },
  { name: "Cat tembok 25 kg", unit: "pail" },
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
        materialName: availableMaterials[0]?.name || "Pekerja",
        unit: availableMaterials[0]?.unit || "OH",
        coefficient: 1,
        wastePercent: 0,
      },
    ];
  });

  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [prevItemTitle, setPrevItemTitle] = useState(itemTitle);
  const [prevInitialMaterials, setPrevInitialMaterials] =
    useState(initialMaterials);

  if (
    isOpen &&
    (!prevOpen ||
      prevItemTitle !== itemTitle ||
      prevInitialMaterials !== initialMaterials)
  ) {
    setPrevOpen(true);
    setPrevItemTitle(itemTitle);
    setPrevInitialMaterials(initialMaterials);
    if (initialMaterials && initialMaterials.length > 0) {
      setMaterials(initialMaterials);
    } else {
      setMaterials([
        {
          id: "1",
          materialName: availableMaterials[0]?.name || "Pekerja",
          unit: availableMaterials[0]?.unit || "OH",
          coefficient: 1,
          wastePercent: 0,
        },
      ]);
    }
  } else if (!isOpen && prevOpen) {
    setPrevOpen(false);
  }

  const [templateName, setTemplateName] = useState("");
  const [savedTemplate, setSavedTemplate] = useState(false);

  const materialOptions = useMemo<ComboboxOption[]>(() => {
    const seen = new Set<string>();
    const options: ComboboxOption[] = [];
    for (const item of availableMaterials) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      options.push({
        value: item.name,
        label: item.name,
        description: `Satuan: ${item.unit}`,
      });
    }
    for (const mat of materials) {
      if (mat.materialName && !seen.has(mat.materialName)) {
        seen.add(mat.materialName);
        options.push({
          value: mat.materialName,
          label: mat.materialName,
          description: `Satuan: ${mat.unit}`,
        });
      }
    }
    return options;
  }, [availableMaterials, materials]);

  const handleAddMaterial = () => {
    const defaultMat = availableMaterials[0] || {
      name: "Material baru",
      unit: "unit",
    };
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
    setMaterials((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdate = (
    id: string,
    field: keyof MaterialAnalysisItem,
    value: string | number,
  ) => {
    setMaterials((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "materialName") {
          const found = availableMaterials.find((a) => a.name === value);
          return {
            ...item,
            materialName: String(value),
            unit: found ? found.unit : item.unit,
          };
        }
        return { ...item, [field]: value };
      }),
    );
  };

  const handleSave = () => {
    onSave?.(materials);
    toast.success("Analisa material item disimpan.");
    onClose();
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast.error("Masukkan nama template analisa terlebih dahulu.");
      return;
    }
    setSavedTemplate(true);
    toast.success(`Template analisa "${templateName.trim()}" tersimpan.`);
    setTimeout(() => setSavedTemplate(false), 2000);
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<Calculator className="size-4" aria-hidden="true" />}
      title={`Analisa Material · ${itemTitle || "Pekerjaan"}`}
      description={`Kebutuhan per 1 ${itemUnit || "M2"} pekerjaan. Rencana = volume ${itemVolume || 100} ${itemUnit || "M2"} × koefisien × (1 + susut).`}
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Simpan Analisa
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {materials.map((mat) => {
            const vol = itemVolume > 0 ? itemVolume : 100;
            const plannedTotal =
              vol *
              (mat.coefficient || 0) *
              (1 + (mat.wastePercent || 0) / 100);
            const formattedPlan = plannedTotal.toLocaleString("id-ID", {
              maximumFractionDigits: 2,
            });

            return (
              <div
                key={mat.id}
                className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <Combobox
                    options={materialOptions}
                    value={mat.materialName}
                    onValueChange={(value) =>
                      handleUpdate(mat.id, "materialName", value)
                    }
                    placeholder="Pilih material..."
                    searchPlaceholder="Cari material..."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <div className="w-24 space-y-1">
                    <Label className="type-p3 text-muted-foreground sm:sr-only">
                      Koefisien
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={mat.coefficient}
                      onChange={(event) =>
                        handleUpdate(
                          mat.id,
                          "coefficient",
                          Number.parseFloat(event.target.value) || 0,
                        )
                      }
                      aria-label="Koefisien"
                      placeholder="Koef"
                      className="text-right tabular-nums"
                    />
                  </div>

                  <div className="w-20 space-y-1">
                    <Label className="type-p3 text-muted-foreground sm:sr-only">
                      Susut (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={mat.wastePercent}
                      onChange={(event) =>
                        handleUpdate(
                          mat.id,
                          "wastePercent",
                          Number.parseFloat(event.target.value) || 0,
                        )
                      }
                      aria-label="Susut persen"
                      placeholder="Susut %"
                      className="text-right tabular-nums"
                    />
                  </div>

                  <div className="type-p3 min-w-[112px] whitespace-nowrap text-muted-foreground tabular-nums">
                    Rencana{" "}
                    <strong className="font-semibold text-foreground">
                      {formattedPlan}
                    </strong>{" "}
                    {mat.unit}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus ${mat.materialName}`}
                    onClick={() => handleRemoveMaterial(mat.id)}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddMaterial}
          className="gap-1.5"
        >
          <Plus className="size-4" aria-hidden="true" />
          Tambah Material
        </Button>

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
          <Input
            type="text"
            placeholder="Nama template analisa, mis. Pasangan Batu"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="flex-1 sm:max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveTemplate}
            className="gap-1.5"
          >
            {savedTemplate ? (
              <>
                <Check className="size-4 text-success" aria-hidden="true" />
                Tersimpan
              </>
            ) : (
              "Simpan Template"
            )}
          </Button>
        </div>
      </div>
    </GlobalModal>
  );
}
