import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import {
  COMPANY_PROFILE,
  PUBLIC_PAGES,
  absoluteUrl,
  buildSubpageJsonLd,
} from "@/lib/site-config";

const PAGE_META = PUBLIC_PAGES[1];

export const metadata: Metadata = {
  title: PAGE_META.title,
  description: PAGE_META.description,
  alternates: {
    canonical: absoluteUrl("/about"),
  },
};

const PILLARS = [
  {
    title: "Pelaksanaan Konstruksi Terukur",
    body: "Setiap proyek dilengkapi Rencana Anggaran Biaya (RAB), jadwal kurva-S, serta pelaporan progres harian langsung oleh tim lapangan.",
  },
  {
    title: "Rantai Pasok & Logistik Searah",
    body: "Pengajuan material alam, Purchase Order, surat jalan armada, hingga sewa kendaraan dan rumah proyek tercatat berjenjang hingga pembayaran keuangan.",
  },
  {
    title: "Verifikasi Dokumen QR Publik",
    body: "Mitra kerja, vendor, dan instansi pengawas dapat memeriksa keaslian dokumen resmi kapan saja melalui portal verifikasi QR publik.",
  },
] as const;

export default function AboutPage() {
  return (
    <PublicSiteChrome activePath="/about">
      <JsonLdScript
        data={buildSubpageJsonLd({
          path: "/about",
          title: PAGE_META.title,
          description: PAGE_META.description,
          pageType: "AboutPage",
        })}
      />

      <div className="space-y-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#102A4D] dark:text-sky-300">
            <Building2 className="size-4" aria-hidden="true" />
            Profil Perusahaan
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            Tentang {COMPANY_PROFILE.legalName}
          </h1>
          <p className="mt-4 max-w-3xl type-p1 text-slate-700 dark:text-slate-300">
            {COMPANY_PROFILE.legalName} adalah perusahaan teknik konstruksi sipil, rehabilitasi jaringan irigasi, dan pengelolaan logistik proyek yang beroperasi di {COMPANY_PROFILE.addressDisplay}. Dengan filosofi kerja{" "}
            <strong className="font-semibold text-slate-950 dark:text-white">
              {COMPANY_PROFILE.motto}
            </strong>
            , kami menggabungkan keahlian lapangan dengan platform ERP operasional terpadu.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              className="bg-[#102A4D] text-white hover:bg-[#0B1E38] dark:bg-sky-600 dark:hover:bg-sky-700"
            >
              <Link href="/contact">
                Hubungi Kami
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/login">Masuk Portal Staf</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="about-pillars-heading" className="space-y-4">
          <h2 id="about-pillars-heading" className="type-h1 text-slate-950 dark:text-white">
            Pilar Tata Kelola &amp; Sistem Operasional
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Card
                key={pillar.title}
                className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <CardHeader className="pb-2">
                  <div className="mb-1 flex items-center gap-2 text-[#102A4D] dark:text-sky-300">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    <CardTitle className="type-h3 text-slate-950 dark:text-white">
                      {pillar.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="type-p2 text-slate-700 dark:text-slate-300">{pillar.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="about-compliance-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
            <div className="space-y-2">
              <h2 id="about-compliance-heading" className="type-h2 text-slate-950 dark:text-white">
                Transparansi &amp; Dokumentasi Legal
              </h2>
              <p className="type-p2 text-slate-700 dark:text-slate-300">
                Untuk informasi kebijakan layanan, penggunaan data operasional, serta antarmuka integrasi agen otomatis, silakan tinjau{" "}
                <Link href="/terms" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
                  Syarat &amp; Ketentuan
                </Link>{" "}
                dan{" "}
                <Link href="/privacy" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
                  Kebijakan Privasi
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </PublicSiteChrome>
  );
}
