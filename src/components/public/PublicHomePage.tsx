import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  HardHat,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Tag,
  Truck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  COMPANY_PROFILE,
  SERVICE_PACKAGES,
  buildHomepageJsonLd,
} from "@/lib/site-config";
import { DocumentLookupForm } from "@/components/public/DocumentLookupForm";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";

const CORE_CAPABILITIES = [
  {
    icon: HardHat,
    title: "Konstruksi Sipil & Laporan Harian",
    description:
      "Pengawasan proyek konstruksi dan rehabilitasi jaringan irigasi dengan kurva-S, jadwal kerja, serta laporan progres harian tim lapangan.",
  },
  {
    icon: Truck,
    title: "Logistik, Material Alam & Sewa",
    description:
      "Alur pengajuan tiket terstruktur dari tim lapangan menuju verifikasi logistik, Purchase Order, surat jalan armada, hingga sewa kendaraan dan rumah proyek.",
  },
  {
    icon: Wallet,
    title: "Keuangan Proyek & Persetujuan Direksi",
    description:
      "Pencatatan tagihan vendor, pembayaran berjenjang multi-PO, kontrol anggaran RAB, serta pelaporan realisasi kas proyek secara akuntabel.",
  },
  {
    icon: FileCheck2,
    title: "Verifikasi Dokumen Digital QR",
    description:
      "Setiap Purchase Order, Surat Jalan, dan dokumen konstruksi resmi dilindungi tanda tangan digital QR yang dapat divalidasi secara publik.",
  },
] as const;

const AGENT_INTEGRATIONS = [
  {
    title: "Dokumentasi Agen AI & Markdown",
    description:
      "Tersedia berkas llms.txt, llms-full.txt, serta negosiasi konten otomatis (Accept: text/markdown) untuk konsumsi LLM rendah token.",
    href: "/llms.txt",
    cta: "Buka /llms.txt",
  },
  {
    title: "MCP Server Card & WebMCP",
    description:
      "Katalog alat publik Model Context Protocol di /.well-known/mcp/server-card.json dan alat WebMCP langsung pada browser.",
    href: "/.well-known/mcp/server-card.json",
    cta: "Buka Server Card",
  },
  {
    title: "API Catalog, OpenAPI & Agent Skills",
    description:
      "Standar RFC 9727 api-catalog, kartu agen A2A, manifes auth.md, dan indeks skill siap pakai bagi agen otonom.",
    href: "/.well-known/api-catalog",
    cta: "Buka API Catalog",
  },
] as const;

