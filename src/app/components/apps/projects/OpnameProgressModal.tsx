"use client";

import { useState, useTransition, useMemo } from "react";
import { HelpCircle, Search, X, Check, Calendar, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordProjectOpname } from "@/app/actions/project";

export type OpnameWorkPointItem = {
  id: string;
  code: string;
  title: string;
  section: string;
  targetVolume: number;
  unit: string;
  completedVolume: number;
  progress: number;
  totalPrice?: number;
};

interface OpnameProgressModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  overallProgress: number;
  items: OpnameWorkPointItem[];
  onSuccess?: () => void;
}

export default function OpnameProgressModal({
  open,
  onClose,
  projectId,
  overallProgress,
  items,
  onSuccess,
}: OpnameProgressModalProps) {
  const [periodType, setPeriodType] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"additional" | "total">("additional");
  const [reportDate, setReportDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Stores input values per workpoint
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        item.section.toLowerCase().includes(query)
      );
    });
  }, [items, searchQuery]);

  // Live simulation of overall progress
  const simulatedProgress = useMemo(() => {
    const totalWage = items.reduce((sum, item) => sum + (item.totalPrice ?? 1), 0);
    if (totalWage <= 0) return overallProgress;

    let weightedSum = 0;
    for (const item of items) {
      const inputVal = parseFloat(inputValues[item.id] ?? "");
      let itemCompleted = item.completedVolume;

      if (!isNaN(inputVal)) {
        itemCompleted = activeTab === "additional"
          ? item.completedVolume + inputVal
          : inputVal;
      }

      const target = item.targetVolume > 0 ? item.targetVolume : 1;
      const itemProgress = Math.min(100, Math.max(0, (itemCompleted / target) * 100));
      const weight = (item.totalPrice ?? 1) / totalWage;
      weightedSum += itemProgress * weight;
    }

    return Math.round(weightedSum * 10) / 10;
  }, [items, inputValues, activeTab, overallProgress]);

  if (!open) return null;

  const handleInputChange = (itemId: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleQuickFinish = (item: OpnameWorkPointItem) => {
    if (activeTab === "additional") {
      const remaining = Math.max(0, item.targetVolume - item.completedVolume);
      setInputValues((prev) => ({ ...prev, [item.id]: remaining.toString() }));
    } else {
      setInputValues((prev) => ({ ...prev, [item.id]: item.targetVolume.toString() }));
    }
  };

  const handleQuickPercent = (item: OpnameWorkPointItem, percent: number) => {
    const target = item.targetVolume > 0 ? item.targetVolume : 1;
    const targetComp = Math.round((target * (percent / 100)) * 100) / 100;
    if (activeTab === "additional") {
      const add = Math.max(0, targetComp - item.completedVolume);
      setInputValues((prev) => ({ ...prev, [item.id]: add.toString() }));
    } else {
      setInputValues((prev) => ({ ...prev, [item.id]: targetComp.toString() }));
    }
  };

  const handleSave = () => {
    setErrorMsg("");
    const opnameEntries = Object.entries(inputValues)
      .map(([workPointId, val]) => ({
        workPointId,
        volume: parseFloat(val) || 0,
      }))
      .filter((e) => e.volume > 0 || (activeTab === "total" && e.volume >= 0));

    if (opnameEntries.length === 0) {
      setErrorMsg("Isi setidaknya 1 volume progres opname sebelum menyimpan.");
      return;
    }

    startTransition(async () => {
      const res = await recordProjectOpname(projectId, {
        reportDate,
        isAdditional: activeTab === "additional",
        periodType,
        weekNumber: periodType === "WEEKLY" ? weekNumber : undefined,
        notes,
        items: opnameEntries,
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">Catat Progres Fisik (Opname)</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {periodType === "DAILY" ? "Laporan Harian" : `Minggu ke-${weekNumber}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Catat volume fisik terpasang per item pekerjaan. Total progres proyek saat ini:{" "}
              <strong className="text-foreground">{overallProgress}%</strong>.
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
            <p className="font-semibold text-foreground">Panduan Catat Opname:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Pilih periode pelaporan <strong>Harian</strong> (per hari kerja) atau <strong>Mingguan</strong> (evaluasi mingguan per opname).</li>
              <li>Pilih metode <strong>Tambahan</strong> jika mencatat volume pekerjaan yang baru selesai pada periode ini.</li>
              <li>Pilih metode <strong>Total Terpasang</strong> jika ingin menginput akumulasi total volume fisik yang terpasang hingga saat ini.</li>
              <li>Sistem menghitung pembobotan progres otomatis sesuai nilai RAB dan memperbarui Kurva S.</li>
            </ul>
          </div>
        )}

        {/* Controls Bar */}
        <div className="space-y-3.5 border-b border-border/60 bg-muted/10 p-5">
          {/* Top Toggles: Periode (Harian / Mingguan) & Metode (Tambahan / Total) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Periode Pelaporan */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setPeriodType("DAILY")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                  periodType === "DAILY"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock className="size-3.5" />
                <span>Harian</span>
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("WEEKLY")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                  periodType === "WEEKLY"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Calendar className="size-3.5" />
                <span>Mingguan</span>
              </button>
            </div>

            {/* Metode Input */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("additional")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeTab === "additional"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tambahan Selesai
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("total")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeTab === "total"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Total Terpasang
              </button>
            </div>
          </div>

          {/* Form Fields: Date, Week Selection, Search, Notes */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                {periodType === "DAILY" ? "Tanggal Pelaporan" : "Tanggal Akhir Minggu"}
              </label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>

            {periodType === "WEEKLY" ? (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Periode Minggu ke-</label>
                <select
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>
                      Minggu ke-{w}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Catatan / Keterangan (Opsional)</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Kondisi cuaca, kendala, dsb."
                  className="mt-1 h-9 text-xs"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Cari Item Pekerjaan</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari uraian atau kode item..."
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Live Progress Impact Indicator */}
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>Proyeksi Progres Total:</span>
              <strong className="text-primary">{overallProgress}%</strong>
              <span>→</span>
              <strong className="text-emerald-500 font-bold">{simulatedProgress}%</strong>
            </span>
            <span className="text-muted-foreground text-[11px]">
              {simulatedProgress > overallProgress ? `Naik +${(simulatedProgress - overallProgress).toFixed(1)}%` : "Belum ada kenaikan"}
            </span>
          </div>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto p-5">
          {errorMsg && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {errorMsg}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-foreground">Tidak ada item ditemukan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tambahkan item pekerjaan di menu Ubah RAB terlebih dahulu.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 font-semibold text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5">Uraian Pekerjaan</th>
                    <th className="w-24 px-3 py-2.5 text-right">Target RAB</th>
                    <th className="w-28 px-3 py-2.5 text-right">Terpasang Saat Ini</th>
                    <th className="w-64 px-3 py-2.5 text-right">
                      {activeTab === "additional" ? "Volume Tambahan" : "Total Terpasang Baru"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredItems.map((item) => {
                    const inputVal = parseFloat(inputValues[item.id] ?? "");
                    let projectedComp = item.completedVolume;
                    if (!isNaN(inputVal)) {
                      projectedComp = activeTab === "additional"
                        ? item.completedVolume + inputVal
                        : inputVal;
                    }
                    const target = item.targetVolume > 0 ? item.targetVolume : 1;
                    const projectedPct = Math.min(100, Math.max(0, Math.round((projectedComp / target) * 1000) / 10));

                    return (
                      <tr key={item.id} className="hover:bg-muted/10">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-foreground">
                            {item.code ? `${item.code} ` : ""}
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{item.section}</p>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          {item.targetVolume} {item.unit}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="font-semibold text-foreground">{item.completedVolume}</span>
                          <span className="ml-1 text-[11px] text-muted-foreground">({item.progress}%)</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={inputValues[item.id] ?? ""}
                              onChange={(e) => handleInputChange(item.id, e.target.value)}
                              placeholder="0"
                              className="h-8 w-24 text-right text-xs"
                            />
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuickPercent(item, 50)}
                                className="h-8 px-2 text-[11px] text-muted-foreground hover:bg-muted"
                                title="Set 50% target"
                              >
                                50%
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuickFinish(item)}
                                className="h-8 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Selesaikan 100%"
                              >
                                <Check className="mr-1 size-3 text-emerald-600" />
                                <span>100%</span>
                              </Button>
                            </div>
                            {!isNaN(inputVal) && inputVal > 0 && (
                              <span className="ml-1 font-mono text-[11px] font-bold text-emerald-500">
                                → {projectedPct}%
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/10 p-5">
          <div className="text-xs text-muted-foreground">
            {periodType === "DAILY" ? "Tercatat sebagai opname harian" : `Tercatat sebagai opname mingguan (Minggu ${weekNumber})`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPending ? "Menyimpan..." : "Simpan Progres"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
