"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import {
  X,
  Plus,
  Trash2,
  Package,
  Hammer,
  TrendingUp,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getProjectRap, saveProjectRap } from "@/app/actions/project";
import type { StockItemOption } from "./MaterialPlanModal";

export interface RabMaterialOption {
  id: string;
  name: string;
  unit: string;
  rabPrice?: number;
  quantity?: number;
}

export interface MaterialPlanItem {
  id?: string;
  stockItemId?: string;
  materialName: string;
  unit: string;
  plannedQuantity: number;
  actualQuantity: number;
  unitPrice: number;
  totalPrice?: number;
  scope?: string;
  notes?: string;
}

export interface LaborPlanItem {
  id?: string;
  workPointId?: string;
  jobName: string;
  volume: number;
  unit: string;
  boronganRate: number;
  totalBorongan: number;
  subkonName?: string;
  notes?: string;
}

interface RapManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  paguRab: number;
  stockItems?: StockItemOption[];
  onSuccess?: () => void;
}

function findMatchingStockItem(
  stockItems: StockItemOption[],
  materialName: string,
  unit: string,
) {
  const normalizedName = materialName.trim().toLocaleLowerCase();
  const normalizedUnit = unit.trim().toLocaleLowerCase();
  return stockItems.find(
    (item) =>
      item.name.trim().toLocaleLowerCase() === normalizedName &&
      item.unit.trim().toLocaleLowerCase() === normalizedUnit,
  );
}

