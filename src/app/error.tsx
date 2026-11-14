"use client";

import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("Unhandled application error");
  }, [error]);

  return (
    <main className="error-shell" role="alert">
      <section className="error-window">
        <div className="error-window-bar" aria-hidden="true">
          <span className="window-dot window-dot-red" />
          <span className="window-dot window-dot-yellow" />
          <span className="window-dot window-dot-green" />
          <span className="error-window-address">skala-prioritas.com / aplikasi / error</span>
          <span className="error-window-actions">◌ &nbsp; ⋮</span>
        </div>
        <div className="error-content">
          <div className="error-illustration">
            <Image
              src="/images/backgrounds/errorimg.svg"
              alt=""
              width={280}
              height={190}
              priority
            />
          </div>
          <p className="error-code">500</p>
          <h1>GAGAL MEMUAT HALAMAN</h1>
          <p className="error-title-en">THIS PAGE COULDN&apos;T LOAD</p>
          <p className="error-copy">
            Mohon maaf, terjadi kesalahan pada server kami sehingga halaman ini
            tidak dapat ditampilkan saat ini. Silakan coba memuat ulang beberapa
            saat lagi.
            <br />
            A server error occurred. Please reload to try again.
          </p>
          <div className="error-actions">
            <button type="button" className="error-button error-button-primary" onClick={reset}>
              <RefreshCw size={21} aria-hidden="true" />
              <span>
                <strong>Muat Ulang</strong>
                <small>Reload</small>
              </span>
            </button>
            <Link href="/" className="error-button error-button-secondary">
              <Home size={22} aria-hidden="true" />
              <span>
                <strong>Kembali ke Beranda</strong>
                <small>Back to Home</small>
              </span>
            </Link>
            <Link href="/apps/tickets" className="error-button error-button-quiet">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                <strong>Laporkan Masalah</strong>
                <small>Report Issue</small>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="error-footer">
        <span>ADAPT, IMPROVISE AND FINISH</span>
      </footer>
    </main>
  );
}
