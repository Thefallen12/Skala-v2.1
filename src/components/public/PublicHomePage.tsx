import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Download,
  FileCheck2,
  HardHat,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
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
  CardTitle,
} from "@/components/ui/card";
import { COMPANY_PROFILE, buildHomepageJsonLd } from "@/lib/site-config";
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

export function PublicHomePage() {
  return (
    <PublicSiteChrome activePath="/">
      <JsonLdScript data={buildHomepageJsonLd()} />

      <div className="space-y-10">
        {/* Hero Section — exactly one visible H1 across all viewports */}
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
                {COMPANY_PROFILE.description} Platform terpadu untuk tim lapangan, koordinator proyek, logistik material, keuangan, dan otorisasi direksi.
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
                  <Link href="/about">Profil Perusahaan</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="size-5 text-[#102A4D] dark:text-sky-400" aria-hidden="true" />
                <h2 className="type-h2 text-slate-900 dark:text-white">
                  Verifikasi Dokumen Resmi
                </h2>
              </div>
              <DocumentLookupForm idPrefix="hero" />
            </div>
          </div>
        </section>

        {/* Layanan & Modul Utama */}
        <section aria-labelledby="services-heading" className="space-y-5">
          <div className="space-y-1">
            <h2 id="services-heading" className="type-h1 text-slate-950 dark:text-white">
              Layanan Teknik &amp; Sistem Operasional
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
                    <CardTitle className="type-h2 text-slate-950 dark:text-white">
                      {item.title}
                    </CardTitle>
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

        {/* Ringkasan Perusahaan, Kontak & Halaman Terkait */}
        <section
          aria-labelledby="company-contact-heading"
          className="grid gap-6 md:grid-cols-2"
        >
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
              <div className="flex items-center gap-2 text-[#102A4D] dark:text-sky-300">
                <Building2 className="size-5" aria-hidden="true" />
                <h2 id="company-contact-heading" className="type-h2 text-slate-950 dark:text-white">
                  Kontak &amp; Kantor Operasional
                </h2>
              </div>
              <CardDescription className="type-p2 text-slate-700 dark:text-slate-300">
                Hubungi tim administrasi atau dukungan teknis {COMPANY_PROFILE.legalName} secara langsung.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 type-p1 text-slate-800 dark:text-slate-200">
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

              <div className="flex items-start gap-3">
                <MapPin className="mt-1 size-4 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <h3 className="type-h3 text-slate-900 dark:text-white">Lokasi &amp; Jam Layanan</h3>
                  <p className="type-p2 text-slate-700 dark:text-slate-300">
                    {COMPANY_PROFILE.addressDisplay} · {COMPANY_PROFILE.openingHours}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
              <h2 className="type-h2 text-slate-950 dark:text-white">
                Informasi Perusahaan &amp; Legalitas
              </h2>
              <CardDescription className="type-p2 text-slate-700 dark:text-slate-300">
                Pelajari profil lengkap, saluran kontak resmi, dan ketentuan layanan platform kami.
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
                className="rounded-xl border border-slate-200 p-3.5 transition hover:border-[#102A4D] hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
              >
                <h3 className="type-h3 text-slate-950 dark:text-white">Kebijakan Privasi</h3>
                <p className="mt-1 type-p3 text-slate-600 dark:text-slate-400">
                  Perlindungan data akun, dokumen transaksi, dan laporan lapangan.
                </p>
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </PublicSiteChrome>
  );
}
