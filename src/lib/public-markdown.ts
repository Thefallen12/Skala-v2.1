import {
  COMPANY_PROFILE,
  SERVICE_PACKAGES,
  SITE_URL,
  absoluteUrl,
  getPublicPageMeta,
} from "@/lib/site-config";

const FOOTER_LINKS_MD = [
  `- [Beranda](${absoluteUrl("/")})`,
  `- [Tentang Perusahaan](${absoluteUrl("/about")})`,
  `- [Harga & Paket Layanan](${absoluteUrl("/pricing")})`,
  `- [Kontak](${absoluteUrl("/contact")})`,
  `- [Syarat dan Ketentuan](${absoluteUrl("/terms")})`,
  `- [Kebijakan Privasi](${absoluteUrl("/privacy")})`,
  `- [Verifikasi Dokumen QR](${absoluteUrl("/verify")})`,
  `- [Portal Masuk Staf](${absoluteUrl("/auth/login")})`,
  `- [llms.txt](${absoluteUrl("/llms.txt")})`,
  `- [llms-full.txt](${absoluteUrl("/llms-full.txt")})`,
  `- [MCP Server Card](${absoluteUrl("/.well-known/mcp/server-card.json")})`,
  `- [API Catalog (RFC 9727)](${absoluteUrl("/.well-known/api-catalog")})`,
].join("\n");

const PRICING_TABLE_MD = [
  "| Paket Layanan | Kategori | Harga (IDR) | Keterangan |",
  "| --- | --- | --- | --- |",
  ...SERVICE_PACKAGES.map(
    (pkg) =>
      `| ${pkg.name} | ${pkg.category} | ${pkg.priceDisplay} ${pkg.billingUnit} | ${pkg.description} |`,
  ),
].join("\n");

