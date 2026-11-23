import type { Metadata } from "next";
import Link from "next/link";
import { JsonLdScript } from "@/components/public/JsonLdScript";
import { PublicSiteChrome } from "@/components/public/PublicSiteChrome";
import {
  COMPANY_PROFILE,
  absoluteUrl,
  buildSubpageJsonLd,
  getPublicPageMeta,
} from "@/lib/site-config";

const PAGE_META = getPublicPageMeta("/privacy");

export const metadata: Metadata = {
  title: { absolute: PAGE_META.title },
  description: PAGE_META.description,
  alternates: {
    canonical: absoluteUrl("/privacy"),
  },
};

export default function PrivacyPage() {
  return (
    <PublicSiteChrome activePath="/privacy">
      <JsonLdScript
        data={buildSubpageJsonLd({
          path: "/privacy",
          title: PAGE_META.title,
          description: PAGE_META.description,
          pageType: "WebPage",
        })}
      />

      <article className="mx-auto max-w-4xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <header className="space-y-2 border-b border-slate-200 pb-5 dark:border-slate-800">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Kebijakan Privasi
          </h1>
          <p className="type-p2 text-slate-600 dark:text-slate-400">
            Komitmen {COMPANY_PROFILE.legalName} dalam melindungi data operasional dan privasi pengguna.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            1. Informasi yang Dikumpulkan
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Kami memproses data identitas staf berwenang (nama, email, peran operasional), catatan transaksi proyek, dokumentasi foto progres lapangan, dan log verifikasi dokumen untuk memastikan keakuratan administrasi proyek konstruksi dan logistik.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            2. Penggunaan Data &amp; Pembatasan Akses
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Data internal perusahaan diproses secara terbatas dengan kontrol akses berbasis peran (role-based access control) serta autentikasi sesi terenkripsi. Endpoint publik pada portal hanya menyajikan informasi perusahaan umum serta status keaslian dokumen QR yang memang dapat diverifikasi publik.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="type-h2 text-slate-950 dark:text-white">
            3. Pembaruan &amp; Permintaan Data
          </h2>
          <p className="type-p1 text-slate-700 dark:text-slate-300">
            Untuk pembaruan informasi akun atau pertanyaan terkait kebijakan privasi, hubungi admin perusahaan melalui{" "}
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
            </a>{" "}
            serta tinjau{" "}
            <Link href="/terms" className="font-semibold text-[#102A4D] underline dark:text-sky-300">
              Syarat &amp; Ketentuan
            </Link>
            .
          </p>
        </section>
      </article>
    </PublicSiteChrome>
  );
}
