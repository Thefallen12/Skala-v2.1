"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateTransactionDocumentSignature,
  type TransactionDocumentAction,
  type TransactionDocumentKind,
} from "@/app/actions/document-signatures";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  photoDownloadHref,
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import {
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  PenLine,
} from "lucide-react";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";

export type DocumentSignoffTask = {
  id: string;
  kind: TransactionDocumentKind;
  number: string;
  subtitle?: string | null;
  attachmentUrl?: string | null;
  action: TransactionDocumentAction;
  signedByName: string | null;
  signedAt: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  previewUrl: string;
};

function isPdfAttachment(url: string) {
  return /\.pdf(?:[?#]|$)/i.test(url) || url.includes("/raw/upload/");
}

export default function DocumentSignoffQueue({
  tasks,
  title,
  description,
}: {
  tasks: DocumentSignoffTask[];
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [previewTask, setPreviewTask] = useState<DocumentSignoffTask | null>(
    null,
  );
  const [previewTab, setPreviewTab] = useState<"document" | "attachment">(
    "document",
  );

  const openPreview = (task: DocumentSignoffTask) => {
    setPreviewTab("document");
    setPreviewTask(task);
  };

  const updateSignature = (task: DocumentSignoffTask) => {
    startTransition(async () => {
      try {
        const result = await updateTransactionDocumentSignature(
          task.kind,
          task.id,
          task.action,
        );
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Document sign-off action failed:", error);
        toast.error("Konfirmasi dokumen gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  if (tasks.length === 0) return null;

  const hasAttachment = Boolean(previewTask?.attachmentUrl);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="type-h2">{title}</CardTitle>
          <p className="type-p2 text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.map((task) => (
            <article
              key={`${task.kind}:${task.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="type-h3 text-primary">
                  {task.kind} · {task.number}
                </p>
                {task.subtitle && (
                  <p className="type-p3 font-medium text-foreground/80">
                    {task.subtitle}
                  </p>
                )}
                <p className="type-p3 text-muted-foreground">
                  {task.signedByName
                    ? `Ditandatangani ${task.signedByName}${task.signedAt ? ` · ${new Date(task.signedAt).toLocaleString("id-ID")}` : ""}`
                    : "Belum ditandatangani"}
                </p>
                <p className="type-p3 text-muted-foreground">
                  {task.acknowledgedByName
                    ? `Diketahui ${task.acknowledgedByName}${task.acknowledgedAt ? ` · ${new Date(task.acknowledgedAt).toLocaleString("id-ID")}` : ""}`
                    : "Belum diketahui"}
                </p>
              </div>
              <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-w-0"
                  onClick={() => openPreview(task)}
                >
                  <Eye className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Pratinjau</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-w-0"
                  onClick={() => updateSignature(task)}
                  disabled={isPending}
                >
                  {task.action === "sign" ? (
                    <PenLine className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <FileCheck2 className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {isPending ? (
                      "Menyimpan..."
                    ) : task.action === "sign" ? (
                      "Tanda Tangani"
                    ) : task.kind === "DO" ? (
                      <>
                        <span className="sm:hidden">Konfirmasi</span>
                        <span className="hidden sm:inline">Konfirmasi Lapangan</span>
                      </>
                    ) : (
                      "Konfirmasi"
                    )}
                  </span>
                </Button>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <GlobalModal
        isOpen={previewTask !== null}
        onClose={() => setPreviewTask(null)}
        title={
          previewTask
            ? `${previewTask.kind} · ${previewTask.number}`
            : "Pratinjau Dokumen"
        }
        description={
          previewTask?.subtitle ?? "Pratinjau dokumen siap tanda tangan."
        }
        hideHeader={!hasAttachment}
        footerNote=""
        className="sm:max-w-3xl"
        bodyClassName={
          hasAttachment
            ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }
        footer={
          hasAttachment && previewTask?.attachmentUrl ? (
            <>
              <Button size="sm" variant="outline" className="min-w-0" asChild>
                <a
                  href={photoDownloadHref(previewTask.attachmentUrl)}
                  {...photoDownloadLinkProps(previewTask.attachmentUrl)}
                >
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {photoDownloadLabel(previewTask.attachmentUrl)}
                  </span>
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPreviewTask(null)}
              >
                Tutup
              </Button>
            </>
          ) : undefined
        }
      >
        {previewTask &&
          (hasAttachment && previewTask.attachmentUrl ? (
            <Tabs
              value={previewTab}
              onValueChange={(value) =>
                setPreviewTab(value as "document" | "attachment")
              }
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
                <TabsTrigger
                  value="document"
                  className="type-p3 min-w-0 gap-1.5 px-2 py-1.5 font-semibold sm:px-3"
                >
                  <FileText className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Dokumen Sistem</span>
                </TabsTrigger>
                <TabsTrigger
                  value="attachment"
                  className="type-p3 min-w-0 gap-1.5 px-2 py-1.5 font-semibold sm:px-3"
                >
                  <Eye className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Lampiran Nota</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="document"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <UniversalDocumentPreview
                  title={`${previewTask.kind} · ${previewTask.number}`}
                  documentNumber={previewTask.number}
                  src={previewTask.previewUrl}
                  toolbarLabel={previewTask.subtitle ?? undefined}
                  minimalToolbar
                  onClose={() => setPreviewTask(null)}
                />
              </TabsContent>
              <TabsContent
                value="attachment"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-border bg-muted/20 p-2"
              >
                {isPdfAttachment(previewTask.attachmentUrl) ? (
                  <iframe
                    src={withLocalPhotoPreview(previewTask.attachmentUrl)}
                    title={`Lampiran ${previewTask.number}`}
                    className="h-[65vh] w-full rounded bg-white"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={withLocalPhotoPreview(previewTask.attachmentUrl)}
                    alt={`Lampiran ${previewTask.number}`}
                    className="mx-auto max-h-[65vh] w-auto max-w-full rounded object-contain"
                  />
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <UniversalDocumentPreview
              title={`${previewTask.kind} · ${previewTask.number}`}
              documentNumber={previewTask.number}
              src={previewTask.previewUrl}
              toolbarLabel={previewTask.subtitle ?? undefined}
              minimalToolbar
              onClose={() => setPreviewTask(null)}
            />
          ))}
      </GlobalModal>
    </>
  );
}
