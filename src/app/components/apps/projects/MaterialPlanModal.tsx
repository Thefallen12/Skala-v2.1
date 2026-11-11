"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  HelpCircle,
  Plus,
  Trash2,
  X,
  Search,
  ChevronDown,
  Check,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRightLeft,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type MaterialPlanRow = {
  id?: string;
  materialName: string;
  plannedQuantity: number; // Volume Rencana dari analisa RAB (Otomatis)
  actualQuantity: number; // Bahan Aktual (Yang diisi oleh pengguna)
  quantity: number; // backward compatibility (sama dengan actualQuantity)
  unit: string;
  scope: string; // "ALL" atau specific workPointId
  scopeTitle?: string;
  fromAnalysis?: boolean; // true jika berasal dari "Isi analisa material"
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
  { name: "Pipa Besi 12\"", unit: "m" },
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

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-16 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs transition"
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
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Hapus teks"
            >
              <X className="size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            tabIndex={-1}
            title="Buka daftar material"
          >
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[280px] max-w-[420px] z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium">
              {query ? `Hasil (${filtered.length})` : `Pilih material (${catalog.length})`}
            </span>
            <span className="text-[10px]">Ketik untuk mencari</span>
          </div>

          <div ref={listRef} className="max-h-56 overflow-y-auto divide-y divide-border/40 p-1">
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
                  className={`flex items-center justify-between w-full px-3 py-1.5 text-left text-xs rounded-lg transition group ${
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
              <div className="py-4 text-center text-xs text-muted-foreground">
                Belum ada data material dalam stok.
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
  analysisMaterials = [],
  preselectedWorkPointId,
  onSave,
  onSyncWithRabAnalysis,
}: MaterialPlanModalProps) {
  // Merge initialMaterials with analysisMaterials:
  // If analysisMaterials are provided, ensure all analysis materials exist in the plan list.
  // Preserve user's actualQuantity if already edited.
  const [materials, setMaterials] = useState<MaterialPlanRow[]>(() => {
    return mergePlanLists(initialMaterials, analysisMaterials, preselectedWorkPointId);
  });

  const [filterMode, setFilterMode] = useState<"ALL" | "ANALYSIS" | "CUSTOM">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // Sync state whenever modal opens or analysisMaterials change
  useEffect(() => {
    if (open) {
      setMaterials(mergePlanLists(initialMaterials, analysisMaterials, preselectedWorkPointId));
    }
  }, [open, initialMaterials, analysisMaterials, preselectedWorkPointId]);

  if (!open) return null;

  function mergePlanLists(
    savedList: MaterialPlanRow[],
    fromAnalysisList: MaterialPlanRow[],
    workPointFilter?: string,
  ): MaterialPlanRow[] {
    const result: MaterialPlanRow[] = [];
    const seenKeys = new Set<string>();

    // 1. Process analysis materials first
    for (const an of fromAnalysisList) {
      if (workPointFilter && an.scope !== workPointFilter && an.scope !== "ALL") {
        continue;
      }
      const key = `${an.materialName.toLowerCase()}__${an.scope}`;
      seenKeys.add(key);

      // Check if user already set an actual quantity for this exact material & scope
      const saved = savedList.find(
        (s) => s.materialName.toLowerCase() === an.materialName.toLowerCase() && s.scope === an.scope,
      );

      const actualQty = saved !== undefined ? saved.actualQuantity ?? saved.quantity : an.plannedQuantity;

      result.push({
        ...an,
        id: an.id || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actualQuantity: actualQty,
        quantity: actualQty,
        fromAnalysis: true,
      });
    }

    // 2. Add saved custom / manual rows that are not in analysis
    for (const saved of savedList) {
      const key = `${saved.materialName.toLowerCase()}__${saved.scope}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          ...saved,
          id: saved.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          plannedQuantity: saved.plannedQuantity ?? 0,
          actualQuantity: saved.actualQuantity ?? saved.quantity ?? 1,
          quantity: saved.actualQuantity ?? saved.quantity ?? 1,
          fromAnalysis: saved.fromAnalysis ?? false,
        });
      }
    }

    // If completely empty, return at least 1 manual row
    if (result.length === 0) {
      return [
        {
          id: `row_init`,
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
      prev.map((r) =>
        r.fromAnalysis && r.plannedQuantity > 0
          ? { ...r, actualQuantity: r.plannedQuantity, quantity: r.plannedQuantity }
          : r,
      ),
    );
  };

  const handleReloadFromRabAnalysis = () => {
    if (analysisMaterials.length > 0) {
      setMaterials(mergePlanLists([], analysisMaterials, preselectedWorkPointId));
      onSyncWithRabAnalysis?.();
    }
  };

  const handleSave = () => {
    const valid = materials.filter(
      (m) => m.materialName.trim().length > 0 && (m.actualQuantity > 0 || m.plannedQuantity > 0),
    );
    onSave(valid);
    onClose();
  };

  // Filtered rows for UI
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (filterMode === "ANALYSIS" && !m.fromAnalysis) return false;
      if (filterMode === "CUSTOM" && m.fromAnalysis) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.materialName.toLowerCase().includes(q);
        const matchesScope = (m.scopeTitle || m.scope).toLowerCase().includes(q);
        if (!matchesName && !matchesScope) return false;
      }
      return true;
    });
  }, [materials, filterMode, searchQuery]);

  const analysisCount = materials.filter((m) => m.fromAnalysis).length;
  const customCount = materials.filter((m) => !m.fromAnalysis).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 bg-muted/40 p-5 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Rencana material</h2>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                {materials.length} Material Terhubung
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Isi kebutuhan total tiap material untuk proyek ini. Hubungkan ke item RAB bila material hanya dipakai di item itu. Baris dari analisa RAB dihitung otomatis; ubah lewat analisa di baris RAB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <HelpCircle className="size-4" />
              <span>Panduan</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Informative Guidance Banner */}
        <div className="border-b border-border/60 bg-primary/5 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-primary font-medium">
            <Sparkles className="size-4 text-primary shrink-0" />
            <span>
              <strong>Bahan dari Analisa Material RAB terhubung otomatis.</strong> Anda cukup mengisi kolom <strong className="underline decoration-primary underline-offset-2">Bahan Aktual</strong> sesuai alokasi nyata di lapangan.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {analysisCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncAllActualWithPlanned}
                className="h-8 text-xs font-semibold rounded-lg gap-1.5 bg-background text-foreground hover:bg-muted"
                title="Samakan semua nilai bahan aktual dengan rencana teoretis analisa RAB"
              >
                <ArrowRightLeft className="size-3.5 text-emerald-600" />
                <span>Samakan Aktual dg Rencana</span>
              </Button>
            )}

            {analysisMaterials.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReloadFromRabAnalysis}
                className="h-8 text-xs font-semibold rounded-lg gap-1.5 bg-background text-foreground hover:bg-muted"
                title="Muat ulang seluruh bahan dan koefisien dari analisa RAB"
              >
                <RefreshCw className="size-3.5 text-sky-600" />
                <span>Muat Ulang dari RAB</span>
              </Button>
            )}
          </div>
        </div>

        {/* Guide Callout Dropdown */}
        {showGuide && (
          <div className="border-b border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Info className="size-4 text-primary" /> Panduan Pengisian Kebutuhan Material:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Rencana Analisa (Otomatis)</strong>: Dihitung dari formula Analisa RAB: <code>Volume Pekerjaan × Koefisien × (1 + Susut%)</code>.
              </li>
              <li>
                <strong>Bahan Aktual</strong>: Jumlah fisik / pesanan aktual yang dialokasikan di lapangan. Jika berbeda dari analisa, sistem akan menampilkan selisih/deviasi persentase secara otomatis.
              </li>
              <li>
                <strong>+ Tambah material</strong>: Gunakan untuk material kustom atau logistik tambahan di luar analisa RAB (misal terpal, patok bowplank, solar genset, dll).
              </li>
            </ul>
          </div>
        )}

        {/* Toolbar: Filters & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterMode("ALL")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                filterMode === "ALL"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-background border hover:bg-muted text-muted-foreground"
              }`}
            >
              Semua Bahan ({materials.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("ANALYSIS")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterMode === "ANALYSIS"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-background border hover:bg-muted text-muted-foreground"
              }`}
            >
              <Sparkles className="size-3 text-amber-500" />
              <span>Dari Analisa RAB ({analysisCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("CUSTOM")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                filterMode === "CUSTOM"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-background border hover:bg-muted text-muted-foreground"
              }`}
            >
              Bahan Tambahan ({customCount})
            </button>
          </div>

          <div className="w-56 relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari bahan / pekerjaan..."
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
        </div>

        {/* Material Table & Rows */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[360px] max-h-[55vh]">
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#102A4D] text-white text-xs font-semibold sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-56">Material / Bahan</th>
                  <th className="p-3 w-52">Lingkup Pekerjaan RAB</th>
                  <th className="p-3 text-right w-36">Rencana Analisa</th>
                  <th className="p-3 text-right w-44 bg-[#143560] border-x border-white/20">
                    Bahan Aktual *
                  </th>
                  <th className="p-3 text-center w-20">Satuan</th>
                  <th className="p-3 text-center w-32">Selisih</th>
                  <th className="p-3 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredMaterials.map((row) => {
                  const actualIndex = materials.findIndex((m) => m === row || m.id === row.id);
                  const isFromAnalysis = Boolean(row.fromAnalysis);
                  const diff = row.actualQuantity - (row.plannedQuantity || 0);
                  const diffPercent =
                    row.plannedQuantity > 0
                      ? Math.round((diff / row.plannedQuantity) * 100)
                      : 0;

                  return (
                    <tr
                      key={row.id || actualIndex}
                      className={`hover:bg-muted/30 transition-colors ${
                        isFromAnalysis ? "" : "bg-muted/10"
                      }`}
                    >
                      {/* 1. Nama Material */}
                      <td className="p-3 align-middle">
                        {isFromAnalysis ? (
                          <div className="space-y-1">
                            <span className="font-bold text-foreground text-xs block">
                              {row.materialName}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              <Sparkles className="size-2.5" /> Dari Analisa RAB
                            </span>
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
                              if (unit) handleRowChange(actualIndex, "unit", unit);
                            }}
                          />
                        )}
                      </td>

                      {/* 2. Lingkup Pekerjaan */}
                      <td className="p-3 align-middle">
                        {isFromAnalysis ? (
                          <div>
                            <span className="font-medium text-foreground block truncate max-w-[200px]" title={row.scopeTitle || row.scope}>
                              {row.scopeTitle || "Item RAB Terkait"}
                            </span>
                            {row.coefficient !== undefined && (
                              <span className="text-[10px] text-muted-foreground block font-mono">
                                Koef: {row.coefficient} · Susut: {row.wastePercent ?? 0}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <select
                            value={row.scope}
                            onChange={(e) => handleRowChange(actualIndex, "scope", e.target.value)}
                            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs"
                          >
                            <option value="ALL">Seluruh proyek</option>
                            {rabItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.code ? `${item.code} ` : ""}
                                {item.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* 3. Rencana Analisa (Otomatis) */}
                      <td className="p-3 text-right align-middle font-mono">
                        {isFromAnalysis ? (
                          <div>
                            <span className="font-semibold text-foreground text-xs">
                              {row.plannedQuantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              Dihitung otomatis
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* 4. Bahan Aktual (Input Utama) */}
                      <td className="p-3 text-right align-middle bg-primary/5 border-x border-primary/20">
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
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="0"
                            className="h-9 w-24 text-right font-bold text-xs bg-background rounded-lg border-primary/40 focus:border-primary shadow-xs"
                          />
                          {isFromAnalysis && row.actualQuantity !== row.plannedQuantity && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRowChange(actualIndex, "actualQuantity", row.plannedQuantity)
                              }
                              className="size-7 rounded-md border bg-background hover:bg-muted text-muted-foreground flex items-center justify-center shrink-0 transition"
                              title="Samakan dengan rencana analisa"
                            >
                              <ArrowRightLeft className="size-3 text-primary" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 5. Satuan */}
                      <td className="p-3 text-center align-middle">
                        {isFromAnalysis ? (
                          <span className="font-semibold text-foreground text-xs font-mono">
                            {row.unit}
                          </span>
                        ) : (
                          <Input
                            value={row.unit}
                            onChange={(e) => handleRowChange(actualIndex, "unit", e.target.value)}
                            placeholder="Satuan"
                            className="h-9 w-16 text-center text-xs rounded-lg font-medium bg-background"
                          />
                        )}
                      </td>

                      {/* 6. Selisih / Deviasi */}
                      <td className="p-3 text-center align-middle">
                        {isFromAnalysis ? (
                          diff === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                              <CheckCircle2 className="size-2.5" /> Sesuai
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                              +{diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} (+{diffPercent}%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300">
                              {diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ({diffPercent}%)
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Manual</span>
                        )}
                      </td>

                      {/* 7. Aksi */}
                      <td className="p-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(actualIndex)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredMaterials.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <AlertCircle className="size-8 text-muted-foreground/40 mb-1" />
                        <p className="font-semibold text-xs text-foreground">
                          Tidak ada material yang sesuai filter
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Klik tombol &quot;+ Tambah material&quot; untuk menambahkan material baru.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddManualRow}
              className="h-9 gap-1.5 text-xs font-semibold rounded-lg bg-background hover:bg-muted text-foreground border shadow-xs"
            >
              <Plus className="size-3.5 text-primary" />
              <span>Tambah material</span>
            </Button>

            <span className="text-xs text-muted-foreground">
              Total {materials.length} material · {analysisCount} terhubung dari analisa RAB
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3.5">
          <div className="text-xs text-muted-foreground">
            {analysisCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                <span>Analisa RAB aktif terhubung</span>
              </span>
            ) : (
              <span>Belum ada analisa RAB terhubung</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold rounded-lg"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              Simpan rencana
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