export default function RapManagementModal({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  paguRab,
  stockItems = [],
  onSuccess,
}: RapManagementModalProps) {
  const [activeTab, setActiveTab] = useState<"materials" | "labor">("materials");
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Data State
  const [rabMaterials, setRabMaterials] = useState<RabMaterialOption[]>([]);
  const [materialPlans, setMaterialPlans] = useState<MaterialPlanItem[]>([]);
  const [laborPlans, setLaborPlans] = useState<LaborPlanItem[]>([]);
  const [prevLoadKey, setPrevLoadKey] = useState("");
  const stockItemsRef = useRef(stockItems);

  useEffect(() => {
    stockItemsRef.current = stockItems;
  }, [stockItems]);

  const loadKey = isOpen && projectId ? `${projectId}:${isOpen}` : "";
  if (loadKey && loadKey !== prevLoadKey) {
    setPrevLoadKey(loadKey);
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
  } else if (!loadKey && prevLoadKey !== "") {
    setPrevLoadKey("");
  }

  // Load data on open or project change
  useEffect(() => {
    if (!isOpen || !projectId) return;
    let cancelled = false;

    getProjectRap(projectId)
      .then((res) => {
        if (cancelled) return;
        const currentStockItems = stockItemsRef.current;
        if (res && res.success) {
          setRabMaterials(res.rabMaterials || []);
          if (res.materialPlans && res.materialPlans.length > 0) {
            setMaterialPlans(
              res.materialPlans.map((material) => ({
                ...material,
                stockItemId:
                  material.stockItemId ||
                  findMatchingStockItem(currentStockItems, material.materialName, material.unit)?.id,
              })),
            );
          } else if (res.rabMaterials && res.rabMaterials.length > 0) {
            // Auto populate from rab materials if empty
            setMaterialPlans(
              res.rabMaterials.map((m) => ({
                materialName: m.name,
                unit: m.unit,
                plannedQuantity: m.quantity || 0,
                actualQuantity: m.quantity || 0,
                unitPrice: m.rabPrice ? Math.round(m.rabPrice * 0.85) : 0, // Estimasi awal RAP 85% harga RAB
                totalPrice: 0,
                stockItemId: findMatchingStockItem(currentStockItems, m.name, m.unit)?.id,
              }))
            );
          } else {
            setMaterialPlans([]);
          }

          if (res.laborPlans && res.laborPlans.length > 0) {
            setLaborPlans(
              res.laborPlans.map((labor) => {
                const volume = Math.max(0, Number(labor.volume) || 0);
                const savedRate = Math.max(0, Number(labor.boronganRate) || 0);
                const savedTotal = Math.max(0, Number(labor.totalBorongan) || 0);
                const rate =
                  savedRate > 0 ? savedRate : volume > 0 ? savedTotal / volume : 0;

                return {
                  ...labor,
                  boronganRate: rate,
                  totalBorongan: Math.round(volume * rate),
                };
              }),
            );
          } else if (res.workPoints && res.workPoints.length > 0) {
            // Auto populate labor items from work points
            setLaborPlans(res.workPoints.map((wp) => {
              const volume = Math.max(0, Number(wp.volume) || 0);
              const estimatedTotal = Math.round(wp.totalRab * 0.3);
              const boronganRate = volume > 0 ? estimatedTotal / volume : 0;

              return {
                workPointId: wp.id,
                jobName: wp.title,
                volume,
                unit: wp.unit,
                boronganRate,
                totalBorongan: Math.round(volume * boronganRate),
                subkonName: "Mandor Lapangan",
                notes: wp.location || "",
              };
            }));
          } else {
            setLaborPlans([]);
          }
        } else {
          setErrorMsg(res?.message || "Gagal memuat data RAP dari server.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load RAP data:", err);
        setErrorMsg("Gagal memuat data RAP dari server.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId]);

  // Calculations
  const totalMaterialCost = materialPlans.reduce(
    (sum, m) => sum + Math.round((m.actualQuantity || 0) * (m.unitPrice || 0)),
    0
  );

  const totalLaborCost = laborPlans.reduce(
    (sum, labor) => sum + Math.round(Math.max(0, labor.volume) * Math.max(0, labor.boronganRate)),
    0,
  );

  const totalRap = totalMaterialCost + totalLaborCost;
  const profitAmount = paguRab - totalRap;
  const profitMarginPercent = paguRab > 0 ? ((profitAmount / paguRab) * 100).toFixed(1) : "0.0";

  // Handlers for Material Plan
  const handleAddMaterialRow = () => {
    const firstRabMat = rabMaterials[0];
    setMaterialPlans((prev) => [
      ...prev,
      {
        materialName: firstRabMat?.name || "",
        unit: firstRabMat?.unit || "unit",
        plannedQuantity: firstRabMat?.quantity || 0,
        actualQuantity: firstRabMat?.quantity || 1,
        unitPrice: firstRabMat?.rabPrice ? Math.round(firstRabMat.rabPrice * 0.85) : 0,
        stockItemId: firstRabMat
          ? findMatchingStockItem(stockItems, firstRabMat.name, firstRabMat.unit)?.id
          : undefined,
      },
    ]);
  };

  const handleSelectRabMaterial = (index: number, matName: string) => {
    const selected = rabMaterials.find((m) => m.name === matName);
    setMaterialPlans((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          materialName: matName,
          unit: selected?.unit || item.unit,
          plannedQuantity: selected?.quantity ?? item.plannedQuantity,
          actualQuantity: selected?.quantity ?? item.actualQuantity,
          unitPrice: selected?.rabPrice ? Math.round(selected.rabPrice * 0.85) : item.unitPrice,
          stockItemId: selected
            ? findMatchingStockItem(stockItems, selected.name, selected.unit)?.id
            : undefined,
        };
      })
    );
  };

  const handleSelectStockItem = (index: number, stockItemId: string) => {
    setMaterialPlans((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, stockItemId: stockItemId || undefined } : item,
      ),
    );
  };

  const handleUpdateMaterial = (index: number, field: keyof MaterialPlanItem, value: any) => {
    setMaterialPlans((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterialPlans((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSyncAllFromRab = () => {
    if (rabMaterials.length === 0) return;
    setMaterialPlans(
      rabMaterials.map((m) => ({
        materialName: m.name,
        unit: m.unit,
        plannedQuantity: m.quantity || 0,
        actualQuantity: m.quantity || 0,
        unitPrice: m.rabPrice ? Math.round(m.rabPrice * 0.85) : 0,
        stockItemId: findMatchingStockItem(stockItems, m.name, m.unit)?.id,
      }))
    );
  };

  // Handlers for Labor Plan ("Untuk Jasa Kita Borongkan")
  const handleUpdateLabor = (index: number, field: keyof LaborPlanItem, value: any) => {
    setLaborPlans((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "volume" || field === "boronganRate") {
          const volume = field === "volume" ? Math.max(0, Number(value) || 0) : item.volume;
          const rate = field === "boronganRate" ? Math.max(0, Number(value) || 0) : item.boronganRate;
          updated.volume = volume;
          updated.boronganRate = rate;
          updated.totalBorongan = Math.round(volume * rate);
        } else if (field === "totalBorongan") {
          const total = Math.max(0, Number(value) || 0);
          updated.totalBorongan = total;
          updated.boronganRate = item.volume > 0 ? total / item.volume : 0;
        }
        return updated;
      })
    );
  };

  const handleAddLaborRow = () => {
    setLaborPlans((prev) => [
      ...prev,
      {
        jobName: "Pekerjaan Borongan Tambahan",
        volume: 1,
        unit: "paket",
        boronganRate: 0,
        totalBorongan: 0,
        subkonName: "Mandor Borongan",
      },
    ]);
  };

  const handleRemoveLabor = (index: number) => {
    setLaborPlans((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Save RAP to DB
  const handleSave = () => {
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await saveProjectRap(projectId, {
        materialPlans: materialPlans.map((m) => ({
          materialName: m.materialName,
          stockItemId: m.stockItemId,
          unit: m.unit,
          plannedQuantity: m.plannedQuantity,
          actualQuantity: m.actualQuantity,
          unitPrice: m.unitPrice,
          scope: m.scope || "ALL",
          notes: m.notes,
        })),
        laborPlans: laborPlans.map((l) => ({
          workPointId: l.workPointId,
          jobName: l.jobName,
          volume: l.volume,
          unit: l.unit,
          boronganRate: l.boronganRate,
          totalBorongan: l.totalBorongan,
          subkonName: l.subkonName,
          notes: l.notes,
        })),
      });

      if (res.success) {
        setSuccessMsg(res.message || "RAP berhasil disimpan ke database!");
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.message || "Gagal menyimpan RAP.");
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-5 backdrop-blur-xs animate-in fade-in">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 p-5 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Penyusunan RAP (Bahan &amp; Jasa Borongan)
              </h2>
              <Badge variant="outline" className="text-xs font-semibold">
                Tim ADM / Project Manager
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Proyek: <strong className="text-foreground">{projectTitle}</strong> · Nilai Kontrak RAB:{" "}
              <strong className="text-foreground">Rp {paguRab.toLocaleString("id-ID")}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab Selector & Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3">
          <div className="flex rounded-xl border border-border/70 bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("materials")}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === "materials"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="size-3.5 text-primary" />
              <span>1. Bahan RAP ({materialPlans.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("labor")}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === "labor"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Hammer className="size-3.5 text-amber-500" />
              <span>2. Jasa Borongan ({laborPlans.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "materials" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSyncAllFromRab}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Tarik semua bahan dari analisa upload RAB"
                >
                  <RefreshCw className="size-3 text-muted-foreground" />
                  <span>Sinkron Bahan RAB</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddMaterialRow}
                  className="h-8 gap-1.5 text-xs bg-foreground text-background font-semibold"
                >
                  <Plus className="size-3.5" />
                  <span>Tambah Bahan</span>
                </Button>
              </>
            )}

            {activeTab === "labor" && (
              <Button
                type="button"
                size="sm"
                onClick={handleAddLaborRow}
                className="h-8 gap-1.5 text-xs bg-foreground text-background font-semibold"
              >
                <Plus className="size-3.5" />
                <span>Tambah Borongan</span>
              </Button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              <RefreshCw className="mx-auto size-6 animate-spin text-muted-foreground mb-2" />
              <span>Memuat data RAB dan RAP proyek...</span>
            </div>
          ) : activeTab === "materials" ? (
            /* ================= TAB 1: BAHAN RAP ================= */
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/15 p-3 text-xs text-muted-foreground">
                <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                <span>
                  <strong>Dropdown Menu Bahan</strong> mengambil langsung dari daftar bahan yang di-upload pada RAB
                  proyek ini ({rabMaterials.length} bahan terdeteksi). Hubungkan ke barang stok untuk melihat stok
                  tersedia; penyimpanan RAP tidak mengubah jumlah stok.
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full min-w-[1080px] text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2.5 w-72">Bahan (Dari Upload RAB)</th>
                      <th className="px-3 py-2.5 w-56">Barang Stok</th>
                      <th className="px-3 py-2.5 text-right w-24">Vol RAB</th>
                      <th className="px-3 py-2.5 text-right w-28">Bahan Aktual</th>
                      <th className="px-3 py-2.5 w-20">Satuan</th>
                      <th className="px-3 py-2.5 text-right w-36">Harga Satuan RAP (Rp)</th>
                      <th className="px-3 py-2.5 text-right w-36">Subtotal RAP</th>
                      <th className="px-3 py-2.5 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {materialPlans.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-muted-foreground">
                          Belum ada bahan RAP. Klik <strong>Tambah Bahan</strong> atau{" "}
                          <strong>Sinkron Bahan RAB</strong> untuk memulai.
                        </td>
                      </tr>
                    ) : (
                      materialPlans.map((mat, idx) => {
                        const lineTotal = Math.round((mat.actualQuantity || 0) * (mat.unitPrice || 0));
                        return (
                          <tr key={idx} className="hover:bg-muted/10 transition">
                            {/* Dropdown Menu Ambil Dari Bahan Upload RAB */}
                            <td className="px-3.5 py-2">
                              <select
                                value={mat.materialName}
                                onChange={(e) => handleSelectRabMaterial(idx, e.target.value)}
                                className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                              >
                                {rabMaterials.length === 0 && (
                                  <option value={mat.materialName}>{mat.materialName || "Pilih Bahan"}</option>
                                )}
                                {rabMaterials.map((rm) => (
                                  <option key={rm.id || rm.name} value={rm.name}>
                                    {rm.name} ({rm.unit})
                                  </option>
                                ))}
                                {!rabMaterials.some((rm) => rm.name === mat.materialName) && mat.materialName && (
                                  <option value={mat.materialName}>{mat.materialName}</option>
                                )}
                              </select>
                            </td>

                            <td className="px-3 py-2">
                              <select
                                value={mat.stockItemId || ""}
                                onChange={(e) => handleSelectStockItem(idx, e.target.value)}
                                className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                                aria-label={`Hubungkan ${mat.materialName} ke barang stok`}
                              >
                                <option value="">
                                  {stockItems.length > 0 ? "Pilih barang stok" : "Tidak ada barang stok"}
                                </option>
                                {stockItems.map((stockItem) => (
                                  <option key={stockItem.id} value={stockItem.id}>
                                    {stockItem.name} · {stockItem.sku}
                                  </option>
                                ))}
                                {mat.stockItemId && !stockItems.some((item) => item.id === mat.stockItemId) && (
                                  <option value={mat.stockItemId}>Barang stok tidak ditemukan</option>
                                )}
                              </select>
                              {(() => {
                                const linkedStockItem = stockItems.find(
                                  (item) => item.id === mat.stockItemId,
                                );
                                return linkedStockItem ? (
                                  <span className="mt-1 block text-[10px] text-muted-foreground">
                                    Stok:{" "}
                                    {Number(linkedStockItem.stockQuantity || 0).toLocaleString("id-ID", {
                                      maximumFractionDigits: 3,
                                    })}{" "}
                                    {linkedStockItem.unit}
                                  </span>
                                ) : (
                                  <span className="mt-1 block text-[10px] text-muted-foreground">
                                    Belum terhubung
                                  </span>
                                );
                              })()}
                            </td>

                            {/* Volume Kebutuhan RAB */}
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {mat.plannedQuantity || "—"}
                            </td>

                            {/* Bahan Aktual RAP */}
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={mat.actualQuantity || ""}
                                onChange={(e) =>
                                  handleUpdateMaterial(idx, "actualQuantity", parseFloat(e.target.value) || 0)
                                }
                                placeholder="0"
                                className="h-8 text-right text-xs font-bold"
                              />
                            </td>

                            {/* Satuan */}
                            <td className="px-3 py-2 text-muted-foreground font-medium">
                              {mat.unit || "unit"}
                            </td>

                            {/* Harga Satuan RAP (Rp) */}
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={mat.unitPrice || ""}
                                onChange={(e) =>
                                  handleUpdateMaterial(idx, "unitPrice", parseFloat(e.target.value) || 0)
                                }
                                placeholder="0"
                                className="h-8 text-right text-xs font-mono"
                              />
                            </td>

                            {/* Subtotal RAP */}
                            <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                              Rp {lineTotal.toLocaleString("id-ID")}
                            </td>

                            {/* Hapus */}
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveMaterial(idx)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ================= TAB 2: JASA BORONGAN ================= */
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <Hammer className="size-4 shrink-0" />
                <span>
                  <strong>Skema Jasa Borongan:</strong> Tenaga kerja dan tukang diborongkan per item pekerjaan atau
                  per mandor subkon. Masukkan harga satuan; total dihitung otomatis dari volume × harga satuan.
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full min-w-[1020px] text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2.5 w-64">Uraian Pekerjaan Borongan</th>
                      <th className="px-3 py-2.5 text-right w-24">Volume</th>
                      <th className="px-3 py-2.5 w-20">Satuan</th>
                      <th className="px-3 py-2.5 text-right w-40">Harga Satuan (Rp)</th>
                      <th className="px-3 py-2.5 text-right w-40">Total Borongan (Rp)</th>
                      <th className="px-3 py-2.5 w-52">Mandor / Subkon Borongan</th>
                      <th className="px-3 py-2.5 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {laborPlans.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-muted-foreground">
                          Belum ada item jasa borongan. Klik <strong>Tambah Borongan</strong> untuk menambahkan.
                        </td>
                      </tr>
                    ) : (
                      laborPlans.map((labor, idx) => (
                        <tr key={idx} className="hover:bg-muted/10 transition">
                          {/* Nama Pekerjaan */}
                          <td className="px-3.5 py-2">
                            <Input
                              type="text"
                              value={labor.jobName}
                              onChange={(e) => handleUpdateLabor(idx, "jobName", e.target.value)}
                              placeholder="Nama pekerjaan borongan"
                              className="h-8 text-xs font-semibold"
                            />
                          </td>

                          {/* Volume */}
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={labor.volume || ""}
                              onChange={(e) =>
                                handleUpdateLabor(idx, "volume", parseFloat(e.target.value) || 0)
                              }
                              className="h-8 text-right text-xs"
                            />
                          </td>

                          {/* Satuan */}
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={labor.unit}
                              onChange={(e) => handleUpdateLabor(idx, "unit", e.target.value)}
                              placeholder="m / Ls"
                              className="h-8 text-xs text-muted-foreground"
                            />
                          </td>

                          {/* Harga Satuan Jasa (Rp) */}
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={labor.boronganRate || ""}
                              onChange={(e) =>
                                handleUpdateLabor(idx, "boronganRate", parseFloat(e.target.value) || 0)
                              }
                              placeholder="0"
                              className="h-8 text-right text-xs font-mono font-bold text-amber-600 dark:text-amber-400"
                            />
                          </td>

                          {/* Total Borongan Jasa (Rp) */}
                          <td className="px-3 py-2 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                            Rp {Math.round(labor.volume * labor.boronganRate).toLocaleString("id-ID")}
                          </td>

                          {/* Mandor / Subkon */}
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={labor.subkonName || ""}
                              onChange={(e) => handleUpdateLabor(idx, "subkonName", e.target.value)}
                              placeholder="Nama mandor / kelompok borongan"
                              className="h-8 text-xs"
                            />
                          </td>

                          {/* Hapus */}
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLabor(idx)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Financial Summary Strip */}
        <div className="border-t border-border/80 bg-muted/30 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Bahan */}
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <span className="text-[11px] font-medium text-muted-foreground">Total Bahan RAP</span>
              <p className="mt-1 font-mono text-sm sm:text-base font-bold text-foreground">
                Rp {totalMaterialCost.toLocaleString("id-ID")}
              </p>
            </div>

            {/* Total Jasa Borongan */}
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <span className="text-[11px] font-medium text-muted-foreground">Total Jasa Borongan</span>
              <p className="mt-1 font-mono text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400">
                Rp {totalLaborCost.toLocaleString("id-ID")}
              </p>
            </div>

            {/* Total RAP */}
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
              <span className="text-[11px] font-medium text-primary">Total RAP Pelaksanaan</span>
              <p className="mt-1 font-mono text-sm sm:text-base font-extrabold text-foreground">
                Rp {totalRap.toLocaleString("id-ID")}
              </p>
            </div>

            {/* Estimasi Keuntungan / Margin */}
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span>Rencana Laba Proyek</span>
                <span className="font-bold">({profitMarginPercent}%)</span>
              </span>
              <p className="mt-1 font-mono text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
                Rp {profitAmount.toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-between border-t border-border/80 p-4 bg-card">
          <span className="text-xs text-muted-foreground">
            Total RAB Kontrak: <strong>Rp {paguRab.toLocaleString("id-ID")}</strong>
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {isPending ? "Menyimpan RAP..." : "Simpan RAP ke Database"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
