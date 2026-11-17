"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Info,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type MaterialPlanRow = {
  id?: string;
  materialName: string;
  plannedQuantity: number;
  actualQuantity: number;
  quantity: number;
  unit: string;
  scope: string;
  scopeTitle?: string;
  fromAnalysis?: boolean;
  coefficient?: number;
  wastePercent?: number;
  notes?: string;
};

export type StockItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  stockQuantity?: string | number | null;
  unitPrice?: string | number | null;
};

interface MaterialPlanModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  rabItems: Array<{ id: string; code: string; title: string }>;
  stockItems?: StockItemOption[];
  initialMaterials?: MaterialPlanRow[];
  analysisMaterials?: MaterialPlanRow[];
  preselectedWorkPointId?: string;
  onSave: (materials: MaterialPlanRow[]) => void;
  onSyncWithRabAnalysis?: () => void;
}

const COMMON_MATERIALS = [
  { name: "Semen Portland 50kg", unit: "sak" },
  { name: "Semen 40 kg", unit: "Zak" },
  { name: "Pasir Pasang", unit: "m3" },
  { name: "Pasir Beton", unit: "m3" },
  { name: "Batu Belah/Batu Kali/Batu Gunung", unit: "m3" },
  { name: "Kerikil / Batu Split 2/3", unit: "m3" },
  { name: "Besi Beton Polos", unit: "kg" },
  { name: "Besi Beton Ulir 13mm", unit: "btg" },
  { name: "Kawat Ikat", unit: "kg" },
  { name: "Papan Kayu Kelas III", unit: "m3" },
  { name: "Multipleks 12 mm", unit: "Lembar" },
  { name: "Paku Kayu", unit: "kg" },
  { name: "Keramik Granit 60×60", unit: "dus" },
  { name: "Cat Tembok Interior 20L", unit: "pail" },
  { name: "Pipa PVC AW 3/4 inch", unit: "btg" },
  { name: 'Pipa Besi 12"', unit: "m" },
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
  const [prevValue, setPrevValue] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  if (prevValue !== value) {
    setPrevValue(value);
    setQuery(value);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const catalog = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      sku?: string;
      unit: string;
      category?: string;
    }> = [];
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

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)),
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen) {
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex]);
        } else if (filtered.length > 0) {
          handleSelect(filtered[0]);
        } else if (query.trim()) {
          handleSelectCustom();
        }
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="text"
          value={query}
          onFocus={() => {
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onChange={(event) => {
            const val = event.target.value;
            setQuery(val);
            onChange(val);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-8 pr-16"
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Hapus teks"
              onClick={() => {
                setQuery("");
                onChange("", unit);
                setIsOpen(true);
              }}
              className="size-7 text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Buka daftar material"
            onClick={() => setIsOpen((prev) => !prev)}
            tabIndex={-1}
            className="size-7 text-muted-foreground"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] max-w-[420px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="type-p3 flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-muted-foreground">
            <span className="font-medium">
              {query
                ? `Hasil (${filtered.length})`
                : `Pilih material (${catalog.length})`}
            </span>
            <span>Ketik untuk mencari</span>
          </div>

          <div className="max-h-56 divide-y divide-border/40 overflow-y-auto p-1">
            {query.trim() && !exactMatch && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectCustom}
                className="w-full justify-between text-primary"
              >
                <span className="truncate">
                  + Gunakan &quot;{query.trim()}&quot;
                </span>
                <Badge variant="outline">Kustom</Badge>
              </Button>
            )}

            {filtered.map((item, idx) => {
              const isSelected =
                item.name.toLowerCase() === value.trim().toLowerCase();
              const isHighlighted = idx === highlightIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`type-p2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                    isSelected
                      ? "bg-accent font-semibold text-accent-foreground"
                      : isHighlighted
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/70"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2 pr-2">
                    {isSelected && (
                      <Check
                        className="size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{item.name}</span>
                  </div>

                  <div className="type-p3 flex shrink-0 items-center gap-1.5 font-mono text-muted-foreground">
                    {item.sku && <span>{item.sku}</span>}
                    <Badge variant="secondary">{item.unit}</Badge>
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && !query.trim() && (
              <p className="type-p3 py-4 text-center text-muted-foreground">
                Belum ada data material dalam stok.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function mergePlanLists(
  savedList: MaterialPlanRow[],
  fromAnalysisList: MaterialPlanRow[],
  workPointFilter?: string,
): MaterialPlanRow[] {
  const result: MaterialPlanRow[] = [];
  const seenKeys = new Set<string>();

  for (const an of fromAnalysisList) {
    if (
      workPointFilter &&
      an.scope !== workPointFilter &&
      an.scope !== "ALL"
    ) {
      continue;
    }
    const key = `${an.materialName.toLowerCase()}__${an.scope}`;
    seenKeys.add(key);

    const saved = savedList.find(
      (s) =>
        s.materialName.toLowerCase() === an.materialName.toLowerCase() &&
        s.scope === an.scope,
    );

    const actualQty =
      saved !== undefined
        ? (saved.actualQuantity ?? saved.quantity)
        : an.plannedQuantity;

    result.push({
      ...an,
      id:
        an.id ||
        `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actualQuantity: actualQty,
      quantity: actualQty,
      fromAnalysis: true,
    });
  }

  for (const saved of savedList) {
    const key = `${saved.materialName.toLowerCase()}__${saved.scope}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push({
        ...saved,
        id:
          saved.id ||
          `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        plannedQuantity: saved.plannedQuantity ?? 0,
        actualQuantity: saved.actualQuantity ?? saved.quantity ?? 1,
        quantity: saved.actualQuantity ?? saved.quantity ?? 1,
        fromAnalysis: saved.fromAnalysis ?? false,
      });
    }
  }

  if (result.length === 0) {
    return [
      {
        id: "row_init",
        materialName: "",
        plannedQuantity: 0,
        actualQuantity: 1,
        quantity: 1,
        unit: "pcs",
        scope: workPointFilter ?? "ALL",
        fromAnalysis: false,
      },
    ];
  }

  return result;
}

