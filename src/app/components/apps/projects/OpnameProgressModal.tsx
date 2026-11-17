"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Calendar,
  Check,
  ClipboardCheck,
  Clock,
  HelpCircle,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { recordProjectOpname } from "@/app/actions/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { getJakartaDateKey } from "@/lib/habit-date";

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
  const [activeTab, setActiveTab] = useState<"additional" | "total">(
    "additional",
  );
  const [reportDate, setReportDate] = useState(() => getJakartaDateKey());
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  // Pembobotan mengikuti `calculateWeightedProjectProgress` di server menggunakan `item.totalPrice`.
  const simulatedProgress = useMemo(() => {
    if (items.length === 0) return overallProgress;
    const hasAnyPrice = items.some((item) => (item.totalPrice ?? 0) > 0);
    const getWeight = (item: OpnameWorkPointItem) =>
      hasAnyPrice ? Math.max(0, item.totalPrice ?? 0) : 1;
    const totalWage = items.reduce((sum, item) => sum + getWeight(item), 0);
    if (totalWage <= 0) return overallProgress;

    let weightedSum = 0;
    for (const item of items) {
      const rawVal = (inputValues[item.id] ?? "").trim();
      const inputVal = rawVal === "" ? Number.NaN : Number.parseFloat(rawVal);
      let itemCompleted = item.completedVolume;

      if (Number.isFinite(inputVal)) {
        itemCompleted =
          activeTab === "additional"
            ? item.completedVolume + inputVal
            : inputVal;
      }

      const target = item.targetVolume > 0 ? item.targetVolume : 1;
      const itemProgress = Math.min(
        100,
        Math.max(0, Math.round((itemCompleted / target) * 1000) / 10),
      );
      const weight = getWeight(item) / totalWage;
      weightedSum += itemProgress * weight;
    }

    return Math.round(weightedSum * 10) / 10;
  }, [items, inputValues, activeTab, overallProgress]);

  const handleInputChange = (itemId: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleQuickFinish = (item: OpnameWorkPointItem) => {
    if (activeTab === "additional") {
      const remaining = Math.max(0, item.targetVolume - item.completedVolume);
      setInputValues((prev) => ({ ...prev, [item.id]: remaining.toString() }));
    } else {
      setInputValues((prev) => ({
        ...prev,
        [item.id]: item.targetVolume.toString(),
      }));
    }
  };

  const handleQuickPercent = (item: OpnameWorkPointItem, percent: number) => {
    const target = item.targetVolume > 0 ? item.targetVolume : 1;
    const targetComp = Math.round(target * (percent / 100) * 100) / 100;
    if (activeTab === "additional") {
      const add = Math.max(0, targetComp - item.completedVolume);
      setInputValues((prev) => ({ ...prev, [item.id]: add.toString() }));
    } else {
      setInputValues((prev) => ({ ...prev, [item.id]: targetComp.toString() }));
    }
  };

  const handleSave = () => {
    const opnameEntries = Object.entries(inputValues)
      .filter(([, raw]) => raw.trim() !== "")
      .map(([workPointId, val]) => ({
        workPointId,
        volume: Number.parseFloat(val),
      }))
      .filter(
        (entry) =>
          Number.isFinite(entry.volume) &&
          (activeTab === "additional"
            ? entry.volume > 0
            : entry.volume >= 0),
      );

    if (opnameEntries.length === 0) {
      toast.error("Isi minimal 1 volume progres opname sebelum menyimpan.");
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
        toast.success(res.message || "Progres opname berhasil disimpan.");
        setInputValues({});
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || "Gagal menyimpan progres opname.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<ClipboardCheck className="size-4" aria-hidden="true" />}
      title="Catat Progres Opname"
      description={`Total progres proyek saat ini: ${overallProgress}%`}
      className="max-w-4xl"
      footerNote={
        periodType === "DAILY"
          ? "Tercatat sebagai opname harian"
          : `Tercatat sebagai opname mingguan (Minggu ke-${weekNumber})`
      }
      footer={
        <>
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
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Menyimpan...
              </>
            ) : (
              "Simpan Progres"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Top Controls */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={periodType === "DAILY" ? "default" : "ghost"}
                  onClick={() => setPeriodType("DAILY")}
                  className="gap-1.5"
                >
                  <Clock className="size-3.5" aria-hidden="true" />
                  Harian
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={periodType === "WEEKLY" ? "default" : "ghost"}
                  onClick={() => setPeriodType("WEEKLY")}
                  className="gap-1.5"
                >
                  <Calendar className="size-3.5" aria-hidden="true" />
                  Mingguan
                </Button>
              </div>

              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "additional" ? "secondary" : "ghost"}
                  onClick={() => setActiveTab("additional")}
                >
                  Tambahan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "total" ? "secondary" : "ghost"}
                  onClick={() => setActiveTab("total")}
                >
                  Total Terpasang
                </Button>
              </div>
            </div>

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

          {showGuide && (
            <div className="type-p3 rounded-lg border border-border bg-card p-3 text-muted-foreground">
              <p className="font-semibold text-foreground">
                Panduan Catat Opname:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  Pilih <strong>Tambahan</strong> untuk mencatat volume baru
                  yang selesai pada periode ini, atau{" "}
                  <strong>Total Terpasang</strong> untuk akumulasi fisik saat
                  ini.
                </li>
                <li>
                  Kolom yang dibiarkan kosong tidak akan diubah atau direset.
                </li>
                <li>
                  Pembobotan progres dihitung otomatis sesuai bobot nilai RAB.
                </li>
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="type-p3 font-medium text-muted-foreground">
                {periodType === "DAILY"
                  ? "Tanggal Pelaporan"
                  : "Tanggal Akhir Minggu"}
              </Label>
              <DatePicker
                value={reportDate}
                onValueChange={(dateKey) => {
                  if (dateKey) setReportDate(dateKey);
                }}
              />
            </div>

            {periodType === "WEEKLY" ? (
              <div className="space-y-1.5">
                <Label className="type-p3 font-medium text-muted-foreground">
                  Periode Minggu
                </Label>
                <Select
                  value={String(weekNumber)}
                  onValueChange={(val) =>
                    setWeekNumber(Number.parseInt(val, 10) || 1)
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Pilih minggu" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, idx) => idx + 1).map(
                      (week) => (
                        <SelectItem key={week} value={String(week)}>
                          Minggu ke-{week}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label
                  htmlFor="opname-notes"
                  className="type-p3 font-medium text-muted-foreground"
                >
                  Catatan (Opsional)
                </Label>
                <Input
                  id="opname-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Cuaca, kendala, atau keterangan"
                  className="h-10"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="opname-search"
                className="type-p3 font-medium text-muted-foreground"
              >
                Cari Item
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="opname-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari uraian atau kode..."
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-2">
            <span className="type-p2 flex items-center gap-1.5 font-medium text-foreground tabular-nums">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <span>Proyeksi Progres:</span>
              <strong className="text-primary">{overallProgress}%</strong>
              <span aria-hidden="true">→</span>
              <strong className="font-bold text-success">
                {simulatedProgress}%
              </strong>
            </span>
            <Badge variant="outline" className="tabular-nums">
              {simulatedProgress > overallProgress
                ? `Naik +${(simulatedProgress - overallProgress).toFixed(1)}%`
                : "Belum ada kenaikan"}
            </Badge>
          </div>
        </div>

        {/* Items List */}
        {filteredItems.length === 0 ? (
          <EmptyState
            title="Tidak ada item ditemukan"
            description="Tambahkan item pekerjaan di menu Ubah RAB terlebih dahulu."
          />
        ) : (
          <>
            {/* Mobile Vertical Cards */}
            <div className="space-y-3 md:hidden">
              {filteredItems.map((item) => {
                const rawVal = (inputValues[item.id] ?? "").trim();
                const inputVal =
                  rawVal === "" ? Number.NaN : Number.parseFloat(rawVal);
                let projectedComp = item.completedVolume;
                if (Number.isFinite(inputVal)) {
                  projectedComp =
                    activeTab === "additional"
                      ? item.completedVolume + inputVal
                      : inputVal;
                }
                const target = item.targetVolume > 0 ? item.targetVolume : 1;
                const projectedPct = Math.min(
                  100,
                  Math.max(0, Math.round((projectedComp / target) * 1000) / 10),
                );

                return (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="type-p2 font-semibold text-foreground">
                          {item.code ? `${item.code} ` : ""}
                          {item.title}
                        </p>
                        <p className="type-p3 text-muted-foreground">
                          {item.section}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 tabular-nums">
                        {item.progress}%
                      </Badge>
                    </div>

                    <div className="type-p3 grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5 tabular-nums">
                      <div>
                        <span className="text-muted-foreground">Target RAB:</span>
                        <p className="font-semibold text-foreground">
                          {item.targetVolume} {item.unit}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Terpasang:
                        </span>
                        <p className="font-semibold text-foreground">
                          {item.completedVolume} {item.unit}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={inputValues[item.id] ?? ""}
                        onChange={(event) =>
                          handleInputChange(item.id, event.target.value)
                        }
                        placeholder={
                          activeTab === "additional"
                            ? "Tambah volume"
                            : "Total volume"
                        }
                        aria-label={`Volume ${item.title}`}
                        className="min-w-[110px] flex-1 text-right tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickPercent(item, 50)}
                      >
                        50%
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickFinish(item)}
                        className="gap-1"
                      >
                        <Check
                          className="size-3.5 text-success"
                          aria-hidden="true"
                        />
                        100%
                      </Button>
                    </div>

                    {Number.isFinite(inputVal) && (
                      <p className="type-p3 font-semibold text-success tabular-nums">
                        Proyeksi item: → {projectedPct}%
                      </p>
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
                    <TableHead>Uraian Pekerjaan</TableHead>
                    <TableHead className="text-right">Target RAB</TableHead>
                    <TableHead className="text-right">Terpasang</TableHead>
                    <TableHead className="text-right">
                      {activeTab === "additional"
                        ? "Volume Tambahan"
                        : "Total Terpasang"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const rawVal = (inputValues[item.id] ?? "").trim();
                    const inputVal =
                      rawVal === "" ? Number.NaN : Number.parseFloat(rawVal);
                    let projectedComp = item.completedVolume;
                    if (Number.isFinite(inputVal)) {
                      projectedComp =
                        activeTab === "additional"
                          ? item.completedVolume + inputVal
                          : inputVal;
                    }
                    const target = item.targetVolume > 0 ? item.targetVolume : 1;
                    const projectedPct = Math.min(
                      100,
                      Math.max(
                        0,
                        Math.round((projectedComp / target) * 1000) / 10,
                      ),
                    );

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <p className="type-p2 font-semibold text-foreground">
                            {item.code ? `${item.code} ` : ""}
                            {item.title}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {item.section}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3 text-right font-medium text-muted-foreground tabular-nums">
                          {item.targetVolume} {item.unit}
                        </TableCell>
                        <TableCell className="type-p3 text-right tabular-nums">
                          <span className="font-semibold text-foreground">
                            {item.completedVolume}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            ({item.progress}%)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={inputValues[item.id] ?? ""}
                              onChange={(event) =>
                                handleInputChange(item.id, event.target.value)
                              }
                              placeholder="—"
                              aria-label={`Volume ${item.title}`}
                              className="w-24 text-right tabular-nums"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickPercent(item, 50)}
                            >
                              50%
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickFinish(item)}
                              className="gap-1"
                            >
                              <Check
                                className="size-3.5 text-success"
                                aria-hidden="true"
                              />
                              100%
                            </Button>
                            {Number.isFinite(inputVal) && (
                              <span className="type-p3 min-w-[54px] font-semibold text-success tabular-nums">
                                → {projectedPct}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </GlobalModal>
  );
}
