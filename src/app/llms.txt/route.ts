import { COMPANY_PROFILE, PUBLIC_PAGES, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
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
    `- [${PUBLIC_PAGES[0].title}](${absoluteUrl("/")}): Profil perusahaan, ringkasan layanan konstruksi & logistik, kontak resmi, serta alat verifikasi dokumen.`,
    `- [Tentang Perusahaan](${absoluteUrl("/about")}): Latar belakang, fokus layanan teknik & irigasi, serta arsitektur tata kelola operasional.`,
    `- [Kontak Resmi](${absoluteUrl("/contact")}): Email resmi (${COMPANY_PROFILE.email}), telepon (${COMPANY_PROFILE.telephoneDisplay}), alamat kantor (${COMPANY_PROFILE.addressDisplay}), dan jam layanan.`,
    "",
    "## Dokumen Legal & Tata Kelola",
    "",
    `- [Syarat dan Ketentuan](${absoluteUrl("/terms")}): Ketentuan penggunaan layanan web, aplikasi Android, hak akses staf, dan sinyal penggunaan konten.`,
    `- [Kebijakan Privasi](${absoluteUrl("/privacy")}): Penjelasan pengelolaan data operasional proyek dan autentikasi pengguna.`,
    "",
    "## Integrasi Agen, API Publik & Aplikasi",
    "",
    `- [MCP Server Card (SEP-1649)](${absoluteUrl("/.well-known/mcp/server-card.json")}): Metadata server MCP publik untuk penemuan kemampuan & endpoint.`,
    `- [Endpoint MCP Publik (Streamable HTTP)](${absoluteUrl("/api/mcp")}): Endpoint JSON-RPC read-only untuk profil perusahaan dan pembuat tautan verifikasi dokumen.`,
    `- [Verifikasi Dokumen QR](${SITE_URL}/verify/{kode}): Validasi daring keaslian Purchase Order, Invoice, Surat Jalan, dan kontrak proyek.`,
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
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
