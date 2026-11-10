"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { importProjects, importDrtRabProject } from "@/app/actions/project";
import { parseDrtRabWorkbook, type ParsedDrtRabResult } from "@/lib/drt-rab-parser";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Upload, CheckCircle2, AlertCircle, Sparkles, Building2, MapPin, Coins, FileText, Layers } from "lucide-react";

type ImportProjectRow = {
  code: string;
  title: string;
  pagu: string | number;
  jenisPekerjaan: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  status: string;
};

const columns = [
  "Kode Proyek",
  "Nama Proyek",
  "Pagu Anggaran",
  "Jenis Pekerjaan",
  "Desa",
  "Kecamatan",
  "Kabupaten",
  "Status",
] as const;

function cellValue(value: ExcelJS.CellValue): unknown {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "text" in value) return value.text;
  if (value && typeof value === "object" && "result" in value) return value.result;
  return "";
}

export default function ImportProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<ImportProjectRow[]>([]);
  const [drtResult, setDrtResult] = useState<ParsedDrtRabResult | null>(null);
  const [rawFileBase64, setRawFileBase64] = useState<string>("");
  const [rawFileName, setRawFileName] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const readFile = async (file?: File) => {
    setRows([]);
    setDrtResult(null);
    setRawFileBase64("");
    setRawFileName("");
    setMessage("");

    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setMessage("Pilih file .xlsx, .xls, atau .csv.");
      return;
    }

    setRawFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      setRawFileBase64(base64);

      // Check if file is an official DRT / Poktan RAB Workbook
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        try {
          const parsedDrt = await parseDrtRabWorkbook(buffer);
          if (parsedDrt.success && parsedDrt.workItems.length > 0) {
            setDrtResult(parsedDrt);
            setMessage("");
            return;
          }
        } catch {
          // If DRT parser fails, fallback to standard batch format
        }
      }

      // Fallback: Standard Batch Projects format
      let headers: string[];
      let records: Record<string, unknown>[];
      if (/\.csv$/i.test(file.name)) {
        const parsedCsv = Papa.parse<Record<string, unknown>>(await file.text(), {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
        });
        if (parsedCsv.errors.length) {
          setMessage(`Format CSV tidak valid: ${parsedCsv.errors[0].message}`);
          return;
        }
        headers = parsedCsv.meta.fields ?? [];
        records = parsedCsv.data;
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
          setMessage("File tidak memiliki lembar kerja.");
          return;
        }
        headers = Array.from({ length: sheet.columnCount }, (_, index) =>
          sheet.getRow(1).getCell(index + 1).text.trim(),
        );
        records = [];
        for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
          const row = sheet.getRow(rowIndex);
          records.push(
            Object.fromEntries(
              headers.map((header, index) => [
                header,
                cellValue(row.getCell(index + 1).value),
              ]),
            ),
          );
        }
      }

      records = records.filter((record) =>
        Object.values(record).some((value) => String(value ?? "").trim() !== ""),
      );

      if (!records.length) {
        setMessage("File belum berisi data proyek atau item RAB.");
        return;
      }

      const missingHeaders = columns.filter((col) => !headers.includes(col));
      if (missingHeaders.length) {
        setMessage(`Format file tidak dikenali. Pastikan file adalah Dokumen Rencana Teknis (DRT/RAB) atau gunakan template resmi (${missingHeaders.join(", ")}).`);
        return;
      }

      const importedRows = records.map((record) => ({
        code: String(record["Kode Proyek"] ?? "").trim(),
        title: String(record["Nama Proyek"] ?? "").trim(),
        pagu: record["Pagu Anggaran"] as string | number,
        jenisPekerjaan: String(record["Jenis Pekerjaan"] ?? "").trim(),
        desa: String(record["Desa"] ?? "").trim(),
        kecamatan: String(record["Kecamatan"] ?? "").trim(),
        kabupaten: String(record["Kabupaten"] ?? "").trim(),
        status: String(record["Status"] ?? "").trim(),
      }));

      setRows(importedRows);
    } catch (error) {
      console.error("Read file error:", error);
      setMessage("Terjadi kesalahan saat membaca file. Pastikan file tidak rusak.");
    }
  };

  const handleApplyDrtProject = () => {
    if (!rawFileBase64) return;
    startTransition(async () => {
      const res = await importDrtRabProject({
        fileBase64: rawFileBase64,
        fileName: rawFileName,
      });

      if (res.success) {
        onOpenChange(false);
        if (res.projectId) {
          router.push(`/apps/projects/${res.projectId}`);
        } else {
          router.refresh();
        }
      } else {
        setMessage(res.message);
      }
    });
  };

  const handleApplyBatchProjects = () => {
    startTransition(async () => {
      const res = await importProjects(rows);
      if (res.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setMessage(res.message);
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Impor Dokumen RAB / Proyek"
      description="Unggah file Excel Dokumen Rencana Teknis (DRT/RAB) atau file batch proyek untuk diproses otomatis."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Batal
          </Button>

          {drtResult ? (
            <Button
              type="button"
              size="sm"
              onClick={handleApplyDrtProject}
              disabled={isPending}
              className="gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Sparkles className="size-3.5" />
              <span>{isPending ? "Memproses Proyek & RAB..." : "Buat & Terapkan Proyek Ini"}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleApplyBatchProjects}
              disabled={!rows.length || isPending}
              className="gap-1.5 font-semibold"
            >
              <Upload className="size-3.5" />
              <span>{isPending ? "Mengimpor..." : `Impor ${rows.length} Proyek`}</span>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Upload box */}
        <div className="space-y-2 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center">
          <Label htmlFor="project-import-file" className="block text-xs font-bold text-foreground cursor-pointer">
            Pilih atau Tarik File Excel RAB (.xlsx, .xls)
          </Label>
          <Input
            id="project-import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={isPending}
            className="cursor-pointer file:cursor-pointer text-xs"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          <p className="text-[11px] text-muted-foreground">
            Sistem otomatis mengenali Dokumen Rencana Teknis (DRT) Poktan, Rekapitulasi, dan Rincian Biaya.
          </p>
        </div>

        {/* DRT RAB DETECTED PREVIEW */}
        {drtResult && (
          <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Dokumen Rencana Teknis (DRT) / RAB Terdeteksi</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-card p-3 rounded-lg border border-border">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Building2 className="size-3" />
                  <span>Nama Kelompok Tani / Proyek</span>
                </span>
                <p className="font-bold text-foreground">{drtResult.metadata.title}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Coins className="size-3" />
                  <span>Total Anggaran / Pagu Kontrak</span>
                </span>
                <p className="font-extrabold text-foreground text-sm font-mono">
                  Rp {drtResult.metadata.totalBudget.toLocaleString("id-ID")}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3" />
                  <span>Lokasi Pekerjaan</span>
                </span>
                <p className="font-semibold text-foreground">
                  {drtResult.metadata.address || "Aceh Tengah"}
                  {drtResult.metadata.landAreaHa > 0 && ` (${drtResult.metadata.landAreaHa} Ha)`}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Layers className="size-3" />
                  <span>Rincian Titik Kerja &amp; Material</span>
                </span>
                <p className="font-semibold text-foreground">
                  {drtResult.workItems.length} titik kerja · {drtResult.materials.length} material terdeteksi
                </p>
              </div>
            </div>

            {/* Work Items Preview List */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Pratinjau Item Pekerjaan yang Akan Dibuat ({drtResult.workItems.length} item):
              </span>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background text-xs divide-y divide-border/60">
                {drtResult.workItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 hover:bg-muted/30">
                    <div className="min-w-0 pr-2">
                      <p className="font-medium truncate text-foreground">
                        {item.code ? `${item.code} ` : ""}
                        {item.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.section} · {item.volume} {item.unit}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-foreground shrink-0">
                      Rp {item.totalPrice.toLocaleString("id-ID")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              * Catatan: Harga RAP dikosongkan dan dapat dilengkapi internal tim nanti sesuai kebutuhan riil.
            </p>
          </div>
        )}

        {/* BATCH ROWS PREVIEW */}
        {rows.length > 0 && !drtResult && (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{rows.length} baris proyek siap diimpor:</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-1.5">Kode</th>
                    <th className="px-2.5 py-1.5">Nama Proyek</th>
                    <th className="px-2.5 py-1.5">Lokasi</th>
                    <th className="px-2.5 py-1.5 text-right">Pagu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 4).map((row, idx) => (
                    <tr key={`${row.code}-${idx}`}>
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px]">{row.code}</td>
                      <td className="px-2.5 py-1.5 font-medium">{row.title}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">
                        {[row.desa, row.kecamatan, row.kabupaten].filter(Boolean).join(", ")}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium">
                        {row.pagu}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {message && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs font-medium text-foreground"
          >
            <AlertCircle className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </GlobalModal>
  );
}
