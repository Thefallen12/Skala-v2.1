"use client";

import { useRef, useState, useTransition } from "react";
import {
  Calendar,
  ClipboardPaste,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseDrtRabFileAction,
  saveProjectRab,
  type RabItemInput,
} from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { getJakartaDateKey, shiftDateKey } from "@/lib/habit-date";

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

interface EditRabModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialItems: EditableRabItem[];
  onSuccess?: () => void;
}

function createEmptyRabItem(section = ""): EditableRabItem {
  return {
    section,
    code: "",
    title: "",
    volume: 0,
    unit: "",
    unitPrice: 0,
    rapPrice: 0,
    startDate: "",
    endDate: "",
  };
}

export default function EditRabModal({
  open,
  onClose,
  projectId,
  initialItems,
  onSuccess,
}: EditRabModalProps) {
  const [items, setItems] = useState<EditableRabItem[]>(() =>
    initialItems.length > 0 ? initialItems : [createEmptyRabItem()],
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const isNewRab = initialItems.length === 0;

  const totalRab = items.reduce(
    (sum, item) =>
      sum + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const totalRap = items.reduce(
    (sum, item) =>
      sum + (Number(item.volume) || 0) * (Number(item.rapPrice) || 0),
    0,
  );
  const profit = totalRab - totalRap;
  const profitPercent =
    totalRab > 0 ? ((profit / totalRab) * 100).toFixed(1) : "0.0";

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      createEmptyRabItem(prev[prev.length - 1]?.section || ""),
    ]);
  };

  const handleAutoSchedule = () => {
    const todayKey = getJakartaDateKey();
    setItems((prev) =>
      prev.map((item, idx) => {
        const start = shiftDateKey(todayKey, idx * 7);
        const end = shiftDateKey(start, 7);
        return {
          ...item,
          startDate: start,
          endDate: end,
        };
      }),
    );
    toast.success("Jadwal rencana otomatis diisi per minggu.");
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

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const parsed = await parseDrtRabFileAction({
            projectId,
            fileBase64: base64,
            fileName: file.name,
          });

          if (!parsed.success || parsed.workItems.length === 0) {
            toast.error(
              parsed.message || "Gagal membaca item RAB dari file Excel.",
            );
            return;
          }

          const todayKey = getJakartaDateKey();
          const mappedItems: EditableRabItem[] = parsed.workItems.map(
            (work, idx) => {
              const start = shiftDateKey(todayKey, Math.floor(idx / 2) * 7);
              const end = shiftDateKey(start, 7);

              return {
                section: work.section || "Pekerjaan",
                code: work.code || `ITM-${idx + 1}`,
                title: work.title,
                volume: work.volume,
                unit: work.unit || "unit",
                unitPrice: work.unitPrice,
                rapPrice: 0,
                startDate: start,
                endDate: end,
              };
            },
          );

          setItems(mappedItems);
          toast.success(
            `Berhasil memuat ${mappedItems.length} item pekerjaan dari ${file.name}.`,
          );
        } catch (err) {
          toast.error(
            `Error memproses file Excel: ${err instanceof Error ? err.message : "Format tidak sesuai"}`,
          );
        } finally {
          setIsParsingExcel(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(
        `Error membaca file: ${err instanceof Error ? err.message : "Gagal"}`,
      );
      setIsParsingExcel(false);
    }
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
          volume:
            Number.parseFloat(parts[3]?.replace(/[^0-9.]/g, "") || "1") || 1,
          unit: parts[4]?.trim() || "paket",
          unitPrice:
            Number.parseFloat(parts[5]?.replace(/[^0-9.]/g, "") || "0") || 0,
          rapPrice:
            Number.parseFloat(parts[6]?.replace(/[^0-9.]/g, "") || "0") || 0,
          startDate: parts[7]?.trim() || "",
          endDate: parts[8]?.trim() || "",
        });
      }
    });

    if (parsed.length > 0) {
      setItems(parsed);
      setShowPasteModal(false);
      setPasteText("");
      toast.success(`${parsed.length} baris RAB berhasil ditempel.`);
    } else {
      toast.error("Format tempel tidak valid. Gunakan pemisah Tab dari Excel.");
    }
  };

  const handleSave = () => {
    if (items.length === 0) {
      toast.error("Tambahkan minimal 1 item pekerjaan.");
      return;
    }

    startTransition(async () => {
      const payload: RabItemInput[] = items.map((item) => ({
        id: item.id,
        section: item.section,
        code: item.code,
        title: item.title,
        volume: Number(item.volume) || 0,
        unit: item.unit,
        unitPrice: Number(item.unitPrice) || 0,
        rapPrice: Number(item.rapPrice) || 0,
        startDate: item.startDate || undefined,
        endDate: item.endDate || undefined,
      }));

      const res = await saveProjectRab(projectId, {
        items: payload,
        replaceExisting,
      });

      if (res.success) {
        toast.success(res.message || "RAB berhasil disimpan.");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || "Gagal menyimpan RAB.");
      }
    });
  };

  return (
    <>
      <GlobalModal
        isOpen={open}
        onClose={onClose}
        mobileBehavior="sheet"
        icon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
        title={isNewRab ? "Isi RAB" : "Ubah RAB"}
        description="Satu baris per item pekerjaan. Tanggal rencana dipakai untuk Kurva S."
        className="max-w-6xl"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5 text-left">
              <p className="type-p2 font-bold text-foreground tabular-nums">
                Total RAB Rp {totalRab.toLocaleString("id-ID")} · {items.length}{" "}
                item
              </p>
              <p className="type-p3 text-muted-foreground tabular-nums">
                Rencana laba:{" "}
                <strong className="text-success">
                  Rp {profit.toLocaleString("id-ID")} ({profitPercent}%)
                </strong>
              </p>
            </div>
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
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan RAB"
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPasteModal(true)}
                className="gap-1.5"
              >
                <ClipboardPaste className="size-3.5" aria-hidden="true" />
                Tempel Excel
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isParsingExcel}
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                {isParsingExcel ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="size-3.5 text-success" aria-hidden="true" />
                )}
                {isParsingExcel ? "Membaca..." : "Impor Excel"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="gap-1.5"
              >
                <Plus className="size-3.5 text-primary" aria-hidden="true" />
                Tambah Baris
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoSchedule}
                className="gap-1.5"
              >
                <Calendar className="size-3.5" aria-hidden="true" />
                Jadwal Otomatis
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowGuide((prev) => !prev)}
                className="gap-1.5"
              >
                <HelpCircle className="size-3.5" aria-hidden="true" />
                Panduan
              </Button>
            </div>

            <Label
              htmlFor="rab-replace-existing"
              className="flex cursor-pointer items-center gap-2"
            >
              <Checkbox
                id="rab-replace-existing"
                checked={replaceExisting}
                onCheckedChange={(checked) =>
                  setReplaceExisting(checked === true)
                }
              />
              <span className="type-p3 font-normal text-muted-foreground">
                Ganti item tanpa progres
              </span>
            </Label>
          </div>

          {showGuide && (
            <div className="type-p3 rounded-xl border border-border bg-muted/30 p-3.5 text-muted-foreground">
              <p className="font-semibold text-foreground">
                Tips Pengisian RAB:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  Kelompokkan item dengan nama <strong>Bagian</strong> yang
                  sama (mis. &quot;A. Persiapan&quot;).
                </li>
                <li>
                  Isi <strong>Harga Satuan</strong> (RAB klien) dan{" "}
                  <strong>Harga RAP</strong> (estimasi biaya) untuk melihat
                  margin laba.
                </li>
                <li>
                  Kolom <strong>Mulai</strong> dan <strong>Selesai</strong>{" "}
                  dipakai untuk Kurva S.
                </li>
              </ul>
            </div>
          )}

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {items.map((item, index) => (
              <div
                key={item.id ?? `mob-${index}`}
                className="space-y-3 rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="type-p3 font-semibold text-muted-foreground">
                    Item #{index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus baris ${index + 1}`}
                    onClick={() => handleRemoveItem(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Bagian
                    </Label>
                    <Input
                      value={item.section}
                      onChange={(e) =>
                        handleChangeItem(index, "section", e.target.value)
                      }
                      placeholder="A. Persiapan"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Kode
                    </Label>
                    <Input
                      value={item.code}
                      onChange={(e) =>
                        handleChangeItem(index, "code", e.target.value)
                      }
                      placeholder="A.1"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="type-p3 text-muted-foreground">
                    Uraian Pekerjaan
                  </Label>
                  <Input
                    value={item.title}
                    onChange={(e) =>
                      handleChangeItem(index, "title", e.target.value)
                    }
                    placeholder="Uraian item pekerjaan"
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
                      value={item.volume ? item.volume : ""}
                      onChange={(e) =>
                        handleChangeItem(
                          index,
                          "volume",
                          Number.parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Satuan
                    </Label>
                    <Input
                      value={item.unit}
                      onChange={(e) =>
                        handleChangeItem(index, "unit", e.target.value)
                      }
                      placeholder="m2 / unit"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Harga Satuan
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.unitPrice ? item.unitPrice : ""}
                      onChange={(e) =>
                        handleChangeItem(
                          index,
                          "unitPrice",
                          Number.parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Harga RAP
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.rapPrice ? item.rapPrice : ""}
                      onChange={(e) =>
                        handleChangeItem(
                          index,
                          "rapPrice",
                          Number.parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Mulai
                    </Label>
                    <DatePicker
                      clearable
                      value={item.startDate}
                      onValueChange={(val) =>
                        handleChangeItem(index, "startDate", val)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="type-p3 text-muted-foreground">
                      Selesai
                    </Label>
                    <DatePicker
                      clearable
                      value={item.endDate}
                      onValueChange={(val) =>
                        handleChangeItem(index, "endDate", val)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Shadcn Table */}
          <div className="hidden md:block">
            <Table pagination={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Bagian</TableHead>
                  <TableHead className="w-20">Kode</TableHead>
                  <TableHead className="min-w-44">Uraian</TableHead>
                  <TableHead className="w-24">Volume</TableHead>
                  <TableHead className="w-24">Satuan</TableHead>
                  <TableHead className="w-32">Harga Satuan</TableHead>
                  <TableHead className="w-32">Harga RAP</TableHead>
                  <TableHead className="w-40">Mulai</TableHead>
                  <TableHead className="w-40">Selesai</TableHead>
                  <TableHead className="w-12 text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id ?? `row-${index}`}>
                    <TableCell>
                      <Input
                        value={item.section}
                        onChange={(e) =>
                          handleChangeItem(index, "section", e.target.value)
                        }
                        placeholder="A. Persiapan"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.code}
                        onChange={(e) =>
                          handleChangeItem(index, "code", e.target.value)
                        }
                        placeholder="A.1"
                        className="font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.title}
                        onChange={(e) =>
                          handleChangeItem(index, "title", e.target.value)
                        }
                        placeholder="Uraian pekerjaan"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.volume ? item.volume : ""}
                        onChange={(e) =>
                          handleChangeItem(
                            index,
                            "volume",
                            Number.parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit}
                        onChange={(e) =>
                          handleChangeItem(index, "unit", e.target.value)
                        }
                        placeholder="Satuan"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={item.unitPrice ? item.unitPrice : ""}
                        onChange={(e) =>
                          handleChangeItem(
                            index,
                            "unitPrice",
                            Number.parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={item.rapPrice ? item.rapPrice : ""}
                        onChange={(e) =>
                          handleChangeItem(
                            index,
                            "rapPrice",
                            Number.parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <DatePicker
                        clearable
                        value={item.startDate}
                        onValueChange={(val) =>
                          handleChangeItem(index, "startDate", val)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DatePicker
                        clearable
                        value={item.endDate}
                        onValueChange={(val) =>
                          handleChangeItem(index, "endDate", val)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Hapus baris ${index + 1}`}
                        onClick={() => handleRemoveItem(index)}
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
        </div>
      </GlobalModal>

      {/* Nested Excel Paste Modal */}
      <GlobalModal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        mobileBehavior="sheet"
        icon={<ClipboardPaste className="size-4" aria-hidden="true" />}
        title="Tempel Data Excel"
        description="Salin kolom dari Excel: Bagian, Kode, Uraian, Volume, Satuan, Harga satuan, Harga RAP, Mulai (YYYY-MM-DD), Selesai."
        className="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPasteModal(false)}
            >
              Batal
            </Button>
            <Button type="button" size="sm" onClick={handleParsePaste}>
              Terapkan Baris
            </Button>
          </>
        }
      >
        <Textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder="Tempel baris tabel Excel di sini..."
          rows={6}
          className="font-mono"
        />
      </GlobalModal>
    </>
  );
}
