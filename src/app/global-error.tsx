"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100 antialiased">
        <main
          role="alert"
          className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            Error 500
          </p>
          <h1 className="mt-2 text-xl font-bold">Terjadi Kesalahan Aplikasi</h1>
          <p className="mt-2 text-sm text-slate-300">
            Mohon maaf, sistem mengalami gangguan tak terduga. Laporan kesalahan
            telah dicatat untuk pemeriksaan teknis.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Muat Ulang
            </button>
            <Link
              href="/"
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
