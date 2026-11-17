"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  Layers,
  Loader2,
  MapPin,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { importDrtRabProject, importProjects } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseDrtRabWorkbook,
  type ParsedDrtRabResult,
} from "@/lib/drt-rab-parser";

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
  if (value && typeof value === "object" && "result" in value) {
    return value.result;
  }
  return "";
}

export default function ImportProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

    if (!file) {
      setSelectedFiles([]);
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      const err = "Pilih file berformat .xlsx, .xls, atau .csv.";
      setMessage(err);
      toast.error(err);
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles([file]);
    setRawFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      setRawFileBase64(base64);

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        try {
          const parsedDrt = await parseDrtRabWorkbook(buffer);
          if (parsedDrt.success && parsedDrt.workItems.length > 0) {
            setDrtResult(parsedDrt);
            setMessage("");
            return;
          }
        } catch {
          // Fallback ke format batch standar
        }
      }

      let headers: string[];
      let records: Record<string, unknown>[];
      if (/\.csv$/i.test(file.name)) {
        const parsedCsv = Papa.parse<Record<string, unknown>>(
          await file.text(),
          {
            header: true,
            skipEmptyLines: "greedy",
            transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
          },
        );
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
        setMessage(
          `Format file tidak dikenali. Pastikan file adalah DRT/RAB atau gunakan template resmi (${missingHeaders.join(", ")}).`,
        );
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
      setMessage(
        "Terjadi kesalahan saat membaca file. Pastikan file tidak rusak.",
      );
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
        toast.success(res.message || "Proyek DRT berhasil dibuat.");
        onOpenChange(false);
        if (res.projectId) {
          router.push(`/apps/projects/${res.projectId}`);
        } else {
          router.refresh();
        }
      } else {
        setMessage(res.message);
        toast.error(res.message);
      }
    });
  };

  const handleApplyBatchProjects = () => {
    startTransition(async () => {
      const res = await importProjects(rows);
      if (res.success) {
        toast.success(res.message || `${rows.length} proyek berhasil diimpor.`);
        onOpenChange(false);
        router.refresh();
      } else {
        setMessage(res.message);
        toast.error(res.message);
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      mobileBehavior="sheet"
      icon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
      title="Impor Proyek / RAB"
      description="Unggah Excel Dokumen Rencana Teknis (DRT/RAB) atau daftar batch proyek (.xlsx, .xls, .csv)."
      className="max-w-3xl"
      footer={
        <>
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
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              <span>{isPending ? "Memproses..." : "Terapkan Proyek"}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleApplyBatchProjects}
              disabled={!rows.length || isPending}
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              <span>{isPending ? "Mengimpor..." : "Impor Proyek"}</span>
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <FileDropzone
          id="project-import-file"
          accept=".xlsx,.xls,.csv"
          multiple={false}
          files={selectedFiles}
          disabled={isPending}
          onFilesChange={(files) => void readFile(files[0])}
          onError={(err) => {
            setMessage(err);
            toast.error(err);
          }}
          label="Pilih File Excel RAB / Proyek"
          hint="Mendukung file DRT Poktan dan template batch resmi (.xlsx, .xls, .csv)."
        />

        {drtResult && (
          <div className="space-y-3 rounded-xl border border-success/40 bg-success/5 p-4">
            <div className="type-p2 flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>Dokumen Rencana Teknis (DRT) / RAB Terdeteksi</span>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="type-p3 flex items-center gap-1 text-muted-foreground">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  <span>Nama Kelompok Tani / Proyek</span>
                </span>
                <p className="type-p2 font-bold text-foreground">
                  {drtResult.metadata.title}
                </p>
              </div>

              <div className="space-y-1">
                <span className="type-p3 flex items-center gap-1 text-muted-foreground">
                  <Coins className="size-3.5" aria-hidden="true" />
                  <span>Total Anggaran / Pagu Kontrak</span>
                </span>
                <p className="type-kpi text-foreground">
                  Rp {drtResult.metadata.totalBudget.toLocaleString("id-ID")}
                </p>
              </div>

              <div className="space-y-1">
                <span className="type-p3 flex items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  <span>Lokasi Pekerjaan</span>
                </span>
                <p className="type-p2 font-semibold text-foreground">
                  {drtResult.metadata.address || "Aceh Tengah"}
                  {drtResult.metadata.landAreaHa > 0 &&
                    ` (${drtResult.metadata.landAreaHa} Ha)`}
                </p>
              </div>

              <div className="space-y-1">
                <span className="type-p3 flex items-center gap-1 text-muted-foreground">
                  <Layers className="size-3.5" aria-hidden="true" />
                  <span>Rincian Titik Kerja &amp; Material</span>
                </span>
                <p className="type-p2 font-semibold text-foreground tabular-nums">
                  {drtResult.workItems.length} titik kerja ·{" "}
                  {drtResult.materials.length} material
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="type-p3 font-semibold text-muted-foreground">
                Pratinjau Item Pekerjaan ({drtResult.workItems.length} item):
              </span>
              <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
                {drtResult.workItems.map((item, idx) => (
                  <div
                    key={`${item.code}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="type-p2 truncate font-medium text-foreground">
                        {item.code ? `${item.code} ` : ""}
                        {item.title}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {item.section} · {item.volume} {item.unit}
                      </p>
                    </div>
                    <span className="type-p3 shrink-0 font-semibold text-foreground tabular-nums">
                      Rp {item.totalPrice.toLocaleString("id-ID")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="type-p3 text-muted-foreground">
              * Harga RAP dikosongkan dan dapat dilengkapi internal tim sesuai
              kebutuhan riil.
            </p>
          </div>
        )}

        {rows.length > 0 && !drtResult && (
          <div className="space-y-2.5 rounded-xl border border-success/40 bg-success/5 p-3.5">
            <div className="type-p2 flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{rows.length} baris proyek siap diimpor:</span>
            </div>

            <div className="space-y-2 sm:hidden">
              {rows.slice(0, 4).map((row, idx) => (
                <div
                  key={`${row.code}-${idx}`}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <p className="type-p2 font-semibold text-foreground">
                    {row.title}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {row.code} ·{" "}
                    {[row.desa, row.kecamatan, row.kabupaten]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="type-p3 mt-1 font-semibold text-foreground tabular-nums">
                    Pagu: {row.pagu}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden bg-background sm:block">
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Proyek</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead className="text-right">Pagu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 4).map((row, idx) => (
                    <TableRow key={`${row.code}-${idx}`}>
                      <TableCell className="type-p3 font-mono">
                        {row.code}
                      </TableCell>
                      <TableCell className="type-p2 font-medium">
                        {row.title}
                      </TableCell>
                      <TableCell className="type-p3 text-muted-foreground">
                        {[row.desa, row.kecamatan, row.kabupaten]
                          .filter(Boolean)
                          .join(", ")}
                      </TableCell>
                      <TableCell className="type-p2 text-right font-semibold tabular-nums">
                        {row.pagu}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {message && (
          <div
            role="status"
            className="type-p3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 font-medium text-foreground"
          >
            <AlertCircle
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>{message}</span>
          </div>
        )}
      </div>
    </GlobalModal>
  );
}