const MARKDOWN_PAGES: Record<string, string> = {
  "/": [
    `# ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/")}`,
    `**Tagline**: ${COMPANY_PROFILE.tagline} — ${COMPANY_PROFILE.motto}`,
    "",
    "## Layanan & Modul Operasional",
    "",
    "1. **Manajemen Proyek & Kurva-S Harian**: Pengelolaan RAB, jadwal kerja lapangan, laporan progres harian tim lapangan, dan pemantauan realisasi konstruksi sipil & rehabilitasi irigasi.",
    "2. **Logistik, Pengadaan Material Alam & Sewa**: Alur pengajuan tiket terstruktur dari tim lapangan ke logistik hingga pembayaran keuangan, Purchase Order, surat jalan armada, serta sewa rumah/kendaraan proyek.",
    "3. **Keuangan & Persetujuan Direksi**: Verifikasi tagihan vendor, arus kas proyek, pembayaran berjenjang, serta pembukuan realisasi terintegrasi.",
    "4. **Verifikasi Dokumen Digital QR**: Validasi keaslian Purchase Order, Surat Jalan, dan kontrak konstruksi melalui tautan publik `/verify/{kode}`.",
    "",
    "## Harga & Paket Layanan (Pricing)",
    "",
    PRICING_TABLE_MD,
    "",
    "## Akses Portal & Aplikasi",
    "",
    `- **Masuk Portal Web**: ${absoluteUrl("/auth/login")}`,
    `- **Unduh Aplikasi Android (APK ${COMPANY_PROFILE.apk.version})**: ${absoluteUrl(COMPANY_PROFILE.apk.href)}`,
    `- **Verifikasi Dokumen QR**: \`${SITE_URL}/verify/{kode}\``,
    "",
    "## Kontak Resmi",
    "",
    `- **Email**: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email})`,
    `- **Telepon**: [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
    `- **Alamat**: ${COMPANY_PROFILE.addressDisplay}`,
    `- **Jam Operasional**: ${COMPANY_PROFILE.openingHours}`,
    "",
    "## Navigasi Publik & Penemuan Agen",
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/about": [
    `# Tentang ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/about").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/about")}`,
    "",
    "## Profil Perusahaan",
    "",
    `${COMPANY_PROFILE.legalName} bergerak di bidang jasa teknik konstruksi sipil, rehabilitasi jaringan irigasi, serta pengelolaan rantai pasok dan sistem ERP proyek lapangan yang berbasis di ${COMPANY_PROFILE.addressDisplay}.`,
    "",
    "## Fokus Tata Kelola Operasional",
    "",
    "- **Satu Alur Searah**: Pengajuan kebutuhan proyek oleh tim lapangan diverifikasi secara berjenjang oleh koordinator, logistik, direksi, hingga bagian keuangan tanpa duplikasi data.",
    "- **Akurasi Realisasi Biaya & Progres**: Setiap pengeluaran material, sewa aset proyek, dan laporan progres harian terhubung langsung ke objek proyek terkait.",
    "- **Transparansi Dokumen**: Setiap Purchase Order dan Surat Jalan dilengkapi QR code validasi keaslian secara daring.",
    "",
    "## Kontak & Tautan Terkait",
    "",
    `- **Email**: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email})`,
    `- **Telepon**: [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/pricing": [
    `# Harga & Paket Layanan — ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/pricing").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/pricing")}`,
    "",
    "## Daftar Harga Resmi (IDR)",
    "",
    PRICING_TABLE_MD,
    "",
    "## Rincian Fitur per Paket",
    "",
    ...SERVICE_PACKAGES.flatMap((pkg) => [
      `### ${pkg.name} — ${pkg.priceDisplay} (${pkg.billingUnit})`,
      "",
      pkg.description,
      "",
      ...pkg.features.map((feat) => `- ${feat}`),
      "",
    ]),
    "## Hubungi Penjualan & Konsultasi",
    "",
    `- **Email**: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email})`,
    `- **Telepon**: [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/contact": [
    `# Kontak Resmi ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/contact").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/contact")}`,
    "",
    "## Saluran Komunikasi",
    "",
    "| Kanal | Detail |",
    "| --- | --- |",
    `| Email Resmi | [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email}) |`,
    `| Telepon / WhatsApp Kantor | [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone}) |`,
    `| Alamat Operasional | ${COMPANY_PROFILE.addressDisplay} |`,
    `| Jam Layanan | ${COMPANY_PROFILE.openingHours} |`,
    "",
    "## Verifikasi Dokumen & Dukungan Teknis",
    "",
    `- Untuk mengecek keaslian dokumen Purchase Order atau Surat Jalan, kunjungi \`${SITE_URL}/verify/{kode}\`.`,
    `- Untuk staf dan koordinator proyek yang memiliki akun aktif, silakan masuk melalui [Portal Masuk](${absoluteUrl("/auth/login")}).`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/terms": [
    `# Syarat dan Ketentuan Layanan — ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/terms").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/terms")}`,
    "",
    "## 1. Ruang Lingkup Layanan",
    "",
    `Platform **${SITE_URL}** dan aplikasi Android resmi (${COMPANY_PROFILE.apk.fileName}) disediakan oleh ${COMPANY_PROFILE.legalName} untuk pengelolaan proyek konstruksi, pengadaan logistik, administrasi keuangan, serta layanan publik verifikasi keaslian dokumen perusahaan.`,
    "",
    "## 2. Hak Akses & Keamanan Akun",
    "",
    "- Modul internal ERP (/apps/*, /dashboard/*) hanya dapat diakses oleh personel berwenang sesuai peran yang ditetapkan administrator.",
    "- Pengguna bertanggung jawab menjaga kerahasiaan kredensial masing-masing dan tidak menyalahgunakan akses data proyek maupun keuangan.",
    "",
    "## 3. Kebijakan Crawler & Penggunaan Agen AI",
    "",
    "- Halaman publik (/, /about, /pricing, /contact, /terms, /privacy, /verify) serta endpoint penemuan (/llms.txt, /.well-known/mcp/server-card.json) diperbolehkan untuk pengindeksan pencarian dan grounding AI secara real-time (`search=yes, ai-input=yes`).",
    "- Konten situs tidak diizinkan untuk pelatihan ulang model AI tanpa persetujuan tertulis (`ai-train=no`).",
    "",
    "## 4. Kontak Pertanyaan Hukum",
    "",
    `Hubungi [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email}) atau [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone}) untuk pertanyaan mengenai ketentuan ini.`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/privacy": [
    `# Kebijakan Privasi — ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${getPublicPageMeta("/privacy").description}`,
    "",
    `**Canonical URL**: ${absoluteUrl("/privacy")}`,
    "",
    "## 1. Data yang Diproses",
    "",
    "- **Data Akun & Otorisasi**: Nama pengguna, alamat email dinas, peran akses, serta log autentikasi sesi untuk menjaga keamanan sistem.",
    "- **Data Operasional Proyek**: Catatan progres harian, dokumen PO/Invoice/Surat Jalan, koordinat survei lapangan atau perjalanan armada yang diinput oleh staf berwenang.",
    "",
    "## 2. Penggunaan & Pembatasan Akses",
    "",
    "Data operasional hanya digunakan untuk keperluan tata kelola proyek, audit internal, pembayaran vendor, dan kepatuhan pelaporan resmi perusahaan. Endpoint publik seperti beranda, halaman informasi, serta verifikasi QR hanya menampilkan informasi yang memang ditujukan untuk publik.",
    "",
    "## 3. Kontak Privasi Data",
    "",
    `Permintaan koreksi data atau pertanyaan privasi dapat dikirimkan ke [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email}) atau [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone}).`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/verify": [
    `# Verifikasi Dokumen Digital QR — ${COMPANY_PROFILE.legalName}`,
    "",
    `> Portal publik untuk memeriksa keaslian Purchase Order, Invoice, Surat Jalan, dan Kontrak Kerja ${COMPANY_PROFILE.legalName}.`,
    "",
    `- **Format URL Verifikasi**: \`${SITE_URL}/verify/{kode}\``,
    `- **Gratis tanpa login**: Ya (Rp 0)`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),

  "/auth/login": [
    `# Masuk ke Portal ${COMPANY_PROFILE.legalName}`,
    "",
    `> Halaman autentikasi staf dan manajemen ${COMPANY_PROFILE.legalName}.`,
    "",
    `- **URL Masuk**: ${absoluteUrl("/auth/login")}`,
    `- **Beranda Informasi Perusahaan**: ${absoluteUrl("/")}`,
    `- **Unduh APK Android (${COMPANY_PROFILE.apk.version})**: ${absoluteUrl(COMPANY_PROFILE.apk.href)}`,
    `- **Kontak Bantuan**: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email}) · [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
    "",
    FOOTER_LINKS_MD,
  ].join("\n"),
};

export const PUBLIC_MARKDOWN_PATHS = Object.keys(MARKDOWN_PAGES);

export function getPublicMarkdownForPath(pathname: string): string | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return MARKDOWN_PAGES[normalized] ?? null;
}

export function getAllPublicMarkdownCombined(): string {
  return PUBLIC_MARKDOWN_PATHS.map((path) => MARKDOWN_PAGES[path]).join("\n\n---\n\n");
}

export function estimateMarkdownTokens(markdown: string): number {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

export function createMarkdownResponse(pathname: string): Response | null {
  const markdown = getPublicMarkdownForPath(pathname);
  if (!markdown) return null;

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "X-Markdown-Tokens": String(estimateMarkdownTokens(markdown)),
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      Link: `<${absoluteUrl("/llms.txt")}>; rel="service-doc"; type="text/plain", <${absoluteUrl("/.well-known/mcp/server-card.json")}>; rel="service-desc"; type="application/json", <${absoluteUrl("/sitemap.xml")}>; rel="sitemap"; type="application/xml"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
