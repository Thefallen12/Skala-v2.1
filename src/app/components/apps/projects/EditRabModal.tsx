"use client";

import { useState, useTransition } from "react";
import {
  FileSpreadsheet,
  FileUp,
  HelpCircle,
  Plus,
  Trash2,
  X,
  Sparkles,
  ClipboardPaste,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProjectRab, type RabItemInput } from "@/app/actions/project";

export type EditableRabItem = {
  id?: string;
  section: string;
  code: string;
  title: string;
  volume: number;
  unit: string;
  unitPrice: number;
  rapPrice: number;
  startDate: string;
  endDate: string;
};

const SAMPLE_RENOVATION_ITEMS: EditableRabItem[] = [
  {
    section: "A. Persiapan",
    code: "A.1",
    title: "Pembersihan dan bongkaran",
    volume: 1,
    unit: "paket",
    unitPrice: 4500000,
    rapPrice: 3400000,
    startDate: "2026-10-27",
    endDate: "2026-11-02",
  },
  {
    section: "B. Lantai",
    code: "B.1",
    title: "Pasang keramik 60×60",
    volume: 85,
    unit: "m2",
    unitPrice: 285000,
    rapPrice: 220000,
    startDate: "2026-11-03",
    endDate: "2026-11-20",
  },
  {
    section: "C. Dinding",
    code: "C.1",
    title: "Cat dinding 2 lapis",
    volume: 240,
    unit: "m2",
    unitPrice: 42000,
    rapPrice: 31000,
    startDate: "2026-11-18",
    endDate: "2026-12-05",
  },
  {
    section: "D. Listrik",
    code: "D.1",
    title: "Titik lampu dan stopkontak",
    volume: 24,
    unit: "titik",
    unitPrice: 350000,
    rapPrice: 260000,
    startDate: "2026-11-30",
    endDate: "2026-12-20",
  },
];

interface EditRabModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialItems: EditableRabItem[];
  onSuccess?: () => void;
}

