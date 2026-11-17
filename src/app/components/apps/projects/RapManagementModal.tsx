"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Calculator,
  FileSpreadsheet,
  Hammer,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getProjectRap, saveProjectRap } from "@/app/actions/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState<"materials" | "labor">(
    "materials",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

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
  } else if (!loadKey && prevLoadKey !== "") {
    setPrevLoadKey("");
  }

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
                  findMatchingStockItem(
                    currentStockItems,
                    material.materialName,
                    material.unit,
                  )?.id,
              })),
            );
          } else if (res.rabMaterials && res.rabMaterials.length > 0) {
            setMaterialPlans(
              res.rabMaterials.map((mat) => ({
                materialName: mat.name,
                unit: mat.unit,
                plannedQuantity: mat.quantity || 0,
                actualQuantity: mat.quantity || 0,
                unitPrice: mat.rabPrice ? Math.round(mat.rabPrice * 0.85) : 0,
                totalPrice: 0,
                stockItemId: findMatchingStockItem(
                  currentStockItems,
                  mat.name,
                  mat.unit,
                )?.id,
              })),
            );
          } else {
            setMaterialPlans([]);
          }

          if (res.laborPlans && res.laborPlans.length > 0) {
            setLaborPlans(
              res.laborPlans.map((labor) => {
                const volume = Math.max(0, Number(labor.volume) || 0);
                const savedRate = Math.max(0, Number(labor.boronganRate) || 0);
                const savedTotal = Math.max(
                  0,
                  Number(labor.totalBorongan) || 0,
                );
                const rate =
                  savedRate > 0
                    ? savedRate
                    : volume > 0
                      ? savedTotal / volume
                      : 0;

                return {
                  ...labor,
                  boronganRate: rate,
                  totalBorongan: Math.round(volume * rate),
                };
              }),
            );
          } else if (res.workPoints && res.workPoints.length > 0) {
            setLaborPlans(
              res.workPoints.map((wp) => {
                const volume = Math.max(0, Number(wp.volume) || 0);
                const estimatedTotal = Math.round(wp.totalRab * 0.3);
                const boronganRate =
                  volume > 0 ? Math.round(estimatedTotal / volume) : 0;

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
              }),
            );
          } else {
            setLaborPlans([]);
          }
        } else {
          toast.error(res?.message || "Gagal memuat data RAP dari server.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load RAP data:", err);
        toast.error("Gagal memuat data RAP dari server.");
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

  const totalMaterialCost = materialPlans.reduce(
    (sum, mat) => sum + Math.round((mat.actualQuantity || 0) * (mat.unitPrice || 0)),
    0,
  );

  const totalLaborCost = laborPlans.reduce(
    (sum, labor) =>
      sum +
      Math.round(
        Math.max(0, labor.volume) * Math.max(0, labor.boronganRate),
      ),
    0,
  );

  const totalRap = totalMaterialCost + totalLaborCost;
  const profitAmount = paguRab - totalRap;
  const profitMarginPercent =
    paguRab > 0 ? ((profitAmount / paguRab) * 100).toFixed(1) : "0.0";

  const rabMaterialOptions = useMemo<ComboboxOption[]>(() => {
    const seen = new Set<string>();
    const options: ComboboxOption[] = [];
    for (const item of rabMaterials) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      options.push({
        value: item.name,
        label: item.name,
        description: `Satuan: ${item.unit}`,
      });
    }
    for (const mat of materialPlans) {
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
  }, [rabMaterials, materialPlans]);

  const stockOptions = useMemo<ComboboxOption[]>(
    () =>
      stockItems.map((item) => ({
        value: item.id,
        label: item.name,
        description: `${item.sku} · Stok: ${Number(item.stockQuantity || 0).toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${item.unit}`,
        keywords: [item.sku, item.category],
      })),
    [stockItems],
  );

  const handleAddMaterialRow = () => {
    const firstRabMat = rabMaterials[0];
    setMaterialPlans((prev) => [
      ...prev,
      {
        materialName: firstRabMat?.name || "",
        unit: firstRabMat?.unit || "unit",
        plannedQuantity: firstRabMat?.quantity || 0,
        actualQuantity: firstRabMat?.quantity || 1,
        unitPrice: firstRabMat?.rabPrice
          ? Math.round(firstRabMat.rabPrice * 0.85)
          : 0,
        stockItemId: firstRabMat
          ? findMatchingStockItem(
              stockItems,
              firstRabMat.name,
              firstRabMat.unit,
            )?.id
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
          unitPrice: selected?.rabPrice
            ? Math.round(selected.rabPrice * 0.85)
            : item.unitPrice,
          stockItemId: selected
            ? findMatchingStockItem(stockItems, selected.name, selected.unit)?.id
            : undefined,
        };
      }),
    );
  };

  const handleSelectStockItem = (index: number, stockItemId: string) => {
    setMaterialPlans((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, stockItemId: stockItemId || undefined }
          : item,
      ),
    );
  };

  const handleUpdateMaterial = <K extends keyof MaterialPlanItem>(
    index: number,
    field: K,
    value: MaterialPlanItem[K],
  ) => {
    setMaterialPlans((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterialPlans((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSyncAllFromRab = () => {
    if (rabMaterials.length === 0) {
      toast.error("Belum ada bahan analisa pada RAB proyek ini.");
      return;
    }
    setMaterialPlans(
      rabMaterials.map((mat) => ({
        materialName: mat.name,
        unit: mat.unit,
        plannedQuantity: mat.quantity || 0,
        actualQuantity: mat.quantity || 0,
        unitPrice: mat.rabPrice ? Math.round(mat.rabPrice * 0.85) : 0,
        stockItemId: findMatchingStockItem(stockItems, mat.name, mat.unit)?.id,
      })),
    );
    toast.success("Bahan disinkronkan dari analisa RAB.");
  };

  const handleUpdateLabor = <K extends keyof LaborPlanItem>(
    index: number,
    field: K,
    value: LaborPlanItem[K],
  ) => {
    setLaborPlans((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "volume" || field === "boronganRate") {
          const volume =
            field === "volume" ? Math.max(0, Number(value) || 0) : item.volume;
          const rate =
            field === "boronganRate"
              ? Math.max(0, Number(value) || 0)
              : item.boronganRate;
          updated.volume = volume;
          updated.boronganRate = rate;
          updated.totalBorongan = Math.round(volume * rate);
        } else if (field === "totalBorongan") {
          const total = Math.max(0, Number(value) || 0);
          updated.totalBorongan = total;
          updated.boronganRate = item.volume > 0 ? total / item.volume : 0;
        }
        return updated;
      }),
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

  const handleSave = () => {
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
        toast.success(res.message || "RAP berhasil disimpan.");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || "Gagal menyimpan RAP.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<Calculator className="size-4" aria-hidden="true" />}
      title="Penyusunan RAP"
      description={`${projectTitle} · Nilai Kontrak RAB: Rp ${paguRab.toLocaleString("id-ID")}`}
      className="max-w-5xl"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="type-p3 text-muted-foreground tabular-nums">
            Total RAB Kontrak:{" "}
            <strong className="text-foreground">
              Rp {paguRab.toLocaleString("id-ID")}
            </strong>
          </span>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending || isLoading}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Menyimpan...
                </>
              ) : (
                "Simpan RAP"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-16 text-center">
            <RefreshCw
              className="mx-auto mb-2 size-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <p className="type-p2 text-muted-foreground">
              Memuat data RAB dan RAP proyek...
            </p>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value === "labor" ? "labor" : "materials")
            }
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="materials" className="gap-1.5">
                  <Package className="size-3.5" aria-hidden="true" />
                  <span>Bahan RAP ({materialPlans.length})</span>
                </TabsTrigger>
                <TabsTrigger value="labor" className="gap-1.5">
                  <Hammer className="size-3.5" aria-hidden="true" />
                  <span>Jasa Borongan ({laborPlans.length})</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                {activeTab === "materials" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSyncAllFromRab}
                      className="gap-1.5"
                    >
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Sinkron RAB
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddMaterialRow}
                      className="gap-1.5"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Tambah Bahan
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddLaborRow}
                    className="gap-1.5"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Tambah Borongan
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="materials" className="space-y-4">
              <div className="type-p3 flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 text-muted-foreground">
                <FileSpreadsheet
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  Daftar bahan diambil dari analisa upload RAB (
                  {rabMaterials.length} bahan). Hubungkan ke barang stok untuk
                  memantau ketersediaan gudang.
                </span>
              </div>

              {materialPlans.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Belum ada bahan RAP"
                  description="Klik Tambah Bahan atau Sinkron RAB untuk menyusun rencana biaya material."
                />
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-3 md:hidden">
                    {materialPlans.map((mat, idx) => {
                      const lineTotal = Math.round(
                        (mat.actualQuantity || 0) * (mat.unitPrice || 0),
                      );
                      const linkedStockItem = stockItems.find(
                        (item) => item.id === mat.stockItemId,
                      );
                      return (
                        <div
                          key={`mob-mat-${idx}`}
                          className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="type-p3 font-semibold text-muted-foreground">
                              Bahan #{idx + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Hapus bahan"
                              onClick={() => handleRemoveMaterial(idx)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>

                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Bahan (dari RAB)
                            </Label>
                            <Combobox
                              options={rabMaterialOptions}
                              value={mat.materialName}
                              onValueChange={(val) =>
                                handleSelectRabMaterial(idx, val)
                              }
                              placeholder="Pilih bahan..."
                              searchPlaceholder="Cari bahan..."
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Barang Stok
                            </Label>
                            <Combobox
                              allowClear
                              options={stockOptions}
                              value={mat.stockItemId || ""}
                              onValueChange={(val) =>
                                handleSelectStockItem(idx, val)
                              }
                              placeholder={
                                stockItems.length > 0
                                  ? "Hubungkan barang stok..."
                                  : "Tidak ada barang stok"
                              }
                              searchPlaceholder="Cari stok..."
                            />
                            {linkedStockItem && (
                              <p className="type-p3 text-muted-foreground tabular-nums">
                                Stok:{" "}
                                {Number(
                                  linkedStockItem.stockQuantity || 0,
                                ).toLocaleString("id-ID", {
                                  maximumFractionDigits: 3,
                                })}{" "}
                                {linkedStockItem.unit}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="type-p3 text-muted-foreground">
                                Aktual ({mat.unit || "unit"})
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={mat.actualQuantity || ""}
                                onChange={(e) =>
                                  handleUpdateMaterial(
                                    idx,
                                    "actualQuantity",
                                    Number.parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="text-right font-semibold tabular-nums"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="type-p3 text-muted-foreground">
                                Harga Satuan (Rp)
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={mat.unitPrice || ""}
                                onChange={(e) =>
                                  handleUpdateMaterial(
                                    idx,
                                    "unitPrice",
                                    Number.parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="text-right font-mono tabular-nums"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                            <span className="type-p3 text-muted-foreground">
                              Vol RAB: {mat.plannedQuantity || "—"}
                            </span>
                            <span className="type-p2 font-bold text-foreground tabular-nums">
                              Rp {lineTotal.toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table pagination={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-52">
                            Bahan (Upload RAB)
                          </TableHead>
                          <TableHead className="min-w-48">Barang Stok</TableHead>
                          <TableHead className="text-right">Vol RAB</TableHead>
                          <TableHead className="w-28 text-right">
                            Aktual
                          </TableHead>
                          <TableHead>Satuan</TableHead>
                          <TableHead className="w-36 text-right">
                            Harga Satuan
                          </TableHead>
                          <TableHead className="text-right">
                            Subtotal RAP
                          </TableHead>
                          <TableHead className="w-12 text-center">
                            Aksi
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materialPlans.map((mat, idx) => {
                          const lineTotal = Math.round(
                            (mat.actualQuantity || 0) * (mat.unitPrice || 0),
                          );
                          const linkedStockItem = stockItems.find(
                            (item) => item.id === mat.stockItemId,
                          );

                          return (
                            <TableRow key={`mat-${idx}`}>
                              <TableCell>
                                <Combobox
                                  options={rabMaterialOptions}
                                  value={mat.materialName}
                                  onValueChange={(val) =>
                                    handleSelectRabMaterial(idx, val)
                                  }
                                  placeholder="Pilih bahan..."
                                  searchPlaceholder="Cari bahan..."
                                />
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                <Combobox
                                  allowClear
                                  options={stockOptions}
                                  value={mat.stockItemId || ""}
                                  onValueChange={(val) =>
                                    handleSelectStockItem(idx, val)
                                  }
                                  placeholder={
                                    stockItems.length > 0
                                      ? "Pilih barang stok"
                                      : "Tidak ada stok"
                                  }
                                  searchPlaceholder="Cari stok..."
                                />
                                <span className="type-p3 mt-1 block text-muted-foreground tabular-nums">
                                  {linkedStockItem
                                    ? `Stok: ${Number(linkedStockItem.stockQuantity || 0).toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${linkedStockItem.unit}`
                                    : "Belum terhubung"}
                                </span>
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                                {mat.plannedQuantity || "—"}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={mat.actualQuantity || ""}
                                  onChange={(e) =>
                                    handleUpdateMaterial(
                                      idx,
                                      "actualQuantity",
                                      Number.parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  placeholder="0"
                                  className="text-right font-semibold tabular-nums"
                                />
                              </TableCell>
                              <TableCell className="type-p3 text-muted-foreground">
                                {mat.unit || "unit"}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={mat.unitPrice || ""}
                                  onChange={(e) =>
                                    handleUpdateMaterial(
                                      idx,
                                      "unitPrice",
                                      Number.parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  placeholder="0"
                                  className="text-right font-mono tabular-nums"
                                />
                              </TableCell>
                              <TableCell className="type-p2 text-right font-mono font-bold text-foreground tabular-nums">
                                Rp {lineTotal.toLocaleString("id-ID")}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Hapus bahan"
                                  onClick={() => handleRemoveMaterial(idx)}
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
            </TabsContent>

            <TabsContent value="labor" className="space-y-4">
              <div className="type-p3 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-foreground">
                <Hammer
                  className="size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span>
                  Tenaga kerja dan tukang diborongkan per item pekerjaan atau
                  mandor subkon. Total dihitung otomatis dari volume × harga
                  satuan.
                </span>
              </div>

              {laborPlans.length === 0 ? (
                <EmptyState
                  icon={Hammer}
                  title="Belum ada jasa borongan"
                  description="Klik Tambah Borongan untuk mencatat biaya tenaga borongan."
                />
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-3 md:hidden">
                    {laborPlans.map((labor, idx) => (
                      <div
                        key={`mob-lab-${idx}`}
                        className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="type-p3 font-semibold text-muted-foreground">
                            Borongan #{idx + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Hapus borongan"
                            onClick={() => handleRemoveLabor(idx)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>

                        <div className="space-y-1">
                          <Label className="type-p3 text-muted-foreground">
                            Uraian Pekerjaan
                          </Label>
                          <Input
                            value={labor.jobName}
                            onChange={(e) =>
                              handleUpdateLabor(idx, "jobName", e.target.value)
                            }
                            placeholder="Nama pekerjaan borongan"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Volume
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={labor.volume || ""}
                              onChange={(e) =>
                                handleUpdateLabor(
                                  idx,
                                  "volume",
                                  Number.parseFloat(e.target.value) || 0,
                                )
                              }
                              className="text-right tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Satuan
                            </Label>
                            <Input
                              value={labor.unit}
                              onChange={(e) =>
                                handleUpdateLabor(idx, "unit", e.target.value)
                              }
                              placeholder="m / Ls"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Harga Satuan (Rp)
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={labor.boronganRate || ""}
                              onChange={(e) =>
                                handleUpdateLabor(
                                  idx,
                                  "boronganRate",
                                  Number.parseFloat(e.target.value) || 0,
                                )
                              }
                              className="text-right font-mono tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="type-p3 text-muted-foreground">
                              Mandor / Subkon
                            </Label>
                            <Input
                              value={labor.subkonName || ""}
                              onChange={(e) =>
                                handleUpdateLabor(
                                  idx,
                                  "subkonName",
                                  e.target.value,
                                )
                              }
                              placeholder="Nama mandor"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                          <span className="type-p3 text-muted-foreground">
                            Total Borongan
                          </span>
                          <span className="type-p2 font-bold text-foreground tabular-nums">
                            Rp{" "}
                            {Math.round(
                              labor.volume * labor.boronganRate,
                            ).toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table pagination={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-52">
                            Uraian Pekerjaan
                          </TableHead>
                          <TableHead className="w-24 text-right">
                            Volume
                          </TableHead>
                          <TableHead className="w-24">Satuan</TableHead>
                          <TableHead className="w-36 text-right">
                            Harga Satuan
                          </TableHead>
                          <TableHead className="text-right">
                            Total Borongan
                          </TableHead>
                          <TableHead className="min-w-44">
                            Mandor / Subkon
                          </TableHead>
                          <TableHead className="w-12 text-center">
                            Aksi
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {laborPlans.map((labor, idx) => (
                          <TableRow key={`lab-${idx}`}>
                            <TableCell>
                              <Input
                                value={labor.jobName}
                                onChange={(e) =>
                                  handleUpdateLabor(
                                    idx,
                                    "jobName",
                                    e.target.value,
                                  )
                                }
                                placeholder="Nama pekerjaan"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={labor.volume || ""}
                                onChange={(e) =>
                                  handleUpdateLabor(
                                    idx,
                                    "volume",
                                    Number.parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="text-right tabular-nums"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={labor.unit}
                                onChange={(e) =>
                                  handleUpdateLabor(idx, "unit", e.target.value)
                                }
                                placeholder="m / Ls"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={labor.boronganRate || ""}
                                onChange={(e) =>
                                  handleUpdateLabor(
                                    idx,
                                    "boronganRate",
                                    Number.parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="text-right font-mono font-semibold tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="type-p2 text-right font-mono font-semibold text-foreground tabular-nums">
                              Rp{" "}
                              {Math.round(
                                labor.volume * labor.boronganRate,
                              ).toLocaleString("id-ID")}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={labor.subkonName || ""}
                                onChange={(e) =>
                                  handleUpdateLabor(
                                    idx,
                                    "subkonName",
                                    e.target.value,
                                  )
                                }
                                placeholder="Nama mandor / subkon"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Hapus borongan"
                                onClick={() => handleRemoveLabor(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Financial Summary Strip */}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <span className="type-p3 font-medium text-muted-foreground">
              Total Bahan RAP
            </span>
            <p className="type-h3 mt-1 font-mono text-foreground tabular-nums">
              Rp {totalMaterialCost.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <span className="type-p3 font-medium text-muted-foreground">
              Total Jasa Borongan
            </span>
            <p className="type-h3 mt-1 font-mono text-warning tabular-nums">
              Rp {totalLaborCost.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <span className="type-p3 font-medium text-primary">
              Total RAP Pelaksanaan
            </span>
            <p className="type-h3 mt-1 font-mono font-bold text-foreground tabular-nums">
              Rp {totalRap.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="rounded-xl border border-success/40 bg-success/5 p-3">
            <div className="type-p3 flex items-center justify-between font-medium text-success">
              <span>Rencana Laba</span>
              <Badge variant="outline" className="tabular-nums">
                {profitMarginPercent}%
              </Badge>
            </div>
            <p className="type-h3 mt-1 font-mono text-success tabular-nums">
              Rp {profitAmount.toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      </div>
    </GlobalModal>
  );
}
