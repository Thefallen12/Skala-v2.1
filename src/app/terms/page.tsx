import type { Metadata } from "next";
import Link from "next/link";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import {
  COMPANY_PROFILE,
  SITE_URL,
  absoluteUrl,
  buildSubpageJsonLd,
  getPublicPageMeta,
} from "@/lib/site-config";

const PAGE_META = getPublicPageMeta("/terms");

export const metadata: Metadata = {
  title: { absolute: PAGE_META.title },
  description: PAGE_META.description,
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
};

export default function TermsPage() {
  return (
    <PublicSiteChrome activePath="/terms">
      <JsonLdScript
        data={buildSubpageJsonLd({
          path: "/terms",
          title: PAGE_META.title,
          description: PAGE_META.description,
          pageType: "WebPage",
        })}
      />

      <article className="mx-auto max-w-4xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <header className="space-y-2 border-b border-slate-200 pb-5 dark:border-slate-800">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Syarat dan Ketentuan Layanan
          </h1>
          <p className="type-p2 text-slate-600 dark:text-slate-400">
            Berlaku untuk domain {SITE_URL} dan aplikasi mobile resmi {COMPANY_PROFILE.legalName}.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            1. Ruang Lingkup Penggunaan
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Platform web dan aplikasi Android ({COMPANY_PROFILE.apk.fileName}) dikelola oleh {COMPANY_PROFILE.legalName} untuk mendukung operasional proyek konstruksi, pengadaan material, pencatatan logistik armada, administrasi keuangan, serta verifikasi dokumen resmi berbasis QR.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            2. Akses Sistem Internal &amp; Keamanan Akun
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Halaman dan API operasional internal (/apps/*, /dashboard/*, /user-profile/*) hanya boleh diakses oleh personel terdaftar sesuai peran yang diberikan oleh administrator perusahaan. Pengguna wajib menjaga kerahasiaan email dan kata sandi akun masing-masing.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            3. Ketentuan Crawler, Indeks Pencarian, dan Agen AI
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Halaman informasi publik (/ , /about, /contact, /terms, /privacy) beserta endpoint penemuan (/llms.txt, /.well-known/mcp/server-card.json) dapat diakses oleh agen pencarian dan grounding AI sesuai sinyal{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
              Content-Signal: search=yes, ai-input=yes, ai-train=no
            </code>{" "}
            pada{" "}
            <a href="/robots.txt" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
              robots.txt
            </a>
            . Penggunaan materi situs untuk pelatihan ulang model AI dilarang tanpa izin tertulis.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            4. Pertanyaan &amp; Kontak Legal
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Jika terdapat pertanyaan terkait ketentuan layanan, silakan hubungi{" "}
            <a
              href={`mailto:${COMPANY_PROFILE.email}`}
              className="font-semibold text-[#102A4D] underline dark:text-sky-300"
            >
              {COMPANY_PROFILE.email}
            </a>{" "}
            atau telepon{" "}
            <a
              href={`tel:${COMPANY_PROFILE.telephone}`}
              className="font-semibold text-[#102A4D] underline dark:text-sky-300"
            >
              {COMPANY_PROFILE.telephoneDisplay}
            </a>
            , atau lihat{" "}
            <Link href="/privacy" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
              Kebijakan Privasi
            </Link>
            .
          </p>
        </section>
      </article>
    </PublicSiteChrome>
  );
}
