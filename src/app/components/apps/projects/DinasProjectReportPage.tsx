"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Image as ImageIcon,
  Landmark,
  Layers,
  Printer,
  Search,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DINAS_PROJECTS_DATA,
  DINAS_REPORT_METADATA,
} from "@/lib/dinas-report-data";
import { cn } from "@/lib/utils";

type DinasTabType = "rekapitulasi" | "rincian_sid" | "database_spk";

type DinasProjectProgressSource = {
  kelompokTani: string;
  name: string;
  title: string;
  progress: number;
};

function normalizeGroupName(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("id-ID");
}

function calculateRealizedArea(
  areaHa: number,
  progressPercent: number,
): number {
  return (areaHa * progressPercent) / 100;
}

export function DinasProjectReportPage({
  projects,
}: {
  projects: DinasProjectProgressSource[];
}) {
  const [activeTab, setActiveTab] = useState<DinasTabType>("rekapitulasi");
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPoktanIndex, setSelectedPoktanIndex] = useState<number>(0);

  const linkedProjectsByGroup = useMemo(() => {
    const projectByGroup = new Map<string, DinasProjectProgressSource>();
    const ambiguousGroups = new Set<string>();
    for (const project of projects) {
      const keys = new Set(
        [project.kelompokTani, project.name, project.title]
          .map(normalizeGroupName)
          .filter(Boolean),
      );
      for (const key of keys) {
        if (ambiguousGroups.has(key)) continue;
        if (projectByGroup.has(key)) {
          projectByGroup.delete(key);
          ambiguousGroups.add(key);
        } else {
          projectByGroup.set(key, project);
        }
      }
    }
    return projectByGroup;
  }, [projects]);

  const projectReportData = useMemo(
    () =>
      DINAS_PROJECTS_DATA.map((record) => {
        const linkedProject = linkedProjectsByGroup.get(
          normalizeGroupName(record.poktan),
        );
        const sourceProgress =
          linkedProject && Number.isFinite(linkedProject.progress)
            ? linkedProject.progress
            : record.progresFisikKonstruksiPercent;
        const progress = Math.min(100, Math.max(0, sourceProgress));
        const realizedArea = calculateRealizedArea(
          record.luasLahanHa,
          progress,
        );
        return {
          ...record,
          progresFisikKonstruksiPercent: progress,
          realisasiHaKonstruksi: realizedArea,
          biayaDigunakanKonstruksi:
            record.luasLahanHa > 0
              ? Math.round(
                  (record.totalBiayaKonstruksi / record.luasLahanHa) *
                    realizedArea,
                )
              : 0,
        };
      }),
    [linkedProjectsByGroup],
  );

  const kecamatanList = useMemo(() => {
    const set = new Set<string>();
    projectReportData.forEach((p) => set.add(p.kecamatan));
    return Array.from(set).sort();
  }, [projectReportData]);

  const filteredData = useMemo(() => {
    return projectReportData.filter((item) => {
      const matchKecamatan =
        selectedKecamatan === "ALL" ||
        item.kecamatan.toLowerCase() === selectedKecamatan.toLowerCase();
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
  }, [projectReportData, selectedKecamatan, searchQuery]);

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
        ].join(","),
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
        ].join(","),
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
          ].join(","),
        ),
      );
    }

    const csvContent =
      "data:text/csv;charset=utf-8," + [csvHeader, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Laporan_Dinas_${activeTab}_Aceh_Tengah_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedPoktan =
    filteredData[selectedPoktanIndex] || filteredData[0] || projectReportData[0];

  return (
    <div className="space-y-6">
      {/* Official Dinas Report Header */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Landmark className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Format Laporan Resmi Dinas</Badge>
                <span className="type-p3 text-muted-foreground">
                  Tahun Anggaran 2026
                </span>
              </div>
              <h2 className="type-h2 mt-1 text-foreground">
                {DINAS_REPORT_METADATA.kegiatan}
              </h2>
              <p className="type-p2 text-muted-foreground">
                {DINAS_REPORT_METADATA.satker} · Kabupaten Aceh Tengah (Pagu: Rp
                10.179.000.000 · 754 Ha · 38 Poktan)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-1.5"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>Ekspor CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>Cetak Laporan</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rekapitulasi" ? "default" : "outline"}
            onClick={() => setActiveTab("rekapitulasi")}
            className="gap-1.5"
          >
            <Layers className="size-3.5" aria-hidden="true" />
            <span>Rekapitulasi Fisik</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rincian_sid" ? "default" : "outline"}
            onClick={() => setActiveTab("rincian_sid")}
            className="gap-1.5"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            <span>Hasil SID &amp; Foto</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "database_spk" ? "default" : "outline"}
            onClick={() => setActiveTab("database_spk")}
            className="gap-1.5"
          >
            <UserCheck className="size-3.5" aria-hidden="true" />
            <span>Database SPK &amp; SP2D</span>
          </Button>
        </div>
      </div>

      {/* Metric Summaries */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">Total Poktan Terdaftar</p>
          <p className="type-kpi mt-1 text-foreground">
            {filteredData.length}{" "}
            <span className="type-p3 font-normal text-muted-foreground">
              dari 38 Poktan
            </span>
          </p>
          <p className="type-p3 mt-1 text-muted-foreground">
            9 Kecamatan se-Aceh Tengah
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Total Luas Lahan (CPCL)
          </p>
          <p className="type-kpi mt-1 text-foreground">
            {aggregates.totalLuas.toLocaleString("id-ID")}{" "}
            <span className="type-p3 font-normal text-muted-foreground">
              Hektar
            </span>
          </p>
          <p className="type-p3 mt-1 font-medium text-success tabular-nums">
            Realisasi:{" "}
            {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID")} Ha
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Pagu Konstruksi &amp; Olah Lahan
          </p>
          <p className="type-kpi mt-1 text-foreground">
            Rp{" "}
            {(
              aggregates.totalBiayaKonstruksi + aggregates.totalBiayaOlahLahan
            ).toLocaleString("id-ID")}
          </p>
          <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
            Digunakan: Rp{" "}
            {(
              aggregates.totalBiayaDigunakanKonstruksi +
              aggregates.totalBiayaDigunakanOlahLahan
            ).toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Tersalurkan SP2D (Bank)
          </p>
          <p className="type-kpi mt-1 text-success">
            Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
          </p>
          <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
            T1: Rp {aggregates.totalSp2d1.toLocaleString("id-ID")} · T2: Rp{" "}
            {aggregates.totalSp2d2.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari Poktan, Desa, SPK, Ketua..."
              className="pl-8"
            />
          </div>

          <Select
            value={selectedKecamatan}
            onValueChange={setSelectedKecamatan}
          >
            <SelectTrigger className="w-52">
              <Filter
                className="mr-1.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <SelectValue placeholder="Semua Kecamatan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                Semua Kecamatan ({projectReportData.length})
              </SelectItem>
              {kecamatanList.map((kec) => (
                <SelectItem key={kec} value={kec}>
                  Kec. {kec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="type-p3 text-muted-foreground tabular-nums">
          Menampilkan{" "}
          <strong className="font-semibold text-foreground">
            {filteredData.length}
          </strong>{" "}
          baris data
        </p>
      </div>

      {filteredData.length === 0 ? (
        <EmptyState
          title="Data laporan dinas tidak ditemukan"
          description="Coba ubah filter kecamatan atau kata kunci pencarian."
        />
      ) : (
        <>
          {/* TAB 1: Rekapitulasi */}
          {activeTab === "rekapitulasi" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div>
                <h3 className="type-h3 text-foreground">
                  Tabel 1: Rekapitulasi Realisasi Fisik Konstruksi &amp; Olah
                  Lahan
                </h3>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026
                </p>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="text-center">
                      No
                    </TableHead>
                    <TableHead rowSpan={2}>Kecamatan</TableHead>
                    <TableHead rowSpan={2}>Desa / Kampung</TableHead>
                    <TableHead rowSpan={2}>Nama Poktan</TableHead>
                    <TableHead rowSpan={2} className="text-right">
                      Luas (Ha)
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Konstruksi
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      BAST Fisik
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Olah Lahan
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-center">UPKK</TableHead>
                    <TableHead className="text-center">UPKK-PPK</TableHead>
                    <TableHead className="text-center">PPK-KPA</TableHead>
                    <TableHead className="text-center">KPA-Poktan</TableHead>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => (
                    <TableRow key={d.no}>
                      <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                        {d.no}
                      </TableCell>
                      <TableCell className="type-p2 font-medium text-foreground">
                        {d.kecamatan}
                      </TableCell>
                      <TableCell className="type-p3 text-muted-foreground">
                        {d.desa}
                      </TableCell>
                      <TableCell className="type-p2 font-semibold text-foreground">
                        {d.poktan}
                      </TableCell>
                      <TableCell className="type-p2 text-right font-medium tabular-nums">
                        {d.luasLahanHa}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaKonstruksi.toLocaleString("id-ID", {
                          maximumFractionDigits: 5,
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikKonstruksiPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastTeknisUpkk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastUpkkPpk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastPpkKpa || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastKpaPoktan || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikOlahLahanPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaOlahLahan}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="type-p2 text-center font-bold">
                      Total Keseluruhan ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalRealisasiHaKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell
                      colSpan={4}
                      className="type-p3 text-center text-muted-foreground"
                    >
                      Selesai &amp; BAST Lengkap
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaOlahLahan.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanOlahLahan.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* TAB 2: Hasil SID & Dokumentasi Foto */}
          {activeTab === "rincian_sid" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="type-h3 text-foreground">
                      Pilih Kelompok Tani untuk Rincian Fisik &amp; Dokumentasi
                    </h3>
                    <p className="type-p3 text-muted-foreground">
                      Laporan Realisasi Fisik Hasil SID vs Fisik Konstruksi
                    </p>
                  </div>
                  <Badge variant="outline">
                    {selectedPoktan.kecamatan} · {selectedPoktan.desa}
                  </Badge>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {filteredData.map((p, idx) => (
                    <button
                      key={p.no}
                      type="button"
                      onClick={() => setSelectedPoktanIndex(idx)}
                      className={cn(
                        "flex min-w-[160px] shrink-0 flex-col rounded-lg border p-3 text-left transition",
                        selectedPoktan.no === p.no
                          ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <span className="type-p3 uppercase tracking-wider text-muted-foreground">
                        #{p.no} · {p.kecamatan}
                      </span>
                      <span className="type-p2 truncate font-bold text-foreground">
                        {p.poktan}
                      </span>
                      <span className="type-p3 mt-0.5 tabular-nums">
                        Luas: {p.luasLahanHa} Ha
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="type-h3 text-foreground">
                        Rincian Item Pekerjaan Konstruksi
                      </h4>
                      <p className="type-p3 text-muted-foreground">
                        {selectedPoktan.poktan} · Kec.{" "}
                        {selectedPoktan.kecamatan}, Desa {selectedPoktan.desa}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="type-p3 text-muted-foreground">
                        Total Anggaran Konstruksi
                      </span>
                      <p className="type-h3 font-bold text-primary tabular-nums">
                        Rp{" "}
                        {selectedPoktan.totalBiayaKonstruksi.toLocaleString(
                          "id-ID",
                        )}
                      </p>
                    </div>
                  </div>

                  <Table pagination={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">No</TableHead>
                        <TableHead>Rincian Pekerjaan</TableHead>
                        <TableHead className="text-right">Vol SID</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                        <TableHead className="text-right">Biaya (Rp)</TableHead>
                        <TableHead className="text-right">Realisasi</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPoktan.pekerjaanList.map((item, i) => (
                        <TableRow key={`${item.namaPekerjaan}-${i}`}>
                          <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                            {i + 1}
                          </TableCell>
                          <TableCell className="type-p2 whitespace-normal font-medium text-foreground">
                            {item.namaPekerjaan}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                            {item.volume !== null && item.volume !== undefined
                              ? String(item.volume)
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-center text-muted-foreground">
                            {item.satuan || "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono font-semibold text-foreground tabular-nums">
                            {item.biaya > 0
                              ? item.biaya.toLocaleString("id-ID")
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono font-medium text-success tabular-nums">
                            {item.realisasiVolume !== null &&
                            item.realisasiVolume !== undefined
                              ? String(item.realisasiVolume)
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-center text-muted-foreground">
                            {item.realisasiSatuan || item.satuan || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="type-p3 inline-flex items-center gap-1 font-semibold text-success">
                              <CheckCircle2
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              100%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="type-p2 text-center font-bold">
                          Total Biaya Konstruksi
                        </TableCell>
                        <TableCell className="type-p2 text-right font-mono font-bold text-primary tabular-nums">
                          Rp{" "}
                          {selectedPoktan.totalBiayaKonstruksi.toLocaleString(
                            "id-ID",
                          )}
                        </TableCell>
                        <TableCell
                          colSpan={3}
                          className="type-p3 text-center font-semibold text-success"
                        >
                          Progres Fisik 100% Selesai
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* 4 Photo Stages */}
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h4 className="type-h3 flex items-center gap-2 text-foreground">
                        <ImageIcon
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        Dokumentasi Resmi
                      </h4>
                      <Badge variant="outline">4 Tahap</Badge>
                    </div>
                    <p className="type-p3 mb-4 text-muted-foreground">
                      Dokumentasi visual fisik wajib untuk lampiran BAST dan
                      pertanggungjawaban dinas.
                    </p>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-border bg-muted/15 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-foreground">
                          Kondisi 0%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Sebelum Kerja
                        </span>
                        <Badge variant="secondary" className="mt-1.5">
                          Terverifikasi
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-border bg-muted/15 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-foreground">
                          Kondisi 50%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Sedang Jalan
                        </span>
                        <Badge variant="secondary" className="mt-1.5">
                          Terverifikasi
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-success/40 bg-success/5 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-success">
                          Kondisi 100%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Selesai
                        </span>
                        <Badge variant="outline" className="mt-1.5">
                          Lengkap
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-warning/40 bg-warning/5 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-warning/15 text-warning">
                          <Landmark className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-warning">
                          Prasasti
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Batu Prasasti
                        </span>
                        <Badge variant="outline" className="mt-1.5">
                          Terpasang
                        </Badge>
                      </div>
                    </div>

                    <div className="type-p3 mt-4 space-y-1.5 border-t border-border pt-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Ketua Poktan:
                        </span>
                        <span className="font-semibold text-foreground">
                          {selectedPoktan.ketuaPoktan}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Ketua UPKK:
                        </span>
                        <span className="font-semibold text-foreground">
                          {selectedPoktan.ketuaUpkk}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nomor SPK:</span>
                        <span className="font-mono text-foreground">
                          {selectedPoktan.nomorSpk}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Database SPK & SP2D */}
          {activeTab === "database_spk" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="type-h3 text-foreground">
                    Tabel 3: Database SPK, Pengurus Poktan/UPKK &amp; SP2D
                  </h3>
                  <p className="type-p3 mt-0.5 text-muted-foreground">
                    Penyaluran Dana Hibah Rehabilitasi Lahan Sawah Aceh Tengah
                    T.A. 2026
                  </p>
                </div>
                <Badge variant="outline">
                  Bank Syariah Indonesia (BSI)
                </Badge>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">No</TableHead>
                    <TableHead>Kecamatan / Desa</TableHead>
                    <TableHead>Nama Poktan &amp; Luas</TableHead>
                    <TableHead>Nomor &amp; Tanggal SPK</TableHead>
                    <TableHead>Jangka Waktu</TableHead>
                    <TableHead>Bank &amp; Rekening</TableHead>
                    <TableHead>Pengurus</TableHead>
                    <TableHead className="text-right">SP2D Tahap 1</TableHead>
                    <TableHead className="text-right">SP2D Tahap 2</TableHead>
                    <TableHead className="text-right">Total Tersalur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => {
                    const totalTersalur = d.sp2d1Jumlah + d.sp2d2Jumlah;
                    return (
                      <TableRow key={d.no}>
                        <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                          {d.no}
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-semibold text-foreground">
                            Kec. {d.kecamatan}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Desa {d.desa}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-bold text-foreground">
                            {d.poktan}
                          </p>
                          <p className="type-p3 text-muted-foreground tabular-nums">
                            {d.luasLahanHa} Ha ({d.jumlahAnggota} Anggota)
                          </p>
                        </TableCell>
                        <TableCell className="font-mono">
                          <p className="type-p3 font-semibold text-foreground">
                            {d.nomorSpk}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Tgl: {d.tglSpk}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3 tabular-nums">
                          <p>{d.tglMulai} s/d</p>
                          <p className="text-muted-foreground">{d.tglSelesai}</p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-medium text-foreground">
                            {d.namaBank}
                          </p>
                          <p className="type-p3 font-mono text-muted-foreground">
                            {d.noRekening}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3">
                          <p>
                            <span className="text-muted-foreground">
                              Ketua:{" "}
                            </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaPoktan}
                            </span>
                          </p>
                          <p className="font-mono text-muted-foreground">
                            NIK: {d.nikKetua}
                          </p>
                          <p>
                            <span className="text-muted-foreground">UPKK: </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaUpkk}
                            </span>
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d1Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d1NoTgl}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d2Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d2NoTgl || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                          Rp {totalTersalur.toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7} className="type-p2 text-center font-bold">
                      Total Penyaluran SP2D ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d1.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d2.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                      Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Official Sign-Off Section for Dinas Printing */}
      <div className="mt-12 hidden border-t border-border pt-6 print:block">
        <div className="type-p3 grid grid-cols-3 gap-6 text-center">
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
            <p>
              Takengon,{" "}
              {new Date().toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="font-bold">
              Pejabat Pelaksana Teknis Kegiatan (PPTK)
            </p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA PPTK LENGKAP, SP</p>
            <p className="text-muted-foreground">NIP. 19850720 201001 1 003</p>
          </div>
        </div>
      </div>
    </div>
  );
}
