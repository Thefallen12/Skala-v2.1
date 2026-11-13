"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTransactionDocumentSignature,
  type TransactionDocumentAction,
  type TransactionDocumentKind,
} from "@/app/actions/document-signatures";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, FileCheck2, PenLine } from "lucide-react";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";

export type DocumentSignoffTask = {
  id: string;
  kind: TransactionDocumentKind;
  number: string;
  action: TransactionDocumentAction;
  signedByName: string | null;
  signedAt: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  previewUrl: string;
};

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
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const updateSignature = (task: DocumentSignoffTask) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await updateTransactionDocumentSignature(
          task.kind,
          task.id,
          task.action,
        );
        setMessage(result.message);
        if (result.success) {
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Document sign-off action failed:", error);
        setMessage("Konfirmasi dokumen gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((task) => (
          <article
            key={`${task.kind}:${task.id}`}
            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-primary">
                {task.kind} · {task.number}
              </p>
              <p className="text-xs text-muted-foreground">
                {task.signedByName
                  ? `Ditandatangani ${task.signedByName}${task.signedAt ? ` · ${new Date(task.signedAt).toLocaleString("id-ID")}` : ""}`
                  : "Belum ditandatangani"}
              </p>
              <p className="text-xs text-muted-foreground">
                {task.acknowledgedByName
                  ? `Diketahui ${task.acknowledgedByName}${task.acknowledgedAt ? ` · ${new Date(task.acknowledgedAt).toLocaleString("id-ID")}` : ""}`
                  : "Belum diketahui"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={task.previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                  Pratinjau
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => updateSignature(task)}
                disabled={isPending}
              >
                {task.action === "sign" ? (
                  <PenLine className="mr-2 size-4" aria-hidden="true" />
                ) : (
                  <FileCheck2 className="mr-2 size-4" aria-hidden="true" />
                )}
                {isPending
                  ? "Menyimpan..."
                  : task.action === "sign"
                    ? "Tanda Tangani"
                    : task.kind === "DO"
                      ? "Konfirmasi Koordinator Lapangan"
                      : "Konfirmasi Diketahui"}
              </Button>
            </div>
          </article>
        ))}
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
