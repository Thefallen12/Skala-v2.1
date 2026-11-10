"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { HelpCircle, Plus, Trash2, X, Search, ChevronDown, Check } from "lucide-react";
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

function SearchableMaterialInput({
  value,
  unit,
  stockItems = [],
  commonMaterials = [],
  placeholder = "Pilih atau ketik nama material",
  onChange,
}: {
  value: string;
  unit?: string;
  stockItems?: StockItemOption[];
  commonMaterials?: Array<{ name: string; unit: string }>;
  placeholder?: string;
  onChange: (materialName: string, unit?: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync internal query when value updates from outside
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Deduplicated Catalog
  const catalog = useMemo(() => {
    const list: Array<{ id: string; name: string; sku?: string; unit: string; category?: string }> = [];
    const seen = new Set<string>();

    for (const item of stockItems) {
      const key = item.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          category: item.category,
        });
      }
    }

    for (const item of commonMaterials) {
      const key = item.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: `common_${item.name}`,
          name: item.name,
          unit: item.unit,
        });
      }
    }

    return list;
  }, [stockItems, commonMaterials]);

  // Filter items matching typed query
  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [catalog, query]);

  const exactMatch = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return catalog.some((item) => item.name.toLowerCase() === q);
  }, [catalog, query]);

  const handleSelect = (item: { name: string; unit: string }) => {
    onChange(item.name, item.unit);
    setQuery(item.name);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const handleSelectCustom = () => {
    if (query.trim()) {
      onChange(query.trim(), unit || "pcs");
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen) {
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex]);
        } else if (filtered.length > 0) {
          handleSelect(filtered[0]);
        } else if (query.trim()) {
          handleSelectCustom();
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onFocus={() => {
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            onChange(val);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-16 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onChange("", unit);
                setIsOpen(true);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Hapus teks"
            >
              <X className="size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            tabIndex={-1}
            title="Buka daftar material"
          >
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Menu Anchored Below Input */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[320px] max-w-[480px] z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium">
              {query ? `Hasil (${filtered.length})` : `Pilih material (${catalog.length})`}
            </span>
            <span className="text-[10px] text-muted-foreground">Ketik untuk mencari</span>
          </div>

          <div ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-border/40 p-1">
            {/* Custom Option if query not exact match */}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleSelectCustom}
                className="flex items-center justify-between w-full px-3 py-2 text-left text-xs rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition font-semibold"
              >
                <span className="truncate">
                  + Gunakan &quot;<strong>{query.trim()}</strong>&quot;
                </span>
                <span className="text-[10px] font-mono opacity-80 whitespace-nowrap ml-2">
                  (Material Kustom)
                </span>
              </button>
            )}

            {filtered.map((item, idx) => {
              const isSelected = item.name.toLowerCase() === value.trim().toLowerCase();
              const isHighlighted = idx === highlightIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`flex items-center justify-between w-full px-3 py-2 text-left text-xs rounded-lg transition group ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-bold"
                      : isHighlighted
                      ? "bg-muted text-foreground"
                      : "hover:bg-muted/70 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {isSelected && <Check className="size-3 text-primary shrink-0" />}
                    <span className="truncate font-medium group-hover:text-primary transition">
                      {item.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono text-muted-foreground">
                    {item.sku && <span>{item.sku}</span>}
                    {item.sku && <span>·</span>}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                      {item.unit}
                    </span>
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && !query.trim() && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Belum ada data material dalam stok.
              </div>
            )}
            {filtered.length === 0 && query.trim() && exactMatch && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Tidak ada material lain yang cocok.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[380px] pb-32">
          {materials.map((row, index) => (
            <div key={index} className="relative flex flex-wrap items-center gap-2.5" style={{ zIndex: materials.length - index }}>
              {/* Material Dropdown / Searchable Input */}
              <div className="min-w-56 flex-1">
                <SearchableMaterialInput
                  value={row.materialName}
                  unit={row.unit}
                  stockItems={stockItems}
                  commonMaterials={COMMON_MATERIALS}
                  placeholder="Pilih atau ketik nama material"
                  onChange={(materialName, unit) => {
                    setMaterials((prev) =>
                      prev.map((r, i) => {
                        if (i !== index) return r;
                        const updated = { ...r, materialName };
                        if (unit) updated.unit = unit;
                        return updated;
                      })
                    );
                  }}
                />
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
                  className="h-10 text-right text-xs rounded-xl"
                />
                <Input
                  value={row.unit}
                  onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                  placeholder="Satuan"
                  className="h-10 w-16 text-center text-xs rounded-xl font-medium"
                />
              </div>

              {/* Scope Dropdown */}
              <div className="w-52">
                <select
                  value={row.scope}
                  onChange={(e) => handleRowChange(index, "scope", e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
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
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
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
            className="mt-2 gap-1.5 text-xs font-semibold rounded-lg"
          >
            <Plus className="size-3.5" />
            <span>Tambah material</span>
          </Button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 p-4">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs rounded-lg">
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="h-9 px-5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Simpan rencana
          </Button>
        </div>
      </div>
    </div>
  );
}
