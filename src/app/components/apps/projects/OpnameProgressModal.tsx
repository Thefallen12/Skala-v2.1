"use client";

import { useState, useTransition } from "react";
import { HelpCircle, Search, X, Check } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"additional" | "total">("additional");
  const [reportDate, setReportDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Stores input values per workpoint
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  if (!open) return null;

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      item.section.toLowerCase().includes(query)
    );
  });

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
            <h2 className="text-xl font-bold text-foreground">Catat progres (opname)</h2>
            <p className="text-xs text-muted-foreground">
              Isi yang bertambah sejak angka terakhir. Totalnya dihitung otomatis. Progres proyek{" "}
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
              <li>Pilih tab <strong>Tambahan</strong> jika ingin mencatat volume fisik yang selesai sejak opname sebelumnya.</li>
              <li>Pilih tab <strong>Total terpasang</strong> jika ingin menginput akumulasi total volume terpasang saat ini.</li>
              <li>Klik tombol <strong>Selesai</strong> pada baris item untuk otomatis mengisi 100% dari target RAB.</li>
            </ul>
          </div>
        )}

        {/* Tabs & Controls */}
        <div className="space-y-3 border-b border-border/60 bg-muted/10 p-5">
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("additional")}
              className={`border-b-2 px-4 py-2 text-xs font-semibold transition ${
                activeTab === "additional"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Tambahan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("total")}
              className={`border-b-2 px-4 py-2 text-xs font-semibold transition ${
                activeTab === "total"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Total terpasang
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Tanggal opname</label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Cari item</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="mis. bata, plester"
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Satu angka per item per tanggal; menyimpan lagi di tanggal yang sama menggantinya.
          </p>
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
                    <th className="px-3 py-2.5">Uraian</th>
                    <th className="w-28 px-3 py-2.5">Volume RAB</th>
                    <th className="w-24 px-3 py-2.5">Terakhir</th>
                    <th className="w-48 px-3 py-2.5">
                      {activeTab === "additional" ? "Tambahan" : "Total terpasang"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/10">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-foreground">
                          {item.code ? `${item.code} ` : ""}
                          {item.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{item.section}</p>
                      </td>
                      <td className="px-3 py-3 font-medium text-muted-foreground">
                        {item.targetVolume} {item.unit}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-foreground">{item.completedVolume}</span>
                        <span className="ml-1 text-[11px] text-muted-foreground">({item.progress}%)</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={inputValues[item.id] ?? ""}
                            onChange={(e) => handleInputChange(item.id, e.target.value)}
                            placeholder="0"
                            className="h-8 w-24 text-right text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFinish(item)}
                            className="h-8 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Check className="mr-1 size-3 text-emerald-600" />
                            <span>Selesai</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 p-5">
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
            {isPending ? "Menyimpan..." : "Simpan progres"}
          </Button>
        </div>
      </div>
    </div>
  );
}
