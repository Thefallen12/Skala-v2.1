import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Globe, Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentLookupForm } from "@/components/public/DocumentLookupForm";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import {
  COMPANY_PROFILE,
  PUBLIC_PAGES,
  SITE_URL,
  absoluteUrl,
  buildSubpageJsonLd,
} from "@/lib/site-config";

const PAGE_META = PUBLIC_PAGES[2];

export const metadata: Metadata = {
  title: PAGE_META.title,
  description: PAGE_META.description,
  alternates: {
    canonical: absoluteUrl("/contact"),
  },
};

export default function ContactPage() {
  return (
    <PublicSiteChrome activePath="/contact">
      <JsonLdScript
        data={buildSubpageJsonLd({
          path: "/contact",
          title: PAGE_META.title,
          description: PAGE_META.description,
          pageType: "ContactPage",
        })}
      />

      <div className="space-y-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            Kontak Resmi {COMPANY_PROFILE.legalName}
          </h1>
          <p className="mt-3 max-w-2xl type-p1 text-slate-700 dark:text-slate-300">
            Hubungi tim administrasi, logistik, atau manajemen proyek kami melalui email, telepon kantor, maupun alamat operasional di Aceh Tengah.
          </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="type-h2 text-slate-950 dark:text-white">
                Saluran Komunikasi Perusahaan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-1 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="type-h3 text-slate-950 dark:text-white">Email Resmi</h2>
                  <p className="type-p2 text-slate-600 dark:text-slate-400">
                    Korespondensi pengadaan, invoice vendor, dan dukungan teknis:
                  </p>
                  <a
                    href={`mailto:${COMPANY_PROFILE.email}`}
                    className="mt-1 inline-block type-p1 font-semibold text-[#102A4D] underline underline-offset-4 dark:text-sky-300"
                  >
                    {COMPANY_PROFILE.email}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="mt-1 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="type-h3 text-slate-950 dark:text-white">Telepon Kantor</h2>
                  <p className="type-p2 text-slate-600 dark:text-slate-400">
                    Konfirmasi pengiriman, status tiket proyek, dan verifikasi dokumen:
                  </p>
                  <a
                    href={`tel:${COMPANY_PROFILE.telephone}`}
                    className="mt-1 inline-block type-p1 font-semibold text-[#102A4D] underline underline-offset-4 dark:text-sky-300"
                  >
                    {COMPANY_PROFILE.telephoneDisplay}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="type-h3 text-slate-950 dark:text-white">Alamat Kantor</h2>
                  <p className="type-p2 text-slate-700 dark:text-slate-300">
                    {COMPANY_PROFILE.addressDisplay}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-1 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="type-h3 text-slate-950 dark:text-white">Jam Operasional</h2>
                  <p className="type-p2 text-slate-700 dark:text-slate-300">
                    {COMPANY_PROFILE.openingHours}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Globe className="mt-1 size-5 shrink-0 text-[#102A4D] dark:text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="type-h3 text-slate-950 dark:text-white">Domain &amp; Tautan Terkait</h2>
                  <p className="type-p2 text-slate-700 dark:text-slate-300">
                    Situs resmi:{" "}
                    <Link href="/" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
                      {SITE_URL}
                    </Link>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="type-h2 text-slate-950 dark:text-white">
                Verifikasi Cepat Dokumen Transaksi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="type-p2 text-slate-700 dark:text-slate-300">
                Pihak eksternal atau vendor dapat memeriksa keabsahan Purchase Order, Invoice, dan Surat Jalan tanpa perlu masuk ke akun internal.
              </p>
              <DocumentLookupForm idPrefix="contact" />
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicSiteChrome>
  );
}
