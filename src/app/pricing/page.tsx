import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, HelpCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import {
  COMPANY_PROFILE,
  SERVICE_PACKAGES,
  absoluteUrl,
  buildFaqNode,
  buildOfferNodes,
  buildSubpageJsonLd,
  getPublicPageMeta,
} from "@/lib/site-config";

const PAGE_META = getPublicPageMeta("/pricing");

export const metadata: Metadata = {
  title: { absolute: PAGE_META.title },
  description: PAGE_META.description,
  alternates: {
    canonical: absoluteUrl("/pricing"),
  },
};

export default function PricingPage() {
  const baseJsonLd = buildSubpageJsonLd({
    path: "/pricing",
    title: PAGE_META.title,
    description: PAGE_META.description,
    pageType: "WebPage",
  });

  const pricingJsonLd = {
    ...baseJsonLd,
    "@graph": [
      ...baseJsonLd["@graph"],
      ...buildOfferNodes(),
      buildFaqNode(),
    ],
  };

  return (
    <PublicSiteChrome activePath="/pricing">
      <JsonLdScript data={pricingJsonLd} />

      <div className="space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#102A4D] dark:text-sky-300">
            <Tag className="size-4" aria-hidden="true" />
            Paket Layanan &amp; Estimasi Biaya Resmi
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            Harga &amp; Paket Layanan {COMPANY_PROFILE.legalName}
          </h1>
          <p className="mt-4 max-w-3xl type-p1 text-slate-700 dark:text-slate-300">
            Informasi biaya transparan dalam mata uang Rupiah (IDR) untuk layanan portal mitra verifikasi QR publik, langganan sistem ERP konstruksi cloud, hingga paket kontrak pengawasan &amp; manajemen proyek sipil.
          </p>
        </section>

        <section aria-labelledby="pricing-tiers-heading" className="space-y-5">
          <h2 id="pricing-tiers-heading" className="type-h1 text-slate-950 dark:text-white">
            Daftar Paket &amp; Skema Langganan
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
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
                      className="text-3xl font-extrabold text-[#102A4D] dark:text-sky-300"
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

                <CardContent className="space-y-5">
                  <ul className="space-y-2.5 type-p2 text-slate-700 dark:text-slate-300">
                    {pkg.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="w-full bg-[#102A4D] text-white hover:bg-[#0B1E38] dark:bg-sky-600 dark:hover:bg-sky-700"
                  >
                    <Link href={pkg.price === 0 ? "/verify" : "/contact"}>
                      {pkg.price === 0 ? "Buka Portal Verifikasi" : "Ajukan Penawaran Resmi"}
                      <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="pricing-faq-heading"
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 text-[#102A4D] dark:text-sky-300">
            <HelpCircle className="size-5" aria-hidden="true" />
            <h2 id="pricing-faq-heading" className="type-h1 text-slate-950 dark:text-white">
              Pertanyaan Umum Biaya &amp; Implementasi
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="type-h3 text-slate-950 dark:text-white">
                Apakah verifikasi QR dipungut biaya?
              </h3>
              <p className="mt-1.5 type-p2 text-slate-700 dark:text-slate-300">
                Tidak. Vendor, pengawas dinas, dan mitra bank dapat memindai atau memasukkan kode dokumen pada /verify gratis (Rp 0) tanpa akun.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="type-h3 text-slate-950 dark:text-white">
                Apa saja yang termasuk paket ERP Cloud?
              </h3>
              <p className="mt-1.5 type-p2 text-slate-700 dark:text-slate-300">
                Lisensi web &amp; Android APK ({COMPANY_PROFILE.apk.label}), pencatatan logistik armada, tiket keuangan, dan integrasi asisten AI Bunglon.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="type-h3 text-slate-950 dark:text-white">
                Bagaimana cara permintaan penawaran resmi?
              </h3>
              <p className="mt-1.5 type-p2 text-slate-700 dark:text-slate-300">
                Hubungi{" "}
                <a href={`mailto:${COMPANY_PROFILE.email}`} className="font-semibold underline">
                  {COMPANY_PROFILE.email}
                </a>{" "}
                atau telepon{" "}
                <a href={`tel:${COMPANY_PROFILE.telephone}`} className="font-semibold underline">
                  {COMPANY_PROFILE.telephoneDisplay}
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </PublicSiteChrome>
  );
}
