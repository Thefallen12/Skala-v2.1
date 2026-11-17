"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DocumentLookupForm({ idPrefix = "home" }: { idPrefix?: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const inputId = `${idPrefix}-document-code`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = code.trim();
    if (!cleaned) {
      setError("Masukkan kode verifikasi dokumen terlebih dahulu.");
      return;
    }
    setError("");
    router.push(`/verify/${encodeURIComponent(cleaned)}`);
  };

  return (
    <form
      action="/verify"
      method="GET"
      onSubmit={handleSubmit}
      toolname="verify_document_lookup"
      tooldescription="Verifikasi keaslian dokumen resmi PT Skala Prioritas Engineering (Purchase Order, Invoice, Surat Jalan, atau Kontrak) menggunakan kode QR dokumen."
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="type-p2 font-semibold text-slate-900 dark:text-slate-100">
          Kode Verifikasi Dokumen
        </Label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <QrCode
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              id={inputId}
              name="code"
              type="text"
              required
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (error) setError("");
              }}
              placeholder="Contoh: PO-2026-001 atau kode QR"
              toolparamdescription="Kode verifikasi alfanumerik yang tertera di bawah QR Code dokumen resmi."
              className="h-11 pl-9"
            />
          </div>
          <Button
            type="submit"
            className="h-11 shrink-0 bg-[#102A4D] px-5 text-white hover:bg-[#0B1E38]"
          >
            Periksa Dokumen
            <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
          </Button>
        </div>
        {error && (
          <p className="type-p3 text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="type-p3 text-slate-600 dark:text-slate-400">
        Mendukung pengecekan dokumen Purchase Order (PO), Surat Jalan (DO), Invoice, dan kontrak konstruksi resmi.
      </p>
    </form>
  );
}
