"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  FileText,
  Pencil,
  Plus,
  Printer,
  Save,
} from "lucide-react";
import {
  createSignedOperationalDocument,
  loadOperationalDocumentSignature,
  saveRichDocumentTemplate,
  saveDocumentTemplate,
} from "@/app/actions/documents";
import CardBox from "@/app/components/shared/CardBox";
import {
  OperationalDocumentKind,
  OperationalDocumentStatus,
  TicketStatus,
  DocType,
} from "@prisma/client";
import type { Template } from "@pdfme/common";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import DocumentWordEditor from "@/components/editor/DocumentWordEditor";
import PdfmeDocumentEditor from "@/components/editor/PdfmeDocumentEditor";
import { createBlankPdfmeTemplate } from "@/lib/documents/pdfme-template";

type TemplateRow = {
  id: string;
  name: string;
  kind: OperationalDocumentKind;
  title: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
};

type RichTemplateDraft = {
  id: string;
  name: string;
  type: DocType;
  contentHtml: string;
  contentJson: Template | null;
  variables: string;
};

type TicketOption = {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  totalAmount: string | null;
  requester: { name: string };
  project: { title: string } | null;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost: string | null;
  }[];
};

type DocumentRow = {
  id: string;
  documentNumber: string;
  kind: OperationalDocumentKind;
  status: OperationalDocumentStatus;
  title: string;
  content: string;
  signatureImage?: string;
  signerName: string;
  signedAt: string;
  issuedAt: string | null;
  createdAt: string;
  ticket: { id: string; ticketNumber: string; title: string };
  signedBy: { name: string };
  issuedBy: { name: string } | null;
};

const kindLabels: Record<OperationalDocumentKind, string> = {
  [OperationalDocumentKind.PURCHASE_ORDER]: "Purchase Order (PO)",
  [OperationalDocumentKind.DELIVERY_ORDER]: "Delivery Order (DO)",
  [OperationalDocumentKind.CUSTOM]: "Dokumen Custom",
};

