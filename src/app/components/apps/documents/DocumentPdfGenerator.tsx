"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import type { DocType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const downloadPdf = async () => {
    if (!selectedTemplateId) return;
    setIsGenerating(true);
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
        toast.error(errorMessage);
        return;
      }

      const pdfUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = `${documentNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      toast.success("PDF berhasil dibuat dan diunduh.");
    } catch (error) {
      console.error("Document PDF download failed:", error);
      toast.error("PDF gagal diunduh. Periksa koneksi lalu coba kembali.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (compatibleTemplates.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label htmlFor={`pdf-template-${recordId}`} className="type-p2 font-medium">
            Template PDF
          </Label>
          <Select
            value={selectedTemplateId}
            onValueChange={setSelectedTemplateId}
            disabled={isGenerating}
          >
            <SelectTrigger id={`pdf-template-${recordId}`} className="w-full bg-background">
              <SelectValue placeholder="Pilih template PDF" />
            </SelectTrigger>
            <SelectContent>
              {compatibleTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={downloadPdf}
          disabled={!selectedTemplateId || isGenerating}
        >
          <Download className="mr-2 size-4" aria-hidden="true" />
          {isGenerating ? "Membuat PDF..." : "Unduh PDF"}
        </Button>
      </div>
    </div>
  );
}
