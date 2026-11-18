export type ProjectWorkTypeGroup = "CONSULTANCY" | "PHYSICAL";

export type WorkTypeBadgeTone =
  | "indigo"
  | "sky"
  | "emerald"
  | "amber"
  | "teal"
  | "slate";

export interface WorkTypeTemplateItem {
  title: string;
  section: string;
  unit: string;
  defaultVolume: number;
  description?: string;
}

export interface ProjectWorkTypeDefinition {
  id: string;
  label: string;
  shortLabel: string;
  group: ProjectWorkTypeGroup;
  groupLabel: string;
  description: string;
  badgeTone: WorkTypeBadgeTone;
  aliases: string[];
  dailyReportFocusHints: string[];
  checklistHints: string[];
  wbsTemplates: WorkTypeTemplateItem[];
  isCustomFallback?: boolean;
}

export const CUSTOM_WORK_TYPE_LABEL = "Lainnya";

export const PROJECT_WORK_TYPES: readonly ProjectWorkTypeDefinition[] = [
  // =========================================================================
  // GROUP 1: CONSULTANCY (Jasa Konsultansi & Rekayasa)
  // =========================================================================
  {
    id: "ded",
    label: "DED (Detail Engineering Design)",
    shortLabel: "DED",
    group: "CONSULTANCY",
    groupLabel: "Jasa Konsultansi & Rekayasa",
    description:
      "Perancangan teknis detail meliputi survey pengukuran, konsep desain, gambar kerja DED, perhitungan struktur/hidrolika, RKS, serta BoQ/EE.",
    badgeTone: "indigo",
    aliases: [
      "ded",
      "detail engineering design",
      "perancangan ded",
      "desain detail",
      "pembuatan ded",
    ],
    dailyReportFocusHints: [
      "Catat persentase penyelesaian lembar gambar DED (Arsitektur/Struktur/MEP/Sipil).",
      "Laporkan status perhitungan teknis, RKS, dan estimasi biaya (BoQ/EE).",
      "Cantumkan hasil asistensi/review desain dengan pemilik proyek atau dinas terkait.",
    ],
    checklistHints: [
      "Revisi gambar kerja & sinkronisasi antar disiplin",
      "Kelengkapan data survey lapangan & topografi",
      "Review dokumen BoQ, Analisa Harga Satuan & RKS",
    ],
    wbsTemplates: [
      {
        title: "Survey Pendahuluan & Pengukuran Topografi",
        section: "A. Persiapan & Survey",
        unit: "%",
        defaultVolume: 100,
        description: "Orientasi lapangan, benchmark, dan pemetaan situasi eksisting.",
      },
      {
        title: "Penyusunan Konsep & Pra-Rancangan Teknis",
        section: "B. Konsep Desain",
        unit: "%",
        defaultVolume: 100,
        description: "Kriteria desain, skematik layout, dan persetujuan konsep awal.",
      },
      {
        title: "Gambar Kerja Detail (DED) & Nota Perhitungan",
        section: "C. Produk Gambar & Hitungan",
        unit: "%",
        defaultVolume: 100,
        description: "Gambar detail arsitektur, struktur, sipil, MEP, dan nota desain.",
      },
      {
        title: "Penyusunan RKS, Spesifikasi Teknis & BoQ / EE",
        section: "D. Dokumen Tender & Finalisasi",
        unit: "%",
        defaultVolume: 100,
        description: "Spesifikasi teknis, volume BoQ, Engineer's Estimate, dan laporan akhir.",
      },
    ],
  },
  {
    id: "konsultan-pengawas",
    label: "Konsultan Pengawas",
    shortLabel: "Konsultan Pengawas",
    group: "CONSULTANCY",
    groupLabel: "Jasa Konsultansi & Rekayasa",
    description:
      "Pengawasan mutu, volume, jadwal, K3, serta verifikasi opname/MC dan instruksi lapangan terhadap kontraktor pelaksana.",
    badgeTone: "indigo",
    aliases: [
      "konsultan pengawas",
      "pengawasan",
      "supervisi",
      "supervision",
      "pengawas lapangan",
    ],
    dailyReportFocusHints: [
      "Catat hasil inspeksi mutu pekerjaan & persetujuan material kontraktor.",
      "Verifikasi jumlah tenaga kerja, peralatan kontraktor, dan kondisi cuaca.",
      "Laporkan temuan ketidaksesuaian (NCR), RFI, atau catatan K3 lapangan.",
    ],
    checklistHints: [
      "Verifikasi Request for Inspection (RFI) & approval material",
      "Pemeriksaan kepatuhan APD & K3 kontraktor pelaksana",
      "Validasi volume opname harian / Mutual Check (MC)",
    ],
    wbsTemplates: [
      {
        title: "Review Dokumen Kontrak, MC-0 & Shop Drawing",
        section: "A. Persiapan Pengawasan",
        unit: "%",
        defaultVolume: 100,
        description: "Pemeriksaan awal gambar kerja, jadwal S-Curve, dan MC-0.",
      },
      {
        title: "Pengawasan Mutu Material, Metode & K3 Lapangan",
        section: "B. Supervisi Harian & Mutu",
        unit: "%",
        defaultVolume: 100,
        description: "Inspeksi harian, uji mutu material, dan pengendalian K3 proyek.",
      },
      {
        title: "Verifikasi Opname Berkala, RFI & Laporan Mingguan/Bulanan",
        section: "C. Pengendalian Progres & Pelaporan",
        unit: "%",
        defaultVolume: 100,
        description: "Pemeriksaan backup volume opname dan laporan pengawasan berkala.",
      },
      {
        title: "Pemeriksaan Akhir, Checklist Defect & PHO/FHO",
        section: "D. Serah Terima & Pelaporan Akhir",
        unit: "%",
        defaultVolume: 100,
        description: "Pemeriksaan As-Built Drawing, defect list, dan rekomendasi PHO/FHO.",
      },
    ],
  },
  {
    id: "konsultan-perencana",
    label: "Konsultan Perencana",
    shortLabel: "Konsultan Perencana",
    group: "CONSULTANCY",
    groupLabel: "Jasa Konsultansi & Rekayasa",
    description:
      "Jasa perencanaan menyeluruh mulai studi kebutuhan, prarencana, pengembangan rancangan, hingga dokumen pengadaan.",
    badgeTone: "sky",
    aliases: [
      "konsultan perencana",
      "perencana",
      "perencanaan konstruksi",
      "planning consultant",
    ],
    dailyReportFocusHints: [
      "Catat progres penyusunan konsep, prarencana, dan pengembangan rancangan.",
      "Laporkan hasil rapat koordinasi dengan pengguna anggaran atau tim teknis.",
      "Monitor kesiapan dokumen pengadaan/lelang dan jawaban aanwijzing.",
    ],
    checklistHints: [
      "Keselarasan program ruang/kebutuhan dengan pagu anggaran",
      "Kelengkapan dokumen prarencana hingga pengembangan desain",
      "Kesiapan paket dokumen lelang & spesifikasi",
    ],
    wbsTemplates: [
      {
        title: "Konsepsi Perancangan & Pengumpulan Data Sekunder",
        section: "A. Konsepsi & Data",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Prarencana & Pengembangan Rancangan",
        section: "B. Pengembangan Rancangan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Penyusunan Rancangan Detail & Dokumen Lelang",
        section: "C. Dokumen Pengadaan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pendampingan Penjelasan Pekerjaan & Pengawasan Berkala",
        section: "D. Pengawasan Berkala",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "manajemen-konstruksi",
    label: "Manajemen Konstruksi (MK)",
    shortLabel: "MK",
    group: "CONSULTANCY",
    groupLabel: "Jasa Konsultansi & Rekayasa",
    description:
      "Pengendalian biaya, mutu, waktu, koordinasi multi-kontraktor, evaluasi addendum/CCO, dan manajemen risiko proyek.",
    badgeTone: "indigo",
    aliases: [
      "manajemen konstruksi",
      "manajemen konstruksi (mk)",
      "mk",
      "construction management",
      "project management consultant",
    ],
    dailyReportFocusHints: [
      "Catat pengendalian deviasi jadwal Kurva-S & koordinasi antar paket/kontraktor.",
      "Laporkan evaluasi usulan CCO/Addendum, klaim termin, atau bottleneck pengadaan.",
      "Dokumentasikan hasil rapat koordinasi mingguan (PCM/SCM) & tindak lanjut.",
    ],
    checklistHints: [
      "Evaluasi deviasi jadwal & rencana percepatan (catch-up plan)",
      "Review kesesuaian klaim progres terhadap mutu & kontrak",
      "Koordinasi interface antar paket pekerjaan",
    ],
    wbsTemplates: [
      {
        title: "Koordinasi Pra-Konstruksi, Master Schedule & Risiko",
        section: "A. Inisiasi & Perencanaan MK",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pengendalian Biaya, Mutu, Waktu & Interface Paket",
        section: "B. Pengendalian Pelaksanaan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Evaluasi Addendum / CCO, Klaim Termin & Audit Mutu",
        section: "C. Administrasi Kontrak",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Komisioning Terpadu, Serah Terima & Close-out Report",
        section: "D. Komisioning & Close-out",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "survey-geoteknik",
    label: "Survey & Uji Tanah (Geoteknik)",
    shortLabel: "Survey / Geoteknik",
    group: "CONSULTANCY",
    groupLabel: "Jasa Konsultansi & Rekayasa",
    description:
      "Pengukuran topografi/bathimetri/drone, penyelidikan tanah (Sondir/CPT, Boring/SPT), uji laboratorium, dan rekomendasi pondasi.",
    badgeTone: "sky",
    aliases: [
      "survey & uji tanah (geoteknik)",
      "survey & uji tanah",
      "survey",
      "geoteknik",
      "uji tanah",
      "sondir",
      "boring",
      "topografi",
      "pemetaan",
    ],
    dailyReportFocusHints: [
      "Catat jumlah titik sondir (CPT), boring (SPT), atau luas area pengukuran hari ini.",
      "Laporkan kedalaman pengeboran, muka air tanah, dan pengambilan sampel tabung/DS.",
      "Cantumkan kondisi akses titik survey, kalibrasi alat ukur, dan progres uji lab.",
    ],
    checklistHints: [
      "Kalibrasi & kesiapan alat ukur (TS/RTK/Sondir/Mesin Bor)",
      "Penandaan koordinat titik bor/sondir & dokumentasi foto lapangan",
      "Pelabelan sampel tanah sebelum dikirim ke laboratorium",
    ],
    wbsTemplates: [
      {
        title: "Mobilisasi Tim & Orientasi Titik Survey / Pengukuran BM",
        section: "A. Mobilisasi & BM",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pengukuran Topografi / Pemetaan Situasi & GIS",
        section: "B. Pengukuran Lapangan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Penyelidikan Tanah Lapangan (Sondir CPT / Boring SPT)",
        section: "C. Penyelidikan Geoteknik",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pengujian Laboratorium Mekanika Tanah & Laporan Rekomendasi",
        section: "D. Uji Lab & Laporan Akhir",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },

  // =========================================================================
  // GROUP 2: PHYSICAL (Konstruksi Fisik & Spesialis)
  // =========================================================================
  {
    id: "bangunan-gedung",
    label: "Kontraktor Pelaksana (Bangunan Gedung)",
    shortLabel: "Bangunan Gedung",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Pembangunan gedung bertingkat maupun sederhana meliputi pekerjaan persiapan, pondasi, struktur beton/baja, arsitektur, dan MEP.",
    badgeTone: "emerald",
    aliases: [
      "kontraktor pelaksana (bangunan gedung)",
      "bangunan gedung",
      "konstruksi gedung",
      "gedung",
      "pembangunan gedung",
      "bangunan",
    ],
    dailyReportFocusHints: [
      "Catat item pekerjaan struktur/arsitektur/MEP yang dikerjakan beserta volume terpasang.",
      "Laporkan mutu beton/besi, pengiriman material utama, dan jumlah tukang/pekerja.",
      "Dokumentasikan area pengecoran, pembesian, pasangan dinding, atau finishing.",
    ],
    checklistHints: [
      "Kesesuaian pembesian, bekisting & slump beton sebelum cor",
      "Ketersediaan semen, besi, bata & material finishing di gudang proyek",
      "Kepatuhan APD kerja di ketinggian (scaffolding & safety harness)",
    ],
    wbsTemplates: [
      {
        title: "Pekerjaan Persiapan, Bowplank & Pembersihan Lahan",
        section: "A. Persiapan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Tanah & Pondasi / Struktur Bawah",
        section: "B. Struktur Bawah",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Struktur Atas (Kolom, Balok, Plat & Atap)",
        section: "C. Struktur Atas",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Arsitektur, Dinding, Lantai & Finishing",
        section: "D. Arsitektur & Finishing",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan MEP Gedung & Uji Fungsi",
        section: "E. MEP & Uji Fungsi",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "sipil-jalan-jembatan",
    label: "Konstruksi Sipil (Jalan & Jembatan)",
    shortLabel: "Jalan & Jembatan",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Pembangunan dan peningkatan jalan, drainase tepi, perkerasan aspal/beton rigid, abutment dan struktur jembatan.",
    badgeTone: "emerald",
    aliases: [
      "konstruksi sipil (jalan & jembatan)",
      "jalan & jembatan",
      "jalan dan jembatan",
      "konstruksi jalan",
      "pengaspalan",
      "perkerasan",
      "jembatan",
      "sipil",
    ],
    dailyReportFocusHints: [
      "Catat STA awal–akhir pekerjaan, lapis perkerasan (subbase/base/AC-WC/rigid), dan panjang/volume.",
      "Laporkan jumlah alat berat aktif (excavator, vibro roller, finisher, dump truck).",
      "Cantumkan hasil uji kepadatan/suhu aspal serta manajemen lalu lintas (traffic cone/flagman).",
    ],
    checklistHints: [
      "Stabilitas badan jalan, elevasi STA & kemiringan drainase",
      "Kondisi alat berat & ritase pengiriman agregat/aspal/beton",
      "Rambu pengamanan lalu lintas kerja jalan aktif",
    ],
    wbsTemplates: [
      {
        title: "Mobilisasi Alat, Pengukuran STA & Manajemen Lalu Lintas",
        section: "A. Persiapan & Traffic",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Tanah, Pemadatan Subgrade & Drainase Jalan",
        section: "B. Tanah & Drainase",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Lapis Pondasi Agregat (LPB / LPA)",
        section: "C. Lapis Pondasi",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Perkerasan Aspal / Beton Rigid & Struktur Jembatan",
        section: "D. Perkerasan & Struktur",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Marka Jalan, Bahu Jalan & Perlengkapan Keselamatan",
        section: "E. Pelengkap Jalan",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "sumber-daya-air-irigasi",
    label: "Sumber Daya Air / Irigasi",
    shortLabel: "SDA / Irigasi",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Rehabilitasi dan pembangunan jaringan irigasi, saluran pasangan batu/beton, pintu air, bendung, bronjong, dan olah lahan.",
    badgeTone: "teal",
    aliases: [
      "sumber daya air / irigasi",
      "sumber daya air",
      "irigasi",
      "rehabilitasi jaringan irigasi",
      "drt/sid rehabilitasi lahan sawah",
      "rehabilitasi lahan sawah",
      "olah lahan",
      "saluran irigasi",
      "drainase",
      "embung",
      "bendung",
      "bronjong",
    ],
    dailyReportFocusHints: [
      "Catat panjang/volume galian sedimen, pasangan batu mortar, plesteran, atau pemasangan pintu air.",
      "Laporkan debit/kondisi aliran air di saluran serta kendala akses langsir material ke lokasi.",
      "Dokumentasikan titik awal–akhir saluran dan dimensi profil pasangan yang dikerjakan.",
    ],
    checklistHints: [
      "Pengeringan/pengalihan aliran sementara sebelum pasangan batu",
      "Kesesuaian dimensi lebar atas/bawah saluran & tebal spesi",
      "Kesiapan batu belah, pasir, semen & langsir material lapangan",
    ],
    wbsTemplates: [
      {
        title: "Pengukuran Saluran, Uitzet & Pembersihan / Striping",
        section: "A. Persiapan & Pengukuran",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Galian Sedimen & Pembentukan Profil Saluran",
        section: "B. Pekerjaan Tanah & Galian",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Pasangan Batu / Saluran Beton & Plesteran",
        section: "C. Konstruksi Saluran",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pemasangan Pintu Air, Bronjong & Bangunan Pelengkap",
        section: "D. Bangunan Pelengkap",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "pekerjaan-tanah-cut-fill",
    label: "Pekerjaan Tanah / Cut & Fill",
    shortLabel: "Cut & Fill",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Land clearing, galian dan timbunan tanah (cut & fill), pemadatan berlapis, stabilisasi lereng, serta dinding penahan tanah.",
    badgeTone: "amber",
    aliases: [
      "pekerjaan tanah / cut & fill",
      "pekerjaan tanah",
      "cut & fill",
      "cut and fill",
      "pematangan lahan",
      "timbunan",
      "galian",
      "dpt",
    ],
    dailyReportFocusHints: [
      "Catat estimasi volume galian/timbunan (m3) dan jumlah ritase dump truck per hari.",
      "Laporkan elevasi cut/fill tercapai, pemadatan per layer, dan kondisi kadar air tanah.",
      "Cantumkan jam operasional alat berat (HM excavator, dozer, vibro) & status cuaca.",
    ],
    checklistHints: [
      "Pemeriksaan patok elevasi desain & batas clearing area",
      "Pemadatan bertahap per layer & sistem drainase sementara",
      "Keamanan lereng galian dan jalur manuver alat berat",
    ],
    wbsTemplates: [
      {
        title: "Survey Patok Batas, Elevasi Awal & Land Clearing",
        section: "A. Persiapan Lahan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Galian (Cut) & Pembuangan Tanah",
        section: "B. Galian Tanah",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Timbunan (Fill), Perataan & Pemadatan",
        section: "C. Timbunan & Pemadatan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pembentukan Lereng, Drainase Sementara & Finishing Elevasi",
        section: "D. Proteksi & Finishing",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "mep",
    label: "MEP (Mekanikal, Elektrikal & Plumbing)",
    shortLabel: "MEP",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Instalasi sistem kelistrikan, panel LVMDP/SDP, tata udara (HVAC), plumbing, pemadam kebakaran/hydrant, serta testing & commissioning.",
    badgeTone: "amber",
    aliases: [
      "mep (mekanikal, elektrikal & plumbing)",
      "mep",
      "mekanikal",
      "elektrikal",
      "plumbing",
      "hvac",
      "instalasi listrik",
      "fire alarm",
      "hydrant",
    ],
    dailyReportFocusHints: [
      "Catat jalur instalasi pipa/kabel/ducting, titik panel/unit terpasang, dan zona lantai.",
      "Laporkan hasil pengetesan parsial (megger test, hydrotest pipa, pressure test).",
      "Cantumkan koordinasi jalur instalasi dengan pekerjaan sipil/plafon.",
    ],
    checklistHints: [
      "Kesesuaian spesifikasi kabel, pipa, MCB & kapasitas unit HVAC",
      "Hasil uji tekan (hydrotest) & uji tahanan isolasi (megger)",
      "Lock-out Tag-out (LOTO) & keselamatan kerja kelistrikan",
    ],
    wbsTemplates: [
      {
        title: "Approval Material, Shop Drawing & Marking Jalur Instalasi",
        section: "A. Persiapan & Marking",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Instalasi Elektrikal, Panel Daya, Penerangan & Grounding",
        section: "B. Elektrikal",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Instalasi Plumbing Air Bersih/Kotor & Pemadam Kebakaran",
        section: "C. Plumbing & Fire",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Instalasi Tata Udara (HVAC) & Sistem Mekanikal",
        section: "D. Mekanikal & HVAC",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Testing & Commissioning Menyeluruh",
        section: "E. Testing & Commissioning",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "interior-lanskap",
    label: "Interior & Lanskap",
    shortLabel: "Interior & Lanskap",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Pekerjaan partisi, plafon, lantai, furniture built-in, tata cahaya interior, hardscape taman, softscape tanaman, dan irigasi taman.",
    badgeTone: "teal",
    aliases: [
      "interior & lanskap",
      "interior",
      "lanskap",
      "landscape",
      "fit out",
      "fit-out",
      "taman",
      "pertamanan",
    ],
    dailyReportFocusHints: [
      "Catat area ruangan/zona taman yang dikerjakan (partisi, plafon, HPL, paving, penanaman).",
      "Laporkan progres fabrikasi furniture di workshop maupun instalasi on-site.",
      "Dokumentasikan kerapian sambungan finishing dan kondisi kesehatan tanaman lanskap.",
    ],
    checklistHints: [
      "Kesesuaian warna/kode material finishing & mockup furniture",
      "Proteksi area selesai agar tidak tergores saat pekerjaan lanjutan",
      "Pemeliharaan awal tanaman & fungsi drainase taman",
    ],
    wbsTemplates: [
      {
        title: "Pengukuran Ulang Lapangan, Mockup Material & Persiapan Area",
        section: "A. Persiapan & Mockup",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Partisi, Plafon, Lantai & Dinding Interior",
        section: "B. Pekerjaan Sipil Interior",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Fabrikasi & Pemasangan Furniture Built-in / Tata Cahaya",
        section: "C. Furniture & Lighting",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Hardscape, Softscape & Pembersihan Akhir",
        section: "D. Lanskap & Finishing",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "renovasi-pemeliharaan",
    label: "Renovasi / Pemeliharaan",
    shortLabel: "Renovasi",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Pembongkaran selektif, perbaikan struktur/atap/kebocoran, peremajaan finishing, serta pemeliharaan gedung atau fasilitas eksisting.",
    badgeTone: "amber",
    aliases: [
      "renovasi / pemeliharaan",
      "renovasi",
      "pemeliharaan",
      "perbaikan",
      "maintenance",
      "rehab gedung",
    ],
    dailyReportFocusHints: [
      "Catat area bongkaran, perbaikan kebocoran/retak, atau penggantian elemen rusak.",
      "Laporkan koordinasi operasional dengan penghuni/pengguna fasilitas eksisting.",
      "Pastikan pembersihan puing harian serta keamanan proteksi area aktif terjaga.",
    ],
    checklistHints: [
      "Pengamanan area eksisting & jalur evakuasi pengguna gedung",
      "Pembuangan puing bongkaran terjadwal",
      "Uji kedap air / fungsi komponen setelah perbaikan",
    ],
    wbsTemplates: [
      {
        title: "Proteksi Area Eksisting & Pembongkaran Terpilih",
        section: "A. Proteksi & Bongkaran",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Perbaikan Elemen Struktur, Atap & Kebocoran",
        section: "B. Perbaikan Utama",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Peremajaan Finishing, Pengecatan & Penggantian Utilitas",
        section: "C. Peremajaan & Utilitas",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pembersihan Akhir, Uji Fungsi & Serah Terima",
        section: "D. Uji Fungsi & Serah Terima",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "epc-industri",
    label: "EPC / Industri",
    shortLabel: "EPC / Industri",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Proyek terpadu Engineering, Procurement, dan Construction untuk fasilitas industri, utilitas pabrik, pipa proses, atau instalasi energi.",
    badgeTone: "amber",
    aliases: [
      "epc / industri",
      "epc",
      "industri",
      "industrial",
      "pabrik",
      "plant",
      "engineering procurement construction",
    ],
    dailyReportFocusHints: [
      "Catat kemajuan lintas fase: dokumen engineering, status pengadaan equipment, dan konstruksi site.",
      "Laporkan inspeksi QA/QC pengelasan, NDT, instalasi mesin proses, serta permit-to-work (PTW).",
      "Monitor jadwal kedatangan long-lead equipment dan kesiapan pre-commissioning.",
    ],
    checklistHints: [
      "Permit to Work (PTW), hot work & confined space clearance",
      "Dokumentasi QA/QC welding map, NDT & material certificate",
      "Kesiapan punch list pre-commissioning & start-up",
    ],
    wbsTemplates: [
      {
        title: "Detail Engineering & Persetujuan Dokumen Teknis (IFC)",
        section: "A. Engineering",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Procurement, Fabrikasi & Pengiriman Equipment Utama",
        section: "B. Procurement",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Konstruksi Sipil, Struktur, Piping & Erection Equipment",
        section: "C. Construction",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pre-Commissioning, Commissioning & Performance Test",
        section: "D. Commissioning",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "baja-struktur-khusus",
    label: "Pekerjaan Baja & Struktur Khusus",
    shortLabel: "Baja & Struktur",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Fabrikasi dan ereksi struktur baja berat/WF, rangka atap bentang lebar, gudang/hangar, jembatan baja, serta perkuatan struktur.",
    badgeTone: "emerald",
    aliases: [
      "pekerjaan baja & struktur khusus",
      "pekerjaan baja",
      "struktur baja",
      "konstruksi baja",
      "baja",
      "erection baja",
      "fabrikasi baja",
    ],
    dailyReportFocusHints: [
      "Catat tonase/jumlah batang baja yang difabrikasi di workshop maupun di-erect di lapangan.",
      "Laporkan hasil pemeriksaan sambungan baut torsi (torque check), pengelasan, dan pengecatan anti-karat.",
      "Cantumkan penggunaan crane/hoist, kecepatan angin, dan pengamanan kerja ketinggian.",
    ],
    checklistHints: [
      "Kesesuaian profil baja, ketebalan cat primer/finish & sertifikat mill",
      "Pengecekan torsi baut mutu tinggi & kualitas las",
      "Lifting plan crane & full body harness pekerja erection",
    ],
    wbsTemplates: [
      {
        title: "Shop Drawing Fabrikasi, Pengadaan Baja & Anchor Bolt",
        section: "A. Persiapan & Material",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Fabrikasi Workshop, Sandblasting & Coating Primer",
        section: "B. Fabrikasi Workshop",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Erection Kolom, Rafter, Gording & Pengencangan Baut",
        section: "C. Erection Lapangan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Penutup Atap/Cladding, Torque Check & Touch-up Cat",
        section: "D. Penutup & QC Akhir",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },
  {
    id: "infrastruktur-jaringan-utilitas",
    label: "Infrastruktur Jaringan / Utilitas",
    shortLabel: "Jaringan / Utilitas",
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Pemasangan jaringan perpipaan air bersih/limbah (PDAM/SPAM), ducting utilitas bawah tanah, jaringan kabel/fiber optik, dan penerangan jalan.",
    badgeTone: "teal",
    aliases: [
      "infrastruktur jaringan / utilitas",
      "infrastruktur jaringan",
      "jaringan utilitas",
      "utilitas",
      "perpipaan",
      "pipa hdpe",
      "spam",
      "pdam",
      "fiber optik",
      "pju",
    ],
    dailyReportFocusHints: [
      "Catat panjang galian trenching, pipa/kabel tergelar (meter), jumlah sambungan/box kontrol.",
      "Laporkan hasil pressure test/leak test jalur serta pekerjaan rekondisi permukaan galian.",
      "Cantumkan koordinasi izin galian jalan dan deteksi utilitas eksisting di lapangan.",
    ],
    checklistHints: [
      "Kedalaman galian, lapisan pasir urug & warning tape utilitas",
      "Kualitas penyambungan butt fusion / elektrofusion / splicing",
      "Pengembalian perkerasan jalan/trotoar setelah penimbunan",
    ],
    wbsTemplates: [
      {
        title: "Survey Jalur Utilitas Eksisting, Marking & Izin Galian",
        section: "A. Survey & Perizinan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pekerjaan Galian Jalur (Trenching) & Bedding Pasir",
        section: "B. Galian & Bedding",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pemasangan Pipa / Kabel / Bak Kontrol & Penyambungan",
        section: "C. Instalasi Jaringan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pengetesan Jalur (Hydrotest/OTDR) & Reinstatement Permukaan",
        section: "D. Uji Jaringan & Rekondisi",
        unit: "%",
        defaultVolume: 100,
      },
    ],
  },

  // =========================================================================
  // FALLBACK / CUSTOM
  // =========================================================================
  {
    id: "lainnya",
    label: CUSTOM_WORK_TYPE_LABEL,
    shortLabel: CUSTOM_WORK_TYPE_LABEL,
    group: "PHYSICAL",
    groupLabel: "Konstruksi Fisik & Spesialis",
    description:
      "Jenis pekerjaan konstruksi atau rekayasa khusus di luar kategori standar; dapat diisi dengan deskripsi kustom sesuai kontrak.",
    badgeTone: "slate",
    aliases: ["lainnya", "custom", "khusus", "umum"],
    dailyReportFocusHints: [
      "Catat ringkasan aktivitas utama, pencapaian volume/deliverable hari ini, dan tenaga kerja.",
      "Laporkan penggunaan peralatan, kondisi cuaca, K3, serta kendala lapangan bila ada.",
    ],
    checklistHints: [
      "Kesesuaian pelaksanaan dengan lingkup kontrak/KAK",
      "Kelengkapan dokumentasi foto harian sebelum dan sesudah kerja",
      "Catatan K3 & keselamatan personel lapangan",
    ],
    wbsTemplates: [
      {
        title: "Persiapan, Mobilisasi & Koordinasi Awal",
        section: "A. Persiapan",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pelaksanaan Pekerjaan Utama",
        section: "B. Pelaksanaan Utama",
        unit: "%",
        defaultVolume: 100,
      },
      {
        title: "Pemeriksaan Mutu, Finishing & Serah Terima",
        section: "C. Penyelesaian",
        unit: "%",
        defaultVolume: 100,
      },
    ],
    isCustomFallback: true,
  },
] as const;

export interface ProjectWorkTypeGroupBucket {
  group: ProjectWorkTypeGroup;
  label: string;
  items: ProjectWorkTypeDefinition[];
}

export const PROJECT_WORK_TYPE_GROUPS: ProjectWorkTypeGroupBucket[] = [
  {
    group: "CONSULTANCY",
    label: "Jasa Konsultansi & Rekayasa",
    items: PROJECT_WORK_TYPES.filter((item) => item.group === "CONSULTANCY"),
  },
  {
    group: "PHYSICAL",
    label: "Konstruksi Fisik & Spesialis",
    items: PROJECT_WORK_TYPES.filter((item) => item.group === "PHYSICAL"),
  },
];

const CONSULTANCY_FALLBACK_REGEX =
  /\b(ded|detail\s+engineering|konsultan|pengawas|supervisi|perencana|manajemen\s+konstruksi|mk|survey|geoteknik|uji\s+tanah|sondir|boring|topografi|feasibility|studi\s+kelayakan)\b/i;

const PHYSICAL_IRRIGATION_REGEX =
  /\b(drt\/?sid|rehabilitasi\s+(?:lahan|jaringan)\s+sawah|olah\s+lahan|irigasi|saluran|sedimen|bronjong|pintu\s+air|bendung|embung)\b/i;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolves any stored `Project.jenisPekerjaan` string (canonical label, alias,
 * legacy DRT string, or custom text) to a structured `ProjectWorkTypeDefinition`.
 */
export function resolveProjectWorkType(
  jenisPekerjaan?: string | null,
): ProjectWorkTypeDefinition {
  const fallback = PROJECT_WORK_TYPES[PROJECT_WORK_TYPES.length - 1]!;
  if (!jenisPekerjaan || !jenisPekerjaan.trim()) {
    return fallback;
  }

  const normalized = normalizeText(jenisPekerjaan);

  // 1. Exact label match (case-insensitive)
  const exactLabel = PROJECT_WORK_TYPES.find(
    (item) => normalizeText(item.label) === normalized,
  );
  if (exactLabel) return exactLabel;

  // 2. Exact id or alias match
  const exactAlias = PROJECT_WORK_TYPES.find(
    (item) =>
      item.id === normalized ||
      item.aliases.some((alias) => normalizeText(alias) === normalized),
  );
  if (exactAlias) return exactAlias;

  // 3. Explicit legacy physical irrigation strings (e.g. "DRT/SID Rehabilitasi Lahan Sawah")
  //    Must run before consultancy keyword matching so "SID" in "DRT/SID" isn't treated as consultancy.
  if (PHYSICAL_IRRIGATION_REGEX.test(normalized)) {
    return (
      PROJECT_WORK_TYPES.find((item) => item.id === "sumber-daya-air-irigasi") ??
      fallback
    );
  }

  // 4. Substring match against known aliases (longest alias wins for accuracy)
  let bestMatch: { def: ProjectWorkTypeDefinition; score: number } | null = null;
  for (const item of PROJECT_WORK_TYPES) {
    if (item.isCustomFallback) continue;
    for (const candidate of [item.label, item.shortLabel, ...item.aliases]) {
      const c = normalizeText(candidate);
      if (c.length < 3) continue;
      if (normalized.includes(c) || c.includes(normalized)) {
        const score = c.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { def: item, score };
        }
      }
    }
  }
  if (bestMatch) return bestMatch.def;

  // 5. Fallback consultancy heuristic for custom consultancy titles
  if (CONSULTANCY_FALLBACK_REGEX.test(normalized)) {
    return {
      ...PROJECT_WORK_TYPES.find((item) => item.id === "ded")!,
      id: "konsultansi-kustom",
      label: jenisPekerjaan.trim(),
      shortLabel: jenisPekerjaan.trim(),
      group: "CONSULTANCY",
      groupLabel: "Jasa Konsultansi & Rekayasa",
      isCustomFallback: true,
    };
  }

  return fallback;
}

export function getWorkTypeGroup(
  jenisPekerjaan?: string | null,
): ProjectWorkTypeGroup {
  return resolveProjectWorkType(jenisPekerjaan).group;
}

export function isConsultancyWorkType(jenisPekerjaan?: string | null): boolean {
  return getWorkTypeGroup(jenisPekerjaan) === "CONSULTANCY";
}

export function isPhysicalWorkType(jenisPekerjaan?: string | null): boolean {
  return getWorkTypeGroup(jenisPekerjaan) === "PHYSICAL";
}

export function formatWorkTypeLabel(jenisPekerjaan?: string | null): string {
  const trimmed = jenisPekerjaan?.trim();
  if (!trimmed) return "Konstruksi Umum";
  const resolved = resolveProjectWorkType(trimmed);
  if (resolved.isCustomFallback) return trimmed;
  return resolved.label;
}

export function formatWorkTypeBadge(jenisPekerjaan?: string | null): {
  label: string;
  shortLabel: string;
  group: ProjectWorkTypeGroup;
  groupLabel: string;
  groupShortLabel: "Konsultansi" | "Fisik";
  tone: WorkTypeBadgeTone;
  isCustom: boolean;
} {
  const trimmed = jenisPekerjaan?.trim() ?? "";
  const resolved = resolveProjectWorkType(trimmed);
  const isCustom = !trimmed || resolved.isCustomFallback === true;
  return {
    label: trimmed || "Konstruksi Umum",
    shortLabel:
      isCustom && trimmed
        ? trimmed.length > 26
          ? `${trimmed.slice(0, 24)}…`
          : trimmed
        : trimmed
          ? resolved.shortLabel
          : "Konstruksi Umum",
    group: resolved.group,
    groupLabel: resolved.groupLabel,
    groupShortLabel: resolved.group === "CONSULTANCY" ? "Konsultansi" : "Fisik",
    tone: resolved.badgeTone,
    isCustom,
  };
}

export function getWorkTypeChecklistTemplates(
  jenisPekerjaan?: string | null,
): WorkTypeTemplateItem[] {
  return resolveProjectWorkType(jenisPekerjaan).wbsTemplates.map((item) => ({
    ...item,
  }));
}

export function getDailyReportFocusHints(jenisPekerjaan?: string | null): {
  categoryLabel: string;
  isConsultancy: boolean;
  focusHints: string[];
  checklistHints: string[];
} {
  const resolved = resolveProjectWorkType(jenisPekerjaan);
  return {
    categoryLabel:
      jenisPekerjaan?.trim() && resolved.isCustomFallback
        ? jenisPekerjaan.trim()
        : resolved.label,
    isConsultancy: resolved.group === "CONSULTANCY",
    focusHints: [...resolved.dailyReportFocusHints],
    checklistHints: [...resolved.checklistHints],
  };
}
