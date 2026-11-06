"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Eye, FilePlus2, Pencil, Plus } from "lucide-react";
import type { DocType } from "@prisma/client";
import {
  getRichDocumentTemplate,
  saveRichDocumentTemplate,
} from "@/app/actions/documents";
import DocumentWordEditor from "@/components/editor/DocumentWordEditor";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlobalModal } from "@/components/ui/global-modal";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TemplateRow = {
  id: string;
  name: string;
  type: DocType;
  variables: string;
  updatedAt: string;
};

type Draft = {
  id?: string;
  name: string;
  type: DocType;
  contentHtml: string;
};

const documentTypes: { value: DocType; label: string }[] = [
  { value: "SPK", label: "SPK" },
  { value: "PURCHASE_ORDER", label: "Purchase Order (PO)" },
  { value: "DO", label: "Delivery Order (DO)" },
  { value: "INVOICE", label: "Invoice" },
  { value: "BAST", label: "BAST" },
  { value: "SURAT_JALAN", label: "Surat Jalan" },
];

const universalPreviewTypes = [
  { value: "PO", label: "Purchase Order (PO)" },
  { value: "INVOICE", label: "Invoice" },
  { value: "KO", label: "Konfirmasi Order (KO)" },
  { value: "DO", label: "Delivery Order (DO)" },
] as const;

const emptyDraft = (): Draft => ({
  name: "",
  type: "PURCHASE_ORDER",
  contentHtml: "<p></p>",
});

export default function TemplateEditorHub({
  templates,
  initialEditId,
  initialTemplate,
}: {
  templates: TemplateRow[];
  initialEditId?: string;
  initialTemplate?: Draft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(Boolean(initialEditId));
  const [draft, setDraft] = useState<Draft>(
    () => initialTemplate ?? emptyDraft(),
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [previewKind, setPreviewKind] =
    useState<(typeof universalPreviewTypes)[number]["value"]>("PO");

  const openNewTemplate = () => {
    setDraft(emptyDraft());
    setMessage("");
    setIsError(false);
    setSheetOpen(true);
  };

  const openTemplate = (id: string) => {
    setMessage("");
    setIsError(false);
    startTransition(async () => {
      try {
        const result = await getRichDocumentTemplate(id);
        if (!result.success) {
          setIsError(true);
          setMessage(result.message);
          return;
        }
        setDraft({
          id: result.template.id,
          name: result.template.name,
          type: result.template.type,
          contentHtml: result.template.contentHtml,
        });
        setSheetOpen(true);
      } catch (error) {
        console.error("Document template load failed:", error);
        setIsError(true);
        setMessage("Template gagal dimuat. Silakan coba kembali.");
      }
    });
  };

  const saveTemplate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const result = await saveRichDocumentTemplate({
          ...draft,
          contentJson: null,
        });
        setIsError(!result.success);
        setMessage(result.message);
        if (result.success) {
          setSheetOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Document template save failed:", error);
        setIsError(true);
        setMessage("Template gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="size-4 text-primary" />
              Pratinjau Desain Dokumen Universal
            </p>
            <p className="text-sm text-muted-foreground">
              Lihat contoh desain cetak PO, Invoice, KO, dan DO tanpa perlu
              membuka transaksi.
            </p>
          </div>
          <Select
            value={previewKind}
            onValueChange={(value) =>
              setPreviewKind(
                value as (typeof universalPreviewTypes)[number]["value"],
              )
            }
          >
            <SelectTrigger className="w-full sm:w-64" aria-label="Pilih jenis pratinjau">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {universalPreviewTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <UniversalDocumentPreview
          title={`Contoh desain ${previewKind}`}
          src={`/api/documents/transactions?preview=1&kind=${previewKind}`}
          documentNumber={`${
            previewKind === "PO"
              ? "PO"
              : previewKind
          }-CONTOH-2026`}
          onCreateTemplate={openNewTemplate}
        />
      </section>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Template</TableHead>
              <TableHead>Jenis Dokumen</TableHead>
              <TableHead>Variabel</TableHead>
              <TableHead>Diperbarui</TableHead>
              <TableHead className="w-24 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow
                key={template.id}
                className="cursor-pointer"
                onClick={() => openTemplate(template.id)}
              >
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {documentTypes.find((type) => type.value === template.type)
                      ?.label ?? template.type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-sm truncate text-xs text-muted-foreground">
                  {template.variables || "Belum ada placeholder"}
                </TableCell>
                <TableCell>
                  {format(new Date(template.updatedAt), "d MMM yyyy, HH:mm", {
                    locale: id,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <ActionIconButton
                    label={`Edit template ${template.name}`}
                    tooltip={`Edit template ${template.name}`}
                    icon={Pencil}
                    onClick={(event) => {
                      event.stopPropagation();
                      openTemplate(template.id);
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {templates.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-36 text-center text-muted-foreground"
                >
                  <FilePlus2 className="mx-auto mb-2 size-6 opacity-50" />
                  Belum ada template dokumen.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <GlobalModal
        isOpen={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          const params = new URLSearchParams(window.location.search);
          params.delete("edit");
          router.replace(
            params.size ? `/apps/templates?${params}` : "/apps/templates",
            { scroll: false },
          );
        }}
        title={draft.id ? "Edit Template Dokumen" : "Buat Template Dokumen"}
        description="Susun dokumen di halaman kiri dan pantau pratinjau cetak A4 di sebelah kanan."
        className="!w-[96vw] !max-w-[96vw]"
      >
          <form
            className="mt-5 space-y-4"
            onSubmit={saveTemplate}
            key={draft.id ?? "new-template"}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-2">
                <Label htmlFor="document-template-name">Nama template</Label>
                <Input
                  id="document-template-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  maxLength={120}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label>Jenis dokumen</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) =>
                    setDraft({ ...draft, type: value as DocType })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DocumentWordEditor
              contentHtml={draft.contentHtml}
              documentType={draft.type}
              splitPreview
              onChange={(contentHtml) =>
                setDraft((current) => ({ ...current, contentHtml }))
              }
            />

            {message && (
              <p
                role={isError ? "alert" : "status"}
                className={
                  isError ? "text-sm text-destructive" : "text-sm text-success"
                }
              >
                {message}
              </p>
            )}

            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-slate-700 bg-[#0F172A]/95 py-3 backdrop-blur">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSheetOpen(false);
                  const params = new URLSearchParams(window.location.search);
                  params.delete("edit");
                  router.replace(
                    params.size ? `/apps/templates?${params}` : "/apps/templates",
                    { scroll: false },
                  );
                }}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan Template"}
              </Button>
            </div>
          </form>
      </GlobalModal>
    </div>
  );
}
