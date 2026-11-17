import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DocumentLookupForm } from "@/components/public/DocumentLookupForm";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import { absoluteUrl, buildSubpageJsonLd } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Verifikasi Dokumen Resmi",
  description:
    "Layanan verifikasi keaslian dokumen Purchase Order, Invoice, Surat Jalan, dan kontrak konstruksi PT Skala Prioritas Engineering.",
  alternates: {
    canonical: absoluteUrl("/verify"),
  },
};

export default async function VerifyIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const cleaned = typeof code === "string" ? code.trim() : "";
  if (cleaned) {
    redirect(`/verify/${encodeURIComponent(cleaned)}`);
  }

  return (
    <PublicSiteChrome activePath="/">
      <JsonLdScript
        data={buildSubpageJsonLd({
          path: "/verify",
          title: "Verifikasi Dokumen Resmi",
          description:
            "Validasi publik keaslian dokumen Purchase Order, Surat Jalan, dan Kontrak PT Skala Prioritas Engineering.",
        })}
      />
      <section className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Verifikasi Keaslian Dokumen
          </h1>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Masukkan kode unik dokumen yang tertera di bawah QR Code Purchase Order, Invoice, Surat Jalan, atau kontrak konstruksi resmi.
          </p>
        </div>
        <DocumentLookupForm idPrefix="verify-index" />
      </section>
    </PublicSiteChrome>
  );
}