export function PublicHomePage() {
  return (
    <PublicSiteChrome activePath="/">
      <JsonLdScript data={buildHomepageJsonLd()} />

      <div className="space-y-12">
        {/* Hero Section — single H1 followed cleanly by H2 */}
        <section
          aria-labelledby="homepage-hero-heading"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:items-center lg:p-10">
            <div className="space-y-5 lg:col-span-7">
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1.5 border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900 dark:border-orange-500/40 dark:bg-orange-950/60 dark:text-orange-200"
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Portal Resmi · Konstruksi &amp; ERP Operasional
              </Badge>

              <h1
                id="homepage-hero-heading"
                className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl dark:text-white"
              >
                PT Skala Prioritas Engineering — Operasional Konstruksi &amp; Logistik Terpadu
              </h1>

              <p className="type-p1 max-w-2xl text-slate-700 dark:text-slate-300">
                {COMPANY_PROFILE.description} Menghubungkan tim lapangan, koordinator proyek, logistik material, keuangan, dan otorisasi direksi.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  asChild
                  className="h-11 bg-[#102A4D] px-6 text-sm font-semibold text-white hover:bg-[#0B1E38] dark:bg-sky-600 dark:hover:bg-sky-700"
                >
                  <Link href="/auth/login">
                    Masuk ke Sistem
                    <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-11 border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <a
                    href={COMPANY_PROFILE.apk.href}
                    download={COMPANY_PROFILE.apk.fileName}
                  >
                    <Download className="mr-1.5 size-4" aria-hidden="true" />
                    Unduh {COMPANY_PROFILE.apk.label}
                  </a>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  className="h-11 px-4 text-sm font-semibold text-[#102A4D] hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Link href="/pricing">Lihat Harga Layanan</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="size-5 text-[#102A4D] dark:text-sky-400" aria-hidden="true" />
                <h2 className="type-h2 text-slate-900 dark:text-white">
                  Verifikasi Dokumen Resmi (QR)
                </h2>
              </div>
              <DocumentLookupForm idPrefix="hero" />
            </div>
          </div>
        </section>

        {/* Kapabilitas Operasional & Layanan Utama: H2 -> H3 */}
        <section aria-labelledby="services-heading" className="space-y-5">
          <div className="space-y-1">
            <h2 id="services-heading" className="type-h1 text-slate-950 dark:text-white">
              Kapabilitas Operasional &amp; Layanan Utama
            </h2>
            <p className="type-p1 text-slate-700 dark:text-slate-300">
              Alur kerja searah yang menghubungkan tim lapangan, logistik, direksi, dan keuangan dalam satu sumber data proyek.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {CORE_CAPABILITIES.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-slate-100 text-[#102A4D] dark:bg-slate-800 dark:text-sky-300">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <h3 className="type-h2 font-semibold text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="type-p2 text-slate-700 dark:text-slate-300">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Harga & Paket Layanan: H2 -> H3, microdata Offer reachable without JS/login */}
        <section aria-labelledby="pricing-heading" className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#102A4D] dark:text-sky-300">
                <Tag className="size-3.5" aria-hidden="true" />
                Transparansi Komersial &amp; Lisensi
              </div>
              <h2 id="pricing-heading" className="type-h1 text-slate-950 dark:text-white">
                Harga &amp; Paket Layanan Operasional (Pricing)
              </h2>
              <p className="type-p1 text-slate-700 dark:text-slate-300">
                Biaya terstruktur untuk akses verifikasi QR vendor, langganan platform ERP konstruksi, hingga kontrak manajemen proyek.
              </p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A4D] underline underline-offset-4 hover:text-[#0B1E38] dark:text-sky-300"
            >
              Rincian Paket Lengkap
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {SERVICE_PACKAGES.map((pkg) => (
              <Card
                key={pkg.id}
                itemScope
                itemType="https://schema.org/Offer"
                className="flex flex-col justify-between border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <CardHeader className="space-y-2">
                  <span className="inline-block w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-[#102A4D] dark:bg-slate-800 dark:text-sky-300">
                    {pkg.category}
                  </span>
                  <h3 itemProp="name" className="type-h2 font-bold text-slate-950 dark:text-white">
                    {pkg.name}
                  </h3>
                  <div className="flex items-baseline gap-1.5 pt-1">
                    <data
                      value={pkg.price}
                      itemProp="price"
                      className="text-2xl font-extrabold text-[#102A4D] dark:text-sky-300"
                    >
                      {pkg.priceDisplay}
                    </data>
                    <meta itemProp="priceCurrency" content={pkg.priceCurrency} />
                    <link itemProp="availability" href="https://schema.org/InStock" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {pkg.billingUnit}
                    </span>
                  </div>
                  <CardDescription itemProp="description" className="type-p2 text-slate-700 dark:text-slate-300">
                    {pkg.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 type-p3 text-slate-700 dark:text-slate-300">
                    {pkg.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/pricing">Lihat Detail Paket</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Identitas, Kontak & Legalitas Perusahaan: H2 -> H3 */}
        <section aria-labelledby="company-identity-heading" className="space-y-5">
          <div className="space-y-1">
            <h2 id="company-identity-heading" className="type-h1 text-slate-950 dark:text-white">
              Identitas, Kontak &amp; Legalitas Perusahaan
            </h2>
            <p className="type-p1 text-slate-700 dark:text-slate-300">
              Informasi resmi, saluran komunikasi langsung, serta halaman informasi publik {COMPANY_PROFILE.legalName}.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <CardHeader>
                <div className="flex items-center gap-2 text-[#102A4D] dark:text-sky-300">
                  <Building2 className="size-5" aria-hidden="true" />
                  <span className="type-h2 font-semibold text-slate-950 dark:text-white">
                    Kontak &amp; Kantor Operasional
                  </span>
                </div>
                <CardDescription className="type-p2 text-slate-700 dark:text-slate-300">
                  Alamat terstruktur dan saluran komunikasi resmi {COMPANY_PROFILE.legalName}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 type-p1 text-slate-800 dark:text-slate-200">
                <address className="not-italic space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div>
                      <h3 className="type-h3 text-slate-900 dark:text-white">Email Resmi</h3>
                      <a
                        href={`mailto:${COMPANY_PROFILE.email}`}
                        className="type-p2 font-medium text-[#102A4D] underline underline-offset-4 dark:text-sky-300"
                      >
                        {COMPANY_PROFILE.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div>
                      <h3 className="type-h3 text-slate-900 dark:text-white">Telepon Kantor</h3>
                      <a
                        href={`tel:${COMPANY_PROFILE.telephone}`}
                        className="type-p2 font-medium text-[#102A4D] underline underline-offset-4 dark:text-sky-300"
                      >
                        {COMPANY_PROFILE.telephoneDisplay}
                      </a>
                    </div>
                  </div>

                  <div
                    className="flex items-start gap-3"
                    itemScope
                    itemType="https://schema.org/PostalAddress"
                  >
                    <MapPin className="mt-1 size-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div>
                      <h3 className="type-h3 text-slate-900 dark:text-white">Lokasi &amp; Jam Layanan</h3>
                      <p className="type-p2 text-slate-700 dark:text-slate-300">
                        <span itemProp="streetAddress">{COMPANY_PROFILE.address.streetAddress}</span>,{" "}
                        <span itemProp="addressLocality">{COMPANY_PROFILE.address.addressLocality}</span>,{" "}
                        <span itemProp="addressRegion">{COMPANY_PROFILE.address.addressRegion}</span>{" "}
                        <span itemProp="postalCode">{COMPANY_PROFILE.address.postalCode}</span>,{" "}
                        <span itemProp="addressCountry">{COMPANY_PROFILE.address.addressCountry}</span> ·{" "}
                        {COMPANY_PROFILE.openingHours}
                      </p>
                    </div>
                  </div>
                </address>

                <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h3 className="type-h3 mb-2 text-slate-900 dark:text-white">
                    Profil Eksternal Resmi
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {COMPANY_PROFILE.externalProfiles.map((profile) => (
                      <a
                        key={profile.url}
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer me"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#102A4D] hover:text-[#102A4D] dark:border-slate-700 dark:text-slate-300"
                      >
                        {profile.label}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <CardHeader>
                <span className="type-h2 font-semibold text-slate-950 dark:text-white">
                  Halaman Perusahaan, Harga &amp; Legalitas
                </span>
                <CardDescription className="type-p2 text-slate-700 dark:text-slate-300">
                  Akses cepat halaman informasi perusahaan, paket harga, kontak, dan dokumen legalitas resmi.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/about"
                  className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                >
                  <h3 className="type-h3 text-slate-950 dark:text-white">Tentang Kami</h3>
                  <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                    Profil layanan teknik, arsitektur proyek, dan tata kelola perusahaan.
                  </p>
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                >
                  <h3 className="type-h3 text-slate-950 dark:text-white">Harga &amp; Paket</h3>
                  <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                    Daftar harga portal mitra QR, lisensi ERP cloud, dan kontrak sipil.
                  </p>
                </Link>
                <Link
                  href="/contact"
                  className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                >
                  <h3 className="type-h3 text-slate-950 dark:text-white">Halaman Kontak</h3>
                  <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                    Detail komunikasi email, telepon resmi, dan alamat operasional.
                  </p>
                </Link>
                <Link
                  href="/terms"
                  className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                >
                  <h3 className="type-h3 text-slate-950 dark:text-white">Syarat &amp; Ketentuan</h3>
                  <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                    Aturan akses sistem, hak penggunaan situs, dan sinyal agen AI.
                  </p>
                </Link>
                <Link
                  href="/privacy"
                  className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 sm:col-span-2 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
                >
                  <h3 className="type-h3 text-slate-950 dark:text-white">Kebijakan Privasi</h3>
                  <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                    Perlindungan data akun, dokumen transaksi, dan laporan lapangan.
                  </p>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Standar Kesiapan Agen AI & Integrasi Publik: H2 -> H3 */}
        <section aria-labelledby="agent-readiness-heading" className="space-y-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#102A4D] dark:text-sky-300">
              <Bot className="size-3.5" aria-hidden="true" />
              Agent-Native Infrastructure
            </div>
            <h2 id="agent-readiness-heading" className="type-h1 text-slate-950 dark:text-white">
              Standar Kesiapan Agen AI &amp; Integrasi Publik
            </h2>
            <p className="type-p1 text-slate-700 dark:text-slate-300">
              Dukungan penuh protokol modern agar asisten AI dapat membaca, memverifikasi, dan berinteraksi secara aman dan terstruktur.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {AGENT_INTEGRATIONS.map((item) => (
              <Card key={item.title} className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <CardHeader className="pb-2">
                  <h3 className="type-h2 font-semibold text-slate-950 dark:text-white">
                    {item.title}
                  </h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="type-p2 text-slate-700 dark:text-slate-300">
                    {item.description}
                  </p>
                  <a
                    href={item.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A4D] underline underline-offset-4 dark:text-sky-300"
                  >
                    {item.cta}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </PublicSiteChrome>
  );
}
