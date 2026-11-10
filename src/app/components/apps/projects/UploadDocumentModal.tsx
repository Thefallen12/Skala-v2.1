"use client";

import React, { useState } from "react";
import { X, HelpCircle, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadProjectDocument } from "@/app/actions/project";

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
}

const CATEGORIES = [
  "Kontrak",
  "Gambar kerja",
  "Izin & Legalitas",
  "BAST & Serah Terima",
  "Lainnya",
];

export default function UploadDocumentModal({
  isOpen,
  onClose,
  projectId,
  onSuccess,
}: UploadDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Kontrak");
  const [notes, setNotes] = useState("");
  const [showInClientPortal, setShowInClientPortal] = useState(false);
  const [showInMobileApp, setShowInMobileApp] = useState(false);
  const [fileName, setFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Judul dokumen wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await uploadProjectDocument(projectId, {
        title: title.trim(),
        category,
        fileUrl: fileName ? `/uploads/${fileName}` : "/documents/dokumen_proyek.pdf",
        notes: notes.trim(),
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-5 pb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Unggah dokumen</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, gambar, DWG, Excel atau dokumen lain, paling besar 25 MB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <HelpCircle className="size-3.5" />
              <span>Panduan</span>
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {errorMsg && (
              <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            {/* File Input */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">File</label>
              <div className="flex items-center gap-2 rounded-lg border border-border p-2 bg-background">
                <input
                  type="file"
                  id="doc-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFileName(f.name);
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:cursor-pointer cursor-pointer"
                />
              </div>
            </div>

            {/* Jenis */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Jenis</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Judul */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Judul</label>
              <Input
                type="text"
                placeholder="mis. Denah lantai 1-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            {/* Checkboxes */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground select-none">
                <input
                  type="checkbox"
                  checked={showInClientPortal}
                  onChange={(e) => setShowInClientPortal(e.target.checked)}
                  className="size-4 rounded border-border text-foreground accent-foreground cursor-pointer"
                />
                <span>Tampilkan di portal klien</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground select-none">
                <input
                  type="checkbox"
                  checked={showInMobileApp}
                  onChange={(e) => setShowInMobileApp(e.target.checked)}
                  className="size-4 rounded border-border text-foreground accent-foreground cursor-pointer"
                />
                <span>Tampilkan ke tim proyek di HP (gambar kerja)</span>
              </label>
            </div>

            {/* Catatan (opsional) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Catatan (opsional)
              </label>
              <Input
                type="text"
                placeholder="mis. Rev 0"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/10 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 px-4 text-xs rounded-lg"
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              className="h-9 px-4 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
