"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { importProjects } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Upload, CheckCircle2, AlertCircle } from "lucide-react";

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

function normalizeAmount(value: unknown): string | number {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    return text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  }
  if (text.includes(",")) return text.replace(",", ".");
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) return text.replace(/\./g, "");
  return text;
}

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
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const readFile = async (file?: File) => {
    setRows([]);
    setMessage("");
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setMessage("Pilih file .xlsx, .xls, atau .csv.");
      return;
    }

    try {
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
        await workbook.xlsx.load(await file.arrayBuffer());
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
        setMessage("File belum berisi data proyek.");
        return;
      }
      const missingHeaders = columns.filter(
        (column) => !headers.includes(column),
      );
      if (missingHeaders.length) {
        setMessage(`Header tidak lengkap: ${missingHeaders.join(", ")}.`);
        return;
      }
      const importedRows = records.map((record) => ({
        code: String(record["Kode Proyek"] ?? "").trim(),
        title: String(record["Nama Proyek"] ?? "").trim(),
        pagu: normalizeAmount(record["Pagu Anggaran"]),
        jenisPekerjaan: String(record["Jenis Pekerjaan"] ?? "").trim(),
        desa: String(record["Desa"] ?? "").trim(),
        kecamatan: String(record["Kecamatan"] ?? "").trim(),
        kabupaten: String(record["Kabupaten"] ?? "").trim(),
        status: String(record.Status ?? "").trim(),
      }));
      setRows(importedRows);
      setMessage(`${importedRows.length} baris siap diimpor.`);
    } catch (error) {
      console.error("Reading project import file failed:", error);
      setMessage("File gagal dibaca. Pastikan file Excel/CSV tidak rusak.");
    }
  };

  const submitImport = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await importProjects(rows);
        setMessage(result.message);
        if (result.success) {
          setRows([]);
          router.refresh();
        }
      } catch (error) {
        console.error("Project import action failed:", error);
        setMessage("Impor proyek gagal. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        setRows([]);
        setMessage("");
        onOpenChange(false);
      }}
      title="Import Data Proyek (Excel / CSV)"
      description="Unggah berkas Excel (.xlsx, .xls) atau CSV sesuai format template untuk menambahkan banyak proyek sekaligus."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setRows([]);
              setMessage("");
              onOpenChange(false);
            }}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={isPending || rows.length === 0}
            onClick={submitImport}
            className="gap-2"
          >
            <Upload className="size-4" aria-hidden="true" />
            {isPending ? "Mengimpor..." : `Impor ${rows.length || ""} Proyek`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Langkah 1 · Unduh Template Resmi
            </p>
            <p className="text-xs text-muted-foreground">
              Pastikan kolom sesuai: Kode Proyek, Nama Proyek, Pagu Anggaran, Jenis Pekerjaan, Desa, Kecamatan, Kabupaten, Status.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
            <a href="/api/projects/template-csv" download>
              <FileDown className="size-4" aria-hidden="true" />
              Download Template CSV
            </a>
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Langkah 2 · Pilih File Proyek (.xlsx, .xls, .csv)
          </p>
          <Label htmlFor="project-import-file" className="sr-only">
            File proyek (.xlsx, .xls, .csv)
          </Label>
          <Input
            id="project-import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={isPending}
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          <p className="text-[11px] text-muted-foreground">
            Maksimal 500 baris per unggahan. Kode proyek yang sudah terdaftar akan dilewati secara otomatis.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{rows.length} baris proyek siap diimpor (Pratinjau 3 baris pertama):</span>
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
                  {rows.slice(0, 3).map((row, idx) => (
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
