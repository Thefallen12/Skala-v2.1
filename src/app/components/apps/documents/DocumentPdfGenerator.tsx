"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { DocType } from "@prisma/client";
import { Button } from "@/components/ui/button";

export type DocumentTemplateOption = {
  id: string;
  name: string;
  type: DocType;
};

export default function DocumentPdfGenerator({
  recordType,
  recordId,
  documentNumber,
  templates,
}: {
  recordType: "PO" | "DO" | "TICKET";
  recordId: string;
  documentNumber: string;
  templates: DocumentTemplateOption[];
}) {
  const compatibleTemplates = templates.filter((template) =>
    recordType === "PO"
      ? template.type === "PURCHASE_ORDER"
      : recordType === "DO"
        ? template.type === "DO" || template.type === "SURAT_JALAN"
        : true,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    compatibleTemplates[0]?.id ?? "",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");

  const downloadPdf = async () => {
    if (!selectedTemplateId) return;
    setIsGenerating(true);
    setMessage("");
    try {
      const response = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          recordType,
          recordId,
        }),
      });
      if (!response.ok) {
        let errorMessage = `PDF gagal dibuat (HTTP ${response.status}).`;
        try {
          const result = (await response.json()) as { message?: string };
          if (result.message) errorMessage = result.message;
        } catch {
          errorMessage = `PDF gagal dibuat (HTTP ${response.status}).`;
        }
        setMessage(errorMessage);
        return;
      }

      const pdfUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = `${documentNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      setMessage("PDF berhasil dibuat dan diunduh.");
    } catch (error) {
      console.error("Document PDF download failed:", error);
      setMessage("PDF gagal diunduh. Periksa koneksi lalu coba kembali.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-60 flex-1 space-y-1.5 text-sm">
          <span className="font-medium">Template PDF</span>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            disabled={isGenerating || compatibleTemplates.length === 0}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
          >
            {compatibleTemplates.length === 0 && (
              <option value="">Belum ada template yang cocok</option>
            )}
            {compatibleTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          onClick={downloadPdf}
          disabled={
            !selectedTemplateId ||
            isGenerating ||
            compatibleTemplates.length === 0
          }
        >
          <Download className="mr-2 size-4" />
          {isGenerating ? "Membuat PDF..." : "Generate & Cetak PDF"}
        </Button>
      </div>
      {message && (
        <p
          role={message.includes("berhasil") ? "status" : "alert"}
          className="text-sm text-muted-foreground"
        >
          {message}
        </p>
      )}
    </div>
  );
}
