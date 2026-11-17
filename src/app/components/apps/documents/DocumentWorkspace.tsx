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
import { toast } from "sonner";
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
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [activeTab, setActiveTab] = useState<
    "create" | "pending" | "issued" | "templates"
  >(readOnly ? "issued" : "create");
  const [kind, setKind] = useState<OperationalDocumentKind>(
    OperationalDocumentKind.PURCHASE_ORDER,
  );
  const [ticketId, setTicketId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [signatureDrawn, setSignatureDrawn] = useState(false);
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
      toast.error("Tanda tangan wajib dibubuhkan sebelum dokumen disimpan.");
      return;
    }
    if (!ticketId) {
      toast.error("Pilih tiket material yang akan dilampirkan.");
      return;
    }
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
        if (result.success) {
          toast.success(result.message);
          setSignatureDrawn(false);
          setTicketId("");
          setTemplateId("");
          setTitle("");
          setContent("");
          clearSignature();
          setActiveTab("pending");
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Signed operational document save failed:", error);
        toast.error("Dokumen gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const openTemplateDialog = (template?: TemplateRow) => {
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
    startTransition(async () => {
      try {
        const result = await saveDocumentTemplate(templateDraft);
        if (result.success) {
          toast.success(result.message);
          setTemplateDialogOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Operational document template save failed:", error);
        toast.error("Template gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const submitRichTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!richContentHtml.trim() || richContentHtml === "<p></p>") {
      toast.error("Isi template dokumen wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveRichDocumentTemplate({
          id: initialRichTemplate?.id,
          name: richTemplateName,
          type: richTemplateType,
          contentHtml: richContentHtml,
          contentJson: richEditorMode === "pdfme" ? pdfmeTemplate : null,
        });
        if (result.success) {
          toast.success(result.message);
          if (!initialRichTemplate) {
            setRichTemplateName("");
            setRichTemplateType(DocType.PURCHASE_ORDER);
            setRichContentHtml("<p></p>");
            setPdfmeTemplate(createBlankPdfmeTemplate());
          }
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Rich document template save failed:", error);
        toast.error("Template gagal disimpan. Silakan coba kembali.");
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
            <h2 className="type-h2 text-foreground">
              {initialRichTemplate ? "Edit Template Dokumen" : "Buat Template Dokumen"}
            </h2>
            <p className="type-p2 mt-1 text-muted-foreground">
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
                <p className="type-p3 text-muted-foreground">
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
                <p className="type-p3 text-muted-foreground">
                  Editor HTML lama tetap tersedia untuk membuka dan mengubah
                  template yang sudah ada.
                </p>
              </TabsContent>
            </Tabs>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 size-4" aria-hidden="true" />
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

  const ticketComboboxOptions = compatibleTickets.map((ticket) => ({
    value: ticket.id,
    label: `${ticket.ticketNumber} · ${ticket.title}`,
    description: ticket.project?.title ?? ticket.requester.name,
  }));

  return (
    <div className="space-y-5">
      {!readOnly && (
        <CardBox>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="type-h2 text-foreground">Alur Dokumen Operasional</h2>
              <p className="type-p2 mt-1 text-muted-foreground">
                Buat dan tanda tangani dokumen, lalu pantau antrean terbit Logistik pada tab berikut.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openTemplateDialog()}
              >
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Template Custom
              </Button>
            </div>
          </div>
        </CardBox>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (
            value === "create" ||
            value === "pending" ||
            value === "issued" ||
            value === "templates"
          ) {
            setActiveTab(value);
          }
        }}
        className="space-y-4"
      >
        {!readOnly && (
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
            <TabsTrigger value="create">Buat &amp; Tanda Tangani</TabsTrigger>
            <TabsTrigger value="pending">
              Menunggu Logistik ({signedDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="issued">
              Dokumen Terbit ({issuedDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="templates">
              Template ({templates.length})
            </TabsTrigger>
          </TabsList>
        )}

        {readOnly && (
          <CardBox>
            <div>
              <h2 className="type-h2 text-foreground">Dokumen Terbit</h2>
              <p className="type-p2 mt-1 text-muted-foreground">
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
                    <SelectTrigger id="document-kind" className="w-full">
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
                  <Combobox
                    id="document-ticket"
                    options={ticketComboboxOptions}
                    value={ticketId}
                    placeholder="Pilih tiket material"
                    searchPlaceholder="Cari nomor atau judul tiket..."
                    emptyText="Tidak ada tiket yang memenuhi syarat."
                    disabled={compatibleTickets.length === 0}
                    onValueChange={(value) => {
                      setTicketId(value);
                      const nextTicket = tickets.find((ticket) => ticket.id === value);
                      const template = compatibleTemplates.find((item) => item.id === templateId);
                      if (nextTicket && template) {
                        setContent(fillTemplate(template.content, nextTicket, kind));
                      }
                    }}
                  />
                  {compatibleTickets.length === 0 && (
                    <p className="type-p3 text-muted-foreground">
                      Tidak ada tiket yang memenuhi syarat untuk jenis dokumen ini.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document-template">Gunakan template</Label>
                  <Select value={templateId || "NONE"} onValueChange={chooseTemplate}>
                    <SelectTrigger id="document-template" className="w-full">
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
                <div className="type-p2 rounded-md border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">
                    {selectedTicket.ticketNumber} · {selectedTicket.title}
                  </p>
                  <p className="type-p3 mt-1 text-muted-foreground">
                    Pemohon: {selectedTicket.requester.name}
                    {selectedTicket.project ? ` · Proyek: ${selectedTicket.project.title}` : ""}
                    {selectedTicket.totalAmount
                      ? ` · Estimasi: ${currencyFormatter.format(Number(selectedTicket.totalAmount))}`
                      : ""}
                  </p>
                  {selectedTicket.items.length > 0 && (
                    <ul className="type-p3 mt-2 list-inside list-disc text-muted-foreground">
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
                  className="mt-0"
                  placeholder="Tulis isi PO/DO atau dokumen custom. Token template: {{ticketNumber}}, {{ticketTitle}}, {{requester}}, {{project}}, {{amount}}, {{items}}"
                />
                <p className="type-p3 text-muted-foreground">
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
                  className="h-36 w-full touch-none rounded-md border border-border bg-white"
                  aria-label="Area tanda tangan digital"
                />
                <p className="type-p3 text-muted-foreground">
                  Tanda tangan gambar ini terikat pada akun yang sedang masuk, bukan sertifikat digital kriptografis.
                </p>
              </div>

              <Button
                type="submit"
                disabled={isPending || compatibleTickets.length === 0}
              >
                <FileSignature className="mr-2 size-4" aria-hidden="true" />
                {isPending ? "Menyimpan..." : "Simpan & Tanda Tangani"}
              </Button>
            </form>
          </CardBox>
          </TabsContent>
        )}

        {!readOnly && (
          <TabsContent value="pending">
            <DocumentArchiveSection
              documents={signedDocuments}
              emptyTitle="Belum ada dokumen menunggu"
              emptyDescription="Dokumen yang baru ditandatangani akan tampil di sini sebelum diterbitkan Logistik."
              onSelect={openDocument}
            />
          </TabsContent>
        )}

        <TabsContent value="issued">
          <DocumentArchiveSection
            documents={issuedDocuments}
            emptyTitle="Belum ada dokumen terbit"
            emptyDescription="Dokumen yang sudah diterbitkan Logistik akan tampil di sini."
            onSelect={openDocument}
          />
        </TabsContent>

        {!readOnly && (
          <TabsContent value="templates">
          <CardBox>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="type-h3 text-foreground">Template Dokumen</h3>
                <p className="type-p3 text-muted-foreground">
                  Gunakan token tiket untuk mengisi informasi otomatis saat membuat dokumen.
                </p>
              </div>
              <Button size="sm" onClick={() => openTemplateDialog()}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Tambah Template
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="type-p2 font-semibold text-foreground">
                            {template.name}
                          </span>
                          <Badge variant={template.isActive ? "lightSuccess" : "gray"}>
                            {template.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <p className="type-p3 text-muted-foreground">
                          {kindLabels[template.kind]} · {template.title}
                        </p>
                      </div>
                      <ActionIconButton
                        label={`Edit template ${template.name}`}
                        tooltip={`Edit template ${template.name}`}
                        icon={Pencil}
                        onClick={() => openTemplateDialog(template)}
                      />
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Judul</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="type-p2 font-medium">{template.name}</TableCell>
                          <TableCell className="type-p2">{kindLabels[template.kind]}</TableCell>
                          <TableCell className="type-p2">{template.title}</TableCell>
                          <TableCell>
                            <Badge variant={template.isActive ? "lightSuccess" : "gray"}>
                              {template.isActive ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <ActionIconButton
                              label={`Edit template ${template.name}`}
                              tooltip={`Edit template ${template.name}`}
                              icon={Pencil}
                              onClick={() => openTemplateDialog(template)}
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
                title="Belum ada template"
                description="Buat template pertama untuk mempercepat penyusunan dokumen berikutnya."
                action={
                  <Button size="sm" variant="outline" onClick={() => openTemplateDialog()}>
                    <Plus className="mr-1.5 size-4" aria-hidden="true" />
                    Tambah Template
                  </Button>
                }
              />
            )}
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
                <SelectTrigger id="template-kind" className="w-full"><SelectValue /></SelectTrigger>
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
                className="mt-0"
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 size-4" aria-hidden="true" />
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
        }}
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
              <div className="space-y-4 rounded-md border border-border p-5">
                <p className="type-p2 whitespace-pre-wrap">{selectedDocument.content}</p>
                <div className="border-t border-border pt-4">
                  <p className="type-p3 text-muted-foreground">
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
                    <p className="type-p2 mt-2 text-muted-foreground" role="status">
                      {detailMessage}
                    </p>
                  )}
                  {selectedDocument.issuedAt && (
                    <p className="type-p3 mt-2 text-muted-foreground">
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
                  <Printer className="mr-2 size-4" aria-hidden="true" />
                  Cetak
                </Button>
              </DialogFooter>
            </>
          )}
      </GlobalModal>
    </div>
  );
}

function DocumentArchiveSection({
  documents,
  emptyTitle,
  emptyDescription,
  onSelect,
}: {
  documents: DocumentRow[];
  emptyTitle: string;
  emptyDescription: string;
  onSelect: (document: DocumentRow) => void;
}) {
  const [kindFilter, setKindFilter] = useState<
    "ALL" | OperationalDocumentKind
  >("ALL");

  const filteredDocuments = useMemo(
    () =>
      kindFilter === "ALL"
        ? documents
        : documents.filter((doc) => doc.kind === kindFilter),
    [documents, kindFilter],
  );

  const filterChips: { value: "ALL" | OperationalDocumentKind; label: string }[] = [
    { value: "ALL", label: `Semua (${documents.length})` },
    { value: OperationalDocumentKind.PURCHASE_ORDER, label: "Purchase Order" },
    { value: OperationalDocumentKind.DELIVERY_ORDER, label: "Delivery Order" },
    { value: OperationalDocumentKind.CUSTOM, label: "Custom" },
  ];

  return (
    <CardBox className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {filterChips.map((chip) => (
          <Button
            key={chip.value}
            type="button"
            size="sm"
            variant={kindFilter === chip.value ? "default" : "outline"}
            onClick={() => setKindFilter(chip.value)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      {filteredDocuments.length ? (
        <>
          <div className="space-y-2.5 md:hidden">
            {filteredDocuments.map((document) => (
              <div
                key={document.id}
                className="space-y-2 rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="type-p3 font-mono font-semibold text-primary">
                      {document.documentNumber}
                    </p>
                    <p className="type-p2 mt-0.5 font-semibold text-foreground">
                      {document.title}
                    </p>
                    <p className="type-p3 text-muted-foreground">
                      {kindLabels[document.kind]} · {document.ticket.ticketNumber}
                    </p>
                  </div>
                  <Badge
                    variant={
                      document.status === OperationalDocumentStatus.ISSUED
                        ? "lightSuccess"
                        : "lightWarning"
                    }
                    className="shrink-0"
                  >
                    {document.status === OperationalDocumentStatus.ISSUED
                      ? "Terbit"
                      : "Siap diterbitkan"}
                  </Badge>
                </div>
                <div className="type-p3 flex items-center justify-between border-t border-border pt-2 text-muted-foreground">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">
                      {document.signedBy.name}
                    </span>
                    <span className="type-p3 block">
                      {dateFormatter.format(new Date(document.signedAt))}
                    </span>
                  </div>
                  <ActionIconButton
                    label={`Lihat detail dokumen ${document.documentNumber}`}
                    tooltip={`Lihat detail dokumen ${document.documentNumber}`}
                    icon={FileText}
                    onClick={() => onSelect(document)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor dokumen</TableHead>
                  <TableHead>Jenis / Tiket</TableHead>
                  <TableHead>Judul</TableHead>
                  <TableHead>Tanda tangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="type-p2 font-medium">{document.documentNumber}</TableCell>
                    <TableCell className="type-p2">
                      {kindLabels[document.kind]}
                      <span className="type-p3 block text-muted-foreground">
                        {document.ticket.ticketNumber}
                      </span>
                    </TableCell>
                    <TableCell className="type-p2">{document.title}</TableCell>
                    <TableCell className="type-p2">
                      {document.signedBy.name}
                      <span className="type-p3 block text-muted-foreground">
                        {dateFormatter.format(new Date(document.signedAt))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          document.status === OperationalDocumentStatus.ISSUED
                            ? "lightSuccess"
                            : "lightWarning"
                        }
                      >
                        {document.status === OperationalDocumentStatus.ISSUED
                          ? "Terbit"
                          : "Siap diterbitkan"}
                      </Badge>
                      {document.issuedAt && (
                        <span className="type-p3 mt-1 block text-muted-foreground">
                          {dateFormatter.format(new Date(document.issuedAt))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionIconButton
                        label={`Lihat detail dokumen ${document.documentNumber}`}
                        tooltip={`Lihat detail dokumen ${document.documentNumber}`}
                        icon={FileText}
                        onClick={() => onSelect(document)}
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
          icon={FileText}
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </CardBox>
  );
}