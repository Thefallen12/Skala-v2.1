import {
  COMPANY_PROFILE,
  SERVICE_PACKAGES,
  SITE_URL,
  absoluteUrl,
  getPublicPageMeta,
} from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const homeMeta = getPublicPageMeta("/");
  const llmsBody = [
    `# ${COMPANY_PROFILE.legalName}`,
    "",
    `> ${COMPANY_PROFILE.description} (${COMPANY_PROFILE.englishSummary})`,
    "",
    `Platform resmi **${COMPANY_PROFILE.legalName}** di [${SITE_URL}](${SITE_URL}/) mendukung pengawasan proyek konstruksi sipil, pengadaan material alam dan logistik, persetujuan direksi, keuangan proyek, serta verifikasi keaslian dokumen digital berbasis QR.`,
    "",
    "Semua halaman publik mendukung negosiasi konten Markdown (`Accept: text/markdown`).",
    "",
    "## Halaman Utama",
    "",
    `- [${homeMeta.title}](${absoluteUrl("/")}): Profil perusahaan, ringkasan layanan konstruksi & logistik, kontak resmi, harga paket, serta alat verifikasi dokumen.`,
    `- [Tentang Perusahaan](${absoluteUrl("/about")}): Latar belakang, fokus layanan teknik & irigasi, serta arsitektur tata kelola operasional.`,
    `- [Harga & Paket Layanan](${absoluteUrl("/pricing")}): Daftar harga paket (${SERVICE_PACKAGES.map((p) => `${p.name}: ${p.priceDisplay} ${p.billingUnit}`).join("; ")}).`,
    `- [Kontak Resmi](${absoluteUrl("/contact")}): Email resmi (${COMPANY_PROFILE.email}), telepon (${COMPANY_PROFILE.telephoneDisplay}), alamat kantor (${COMPANY_PROFILE.addressDisplay}), dan jam layanan.`,
    `- [Verifikasi Dokumen QR](${absoluteUrl("/verify")}): Portal pengecekan keaslian PO, Invoice, Surat Jalan, dan kontrak resmi tanpa login.`,
    "",
    "## Dokumen Legal & Tata Kelola",
    "",
    `- [Syarat dan Ketentuan](${absoluteUrl("/terms")}): Ketentuan penggunaan layanan web, aplikasi Android, hak akses staf, dan sinyal penggunaan konten.`,
    `- [Kebijakan Privasi](${absoluteUrl("/privacy")}): Penjelasan pengelolaan data operasional proyek dan autentikasi pengguna.`,
    `- [Panduan Autentikasi Agen (auth.md)](${absoluteUrl("/auth.md")}): Mekanisme akses publik vs autentikasi internal untuk agen otomatis.`,
    "",
    "## Integrasi Agen, API & Penemuan Standar",
    "",
    `- [Dokumentasi Markdown Lengkap (llms-full.txt)](${absoluteUrl("/llms-full.txt")}): Gabungan seluruh dokumentasi publik dalam satu berkas Markdown.`,
    `- [API Catalog (RFC 9727)](${absoluteUrl("/.well-known/api-catalog")}): Linkset JSON penemuan API publik, OpenAPI 3.1.0, dan status kesehatan.`,
    `- [OpenAPI 3.1.0 Specification](${absoluteUrl("/api/openapi.json")}): Spesifikasi skema endpoint publik.`,
    `- [MCP Server Card (SEP-1649)](${absoluteUrl("/.well-known/mcp/server-card.json")}): Metadata server MCP publik untuk penemuan kemampuan & endpoint.`,
    `- [Endpoint MCP Publik (Streamable HTTP)](${absoluteUrl("/api/mcp")}): Endpoint JSON-RPC read-only untuk profil perusahaan dan pembuat tautan verifikasi dokumen.`,
    `- [A2A Agent Card](${absoluteUrl("/.well-known/agent-card.json")}): Kartu agen Agent2Agent Protocol untuk penemuan kemampuan & skill.`,
    `- [Agent Skills Index](${absoluteUrl("/.well-known/agent-skills/index.json")}): Indeks Agent Skills Discovery RFC v0.2.0 beserta digest SHA-256.`,
    `- [AI Capability Catalog](${absoluteUrl("/.well-known/ai-catalog.json")}): Manifes ARD endpoint penelusuran & alat publik.`,
    `- [Portal Masuk Staf](${absoluteUrl("/auth/login")}): Autentikasi pengguna internal perusahaan.`,
    `- [Aplikasi Android Resmi (APK v${COMPANY_PROFILE.apk.version})](${absoluteUrl(COMPANY_PROFILE.apk.href)}): Unduhan paket Android operasional lapangan.`,
    "",
    "## Kontak Mesin & Manusia",
    "",
    `- Email: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email})`,
    `- Telepon: [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
    `- Alamat: ${COMPANY_PROFILE.addressDisplay}`,
    `- Kebijakan Crawler: ${absoluteUrl("/robots.txt")} (Content-Signal: search=yes, ai-input=yes, ai-train=no)`,
  ].join("\n");

  return new Response(llmsBody, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
