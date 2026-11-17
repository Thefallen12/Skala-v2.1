"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { EmptyState } from "@/components/ui/empty-state";
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
  const [previewKind, setPreviewKind] =
    useState<(typeof universalPreviewTypes)[number]["value"]>("PO");

  const openNewTemplate = () => {
    setDraft(emptyDraft());
    setSheetOpen(true);
  };

  const openTemplate = (templateId: string) => {
    startTransition(async () => {
      try {
        const result = await getRichDocumentTemplate(templateId);
        if (!result.success) {
          toast.error(result.message);
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
        toast.error("Template gagal dimuat. Silakan coba kembali.");
      }
    });
  };

  const saveTemplate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveRichDocumentTemplate({
          ...draft,
          contentJson: null,
        });
        if (result.success) {
          toast.success(result.message);
          setSheetOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Document template save failed:", error);
        toast.error("Template gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="type-h2 flex items-center gap-2 text-foreground">
              <Eye className="size-4 text-primary" aria-hidden="true" />
              Pratinjau Desain Dokumen Universal
            </h2>
            <p className="type-p2 text-muted-foreground">
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
          documentNumber={`${previewKind}-CONTOH-2026`}
          onCreateTemplate={openNewTemplate}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="type-h2 text-foreground">Daftar Template Dokumen</h2>
            <p className="type-p3 text-muted-foreground">
              Klik salah satu template untuk menyunting isi dan tata letak cetak.
            </p>
          </div>
          <Button type="button" size="sm" onClick={openNewTemplate}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Buat Template
          </Button>
        </div>

        {templates.length ? (
          <>
            <div className="space-y-2.5 md:hidden">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="type-p2 truncate font-semibold text-foreground">
                      {template.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {documentTypes.find((type) => type.value === template.type)
                          ?.label ?? template.type}
                      </Badge>
                      <span className="type-p3 text-muted-foreground">
                        {format(new Date(template.updatedAt), "d MMM yyyy, HH:mm", {
                          locale: id,
                        })}
                      </span>
                    </div>
                  </div>
                  <ActionIconButton
                    label={`Edit template ${template.name}`}
                    tooltip={`Edit template ${template.name}`}
                    icon={Pencil}
                    onClick={() => openTemplate(template.id)}
                  />
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
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
                      <TableCell className="type-p2 font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {documentTypes.find((type) => type.value === template.type)
                            ?.label ?? template.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 max-w-sm truncate text-muted-foreground">
                        {template.variables || "Belum ada placeholder"}
                      </TableCell>
                      <TableCell className="type-p2">
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
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            variant="inline"
            icon={FilePlus2}
            title="Belum ada template dokumen"
            description="Buat template pertama untuk mempercepat penyusunan dokumen resmi."
            action={
              <Button type="button" size="sm" onClick={openNewTemplate}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Buat Template
              </Button>
            }
          />
        )}
      </section>

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
        footer={
          <>
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
            <Button type="submit" form="template-editor-form" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan Template"}
            </Button>
          </>
        }
      >
          <form
            id="template-editor-form"
            className="space-y-4"
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
                  <SelectTrigger className="w-full">
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
          </form>
      </GlobalModal>
    </div>
  );
}
