"use client";

import { useState } from "react";
import { HelpCircle, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MaterialPlanRow = {
  id?: string;
  materialName: string;
  quantity: number;
  unit: string;
  scope: string; // "ALL" or specific workPointId
};

export type StockItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
};

interface MaterialPlanModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  rabItems: Array<{ id: string; code: string; title: string }>;
  stockItems?: StockItemOption[];
  initialMaterials?: MaterialPlanRow[];
  preselectedWorkPointId?: string;
  onSave: (materials: MaterialPlanRow[]) => void;
}

const COMMON_MATERIALS = [
  { name: "Semen Portland 50kg", unit: "sak" },
  { name: "Pasir Pasang", unit: "m3" },
  { name: "Keramik Granit 60×60", unit: "dus" },
  { name: "Cat Tembok Interior 20L", unit: "pail" },
  { name: "Plafon Gypsum 9mm", unit: "lbr" },
  { name: "Hollow Galvanis 4×4", unit: "btg" },
  { name: "Kabel NYM 3×2.5mm", unit: "roll" },
  { name: "Stop Kontak & Saklar", unit: "pcs" },
  { name: "Lampu LED Downlight 12W", unit: "pcs" },
  { name: "Bata Ringan / Hebel", unit: "m3" },
];

export default function MaterialPlanModal({
  open,
  onClose,
  rabItems,
  stockItems = [],
  initialMaterials = [],
  preselectedWorkPointId,
  onSave,
}: MaterialPlanModalProps) {
  const [materials, setMaterials] = useState<MaterialPlanRow[]>(() => {
    if (initialMaterials.length > 0) return initialMaterials;
    if (preselectedWorkPointId) {
      return [
        {
          materialName: "",
          quantity: 1,
          unit: "sak",
          scope: preselectedWorkPointId,
        },
      ];
    }
    return [
      {
        materialName: "Semen Portland 50kg",
        quantity: 40,
        unit: "sak",
        scope: "ALL",
      },
      {
        materialName: "Keramik Granit 60×60",
        quantity: 90,
        unit: "dus",
        scope: rabItems[1]?.id ?? "ALL",
      },
      {
        materialName: "Cat Tembok Interior 20L",
        quantity: 6,
        unit: "pail",
        scope: rabItems[2]?.id ?? "ALL",
      },
    ];
  });

  const [showGuide, setShowGuide] = useState(false);

  if (!open) return null;

  const handleAddRow = () => {
    setMaterials((prev) => [
      ...prev,
      {
        materialName: "",
        quantity: 1,
        unit: "pcs",
        scope: preselectedWorkPointId ?? "ALL",
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRowChange = <K extends keyof MaterialPlanRow>(
    index: number,
    field: K,
    value: MaterialPlanRow[K],
  ) => {
    setMaterials((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [field]: value };
        // If selecting a known stock item or common material, update unit
        if (field === "materialName") {
          const matchStock = stockItems.find((s) => s.name === value);
          const matchCommon = COMMON_MATERIALS.find((c) => c.name === value);
          if (matchStock) updated.unit = matchStock.unit;
          else if (matchCommon) updated.unit = matchCommon.unit;
        }
        return updated;
      }),
    );
  };

  const handleSave = () => {
    const valid = materials.filter((m) => m.materialName.trim().length > 0 && m.quantity > 0);
    onSave(valid);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">Rencana material</h2>
            <p className="text-xs text-muted-foreground">
              Isi kebutuhan total tiap material untuk proyek ini. Hubungkan ke item RAB bila material hanya dipakai di item itu. Baris dari analisa RAB dihitung otomatis; ubah lewat analisa di baris RAB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <HelpCircle className="size-4" />
              <span>Panduan</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Guide Callout */}
        {showGuide && (
          <div className="border-b border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Keterangan Lingkup Material:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Pilih <strong>Seluruh proyek</strong> jika material digunakan secara umum di banyak bagian pekerjaan.</li>
              <li>Pilih item pekerjaan tertentu (mis. <em>B.1 Pasang keramik</em>) agar sistem memonitor konsumsi material khusus pada pekerjaan tersebut.</li>
            </ul>
          </div>
        )}

        {/* Dynamic Rows */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {materials.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2.5">
              {/* Material Dropdown / Input */}
              <div className="min-w-56 flex-1">
                <input
                  list={`materials-list-${index}`}
                  value={row.materialName}
                  onChange={(e) => handleRowChange(index, "materialName", e.target.value)}
                  placeholder="Pilih atau ketik nama material"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <datalist id={`materials-list-${index}`}>
                  {stockItems.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.sku} · {item.unit}
                    </option>
                  ))}
                  {COMMON_MATERIALS.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.unit}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Quantity & Unit */}
              <div className="flex w-36 items-center gap-1">
                <Input
                  type="number"
                  min="0.1"
                  step="any"
                  value={row.quantity}
                  onChange={(e) =>
                    handleRowChange(index, "quantity", parseFloat(e.target.value) || 0)
                  }
                  placeholder="Jumlah"
                  className="h-9 text-right text-xs"
                />
                <Input
                  value={row.unit}
                  onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                  placeholder="Satuan"
                  className="h-9 w-14 text-center text-xs"
                />
              </div>

              {/* Scope Dropdown */}
              <div className="w-52">
                <select
                  value={row.scope}
                  onChange={(e) => handleRowChange(index, "scope", e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ALL">Seluruh proyek</option>
                  {rabItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `${item.code} ` : ""}
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleRemoveRow(index)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Hapus baris"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="mt-2 gap-1.5 text-xs font-semibold"
          >
            <Plus className="size-3.5" />
            <span>Tambah material</span>
          </Button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 p-5">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Simpan rencana
          </Button>
        </div>
      </div>
    </div>
  );
}