const docTypeLabels: Record<DocType, string> = {
  [DocType.INVOICE]: "Invoice",
  [DocType.PURCHASE_ORDER]: "Purchase Order (PO)",
  [DocType.DO]: "Delivery Order (DO)",
  [DocType.SPK]: "SPK",
  [DocType.SURAT_JALAN]: "Surat Jalan",
  [DocType.BAST]: "BAST",
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const editableItemsTable = `<table class="items po-items"><thead><tr><th>DESCRIPTION</th><th class="number">QTY</th><th class="money">UNIT PRICE</th><th class="money">AMOUNT</th></tr></thead><tbody><tr><td>Contoh material</td><td>1</td><td>Rp 0</td><td>Rp 0</td></tr></tbody></table>`;

function fillTemplate(
  content: string,
  ticket: TicketOption,
  kind: OperationalDocumentKind,
): string {
  const itemLines = ticket.items
    .map((item) => {
      const quantity = `${item.quantity} ${item.unit}`;
      if (kind === OperationalDocumentKind.DELIVERY_ORDER) {
        return `- ${item.itemName}: ${quantity}`;
      }
      const price = item.estimatedCost
        ? currencyFormatter.format(Number(item.estimatedCost))
        : "tanpa estimasi";
      return `- ${item.itemName}: ${quantity} (${price})`;
    })
    .join("\n");
  const replacements: Record<string, string> = {
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.title,
    requester: ticket.requester.name,
    project: ticket.project?.title ?? "-",
    amount: ticket.totalAmount
      ? currencyFormatter.format(Number(ticket.totalAmount))
      : "-",
    items: itemLines,
  };
  return content.replace(/\{\{(ticketNumber|ticketTitle|requester|project|amount|items)\}\}/g, (_, key: string) => replacements[key]);
}

function normalizeItemsTable(content: string): string {
  return content
    .replace(
      /<p\b[^>]*>\s*\{\{\s*items_table\s*\}\}\s*<\/p>/gi,
      editableItemsTable,
    )
    .replace(/\{\{\s*items_table\s*\}\}/gi, editableItemsTable);
}

export default function DocumentWorkspace({
  templates,
  tickets,
  documents,
  readOnly = false,
  templateEditorOnly = false,
  initialRichTemplate = null,
}: {
  templates: TemplateRow[];
  tickets: TicketOption[];
  documents: DocumentRow[];
  readOnly?: boolean;
  templateEditorOnly?: boolean;
  initialRichTemplate?: RichTemplateDraft | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<OperationalDocumentKind>(
    OperationalDocumentKind.PURCHASE_ORDER,
  );
  const [ticketId, setTicketId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [signatureDrawn, setSignatureDrawn] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{
    id?: string;
    name: string;
    kind: OperationalDocumentKind;
    title: string;
    content: string;
  }>({
    name: "",
    kind: OperationalDocumentKind.PURCHASE_ORDER,
    title: "",
    content: "",
  });
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateError, setTemplateError] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null);
  const [detailMessage, setDetailMessage] = useState("");
  const [richTemplateName, setRichTemplateName] = useState(initialRichTemplate?.name ?? "");
  const [richTemplateType, setRichTemplateType] = useState<DocType>(
    initialRichTemplate?.type ?? DocType.PURCHASE_ORDER,
  );
  const [richEditorMode, setRichEditorMode] = useState<"pdfme" | "word">(
    !initialRichTemplate || initialRichTemplate.contentJson ? "pdfme" : "word",
  );
  const [richContentHtml, setRichContentHtml] = useState(
    initialRichTemplate
      ? normalizeItemsTable(initialRichTemplate.contentHtml)
      : "<p></p>",
  );
  const [pdfmeTemplate, setPdfmeTemplate] = useState<Template>(
    initialRichTemplate?.contentJson ?? createBlankPdfmeTemplate(),
  );
  const [richTemplateMessage, setRichTemplateMessage] = useState("");
  const [richTemplateError, setRichTemplateError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signingRef = useRef(false);

  const selectedTicket = tickets.find((ticket) => ticket.id === ticketId);
  const compatibleTemplates = useMemo(
    () => templates.filter((template) => template.isActive && template.kind === kind),
    [kind, templates],
  );
  const compatibleTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        kind === OperationalDocumentKind.PURCHASE_ORDER
          ? ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
            ticket.status === TicketStatus.PROCESSED_FINANCE
          : true,
      ),
    [kind, tickets],
  );
  const signedDocuments = documents.filter(
    (document) => document.status === OperationalDocumentStatus.SIGNED,
  );
  const issuedDocuments = documents.filter(
    (document) => document.status === OperationalDocumentStatus.ISSUED,
  );

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDrawn(false);
  };

  const startSigning = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    signingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    context.beginPath();
    context.moveTo(
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    );
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#172554";
    context.lineTo(
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    );
    context.stroke();
    setSignatureDrawn(true);
  };

  const continueSigning = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !signingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    context.lineTo(
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    );
    context.stroke();
  };

  const finishSigning = () => {
    signingRef.current = false;
  };

  const chooseTemplate = (value: string) => {
    setTemplateId(value === "NONE" ? "" : value);
    const template = compatibleTemplates.find((item) => item.id === value);
    if (!template) return;
    setTitle(template.title);
    setContent(
      selectedTicket
        ? fillTemplate(template.content, selectedTicket, kind)
        : template.content,
    );
  };

  const submitDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const signatureImage = canvasRef.current?.toDataURL("image/png") ?? "";
    if (!signatureDrawn || !signatureImage) {
      setCreateError(true);
      setCreateMessage("Tanda tangan wajib dibubuhkan sebelum dokumen disimpan.");
      return;
    }
    if (!ticketId) {
      setCreateError(true);
      setCreateMessage("Pilih tiket material yang akan dilampirkan.");
      return;
    }
    setCreateMessage("");
    startTransition(async () => {
      try {
        const result = await createSignedOperationalDocument({
          ticketId,
          templateId: templateId || undefined,
          kind,
          title,
          content,
          signatureImage,
        });
        setCreateError(!result.success);
        setCreateMessage(result.message);
        if (result.success) {
          setSignatureDrawn(false);
          setTicketId("");
          setTemplateId("");
          setTitle("");
          setContent("");
          clearSignature();
          router.refresh();
        }
      } catch (error) {
        console.error("Signed operational document save failed:", error);
        setCreateError(true);
        setCreateMessage("Dokumen gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const openTemplateDialog = (template?: TemplateRow) => {
    setTemplateMessage("");
    setTemplateError(false);
    setTemplateDraft(
      template
        ? {
            id: template.id,
            name: template.name,
            kind: template.kind,
            title: template.title,
            content: template.content,
          }
        : {
            name: "",
            kind,
            title: "",
            content: "",
          },
    );
    setTemplateDialogOpen(true);
  };

  const submitTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTemplateMessage("");
    startTransition(async () => {
      try {
        const result = await saveDocumentTemplate(templateDraft);
        setTemplateError(!result.success);
        setTemplateMessage(result.message);
        if (result.success) {
          setTemplateDialogOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Operational document template save failed:", error);
        setTemplateError(true);
        setTemplateMessage("Template gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const submitRichTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!richContentHtml.trim() || richContentHtml === "<p></p>") {
      setRichTemplateError(true);
      setRichTemplateMessage("Isi template dokumen wajib diisi.");
      return;
    }
    setRichTemplateMessage("");
    startTransition(async () => {
      try {
        const result = await saveRichDocumentTemplate({
          id: initialRichTemplate?.id,
          name: richTemplateName,
          type: richTemplateType,
          contentHtml: richContentHtml,
          contentJson: richEditorMode === "pdfme" ? pdfmeTemplate : null,
        });
        setRichTemplateError(!result.success);
        setRichTemplateMessage(result.message);
        if (result.success) {
          if (!initialRichTemplate) {
            setRichTemplateName("");
            setRichTemplateType(DocType.PURCHASE_ORDER);
            setRichContentHtml("<p></p>");
            setPdfmeTemplate(createBlankPdfmeTemplate());
          }
          router.refresh();
        }
      } catch (error) {
        console.error("Rich document template save failed:", error);
        setRichTemplateError(true);
        setRichTemplateMessage("Template gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const openDocument = (document: DocumentRow) => {
    setSelectedDocument(document);
    setDetailMessage("Memuat tanda tangan...");
    startTransition(async () => {
      try {
        const result = await loadOperationalDocumentSignature(document.id);
        if (!result.success || !result.signatureImage) {
          setDetailMessage(result.message);
          return;
        }
        setSelectedDocument((current) =>
          current?.id === document.id
            ? { ...current, signatureImage: result.signatureImage }
            : current,
        );
        setDetailMessage("");
      } catch (error) {
        console.error("Operational document signature load failed:", error);
        setDetailMessage("Tanda tangan gagal dimuat. Silakan coba kembali.");
      }
    });
  };

  if (templateEditorOnly) {
    return (
      <CardBox>
        <form onSubmit={submitRichTemplate} className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">
              {initialRichTemplate ? "Edit Template Dokumen" : "Buat Template Dokumen"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              PDFme sudah terpasang. Template PDFme disimpan sebagai JSON, sedangkan
              template Word lama tetap disimpan sebagai HTML.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rich-template-name">Nama Template</Label>
              <Input
                id="rich-template-name"
                value={richTemplateName}
                onChange={(event) => setRichTemplateName(event.target.value)}
                maxLength={120}
                placeholder="Contoh: Template Purchase Order Proyek"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rich-template-type">Tipe Dokumen</Label>
              <Select
                value={richTemplateType}
                onValueChange={(value) => {
                  if (Object.values(DocType).includes(value as DocType)) {
                    setRichTemplateType(value as DocType);
                  }
                }}
              >
                <SelectTrigger id="rich-template-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DocType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {docTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Editor Template Dokumen</Label>
            <Tabs
              value={richEditorMode}
              onValueChange={(value) => {
                if (value === "pdfme" || value === "word") {
                  setRichEditorMode(value);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="pdfme">PDFme Designer</TabsTrigger>
                <TabsTrigger value="word">Editor Word (HTML)</TabsTrigger>
              </TabsList>
              <TabsContent value="pdfme" className="space-y-3">
                <PdfmeDocumentEditor
                  initialTemplate={pdfmeTemplate}
                  onChange={setPdfmeTemplate}
                />
                <p className="text-sm text-muted-foreground">
                  PDFme menggunakan bidang yang diseret ke lembar A4 dan menyimpan
                  posisi, ukuran, tipe bidang, serta variabel ke JSON.
                </p>
              </TabsContent>
              <TabsContent value="word" className="space-y-3">
                <DocumentWordEditor
                  contentHtml={richContentHtml}
                  documentType={richTemplateType}
                  onChange={setRichContentHtml}
                />
                <p className="text-sm text-muted-foreground">
                  Editor HTML lama tetap tersedia untuk membuka dan mengubah
                  template yang sudah ada.
                </p>
              </TabsContent>
            </Tabs>
          </div>
          {richTemplateMessage && (
            <p className={`text-sm ${richTemplateError ? "text-destructive" : "text-emerald-700"}`} role="status">
              {richTemplateMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/apps/documents")}>
              Kembali ke Dokumen
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending
                ? "Menyimpan..."
                : initialRichTemplate
                  ? "Simpan Perubahan"
                  : "Simpan Template"}
            </Button>
          </div>
        </form>
      </CardBox>
    );
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
        <CardBox>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Dokumen Operasional</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Siapkan PO, DO, atau dokumen custom, bubuhkan tanda tangan,
                lalu pantau penerbitannya oleh Logistik.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/apps/documents/issued")}
              >
                Dokumen Terbit
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/apps/templates")}
              >
                <Plus className="mr-2 h-4 w-4" />
                Editor Template
              </Button>
              <Button variant="outline" onClick={() => openTemplateDialog()}>
                Template Custom
              </Button>
            </div>
          </div>
        </CardBox>
      )}

      <Tabs defaultValue={readOnly ? "issued" : "create"} className="space-y-4">
        {!readOnly && (
          <TabsList>
            <TabsTrigger value="create">Buat &amp; Tanda Tangani</TabsTrigger>
            <TabsTrigger value="pending">
              Menunggu Logistik ({signedDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="issued">Dokumen Terbit ({issuedDocuments.length})</TabsTrigger>
            <TabsTrigger value="templates">
              Template ({templates.length})
            </TabsTrigger>
          </TabsList>
        )}

        {readOnly && (
          <CardBox>
            <div>
              <h2 className="text-xl font-semibold">Dokumen Terbit</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Daftar dokumen yang sudah diterbitkan Logistik dan dapat diakses
                oleh seluruh pengguna.
              </p>
            </div>
          </CardBox>
        )}

        {!readOnly && (
          <TabsContent value="create">
          <CardBox>
            <form onSubmit={submitDocument} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document-kind">Jenis dokumen</Label>
                  <Select
                    value={kind}
                    onValueChange={(value) => {
                      if (!Object.values(OperationalDocumentKind).includes(value as OperationalDocumentKind)) return;
                      setKind(value as OperationalDocumentKind);
                      setTicketId("");
                      setTemplateId("");
                      setTitle("");
                      setContent("");
                    }}
                  >
                    <SelectTrigger id="document-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(OperationalDocumentKind).map((value) => (
                        <SelectItem key={value} value={value}>
                          {kindLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document-ticket">Tiket material</Label>
                  <Select
                    value={ticketId}
                    onValueChange={(value) => {
                      setTicketId(value);
                      const nextTicket = tickets.find((ticket) => ticket.id === value);
                      const template = compatibleTemplates.find((item) => item.id === templateId);
                      if (nextTicket && template) {
                        setContent(fillTemplate(template.content, nextTicket, kind));
                      }
                    }}
                  >
                    <SelectTrigger id="document-ticket">
                      <SelectValue placeholder="Pilih tiket material" />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleTickets.map((ticket) => (
                        <SelectItem key={ticket.id} value={ticket.id}>
                          {ticket.ticketNumber} · {ticket.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {compatibleTickets.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Tidak ada tiket yang memenuhi syarat untuk jenis dokumen ini.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document-template">Gunakan template</Label>
                  <Select value={templateId || "NONE"} onValueChange={chooseTemplate}>
                    <SelectTrigger id="document-template">
                      <SelectValue placeholder="Dokumen custom tanpa template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Custom / isi manual</SelectItem>
                      {compatibleTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document-title">Judul dokumen</Label>
                  <Input
                    id="document-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={180}
                    required
                  />
                </div>
              </div>

              {selectedTicket && (
                <div className="rounded-md border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">
                    {selectedTicket.ticketNumber} · {selectedTicket.title}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Pemohon: {selectedTicket.requester.name}
                    {selectedTicket.project ? ` · Proyek: ${selectedTicket.project.title}` : ""}
                    {selectedTicket.totalAmount
                      ? ` · Estimasi: ${currencyFormatter.format(Number(selectedTicket.totalAmount))}`
                      : ""}
                  </p>
                  {selectedTicket.items.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-muted-foreground">
                      {selectedTicket.items.map((item, index) => (
                        <li key={`${item.itemName}-${index}`}>
                          {item.itemName} — {item.quantity} {item.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="document-content">Isi dokumen</Label>
                <Textarea
                  id="document-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={9}
                  maxLength={20000}
                  required
                  placeholder="Tulis isi PO/DO atau dokumen custom. Token template: {{ticketNumber}}, {{ticketTitle}}, {{requester}}, {{project}}, {{amount}}, {{items}}"
                />
                <p className="text-xs text-muted-foreground">
                  Isi dokumen disimpan sebagai snapshot dan tidak berubah jika template diedit kemudian.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="document-signature">Tanda tangan Direktur / Administrasi</Label>
                  <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
                    Hapus tanda tangan
                  </Button>
                </div>
                <canvas
                  id="document-signature"
                  ref={canvasRef}
                  width={720}
                  height={180}
                  onPointerDown={startSigning}
                  onPointerMove={continueSigning}
                  onPointerUp={finishSigning}
                  onPointerCancel={finishSigning}
                  className="h-36 w-full touch-none rounded-md border bg-white"
                  aria-label="Area tanda tangan digital"
                />
                <p className="text-xs text-muted-foreground">
                  Tanda tangan gambar ini terikat pada akun yang sedang masuk, bukan sertifikat digital kriptografis.
                </p>
              </div>

              {createMessage && (
                <p
                  className={`text-sm ${createError ? "text-destructive" : "text-emerald-700"}`}
                  role="status"
                >
                  {createMessage}
                </p>
              )}
              <Button
                type="submit"
                disabled={isPending || compatibleTickets.length === 0}
              >
                <FileSignature className="mr-2 h-4 w-4" />
                {isPending ? "Menyimpan..." : "Simpan & Tanda Tangani"}
              </Button>
            </form>
          </CardBox>
          </TabsContent>
        )}

        {!readOnly && (
          <TabsContent value="pending">
            {renderDocumentTable(
              signedDocuments,
              "Belum ada dokumen yang menunggu diterbitkan.",
              openDocument,
            )}
          </TabsContent>
        )}

        <TabsContent value="issued">
          {renderDocumentTable(
            issuedDocuments,
            "Belum ada dokumen yang diterbitkan Logistik.",
            openDocument,
          )}
        </TabsContent>

        {!readOnly && (
          <TabsContent value="templates">
          <CardBox>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Template Dokumen</h3>
                <p className="text-sm text-muted-foreground">
                  Gunakan token tiket untuk mengisi informasi otomatis saat membuat dokumen.
                </p>
              </div>
              <Button onClick={() => openTemplateDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Template
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Judul</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>{kindLabels[template.kind]}</TableCell>
                      <TableCell>{template.title}</TableCell>
                      <TableCell>
                        <Badge variant={template.isActive ? "lightSuccess" : "gray"}>
                          {template.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ActionIconButton
                          label={`Edit template ${template.name}`}
                          tooltip={`Edit template ${template.name}`}
                          icon={Pencil}
                          onClick={() => openTemplateDialog(template)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {templates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Belum ada template. Buat template pertama untuk mempercepat dokumen berikutnya.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardBox>
          </TabsContent>
        )}
      </Tabs>

      <GlobalModal
        isOpen={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        title={templateDraft.id ? "Edit Template" : "Template Dokumen Custom"}
        description={`Token yang tersedia: {{ticketNumber}}, {{ticketTitle}}, {{requester}}, {{project}}, {{amount}}, {{items}}.`}
        className="sm:max-w-2xl"
      >
          <form className="space-y-4" onSubmit={submitTemplate}>
            <div className="space-y-2">
              <Label htmlFor="template-name">Nama template</Label>
              <Input
                id="template-name"
                value={templateDraft.name}
                onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-kind">Jenis dokumen</Label>
              <Select
                value={templateDraft.kind}
                onValueChange={(value) => {
                  if (Object.values(OperationalDocumentKind).includes(value as OperationalDocumentKind)) {
                    setTemplateDraft({ ...templateDraft, kind: value as OperationalDocumentKind });
                  }
                }}
              >
                <SelectTrigger id="template-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(OperationalDocumentKind).map((value) => (
                    <SelectItem key={value} value={value}>{kindLabels[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-title">Judul dokumen</Label>
              <Input
                id="template-title"
                value={templateDraft.title}
                onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })}
                maxLength={180}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-content">Isi template</Label>
              <Textarea
                id="template-content"
                value={templateDraft.content}
                onChange={(event) => setTemplateDraft({ ...templateDraft, content: event.target.value })}
                rows={8}
                maxLength={20000}
                required
              />
            </div>
            {templateMessage && (
              <p className={`text-sm ${templateError ? "text-destructive" : "text-emerald-700"}`} role="status">
                {templateMessage}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 h-4 w-4" />
                {isPending ? "Menyimpan..." : "Simpan Template"}
              </Button>
            </DialogFooter>
          </form>
      </GlobalModal>

      <GlobalModal
        isOpen={selectedDocument !== null}
        onClose={() => {
          setSelectedDocument(null);
          setDetailMessage("");
        }
        }
        title={selectedDocument?.title ?? "Detail dokumen"}
        description={
          selectedDocument
            ? `${selectedDocument.documentNumber} · ${kindLabels[selectedDocument.kind]} · Tiket ${selectedDocument.ticket.ticketNumber}`
            : ""
        }
        className="sm:max-w-3xl"
      >
          {selectedDocument && (
            <>
              <div className="space-y-4 rounded-md border p-5">
                <p className="whitespace-pre-wrap text-sm">{selectedDocument.content}</p>
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Ditandatangani {selectedDocument.signedBy.name} pada {dateFormatter.format(new Date(selectedDocument.signedAt))}
                  </p>
                  {selectedDocument.signatureImage ? (
                    <Image
                      src={selectedDocument.signatureImage}
                      alt={`Tanda tangan ${selectedDocument.signerName}`}
                      width={256}
                      height={80}
                      unoptimized
                      className="mt-2 h-20 max-w-64 object-contain object-left"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground" role="status">
                      {detailMessage}
                    </p>
                  )}
                  {selectedDocument.issuedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Diterbitkan {selectedDocument.issuedBy?.name ?? "Logistik"} pada {dateFormatter.format(new Date(selectedDocument.issuedAt))}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Tutup</Button>
                </DialogClose>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak
                </Button>
              </DialogFooter>
            </>
          )}
      </GlobalModal>
    </div>
  );
}

function renderDocumentTable(
  documents: DocumentRow[],
  emptyMessage: string,
  onSelect: (document: DocumentRow) => void,
) {
  return (
    <CardBox>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor dokumen</TableHead>
              <TableHead>Jenis / Tiket</TableHead>
              <TableHead>Judul</TableHead>
              <TableHead>Tanda tangan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">{document.documentNumber}</TableCell>
                <TableCell>
                  {kindLabels[document.kind]}
                  <span className="block text-xs text-muted-foreground">{document.ticket.ticketNumber}</span>
                </TableCell>
                <TableCell>{document.title}</TableCell>
                <TableCell>
                  {document.signedBy.name}
                  <span className="block text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(document.signedAt))}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={document.status === OperationalDocumentStatus.ISSUED ? "lightSuccess" : "lightWarning"}>
                    {document.status === OperationalDocumentStatus.ISSUED ? "Terbit" : "Siap diterbitkan"}
                  </Badge>
                  {document.issuedAt && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(document.issuedAt))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ActionIconButton
                    label={`Lihat detail dokumen ${document.documentNumber}`}
                    tooltip={`Lihat detail dokumen ${document.documentNumber}`}
                    icon={FileText}
                    onClick={() => onSelect(document)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </CardBox>
  );
}