export default function EditRabModal({
  open,
  onClose,
  projectId,
  initialItems,
  onSuccess,
}: EditRabModalProps) {
  const [items, setItems] = useState<EditableRabItem[]>(() =>
    initialItems.length > 0 ? initialItems : SAMPLE_RENOVATION_ITEMS,
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const totalRab = items.reduce(
    (sum, item) => sum + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const totalRap = items.reduce(
    (sum, item) => sum + (Number(item.volume) || 0) * (Number(item.rapPrice) || 0),
    0,
  );
  const profit = totalRab - totalRap;
  const profitPercent = totalRab > 0 ? ((profit / totalRab) * 100).toFixed(1) : "0.0";

  const handleAddItem = () => {
    const nextCode = `P.${items.length + 1}`;
    setItems((prev) => [
      ...prev,
      {
        section: prev[prev.length - 1]?.section || "A. Pekerjaan",
        code: nextCode,
        title: "",
        volume: 1,
        unit: "m2",
        unitPrice: 0,
        rapPrice: 0,
        startDate: "",
        endDate: "",
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeItem = <K extends keyof EditableRabItem>(
    index: number,
    field: K,
    value: EditableRabItem[K],
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleParsePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split("\n");
    const parsed: EditableRabItem[] = [];

    lines.forEach((line, index) => {
      const parts = line.split("\t");
      if (parts.length >= 4) {
        parsed.push({
          section: parts[0]?.trim() || `Bagian ${index + 1}`,
          code: parts[1]?.trim() || `ITM-${index + 1}`,
          title: parts[2]?.trim() || "Item Pekerjaan",
          volume: parseFloat(parts[3]?.replace(/[^0-9.]/g, "") || "1") || 1,
          unit: parts[4]?.trim() || "paket",
          unitPrice: parseFloat(parts[5]?.replace(/[^0-9.]/g, "") || "0") || 0,
          rapPrice: parseFloat(parts[6]?.replace(/[^0-9.]/g, "") || "0") || 0,
          startDate: parts[7]?.trim() || "",
          endDate: parts[8]?.trim() || "",
        });
      }
    });

    if (parsed.length > 0) {
      setItems(parsed);
      setShowPasteModal(false);
      setPasteText("");
    }
  };

  const handleSave = () => {
    setErrorMsg("");
    if (items.length === 0) {
      setErrorMsg("Tambahkan minimal 1 item pekerjaan.");
      return;
    }

    startTransition(async () => {
      const payload: RabItemInput[] = items.map((it) => ({
        id: it.id,
        section: it.section,
        code: it.code,
        title: it.title,
        volume: Number(it.volume) || 0,
        unit: it.unit,
        unitPrice: Number(it.unitPrice) || 0,
        rapPrice: Number(it.rapPrice) || 0,
        startDate: it.startDate || undefined,
        endDate: it.endDate || undefined,
      }));

      const res = await saveProjectRab(projectId, {
        items: payload,
        replaceExisting,
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
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">Ubah RAB</h2>
            <p className="text-xs text-muted-foreground">
              Satu baris per item pekerjaan. Bagian mengelompokkan item (mis. &quot;II. Pekerjaan Dinding&quot;). Tanggal rencana dipakai untuk Kurva S.
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
            <p className="font-semibold text-foreground">Tips Pengisian RAB:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Kelompokkan item dengan nama <strong>Bagian</strong> yang sama (mis. &quot;A. Persiapan&quot;) agar otomatis terkelompok di tabel.</li>
              <li>Isi <strong>Harga satuan</strong> (harga jual/RAB klien) dan <strong>Harga RAP</strong> (estimasi biaya modal riil) untuk melihat margin laba otomatis.</li>
              <li>Kolom <strong>Mulai</strong> dan <strong>Selesai</strong> digunakan sebagai acuan distribusi target pada grafik <strong>Kurva S</strong>.</li>
            </ul>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/10 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPasteModal(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <ClipboardPaste className="size-3.5 text-muted-foreground" />
              <span>Tempel dari Excel</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5 text-primary" />
              <span>Tambah baris</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setItems(SAMPLE_RENOVATION_ITEMS)}
              className="h-8 gap-1.5 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400"
              title="Isi contoh RAB renovasi rumah seperti di desain"
            >
              <Sparkles className="size-3.5" />
              <span>Contoh RAB Renovasi</span>
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span>Impor mengganti item yang belum punya progres</span>
          </label>
        </div>

        {/* Table of items */}
        <div className="flex-1 overflow-y-auto p-5">
          {errorMsg && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {errorMsg}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-semibold text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2.5 py-2.5">Bagian</th>
                  <th className="w-16 px-2.5 py-2.5">Kode</th>
                  <th className="min-w-44 px-2.5 py-2.5">Uraian pekerjaan</th>
                  <th className="w-20 px-2.5 py-2.5">Volume</th>
                  <th className="w-20 px-2.5 py-2.5">Satuan</th>
                  <th className="w-28 px-2.5 py-2.5">Harga satuan</th>
                  <th className="w-28 px-2.5 py-2.5">Harga RAP</th>
                  <th className="w-32 px-2.5 py-2.5">Mulai</th>
                  <th className="w-32 px-2.5 py-2.5">Selesai</th>
                  <th className="w-10 px-2.5 py-2.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-muted/10">
                    <td className="p-1.5">
                      <Input
                        value={item.section}
                        onChange={(e) => handleChangeItem(index, "section", e.target.value)}
                        placeholder="A. Persiapan"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={item.code}
                        onChange={(e) => handleChangeItem(index, "code", e.target.value)}
                        placeholder="A.1"
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={item.title}
                        onChange={(e) => handleChangeItem(index, "title", e.target.value)}
                        placeholder="Uraian item pekerjaan"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.volume}
                        onChange={(e) =>
                          handleChangeItem(index, "volume", parseFloat(e.target.value) || 0)
                        }
                        className="h-8 text-right text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={item.unit}
                        onChange={(e) => handleChangeItem(index, "unit", e.target.value)}
                        placeholder="m2 / paket"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleChangeItem(index, "unitPrice", parseFloat(e.target.value) || 0)
                        }
                        placeholder="Rp 0"
                        className="h-8 text-right text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number"
                        min="0"
                        value={item.rapPrice}
                        onChange={(e) =>
                          handleChangeItem(index, "rapPrice", parseFloat(e.target.value) || 0)
                        }
                        placeholder="Rp 0"
                        className="h-8 text-right text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="date"
                        value={item.startDate}
                        onChange={(e) => handleChangeItem(index, "startDate", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="date"
                        value={item.endDate}
                        onChange={(e) => handleChangeItem(index, "endDate", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Hapus baris"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary & Actions */}
        <div className="flex flex-col gap-3 border-t border-border bg-muted/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              Total RAB Rp {totalRab.toLocaleString("id-ID")} · {items.length} item
            </p>
            <p className="text-xs text-muted-foreground">
              Rencana laba: <strong className="text-emerald-600 dark:text-emerald-400">Rp {profit.toLocaleString("id-ID")} ({profitPercent}%)</strong>
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
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
              {isPending ? "Menyimpan..." : "Simpan RAB"}
            </Button>
          </div>
        </div>

        {/* Excel Paste Sub-Modal */}
        {showPasteModal && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
              <h3 className="text-base font-bold text-foreground">Tempel Data dari Excel</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Salin kolom dari Excel dengan urutan: <code>Bagian</code>, <code>Kode</code>, <code>Uraian</code>, <code>Volume</code>, <code>Satuan</code>, <code>Harga satuan</code>, <code>Harga RAP</code>, <code>Mulai (YYYY-MM-DD)</code>, <code>Selesai</code>.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Tempel baris tabel Excel di sini..."
                rows={6}
                className="mt-3 w-full rounded-lg border border-border bg-background p-2.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPasteModal(false)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleParsePaste}
                >
                  Terapkan Baris
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