export default function MaterialPlanModal({
  open,
  onClose,
  rabItems,
  stockItems = [],
  initialMaterials = [],
  analysisMaterials = [],
  preselectedWorkPointId,
  onSave,
  onSyncWithRabAnalysis,
}: MaterialPlanModalProps) {
  const [materials, setMaterials] = useState<MaterialPlanRow[]>(() =>
    mergePlanLists(initialMaterials, analysisMaterials, preselectedWorkPointId),
  );

  const [filterMode, setFilterMode] = useState<"ALL" | "ANALYSIS" | "CUSTOM">(
    "ALL",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [prevSyncDeps, setPrevSyncDeps] = useState({
    open,
    initialMaterials,
    analysisMaterials,
    preselectedWorkPointId,
  });

  if (
    open &&
    (!prevSyncDeps.open ||
      prevSyncDeps.initialMaterials !== initialMaterials ||
      prevSyncDeps.analysisMaterials !== analysisMaterials ||
      prevSyncDeps.preselectedWorkPointId !== preselectedWorkPointId)
  ) {
    setPrevSyncDeps({
      open,
      initialMaterials,
      analysisMaterials,
      preselectedWorkPointId,
    });
    setMaterials(
      mergePlanLists(
        initialMaterials,
        analysisMaterials,
        preselectedWorkPointId,
      ),
    );
  } else if (!open && prevSyncDeps.open) {
    setPrevSyncDeps((prev) => ({ ...prev, open: false }));
  }

  const handleAddManualRow = () => {
    setMaterials((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        materialName: "",
        plannedQuantity: 0,
        actualQuantity: 1,
        quantity: 1,
        unit: "pcs",
        scope: preselectedWorkPointId ?? "ALL",
        fromAnalysis: false,
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
        if (field === "actualQuantity") {
          updated.quantity = Number(value) || 0;
        }
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

  const handleSyncAllActualWithPlanned = () => {
    setMaterials((prev) =>
      prev.map((row) =>
        row.fromAnalysis && row.plannedQuantity > 0
          ? {
              ...row,
              actualQuantity: row.plannedQuantity,
              quantity: row.plannedQuantity,
            }
          : row,
      ),
    );
    toast.success("Bahan aktual disamakan dengan rencana analisa RAB.");
  };

  const handleReloadFromRabAnalysis = () => {
    if (analysisMaterials.length > 0) {
      setMaterials(
        mergePlanLists([], analysisMaterials, preselectedWorkPointId),
      );
      onSyncWithRabAnalysis?.();
      toast.success("Data bahan dimuat ulang dari analisa RAB.");
    }
  };

  const handleSave = () => {
    const valid = materials.filter(
      (m) =>
        m.materialName.trim().length > 0 &&
        (m.actualQuantity > 0 || m.plannedQuantity > 0),
    );
    onSave(valid);
    toast.success("Rencana material berhasil disimpan.");
    onClose();
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (filterMode === "ANALYSIS" && !m.fromAnalysis) return false;
      if (filterMode === "CUSTOM" && m.fromAnalysis) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.materialName.toLowerCase().includes(q);
        const matchesScope = (m.scopeTitle || m.scope)
          .toLowerCase()
          .includes(q);
        if (!matchesName && !matchesScope) return false;
      }
      return true;
    });
  }, [materials, filterMode, searchQuery]);

  const analysisCount = materials.filter((m) => m.fromAnalysis).length;
  const customCount = materials.filter((m) => !m.fromAnalysis).length;

  return (
    <GlobalModal
      isOpen={open}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<Package className="size-4" aria-hidden="true" />}
      title="Rencana Material"
      description="Kebutuhan total material proyek. Baris dari analisa RAB terhitung otomatis; sesuaikan Bahan Aktual sesuai kebutuhan lapangan."
      className="max-w-5xl"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
            {analysisCount > 0 ? (
              <>
                <Check className="size-4 text-success" aria-hidden="true" />
                <span>Analisa RAB aktif terhubung</span>
              </>
            ) : (
              <span>Belum ada analisa RAB terhubung</span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              Simpan Rencana
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Info & Quick Sync Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="type-p3 flex items-center gap-2 font-medium text-foreground">
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {materials.length} material terhubung · Isi kolom{" "}
              <strong>Bahan Aktual</strong> sesuai alokasi lapangan.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {analysisCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncAllActualWithPlanned}
                className="gap-1.5"
              >
                <ArrowRightLeft className="size-3.5 text-success" aria-hidden="true" />
                Samakan Aktual
              </Button>
            )}
            {analysisMaterials.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReloadFromRabAnalysis}
                className="gap-1.5"
              >
                <RefreshCw className="size-3.5 text-primary" aria-hidden="true" />
                Muat Ulang RAB
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowGuide((prev) => !prev)}
              className="gap-1.5"
            >
              <HelpCircle className="size-4" aria-hidden="true" />
              Panduan
            </Button>
          </div>
        </div>

        {showGuide && (
          <div className="type-p3 space-y-1.5 rounded-xl border border-border bg-muted/30 p-3.5 text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="size-4 text-primary" aria-hidden="true" />
              Panduan Kebutuhan Material
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Rencana Analisa</strong> dihitung dari Volume Pekerjaan
                × Koefisien × (1 + Susut%).
              </li>
              <li>
                <strong>Bahan Aktual</strong> adalah alokasi fisik di lapangan
                beserta selisih deviasinya.
              </li>
              <li>
                <strong>Tambah Material</strong> untuk logistik tambahan di luar
                analisa RAB.
              </li>
            </ul>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={filterMode === "ALL" ? "default" : "outline"}
              onClick={() => setFilterMode("ALL")}
            >
              Semua ({materials.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === "ANALYSIS" ? "default" : "outline"}
              onClick={() => setFilterMode("ANALYSIS")}
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              Analisa RAB ({analysisCount})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === "CUSTOM" ? "default" : "outline"}
              onClick={() => setFilterMode("CUSTOM")}
            >
              Tambahan ({customCount})
            </Button>
          </div>

          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari bahan atau pekerjaan..."
              className="pl-8"
            />
          </div>
        </div>

        {filteredMaterials.length === 0 ? (
          <EmptyState
            title="Tidak ada material yang cocok"
            description='Klik "Tambah Material" untuk menambahkan material baru.'
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {filteredMaterials.map((row, idx) => {
                const actualIndex = materials.findIndex(
                  (m) => m === row || m.id === row.id,
                );
                const isFromAnalysis = Boolean(row.fromAnalysis);
                const diff = row.actualQuantity - (row.plannedQuantity || 0);
                const diffPercent =
                  row.plannedQuantity > 0
                    ? Math.round((diff / row.plannedQuantity) * 100)
                    : 0;

                return (
                  <div
                    key={row.id || `mob-plan-${idx}`}
                    className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isFromAnalysis ? (
                          <div className="space-y-1">
                            <p className="type-p2 font-semibold text-foreground">
                              {row.materialName}
                            </p>
                            <Badge variant="outline" className="gap-1">
                              <Sparkles className="size-3" aria-hidden="true" />
                              Dari Analisa RAB
                            </Badge>
                          </div>
                        ) : (
                          <SearchableMaterialInput
                            value={row.materialName}
                            unit={row.unit}
                            stockItems={stockItems}
                            commonMaterials={COMMON_MATERIALS}
                            placeholder="Pilih nama material..."
                            onChange={(name, unit) => {
                              handleRowChange(actualIndex, "materialName", name);
                              if (unit) {
                                handleRowChange(actualIndex, "unit", unit);
                              }
                            }}
                          />
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Hapus material"
                        onClick={() => handleRemoveRow(actualIndex)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>

                    {isFromAnalysis ? (
                      <p className="type-p3 text-muted-foreground">
                        {row.scopeTitle || "Item RAB Terkait"}
                        {row.coefficient !== undefined
                          ? ` · Koef: ${row.coefficient} · Susut: ${row.wastePercent ?? 0}%`
                          : ""}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <Label className="type-p3 text-muted-foreground">
                          Lingkup Pekerjaan
                        </Label>
                        <Select
                          value={row.scope}
                          onValueChange={(val) =>
                            handleRowChange(actualIndex, "scope", val)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pilih lingkup" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Seluruh proyek</SelectItem>
                            {rabItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.code ? `${item.code} ` : ""}
                                {item.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="type-p3 text-muted-foreground">
                          Bahan Aktual
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={row.actualQuantity}
                          onChange={(e) =>
                            handleRowChange(
                              actualIndex,
                              "actualQuantity",
                              Number.parseFloat(e.target.value) || 0,
                            )
                          }
                          className="text-right font-semibold tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="type-p3 text-muted-foreground">
                          Satuan
                        </Label>
                        {isFromAnalysis ? (
                          <p className="type-p2 flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 font-medium">
                            {row.unit}
                          </p>
                        ) : (
                          <Input
                            value={row.unit}
                            onChange={(e) =>
                              handleRowChange(
                                actualIndex,
                                "unit",
                                e.target.value,
                              )
                            }
                            placeholder="Satuan"
                          />
                        )}
                      </div>
                    </div>

                    {isFromAnalysis && (
                      <div className="type-p3 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 tabular-nums">
                        <span className="text-muted-foreground">
                          Rencana:{" "}
                          <strong className="text-foreground">
                            {row.plannedQuantity.toLocaleString("id-ID", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {row.unit}
                          </strong>
                        </span>
                        <Badge variant={diff === 0 ? "outline" : "secondary"}>
                          {diff === 0
                            ? "Sesuai"
                            : `${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} (${diffPercent}%)`}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Shadcn Table */}
            <div className="hidden md:block">
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-52">Material / Bahan</TableHead>
                    <TableHead className="min-w-44">
                      Lingkup Pekerjaan
                    </TableHead>
                    <TableHead className="text-right">
                      Rencana Analisa
                    </TableHead>
                    <TableHead className="text-right">Bahan Aktual *</TableHead>
                    <TableHead className="text-center">Satuan</TableHead>
                    <TableHead className="text-center">Selisih</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((row) => {
                    const actualIndex = materials.findIndex(
                      (m) => m === row || m.id === row.id,
                    );
                    const isFromAnalysis = Boolean(row.fromAnalysis);
                    const diff =
                      row.actualQuantity - (row.plannedQuantity || 0);
                    const diffPercent =
                      row.plannedQuantity > 0
                        ? Math.round((diff / row.plannedQuantity) * 100)
                        : 0;

                    return (
                      <TableRow key={row.id || actualIndex}>
                        <TableCell className="whitespace-normal">
                          {isFromAnalysis ? (
                            <div className="space-y-1">
                              <p className="type-p2 font-semibold text-foreground">
                                {row.materialName}
                              </p>
                              <Badge variant="outline" className="gap-1">
                                <Sparkles className="size-3" aria-hidden="true" />
                                Dari Analisa RAB
                              </Badge>
                            </div>
                          ) : (
                            <SearchableMaterialInput
                              value={row.materialName}
                              unit={row.unit}
                              stockItems={stockItems}
                              commonMaterials={COMMON_MATERIALS}
                              placeholder="Pilih nama material..."
                              onChange={(name, unit) => {
                                handleRowChange(
                                  actualIndex,
                                  "materialName",
                                  name,
                                );
                                if (unit) {
                                  handleRowChange(actualIndex, "unit", unit);
                                }
                              }}
                            />
                          )}
                        </TableCell>

                        <TableCell className="whitespace-normal">
                          {isFromAnalysis ? (
                            <div>
                              <span
                                className="type-p2 block max-w-[200px] truncate font-medium text-foreground"
                                title={row.scopeTitle || row.scope}
                              >
                                {row.scopeTitle || "Item RAB Terkait"}
                              </span>
                              {row.coefficient !== undefined && (
                                <span className="type-p3 block font-mono text-muted-foreground tabular-nums">
                                  Koef: {row.coefficient} · Susut:{" "}
                                  {row.wastePercent ?? 0}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <Select
                              value={row.scope}
                              onValueChange={(val) =>
                                handleRowChange(actualIndex, "scope", val)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Pilih lingkup" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALL">
                                  Seluruh proyek
                                </SelectItem>
                                {rabItems.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.code ? `${item.code} ` : ""}
                                    {item.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        <TableCell className="type-p2 text-right font-mono tabular-nums">
                          {isFromAnalysis ? (
                            <div>
                              <span className="font-semibold text-foreground">
                                {row.plannedQuantity.toLocaleString("id-ID", {
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="type-p3 block text-muted-foreground">
                                Otomatis RAB
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="bg-primary/5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={row.actualQuantity}
                              onChange={(e) =>
                                handleRowChange(
                                  actualIndex,
                                  "actualQuantity",
                                  Number.parseFloat(e.target.value) || 0,
                                )
                              }
                              placeholder="0"
                              className="w-24 text-right font-semibold tabular-nums"
                            />
                            {isFromAnalysis &&
                              row.actualQuantity !== row.plannedQuantity && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label="Samakan dengan rencana analisa"
                                  onClick={() =>
                                    handleRowChange(
                                      actualIndex,
                                      "actualQuantity",
                                      row.plannedQuantity,
                                    )
                                  }
                                >
                                  <ArrowRightLeft
                                    className="size-3.5 text-primary"
                                    aria-hidden="true"
                                  />
                                </Button>
                              )}
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          {isFromAnalysis ? (
                            <span className="type-p2 font-mono font-semibold text-foreground">
                              {row.unit}
                            </span>
                          ) : (
                            <Input
                              value={row.unit}
                              onChange={(e) =>
                                handleRowChange(
                                  actualIndex,
                                  "unit",
                                  e.target.value,
                                )
                              }
                              placeholder="Satuan"
                              className="w-20 text-center"
                            />
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {isFromAnalysis ? (
                            diff === 0 ? (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2
                                  className="size-3 text-success"
                                  aria-hidden="true"
                                />
                                Sesuai
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="tabular-nums"
                              >
                                {diff > 0 ? "+" : ""}
                                {diff.toLocaleString("id-ID", {
                                  maximumFractionDigits: 1,
                                })}{" "}
                                ({diff > 0 ? "+" : ""}
                                {diffPercent}%)
                              </Badge>
                            )
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              Manual
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Hapus baris ini"
                            onClick={() => handleRemoveRow(actualIndex)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddManualRow}
            className="gap-1.5"
          >
            <Plus className="size-4 text-primary" aria-hidden="true" />
            Tambah Material
          </Button>
          <span className="type-p3 text-muted-foreground tabular-nums">
            Total {materials.length} material · {analysisCount} dari analisa RAB
          </span>
        </div>
      </div>
    </GlobalModal>
  );
}
