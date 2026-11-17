"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useState } from "react";

class SentryExampleFrontendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleFrontendError";
  }
}

export default function SentryExampleClient({
  hasClientDsn,
  hasServerDsn,
  hasAuthToken,
  org,
  project,
}: {
  hasClientDsn: boolean;
  hasServerDsn: boolean;
  hasAuthToken: boolean;
  org: string;
  project: string;
}) {
  const [hasSentError, setHasSentError] = useState(false);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const isFullyConfigured = hasClientDsn && hasServerDsn;

  const handleThrowSampleError = async () => {
    setIsTriggering(true);
    setApiStatus(null);
    try {
      await Sentry.startSpan(
        {
          name: "Example Frontend/Backend Span",
          op: "test",
        },
        async () => {
          const response = await fetch("/api/sentry-example-api", {
            cache: "no-store",
          });
          setApiStatus(`Backend /api/sentry-example-api HTTP ${response.status}`);
          if (!response.ok) {
            setHasSentError(true);
            throw new SentryExampleFrontendError(
              "This error is raised on the frontend of the example page.",
            );
          }
        },
      );
    } finally {
      setIsTriggering(false);
    }
  };

  const handleTriggerUndefinedFunction = () => {
    setHasSentError(true);
    const missingFn = (globalThis as { myUndefinedFunction?: () => void })
      .myUndefinedFunction;
    missingFn!();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12 text-slate-900 dark:text-slate-100">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
          Sentry Verification · {org} / {project}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Sentry Next.js SDK Test Page
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Gunakan tombol di bawah ini untuk memicu contoh error frontend dan backend API guna memverifikasi integrasi <code>@sentry/nextjs</code>.
        </p>

        <div className="mt-6 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center justify-between">
            <span>Client DSN (NEXT_PUBLIC_SENTRY_DSN)</span>
            <span
              className={
                hasClientDsn
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {hasClientDsn ? "Terpasang" : "Belum diisi di .env"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Server / Edge DSN (SENTRY_DSN)</span>
            <span
              className={
                hasServerDsn
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {hasServerDsn ? "Terpasang" : "Belum diisi di .env"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Source Maps Auth Token (SENTRY_AUTH_TOKEN)</span>
            <span
              className={
                hasAuthToken
                  ? "font-semibold text-emerald-600"
                  : "font-medium text-slate-500"
              }
            >
              {hasAuthToken ? "Terpasang" : "Opsional (belum diisi)"}
            </span>
          </div>
        </div>

        {!isFullyConfigured ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Perhatian:</strong> <code>SENTRY_DSN</code> dan{" "}
            <code>NEXT_PUBLIC_SENTRY_DSN</code> di file <code>.env</code> masih kosong, sehingga event tidak akan terkirim ke dashboard Sentry sampai Anda mengisi DSN lalu menjalankan ulang <code>npm run dev</code>.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isTriggering}
            onClick={handleThrowSampleError}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {isTriggering ? "Mengirim Test Error..." : "Throw Sample Error"}
          </button>

          <button
            type="button"
            onClick={handleTriggerUndefinedFunction}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Trigger myUndefinedFunction()
          </button>
        </div>

        {apiStatus ? (
          <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
            Status API: <code>{apiStatus}</code>
          </p>
        ) : null}

        {hasSentError ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Sample error sudah dipicu. Buka{" "}
            <a
              href={`https://${org}.sentry.io/issues/?project=${encodeURIComponent(project)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Sentry Issues ({org}/{project})
            </a>{" "}
            untuk melihat laporan error dan trace.
          </div>
        ) : null}

        <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800">
          <Link href="/" className="hover:underline">
            Kembali ke Aplikasi
          </Link>
        </div>
      </div>
    </main>
  );
}

