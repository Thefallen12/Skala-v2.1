"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Download,
  FileCheck2,
  Home,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";

export type VerificationDocument = {
  kind: string;
  type: string;
  documentNumber: string;
  issueDate: string;
  partner: string;
  createdBy: string;
  status: string;
  isValid: boolean;
  validationId: string;
  scannedAt: string;
  previewUrl: string | null;
  details?: { label: string; value: string }[];
};

export default function DocumentValidationViewer({
  document,
}: {
  document: VerificationDocument;
}) {
  const downloadUrl = document.previewUrl
    ? `${document.previewUrl}${document.previewUrl.includes("?") ? "&" : "?"}download=1`
    : null;
  const fullHtmlPreviewUrl = document.previewUrl
    ? `${document.previewUrl}${document.previewUrl.includes("?") ? "&" : "?"}format=html`
    : null;

  return (
    <main className="min-h-screen bg-slate-100 font-sans text-slate-950">
      <header className="flex min-h-[76px] flex-col overflow-hidden bg-[#10264a] text-white sm:flex-row">
        <div className="flex min-h-[76px] w-full items-center rounded-br-[42px] bg-white px-5 py-3 text-slate-900 sm:w-[38%] sm:px-7">
          <Image
            src="/images/logos/cop-surat.png"
            alt="PT Skala Prioritas Engineering — Takengon"
            width={760}
            height={120}
            priority
            className="h-auto max-h-[58px] w-full max-w-[500px] object-contain object-left"
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-3 text-center sm:pr-8">
          <p className="text-lg font-extrabold tracking-wide sm:text-xl">
            SISTEM VALIDASI DATA
          </p>
          <p className="text-xs tracking-[0.16em] text-slate-300">
            DATA VALIDATION SYSTEM
          </p>
        </div>
      </header>

      <section
        className={`relative overflow-hidden px-4 py-6 text-white sm:px-8 sm:py-7 ${
          document.isValid
            ? "bg-[radial-gradient(ellipse_at_center,#0b644a_0%,#073c38_48%,#112a3c_100%)]"
            : "bg-[radial-gradient(ellipse_at_center,#8a5a16_0%,#533b1a_48%,#112a3c_100%)]"
        }`}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-4 text-center">
          <div
            className={`relative flex size-14 shrink-0 items-center justify-center rounded-full border-4 sm:size-[72px] ${
              document.isValid
                ? "border-emerald-300 bg-emerald-500/20 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.65)]"
                : "border-amber-300 bg-amber-500/20 text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.45)]"
            }`}
          >
            {document.isValid && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-emerald-300/70 motion-safe:animate-ping"
              />
            )}
            {document.isValid ? (
              <BadgeCheck
                className="relative z-10 size-10 sm:size-12"
                aria-hidden="true"
              />
            ) : (
              <FileCheck2
                className="relative z-10 size-9 sm:size-11"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="text-left">
            <h1
              className={`text-xl font-extrabold leading-tight sm:text-3xl ${
                document.isValid ? "text-emerald-300" : "text-amber-300"
              }`}
              role="status"
            >
              {document.isValid
                ? "DATA VALID & TERVERIFIKASI"
                : "DATA BELUM TERVERIFIKASI"}
            </h1>
            <p className="text-sm font-bold tracking-wide sm:text-xl">
              {document.isValid
                ? "VALID & VERIFIED DATA"
                : "PENDING VERIFICATION"}
            </p>
            <p className="mt-1 text-[11px] text-slate-200 sm:text-sm">
              Dokumen terbit · QR verifikasi tersedia
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-5 lg:px-8">
        <article className="flex min-h-[390px] flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-md sm:min-h-[470px] sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="!text-slate-950 text-sm font-bold sm:text-base">
                PRATINJAU DOKUMEN
              </h2>
              <p className="text-[11px] leading-tight text-slate-500">
                DOCUMENT PREVIEW
              </p>
            </div>
            {fullHtmlPreviewUrl && (
              <a
                href={fullHtmlPreviewUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Buka pratinjau dokumen ukuran penuh"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                <Maximize2 className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Layar Penuh</span>
              </a>
            )}
          </div>
          <div className="mt-2 flex min-h-[330px] flex-1 flex-col overflow-hidden rounded-md bg-slate-100 sm:min-h-[405px]">
            {document.previewUrl ? (
              <UniversalDocumentPreview
                title={`Pratinjau ${document.documentNumber}`}
                documentNumber={document.documentNumber}
                toolbarLabel={document.type}
                src={document.previewUrl}
                minimalToolbar
              />
            ) : (
              <div className="m-auto max-w-sm px-6 text-center text-sm text-slate-500">
                Pratinjau dokumen belum tersedia. Informasi verifikasi tetap
                ditampilkan pada halaman ini.
              </div>
            )}
          </div>
        </article>

        <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-md sm:p-5">
          <h2 className="!text-slate-950 text-sm font-bold sm:text-base">
            RINCIAN DATA VERIFIKASI
          </h2>
          <p className="mb-3 text-[11px] leading-tight text-slate-500">
            VERIFICATION DETAILS
          </p>
          <dl className="divide-y divide-slate-200 rounded-md bg-slate-50 px-3 sm:px-4">
            {[
              { label: "Tipe Dokumen", value: document.type },
              { label: "No. Dokumen", value: document.documentNumber },
              { label: "Tanggal Terbit", value: document.issueDate },
              { label: "Mitra / Penerima", value: document.partner },
              { label: "Pembuat Dokumen", value: document.createdBy },
              ...(document.details ?? []),
              { label: "Waktu Scan", value: document.scannedAt },
              { label: "ID Validasi", value: document.validationId },
            ].map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-2 text-xs sm:text-sm"
              >
                <dt className="font-semibold leading-tight">
                  {item.label}
                  <span className="mt-0.5 block text-[10px] font-normal italic text-slate-500">
                    {item.label === "Tipe Dokumen"
                      ? "Doc Type"
                      : item.label === "No. Dokumen"
                        ? "Doc No."
                        : item.label === "Tanggal Terbit"
                          ? "Issue Date"
                          : ""}
                  </span>
                </dt>
                <dd className="break-words text-right">{item.value || "—"}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
              <dt className="font-semibold">Status</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold text-white ${
                    document.isValid ? "bg-emerald-600" : "bg-amber-600"
                  }`}
                >
                  {document.status}
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-auto grid gap-2 pt-3 sm:grid-cols-2">
            {downloadUrl ? (
              <Button
                asChild
                className="min-h-10 bg-[#10264a] text-white hover:bg-[#193a68]"
              >
                <a href={downloadUrl}>
                  <Download className="mr-2 size-4" aria-hidden="true" />
                  Unduh Dokumen Asli
                  <span className="sr-only"> PDF</span>
                </a>
              </Button>
            ) : (
              <Button disabled className="min-h-10 bg-[#10264a] text-white">
                <Download className="mr-2 size-4" aria-hidden="true" />
                Dokumen PDF Tidak Tersedia
              </Button>
            )}
            <Button asChild variant="outline" className="min-h-10 border-slate-400">
              <Link href="/">
                <Home className="mr-2 size-4" aria-hidden="true" />
                Kembali ke Beranda
              </Link>
            </Button>
          </div>
        </article>
      </section>

      <footer className="mt-auto bg-[#e87514] px-4 py-2 text-center text-white">
        <p className="text-sm font-extrabold tracking-[0.12em]">
          ADAPT, IMPROVISE AND FINISH
        </p>
        <p className="text-[10px]">
          © {new Date().getFullYear()} PT Skala Prioritas Engineering. Semua hak
          dilindungi undang-undang.
        </p>
      </footer>
    </main>
  );
}
