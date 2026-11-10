"use client";

import React from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

function currency(val: number | string | null | undefined): string {
  const num = typeof val === "string" ? parseFloat(val) : Number(val || 0);
  if (isNaN(num)) return "Rp 0";
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "10 Nov 2026";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export interface PrintViewItem {
  id: string;
  code: string;
  title: string;
  section: string;
  volumeText: string;
  unitPrice: number;
  totalPrice: number;
  bobot: number;
  terpasangText: string;
  progress: number;
}

export interface PrintViewGroup {
  sectionName: string;
  items: PrintViewItem[];
}

interface ProjectPrintProps {
  project: {
    id: string;
    title: string;
    code: string;
    clientName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    progress: number;
  };
  rabGroups: PrintViewGroup[];
  totalRabNumber: number;
  plannedToday?: number;
  deviation?: number;
  onBack: () => void;
}

// =========================================================================
// 1. CETAK RAB (Matching Image 2 media_1794323251325_57556b0f.png)
// =========================================================================
export function ProjectPrintRabView({
  project,
  rabGroups,
  totalRabNumber,
  onBack,
}: ProjectPrintProps) {
  const currentDateFormatted = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = [
      ["Rencana Anggaran Biaya (RAB)"],
      ["Proyek", project.title],
      ["Kode", project.code],
      ["Klien", project.clientName || "Klien contoh"],
      ["Tanggal cetak", currentDateFormatted],
      [],
      ["No", "Uraian pekerjaan", "Volume", "Satuan", "Harga satuan", "Jumlah"],
    ];

    for (const group of rabGroups) {
      rows.push([group.sectionName, "", "", "", "", ""]);
      for (const it of group.items) {
        const parts = it.volumeText.trim().split(" ");
        const vol = parts[0] || "1";
        const unit = parts.slice(1).join(" ") || "paket";
        rows.push([it.code, it.title, vol, unit, it.unitPrice.toString(), it.totalPrice.toString()]);
      }
      const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
      rows.push(["", `Subtotal ${group.sectionName}`, "", "", "", subtotal.toString()]);
    }

    rows.push(["", "Total RAB", "", "", "", totalRabNumber.toString()]);
    rows.push([]);
    rows.push(["Rekapitulasi"]);
    rows.push(["No", "Uraian pekerjaan", "Jumlah", "Porsi"]);
    for (const group of rabGroups) {
      const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
      const porsi = totalRabNumber > 0 ? ((subtotal / totalRabNumber) * 100).toFixed(1) + "%" : "0%";
      rows.push([group.sectionName.split(" ")[0] || "", group.sectionName, subtotal.toString(), porsi]);
    }
    rows.push(["", "Total RAB", totalRabNumber.toString(), "100%"]);

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `RAB-${project.code || "proyek"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 pb-16 print:bg-white print:p-0 print:pb-0">
      {/* Top action toolbar (hidden on print) */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke proyek</span>
          </Button>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Pratinjau A4. Hanya volume, harga dan jumlah yang dicetak; RAP, bobot dan progres tidak ikut.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Ekspor Excel</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90"
          >
            <Printer className="size-3.5" />
            <span>Cetak / PDF</span>
          </Button>
        </div>
      </header>

      {/* A4 Sheet Container */}
      <main className="max-w-[850px] mx-auto mt-6 bg-white text-slate-900 shadow-xl rounded-sm p-10 print:shadow-none print:m-0 print:p-0 print:max-w-none print:w-full print:rounded-none">
        {/* Header Strip */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950">Skala-prioritas</h1>
            <p className="text-xs text-slate-600 font-mono">+628135887883</p>
          </div>
          <div className="text-right">
            <span className="text-xl font-extrabold tracking-wider text-slate-950">RAB</span>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="mt-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-950">Rencana Anggaran Biaya</h2>
          <div className="grid grid-cols-2 gap-x-6 text-xs text-slate-700 max-w-md">
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Proyek</span>
              <span className="font-semibold text-slate-900">: {project.title}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Kode</span>
              <span className="font-mono font-semibold text-slate-900">: {project.code}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Klien</span>
              <span className="font-semibold text-slate-900">: {project.clientName || "Klien contoh"}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Tanggal cetak</span>
              <span className="text-slate-900">: {currentDateFormatted}</span>
            </div>
          </div>
        </div>

        {/* RAB Table */}
        <div className="mt-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-2 px-2 w-10">No</th>
                <th className="py-2 px-2">Uraian pekerjaan</th>
                <th className="py-2 px-2 text-right w-16">Volume</th>
                <th className="py-2 px-2 text-left w-16">Satuan</th>
                <th className="py-2 px-2 text-right w-28">Harga satuan</th>
                <th className="py-2 px-2 text-right w-32">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, gIdx) => {
                const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
                return (
                  <React.Fragment key={gIdx}>
                    {/* Section Header */}
                    <tr className="bg-slate-50 font-bold text-slate-950">
                      <td colSpan={6} className="py-2 px-2 font-bold text-slate-950">
                        {group.sectionName}
                      </td>
                    </tr>

                    {/* Section Items */}
                    {group.items.map((it) => {
                      const parts = it.volumeText.trim().split(" ");
                      const vol = parts[0] || "1";
                      const unit = parts.slice(1).join(" ") || "paket";
                      return (
                        <tr key={it.id} className="border-b border-slate-200">
                          <td className="py-2 px-2 text-slate-500 font-mono">{it.code}</td>
                          <td className="py-2 px-2 text-slate-800 font-medium">{it.title}</td>
                          <td className="py-2 px-2 text-right font-mono">{vol}</td>
                          <td className="py-2 px-2 text-slate-600">{unit}</td>
                          <td className="py-2 px-2 text-right font-mono">{currency(it.unitPrice)}</td>
                          <td className="py-2 px-2 text-right font-mono font-medium">{currency(it.totalPrice)}</td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Section */}
                    <tr className="border-b border-slate-300 font-semibold bg-slate-50/50">
                      <td colSpan={5} className="py-2 px-2 text-right text-slate-700">
                        Subtotal {group.sectionName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {currency(subtotal)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Total RAB Row */}
              <tr className="border-t-2 border-b-2 border-slate-900 font-bold">
                <td colSpan={5} className="py-2.5 px-2 text-slate-950 font-bold">
                  Total RAB
                </td>
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  {currency(totalRabNumber)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rekapitulasi Section */}
        <div className="mt-8 space-y-2">
          <h3 className="text-xs font-bold text-slate-950">Rekapitulasi</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-1.5 px-2 w-10">No</th>
                <th className="py-1.5 px-2">Uraian pekerjaan</th>
                <th className="py-1.5 px-2 text-right w-32">Jumlah</th>
                <th className="py-1.5 px-2 text-right w-20">Porsi</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, idx) => {
                const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
                const porsi = totalRabNumber > 0 ? ((subtotal / totalRabNumber) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-1.5 px-2 text-slate-600">{group.sectionName.split(" ")[0]}</td>
                    <td className="py-1.5 px-2 text-slate-800">{group.sectionName}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{currency(subtotal)}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{porsi}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-b border-slate-900 font-bold">
                <td colSpan={2} className="py-2 px-2 text-slate-950 font-bold">
                  Total RAB
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                  {currency(totalRabNumber)}
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                  100%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signature Section */}
        <div className="mt-14 pt-4 grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              Skala-prioritas
            </div>
          </div>
          <div>
            <p className="text-slate-600">Disetujui oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              {project.clientName || "Klien contoh"}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 2. CETAK LAPORAN PROGRES (Matching Image 1 media_1794323216371_7c844d7d.png)
// =========================================================================
export function ProjectPrintProgressView({
  project,
  rabGroups,
  plannedToday = 32.3,
  deviation = -32.3,
  onBack,
}: ProjectPrintProps) {
  const currentDateFormatted = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = [
      ["Laporan Progres Pekerjaan"],
      ["Proyek", project.title],
      ["Kode", project.code],
      ["Klien", project.clientName || "Klien contoh"],
      ["Progres", `${project.progress}%`],
      ["Rencana hari ini", `${plannedToday}%`],
      ["Deviasi", `${deviation}%`],
      ["Tanggal cetak", currentDateFormatted],
      [],
      ["No", "Uraian pekerjaan", "Volume", "Bobot", "Terpasang", "Progres", "Bobot tercapai"],
    ];

    for (const group of rabGroups) {
      rows.push([group.sectionName, "", "", "", "", "", ""]);
      for (const it of group.items) {
        const achievedWeight = ((it.bobot * it.progress) / 100).toFixed(2) + "%";
        rows.push([it.code, it.title, it.volumeText, it.bobot.toFixed(2) + "%", it.terpasangText, it.progress + "%", achievedWeight]);
      }
      const subBobot = group.items.reduce((s, it) => s + it.bobot, 0).toFixed(2) + "%";
      const subAchieved = group.items.reduce((s, it) => s + (it.bobot * it.progress) / 100, 0).toFixed(2) + "%";
      rows.push(["", `Subtotal ${group.sectionName}`, "", subBobot, "", "", subAchieved]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Progres-${project.code || "proyek"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalAchievedBobot = rabGroups
    .flatMap((g) => g.items)
    .reduce((sum, it) => sum + (it.bobot * it.progress) / 100, 0);

  const startDateStr = formatDateIndo(project.startDate || "2026-10-27");
  const endDateStr = formatDateIndo(project.endDate || "2026-12-22");
  const midDateStr = formatDateIndo("2026-11-24");

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 pb-16 print:bg-white print:p-0 print:pb-0">
      {/* Top action toolbar (hidden on print) */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke proyek</span>
          </Button>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Pratinjau A4 Laporan Progres Pekerjaan &amp; Kurva S.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Ekspor Excel</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90"
          >
            <Printer className="size-3.5" />
            <span>Cetak / PDF</span>
          </Button>
        </div>
      </header>

      {/* A4 Sheet Container */}
      <main className="max-w-[850px] mx-auto mt-6 bg-white text-slate-900 shadow-xl rounded-sm p-10 print:shadow-none print:m-0 print:p-0 print:max-w-none print:w-full print:rounded-none">
        {/* Header Strip */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950">Skala-prioritas</h1>
            <p className="text-xs text-slate-600 font-mono">+628135887883</p>
          </div>
          <div className="text-right">
            <span className="text-xl font-extrabold tracking-wider text-slate-950">PROGRES</span>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="mt-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-950">Laporan progres pekerjaan</h2>
          <div className="grid grid-cols-2 gap-x-6 text-xs text-slate-700 max-w-lg">
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Proyek</span>
              <span className="font-semibold text-slate-900">: {project.title}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Kode</span>
              <span className="font-mono font-semibold text-slate-900">: {project.code}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Klien</span>
              <span className="font-semibold text-slate-900">: {project.clientName || "Klien contoh"}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Opname terakhir</span>
              <span className="text-slate-900">: Belum ada opname</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Progres</span>
              <span className="font-bold text-slate-950">: {project.progress}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Rencana hari ini</span>
              <span className="font-bold text-slate-950">: {plannedToday.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Deviasi</span>
              <span className="font-bold text-rose-600">: {deviation.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Perkiraan selesai</span>
              <span className="text-slate-900">: Perlu 7 hari opname</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Tanggal cetak</span>
              <span className="text-slate-900">: {currentDateFormatted}</span>
            </div>
          </div>
        </div>

        {/* Progress Table */}
        <div className="mt-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-2 px-2 w-10">No</th>
                <th className="py-2 px-2">Uraian pekerjaan</th>
                <th className="py-2 px-2 text-right w-20">Volume</th>
                <th className="py-2 px-2 text-right w-16">Bobot</th>
                <th className="py-2 px-2 text-right w-24">Terpasang</th>
                <th className="py-2 px-2 text-right w-16">Progres</th>
                <th className="py-2 px-2 text-right w-24">Bobot tercapai</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, gIdx) => {
                const subBobot = group.items.reduce((s, it) => s + it.bobot, 0);
                const subAchieved = group.items.reduce((s, it) => s + (it.bobot * it.progress) / 100, 0);

                return (
                  <React.Fragment key={gIdx}>
                    {/* Section Header */}
                    <tr className="bg-slate-50 font-bold text-slate-950">
                      <td colSpan={7} className="py-2 px-2 font-bold text-slate-950">
                        {group.sectionName}
                      </td>
                    </tr>

                    {/* Section Items */}
                    {group.items.map((it) => {
                      const achieved = ((it.bobot * it.progress) / 100).toFixed(2);
                      return (
                        <tr key={it.id} className="border-b border-slate-200">
                          <td className="py-2 px-2 text-slate-500 font-mono">{it.code}</td>
                          <td className="py-2 px-2 text-slate-800 font-medium">{it.title}</td>
                          <td className="py-2 px-2 text-right text-slate-700">{it.volumeText}</td>
                          <td className="py-2 px-2 text-right font-mono">{it.bobot.toFixed(2)}%</td>
                          <td className="py-2 px-2 text-right text-slate-700">{it.terpasangText}</td>
                          <td className="py-2 px-2 text-right font-mono font-medium">{it.progress}%</td>
                          <td className="py-2 px-2 text-right font-mono">{achieved}%</td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Section */}
                    <tr className="border-b border-slate-300 font-semibold bg-slate-50/50">
                      <td colSpan={3} className="py-2 px-2 text-right text-slate-700">
                        Subtotal {group.sectionName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {subBobot.toFixed(2)}%
                      </td>
                      <td colSpan={2} />
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {subAchieved.toFixed(2)}%
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Total Row */}
              <tr className="border-t-2 border-b-2 border-slate-900 font-bold">
                <td colSpan={3} className="py-2.5 px-2 text-slate-950 font-bold">
                  Total
                </td>
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  100%
                </td>
                <td colSpan={2} />
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  {totalAchievedBobot.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Kurva S Graphical Canvas */}
        <div className="mt-8 pt-2">
          <div className="mb-2">
            <h3 className="text-xs font-bold text-slate-950">Kurva S</h3>
            <p className="text-[11px] text-slate-500">
              Garis penuh: progres aktual · garis putus-putus: rencana
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 bg-white">
            <svg viewBox="0 0 700 200" className="w-full h-48 overflow-visible">
              {/* Horizontal Gridlines */}
              {[
                { y: 20, label: "100%" },
                { y: 60, label: "75%" },
                { y: 100, label: "50%" },
                { y: 140, label: "25%" },
                { y: 180, label: "0%" },
              ].map((g, i) => (
                <g key={i}>
                  <line x1="45" y1={g.y} x2="680" y2={g.y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x="40" y={g.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                    {g.label}
                  </text>
                </g>
              ))}

              {/* X Axis dates */}
              <text x="50" y="196" fontSize="10" fill="#64748b">
                {startDateStr}
              </text>
              <text x="360" y="196" textAnchor="middle" fontSize="10" fill="#64748b">
                {midDateStr}
              </text>
              <text x="670" y="196" textAnchor="end" fontSize="10" fill="#64748b">
                {endDateStr}
              </text>

              {/* Planned S-Curve (Dashed gray line) */}
              <path
                d="M 50 180 C 200 170, 320 80, 670 20"
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="5,5"
              />

              {/* Actual Curve (Solid thick black line) */}
              <path
                d={`M 50 180 L 150 180 L 220 ${180 - (project.progress * 1.6)}`}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.5"
              />
              <circle cx="50" cy="180" r="3" fill="#0f172a" />
              <circle cx="220" cy={180 - (project.progress * 1.6)} r="3" fill="#0f172a" />
            </svg>
          </div>
        </div>

        {/* 3-Column Signatures */}
        <div className="mt-12 pt-4 grid grid-cols-3 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              Skala-prioritas
            </div>
          </div>
          <div>
            <p className="text-slate-600">Diperiksa oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 text-slate-600 font-mono">
              (....................................)
            </div>
          </div>
          <div>
            <p className="text-slate-600">Disetujui oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              {project.clientName || "Klien contoh"}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
