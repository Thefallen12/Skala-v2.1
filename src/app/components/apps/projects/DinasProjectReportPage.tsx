"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  MapPin,
  TrendingUp,
  Image as ImageIcon,
  ChevronDown,
  Layers,
  Landmark,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DINAS_PROJECTS_DATA,
  DINAS_REPORT_METADATA,
  type DinasProjectRecord,
} from "@/lib/dinas-report-data";

type DinasTabType = "rekapitulasi" | "rincian_sid" | "database_spk";

export function DinasProjectReportPage() {
  const [activeTab, setActiveTab] = useState<DinasTabType>("rekapitulasi");
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPoktanIndex, setSelectedPoktanIndex] = useState<number>(0);

  // Extract unique kecamatan
  const kecamatanList = useMemo(() => {
    const set = new Set<string>();
    DINAS_PROJECTS_DATA.forEach((p) => set.add(p.kecamatan));
    return Array.from(set).sort();
  }, []);

  // Filtered dataset
  const filteredData = useMemo(() => {
    return DINAS_PROJECTS_DATA.filter((item) => {
      const matchKecamatan =
        selectedKecamatan === "ALL" || item.kecamatan.toLowerCase() === selectedKecamatan.toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.poktan.toLowerCase().includes(query) ||
        item.desa.toLowerCase().includes(query) ||
        item.kecamatan.toLowerCase().includes(query) ||
        item.nomorSpk.toLowerCase().includes(query) ||
        item.ketuaPoktan.toLowerCase().includes(query) ||
        item.ketuaUpkk.toLowerCase().includes(query);

      return matchKecamatan && matchSearch;
    });
  }, [selectedKecamatan, searchQuery]);

  // Aggregate stats
  const aggregates = useMemo(() => {
    let totalLuas = 0;
    let totalBiayaKonstruksi = 0;
    let totalBiayaDigunakanKonstruksi = 0;
    let totalRealisasiHaKonstruksi = 0;
    let totalBiayaOlahLahan = 0;
    let totalBiayaDigunakanOlahLahan = 0;
    let totalSp2d1 = 0;
    let totalSp2d2 = 0;

    filteredData.forEach((d) => {
      totalLuas += d.luasLahanHa;
      totalBiayaKonstruksi += d.totalBiayaKonstruksi;
      totalBiayaDigunakanKonstruksi += d.biayaDigunakanKonstruksi;
      totalRealisasiHaKonstruksi += d.realisasiHaKonstruksi;
      totalBiayaOlahLahan += d.totalBiayaOlahLahan;
      totalBiayaDigunakanOlahLahan += d.biayaDigunakanOlahLahan;
      totalSp2d1 += d.sp2d1Jumlah;
      totalSp2d2 += d.sp2d2Jumlah;
    });

    return {
      totalLuas,
      totalBiayaKonstruksi,
      totalBiayaDigunakanKonstruksi,
      totalRealisasiHaKonstruksi,
      totalBiayaOlahLahan,
      totalBiayaDigunakanOlahLahan,
      totalSp2d1,
      totalSp2d2,
      totalPenyaluran: totalSp2d1 + totalSp2d2,
    };
  }, [filteredData]);

  // Export CSV handler
  const handleExportCsv = () => {
    let csvHeader = "";
    let csvRows: string[] = [];

    if (activeTab === "rekapitulasi") {
      csvHeader =
        "No,Kabupaten,Kecamatan,Desa,Nama Poktan,Luas (Ha),Total Biaya Konstruksi,Biaya Digunakan Konstruksi,Realisasi Konstruksi (Ha),Progres Fisik Konstruksi (%),BAST Teknis UPKK,BAST UPKK ke PPK,BAST PPK ke KPA,BAST KPA ke Poktan,Total Biaya Olah Lahan,Biaya Digunakan Olah Lahan,Progres Fisik Olah Lahan (%),Realisasi Olah Lahan (Ha)";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kabupaten}"`,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          d.luasLahanHa,
          d.totalBiayaKonstruksi,
          d.biayaDigunakanKonstruksi,
          d.realisasiHaKonstruksi,
          `${d.progresFisikKonstruksiPercent}%`,
          `"${d.bastTeknisUpkk || ""}"`,
          `"${d.bastUpkkPpk || ""}"`,
          `"${d.bastPpkKpa || ""}"`,
          `"${d.bastKpaPoktan || ""}"`,
          d.totalBiayaOlahLahan,
          d.biayaDigunakanOlahLahan,
          `${d.progresFisikOlahLahanPercent}%`,
          d.realisasiHaOlahLahan,
        ].join(",")
      );
    } else if (activeTab === "database_spk") {
      csvHeader =
        "No,Kecamatan,Desa,Nama Poktan,SK CPCL,Nomor SPK,Tanggal SPK,Mulai,Selesai,Nama Bank,No Rekening,Ketua Poktan,NIK Ketua,Anggota,Ketua UPKK,NIK UPKK,SP2D 1,Jumlah SP2D 1,SP2D 2,Jumlah SP2D 2";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          `"${d.noTglSkCpcl}"`,
          `"${d.nomorSpk}"`,
          `"${d.tglSpk}"`,
          `"${d.tglMulai}"`,
          `"${d.tglSelesai}"`,
          `"${d.namaBank}"`,
          `'${d.noRekening}`,
          `"${d.ketuaPoktan}"`,
          `'${d.nikKetua}`,
          d.jumlahAnggota,
          `"${d.ketuaUpkk}"`,
          `'${d.nikUpkk}`,
          `"${d.sp2d1NoTgl}"`,
          d.sp2d1Jumlah,
          `"${d.sp2d2NoTgl || ""}"`,
          d.sp2d2Jumlah,
        ].join(",")
      );
    } else {
      csvHeader =
        "No,Kecamatan,Desa,Nama Poktan,Luas (Ha),Nama Pekerjaan,Volume SID,Satuan,Biaya Rencana,Realisasi Volume,Realisasi Satuan";
      csvRows = filteredData.flatMap((d) =>
        d.pekerjaanList.map((p) =>
          [
            d.no,
            `"${d.kecamatan}"`,
            `"${d.desa}"`,
            `"${d.poktan}"`,
            d.luasLahanHa,
            `"${p.namaPekerjaan}"`,
            `"${p.volume || ""}"`,
            `"${p.satuan || ""}"`,
            p.biaya,
            `"${p.realisasiVolume || ""}"`,
            `"${p.realisasiSatuan || ""}"`,
          ].join(",")
        )
      );
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [csvHeader, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Laporan_Dinas_${activeTab}_Aceh_Tengah_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedPoktan =
    filteredData[selectedPoktanIndex] || filteredData[0] || DINAS_PROJECTS_DATA[0];

  return (
    <div className="space-y-6">
      {/* Official Dinas Report Header */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Landmark className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] uppercase font-bold tracking-wider">
                  Format Laporan Resmi Dinas
                </Badge>
                <span className="text-xs text-muted-foreground">Tahun Anggaran 2026</span>
              </div>
              <h2 className="text-lg md:text-xl font-bold text-foreground mt-1">
                {DINAS_REPORT_METADATA.kegiatan}
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground">
                {DINAS_REPORT_METADATA.satker} &bull; Kabupaten Aceh Tengah (Pagu: Rp 10.179.000.000 &bull; 754 Ha &bull; 38 Poktan)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-1.5 text-xs rounded-xl"
            >
              <Download className="size-3.5" />
              <span>Ekspor CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-xs rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Printer className="size-3.5" />
              <span>Cetak Laporan Resmi</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab("rekapitulasi")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "rekapitulasi"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" />
            <span>Format 1: Rekapitulasi Fisik (Konstruksi & Olah Lahan)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rincian_sid")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "rincian_sid"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            <span>Format 2: Hasil SID & Dokumentasi (0%, 50%, 100%, Prasasti)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("database_spk")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "database_spk"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <UserCheck className="size-3.5" />
            <span>Format 3: Database SPK & Realisasi SP2D (Tahap 1 & 2)</span>
          </button>
        </div>
      </div>

      {/* Metric Summaries */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <p className="text-xs text-muted-foreground">Total Poktan Terdaftar</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {filteredData.length} <span className="text-xs font-normal text-muted-foreground">dari 38 Poktan</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">9 Kecamatan se-Aceh Tengah</p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <p className="text-xs text-muted-foreground">Total Luas Lahan (CPCL)</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {aggregates.totalLuas.toLocaleString("id-ID")} <span className="text-xs font-normal text-muted-foreground">Hektar</span>
          </p>
          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            Realisasi Konstruksi: {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID")} Ha
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <p className="text-xs text-muted-foreground">Pagu Konstruksi & Olah Lahan</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            Rp {(aggregates.totalBiayaKonstruksi + aggregates.totalBiayaOlahLahan).toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Digunakan: Rp {(aggregates.totalBiayaDigunakanKonstruksi + aggregates.totalBiayaDigunakanOlahLahan).toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <p className="text-xs text-muted-foreground">Tersalurkan SP2D (Kasda/Bank)</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
            Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tahap 1 (70%): Rp {aggregates.totalSp2d1.toLocaleString("id-ID")} &bull; Tahap 2: Rp {aggregates.totalSp2d2.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Poktan, Desa, SPK, Ketua..."
              className="h-8 pl-8 text-xs bg-muted/20 rounded-lg"
            />
          </div>

          <Select value={selectedKecamatan} onValueChange={setSelectedKecamatan}>
            <SelectTrigger className="h-8 w-44 text-xs rounded-lg">
              <Filter className="size-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Semua Kecamatan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Kecamatan ({DINAS_PROJECTS_DATA.length})</SelectItem>
              {kecamatanList.map((kec) => (
                <SelectItem key={kec} value={kec}>
                  Kec. {kec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{filteredData.length}</span> baris data
        </div>
      </div>

      {/* TAB CONTENT 1: Rekapitulasi Realisasi Fisik */}
      {activeTab === "rekapitulasi" && (
        <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
          <div className="border-b border-border/70 bg-muted/20 px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">
              Tabel 1: Rekapitulasi Realisasi Fisik Pelaksanaan Kegiatan Konstruksi & Olah Lahan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border/70 text-muted-foreground font-semibold">
                  <th rowSpan={2} className="px-3 py-2.5 text-center border-r border-border/50 w-10">No</th>
                  <th rowSpan={2} className="px-3 py-2.5 border-r border-border/50">Kecamatan</th>
                  <th rowSpan={2} className="px-3 py-2.5 border-r border-border/50">Desa / Kampung</th>
                  <th rowSpan={2} className="px-3 py-2.5 border-r border-border/50">Nama Poktan</th>
                  <th rowSpan={2} className="px-3 py-2.5 text-right border-r border-border/50">Luas (Ha)</th>
                  <th colSpan={4} className="px-3 py-1.5 text-center border-r border-border/50 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">
                    Pelaksanaan Kegiatan Konstruksi
                  </th>
                  <th colSpan={4} className="px-3 py-1.5 text-center border-r border-border/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">
                    BAST Fisik
                  </th>
                  <th colSpan={4} className="px-3 py-1.5 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300">
                    Pelaksanaan Olah Lahan
                  </th>
                </tr>
                <tr className="bg-muted/30 border-b border-border/70 text-[11px] text-muted-foreground font-medium">
                  {/* Konstruksi */}
                  <th className="px-2.5 py-1.5 text-right border-r border-border/50">Biaya (Rp)</th>
                  <th className="px-2.5 py-1.5 text-right border-r border-border/50">Digunakan (Rp)</th>
                  <th className="px-2.5 py-1.5 text-right border-r border-border/50">Realisasi (Ha)</th>
                  <th className="px-2.5 py-1.5 text-center border-r border-border/50">% Fisik</th>
                  {/* BAST */}
                  <th className="px-2 py-1.5 text-center border-r border-border/50">UPKK</th>
                  <th className="px-2 py-1.5 text-center border-r border-border/50">UPKK-PPK</th>
                  <th className="px-2 py-1.5 text-center border-r border-border/50">PPK-KPA</th>
                  <th className="px-2 py-1.5 text-center border-r border-border/50">KPA-Poktan</th>
                  {/* Olah Lahan */}
                  <th className="px-2.5 py-1.5 text-right border-r border-border/50">Biaya (Rp)</th>
                  <th className="px-2.5 py-1.5 text-right border-r border-border/50">Digunakan (Rp)</th>
                  <th className="px-2.5 py-1.5 text-center border-r border-border/50">% Fisik</th>
                  <th className="px-2.5 py-1.5 text-right">Realisasi (Ha)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredData.map((d) => (
                  <tr key={d.no} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-center text-muted-foreground font-mono border-r border-border/40">{d.no}</td>
                    <td className="px-3 py-2 font-medium text-foreground border-r border-border/40 whitespace-nowrap">{d.kecamatan}</td>
                    <td className="px-3 py-2 text-muted-foreground border-r border-border/40 whitespace-nowrap">{d.desa}</td>
                    <td className="px-3 py-2 font-semibold text-foreground border-r border-border/40 whitespace-nowrap">{d.poktan}</td>
                    <td className="px-3 py-2 text-right font-medium text-foreground border-r border-border/40">{d.luasLahanHa}</td>

                    {/* Konstruksi */}
                    <td className="px-2.5 py-2 text-right font-mono text-muted-foreground border-r border-border/40">
                      {d.totalBiayaKonstruksi.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-foreground border-r border-border/40">
                      {d.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2.5 py-2 text-right font-medium text-foreground border-r border-border/40">
                      {d.realisasiHaKonstruksi}
                    </td>
                    <td className="px-2.5 py-2 text-center border-r border-border/40">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {d.progresFisikKonstruksiPercent}%
                      </span>
                    </td>

                    {/* BAST */}
                    <td className="px-2 py-2 text-center border-r border-border/40 text-[10px] text-muted-foreground">
                      {d.bastTeknisUpkk || "—"}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-border/40 text-[10px] text-muted-foreground">
                      {d.bastUpkkPpk || "—"}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-border/40 text-[10px] text-muted-foreground">
                      {d.bastPpkKpa || "—"}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-border/40 text-[10px] text-muted-foreground">
                      {d.bastKpaPoktan || "—"}
                    </td>

                    {/* Olah Lahan */}
                    <td className="px-2.5 py-2 text-right font-mono text-muted-foreground border-r border-border/40">
                      {d.totalBiayaOlahLahan.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-foreground border-r border-border/40">
                      {d.biayaDigunakanOlahLahan.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2.5 py-2 text-center border-r border-border/40">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                        {d.progresFisikOlahLahanPercent}%
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right font-medium text-foreground">
                      {d.realisasiHaOlahLahan}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-bold border-t-2 border-border/80 text-foreground">
                  <td colSpan={4} className="px-3 py-2.5 text-center border-r border-border/50 uppercase tracking-wide">
                    Total Keseluruhan ({filteredData.length} Kelompok Tani)
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalLuas.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-center border-r border-border/50">100%</td>
                  <td colSpan={4} className="px-2 py-2.5 text-center border-r border-border/50 text-xs text-muted-foreground">
                    Selesai & BAST Lengkap
                  </td>
                  <td className="px-2.5 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalBiayaOlahLahan.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-right border-r border-border/50 font-mono">
                    {aggregates.totalBiayaDigunakanOlahLahan.toLocaleString("id-ID")}
                  </td>
                  <td className="px-2.5 py-2.5 text-center border-r border-border/50">100%</td>
                  <td className="px-2.5 py-2.5 text-right font-mono">
                    {aggregates.totalLuas.toLocaleString("id-ID")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: Hasil SID, Rincian Fisik & Dokumentasi Foto */}
      {activeTab === "rincian_sid" && (
        <div className="space-y-6">
          {/* Poktan Selector Horizontal Strip */}
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Pilih Kelompok Tani untuk Rincian Fisik & Dokumentasi Foto
                </h3>
                <p className="text-xs text-muted-foreground">
                  Format Laporan Realisasi Fisik Berdasarkan Hasil SID vs Fisik Konstruksi Lapangan
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {selectedPoktan.kecamatan} &bull; {selectedPoktan.desa}
              </Badge>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {filteredData.map((p, idx) => (
                <button
                  key={p.no}
                  type="button"
                  onClick={() => setSelectedPoktanIndex(idx)}
                  className={`flex flex-col text-left shrink-0 rounded-lg p-2.5 text-xs transition border ${
                    selectedPoktan.no === p.no
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                  style={{ minWidth: "150px" }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    #{p.no} &bull; {p.kecamatan}
                  </span>
                  <span className="font-bold text-foreground truncate">{p.poktan}</span>
                  <span className="text-[11px] mt-0.5">Luas: {p.luasLahanHa} Ha</span>
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Poktan Item Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Table Rincian Fisik SID */}
            <div className="lg:col-span-2 rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
              <div className="border-b border-border/70 bg-muted/20 px-4 py-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Rincian Item Pekerjaan Konstruksi (Hasil SID vs Realisasi)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {selectedPoktan.poktan} &bull; Kec. {selectedPoktan.kecamatan}, Desa {selectedPoktan.desa}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Total Anggaran Konstruksi</span>
                  <p className="text-sm font-bold text-primary">
                    Rp {selectedPoktan.totalBiayaKonstruksi.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/70 text-muted-foreground font-semibold">
                      <th className="px-3 py-2.5 text-center w-8">No</th>
                      <th className="px-3 py-2.5">Rincian Item Pekerjaan</th>
                      <th className="px-3 py-2.5 text-right">Volume SID</th>
                      <th className="px-2.5 py-2.5 text-center">Satuan</th>
                      <th className="px-3 py-2.5 text-right">Biaya (Rp)</th>
                      <th className="px-3 py-2.5 text-right">Realisasi Fisik</th>
                      <th className="px-2.5 py-2.5 text-center">Satuan</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {selectedPoktan.pekerjaanList.map((item, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-center text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{item.namaPekerjaan}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                          {item.volume !== null && item.volume !== undefined ? String(item.volume) : "—"}
                        </td>
                        <td className="px-2.5 py-2 text-center text-muted-foreground">{item.satuan || "—"}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                          {item.biaya > 0 ? item.biaya.toLocaleString("id-ID") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                          {item.realisasiVolume !== null && item.realisasiVolume !== undefined ? String(item.realisasiVolume) : "—"}
                        </td>
                        <td className="px-2.5 py-2 text-center text-muted-foreground">{item.realisasiSatuan || item.satuan || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            100%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-bold border-t border-border/80 text-foreground">
                      <td colSpan={4} className="px-3 py-2.5 text-center">Total Biaya Konstruksi Tertera</td>
                      <td className="px-3 py-2.5 text-right font-mono text-primary">
                        Rp {selectedPoktan.totalBiayaKonstruksi.toLocaleString("id-ID")}
                      </td>
                      <td colSpan={3} className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400">
                        Progres Fisik 100% Selesai
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Right Col: 4 Photo Documentation Cards (0%, 50%, 100%, Prasasti) */}
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ImageIcon className="size-4 text-primary" />
                    Dokumentasi Lapangan Resmi
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    4 Tahapan Wajib
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Dokumentasi visual fisik wajib untuk lampiran BAST dan pertanggungjawaban dinas.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Titik 0% */}
                  <div className="rounded-lg border border-border/70 bg-muted/10 p-2.5 text-center flex flex-col items-center justify-center min-h-[110px] group hover:border-primary/50 transition">
                    <div className="size-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-1.5 group-hover:bg-primary/20 group-hover:text-primary transition">
                      <ImageIcon className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Kondisi 0%</span>
                    <span className="text-[10px] text-muted-foreground">Sebelum Pekerjaan</span>
                    <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0 h-4">
                      Terverifikasi
                    </Badge>
                  </div>

                  {/* Titik 50% */}
                  <div className="rounded-lg border border-border/70 bg-muted/10 p-2.5 text-center flex flex-col items-center justify-center min-h-[110px] group hover:border-primary/50 transition">
                    <div className="size-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-1.5 group-hover:bg-primary/20 group-hover:text-primary transition">
                      <ImageIcon className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Kondisi 50%</span>
                    <span className="text-[10px] text-muted-foreground">Progres Sedang Jalan</span>
                    <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0 h-4">
                      Terverifikasi
                    </Badge>
                  </div>

                  {/* Titik 100% */}
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 p-2.5 text-center flex flex-col items-center justify-center min-h-[110px]">
                    <div className="size-8 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center justify-center mb-1.5">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Kondisi 100%</span>
                    <span className="text-[10px] text-muted-foreground">Selesai Konstruksi</span>
                    <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-600">
                      Lengkap
                    </Badge>
                  </div>

                  {/* Prasasti */}
                  <div className="rounded-lg border border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/20 p-2.5 text-center flex flex-col items-center justify-center min-h-[110px]">
                    <div className="size-8 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 flex items-center justify-center mb-1.5">
                      <Landmark className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Prasasti</span>
                    <span className="text-[10px] text-muted-foreground">Batu Prasasti Kegiatan</span>
                    <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600">
                      Terpasang
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ketua Poktan:</span>
                    <span className="font-semibold text-foreground">{selectedPoktan.ketuaPoktan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ketua UPKK:</span>
                    <span className="font-semibold text-foreground">{selectedPoktan.ketuaUpkk}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nomor SPK:</span>
                    <span className="font-mono text-[11px] text-foreground">{selectedPoktan.nomorSpk}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: Database SPK & Realisasi SP2D */}
      {activeTab === "database_spk" && (
        <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
          <div className="border-b border-border/70 bg-muted/20 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Tabel 3: Database SPK, Pengurus Poktan/UPKK & Realisasi SP2D
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Penyaluran Dana Hibah Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Bank Operasional: Bank Syariah Indonesia (BSI)
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border/70 text-muted-foreground font-semibold">
                  <th className="px-3 py-2.5 text-center border-r border-border/50 w-8">No</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Kecamatan / Desa</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Nama Poktan & Luas</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Nomor & Tanggal SPK</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Jangka Waktu</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Bank & No Rekening</th>
                  <th className="px-3 py-2.5 border-r border-border/50">Pengurus (Ketua & UPKK)</th>
                  <th className="px-3 py-2.5 text-right border-r border-border/50">SP2D Tahap 1 (70%)</th>
                  <th className="px-3 py-2.5 text-right border-r border-border/50">SP2D Tahap 2 (30%)</th>
                  <th className="px-3 py-2.5 text-right">Total Tersalur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredData.map((d) => {
                  const totalTersalur = d.sp2d1Jumlah + d.sp2d2Jumlah;
                  return (
                    <tr key={d.no} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-center text-muted-foreground font-mono border-r border-border/40">{d.no}</td>
                      <td className="px-3 py-2 border-r border-border/40 whitespace-nowrap">
                        <span className="font-semibold text-foreground">Kec. {d.kecamatan}</span>
                        <div className="text-[11px] text-muted-foreground">Desa {d.desa}</div>
                      </td>
                      <td className="px-3 py-2 border-r border-border/40 whitespace-nowrap">
                        <span className="font-bold text-foreground">{d.poktan}</span>
                        <div className="text-[11px] text-muted-foreground">{d.luasLahanHa} Ha ({d.jumlahAnggota} Anggota)</div>
                      </td>
                      <td className="px-3 py-2 border-r border-border/40 font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{d.nomorSpk}</span>
                        <div className="text-[10px] text-muted-foreground">Tgl: {d.tglSpk}</div>
                      </td>
                      <td className="px-3 py-2 border-r border-border/40 whitespace-nowrap text-[11px]">
                        <div>{d.tglMulai} s/d</div>
                        <div className="text-muted-foreground">{d.tglSelesai}</div>
                      </td>
                      <td className="px-3 py-2 border-r border-border/40 whitespace-nowrap">
                        <span className="font-medium text-foreground">{d.namaBank}</span>
                        <div className="font-mono text-[11px] text-muted-foreground">{d.noRekening}</div>
                      </td>
                      <td className="px-3 py-2 border-r border-border/40 whitespace-nowrap text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Ketua: </span>
                          <span className="font-medium text-foreground">{d.ketuaPoktan}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">NIK: {d.nikKetua}</div>
                        <div className="mt-0.5">
                          <span className="text-muted-foreground">UPKK: </span>
                          <span className="font-medium text-foreground">{d.ketuaUpkk}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right border-r border-border/40 font-mono">
                        <div className="font-semibold text-foreground">Rp {d.sp2d1Jumlah.toLocaleString("id-ID")}</div>
                        <div className="text-[10px] text-muted-foreground">{d.sp2d1NoTgl}</div>
                      </td>
                      <td className="px-3 py-2 text-right border-r border-border/40 font-mono">
                        <div className="font-semibold text-foreground">
                          {d.sp2d2Jumlah > 0 ? `Rp ${d.sp2d2Jumlah.toLocaleString("id-ID")}` : "Rp 0"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{d.sp2d2NoTgl || "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {totalTersalur.toLocaleString("id-ID")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-bold border-t-2 border-border/80 text-foreground">
                  <td colSpan={7} className="px-3 py-2.5 text-center uppercase tracking-wide border-r border-border/50">
                    Total Penyaluran Dana SP2D ({filteredData.length} Poktan)
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-border/50 text-foreground">
                    Rp {aggregates.totalSp2d1.toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-border/50 text-foreground">
                    Rp {aggregates.totalSp2d2.toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                    Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Official Sign-Off Section for Dinas Printing */}
      <div className="hidden print:block mt-12 pt-6 border-t border-border">
        <div className="grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <p>Mengetahui,</p>
            <p className="font-bold">Kuasa Pengguna Anggaran (KPA)</p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA KPA LENGKAP, M.Si</p>
            <p className="text-muted-foreground">NIP. 19780101 200501 1 001</p>
          </div>
          <div>
            <p>Disetujui Oleh,</p>
            <p className="font-bold">Pejabat Pembuat Komitmen (PPK)</p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA PPK LENGKAP, ST</p>
            <p className="text-muted-foreground">NIP. 19820315 200801 1 002</p>
          </div>
          <div>
            <p>Takengon, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="font-bold">Pejabat Pelaksana Teknis Kegiatan (PPTK)</p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA PPTK LENGKAP, SP</p>
            <p className="text-muted-foreground">NIP. 19850720 201001 1 003</p>
          </div>
        </div>
      </div>
    </div>
  );
}
