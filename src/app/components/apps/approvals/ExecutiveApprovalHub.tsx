"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approvePurchaseOrder } from "@/app/actions/orders";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  approveBAST,
  approveProjectAddendum,
  approveSubkonContract,
  approveSubkonTermyn,
} from "@/app/actions/construction";
import { reviewDrawingDocument } from "@/app/actions/drawings";
import { approveProjectWorkPointWage } from "@/app/actions/project";
import {
  approveDirectStockPurchaseByDirector,
  approveByDirector,
  rejectTicketByDirector,
  requestTicketRevisionByDirector,
} from "@/app/actions/tickets";
import {
  approveEquipmentRequest,
  rejectEquipmentRequest,
  requestEquipmentRequestRevision,
} from "@/app/actions/equipment-requests";
import {
  EQUIPMENT_REQUEST_TYPE,
  RENTAL_PERIOD_TYPE_LABELS,
  RENTAL_TICKET_TYPE_LABELS,
  type RentalPeriodType,
  type RentalTicketType,
  type RentalUsageScope,
} from "@/lib/equipment-request";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { getFieldCostLabel } from "@/lib/ticket-field-costs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  BASTType,
  POPaymentMethod,
  TicketCategoryHint,
  TicketPriority,
  TicketRequestCategory,
  TicketType,
  UserRole,
} from "@prisma/client";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  HardHat,
  History,
  Landmark,
  QrCode,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";

type ApprovalPurchaseOrder = {
  publicCode: string;
  poNumber: string;
  vendorName: string;
  vendorAddress: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  createdAt: string;
  paymentMethod: POPaymentMethod;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  paymentTerms: string | null;
  includeTax: boolean;
  financeReviewerName: string | null;
  financeReviewedAt: string | null;
  projectSiteName: string;
  ticketNumber: string | null;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }[];
};

type ApprovalRentalDetails = {
  rentalType: "HOUSE" | "VEHICLE";
  usageScope?: RentalUsageScope;
  assetName: string;
  propertyAddress?: string | null;
  landlordName?: string | null;
  landlordPhone?: string | null;
  occupantCount?: number | null;
  codeOrPlate?: string | null;
  periodType?: RentalPeriodType;
  startDate?: string | null;
  endDate?: string | null;
  duration?: number | null;
};

type ApprovalTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description?: string | null;
  type: TicketType;
  ticketType?: RentalTicketType | null;
  rentalDetails?: ApprovalRentalDetails | null;
  priority?: TicketPriority;
  requestCategory?: TicketRequestCategory | null;
  fieldCategory?: string | null;
  requestPaymentMethod?: POPaymentMethod | null;
  requestPaymentDescription?: string | null;
  attachmentUrl?: string | null;
  receiptUrls?: string[];
  purchaseReceiptUrl?: string | null;
  totalAmount: string | null;
  recipientName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  createdAt: string;
  requesterName: string;
  projectName: string | null;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    categoryHint?: TicketCategoryHint;
    estimatedCost?: string | null;
    materialContract?: {
      contractNumber: string;
      vendorName: string;
    } | null;
  }[];
};

type ApprovalHistoryItem = {
  id: string;
  category: string;
  reference: string;
  action: string;
  createdAt: string;
  actorName: string;
  notes: string | null;
};

type ApprovalDirectPurchase = {
  id: string;
  purchaseNumber: string;
  vendorName: string;
  paymentMethod?: POPaymentMethod;
  paymentBankName?: string | null;
  paymentAccountNumber?: string | null;
  paymentAccountName?: string | null;
  notes?: string | null;
  projectName?: string | null;
  ticketNumber?: string | null;
  totalAmount: string;
  createdAt: string;
  createdByName: string;
  items: {
    itemName: string;
    quantity: string;
    unit: string;
    unitPrice?: string;
    totalPrice?: string;
  }[];
};

type ApprovalWage = {
  id: string;
  title: string;
  location: string | null;
  projectName: string;
  proposedVolume: string | null;
  proposedUnit: string | null;
  proposedUnitPrice: string | null;
  proposedTotalWage: string;
  approvedTotalWage: string | null;
  createdAt?: string;
  proposedByName: string;
};

type ApprovalTermyn = {
  id: string;
  termynNumber: number;
  claimedPercent: string;
  grossAmount: string;
  retentionAmount: string;
  netAmount: string;
  createdAt: string;
  createdByName: string;
  contractNumber: string;
  subkonName: string;
  projectName: string;
};

type ApprovalContract = {
  publicCode: string;
  contractNumber: string;
  subkonName: string;
  workScope: string;
  contractValue: string;
  createdById: string;
  createdAt?: string;
  projectName: string;
};

type ApprovalAddendum = {
  id: string;
  addendumNumber: string;
  budgetChange: string;
  timeExtension: number;
  reason: string;
  createdAt?: string;
  projectName: string;
};

type ApprovalBast = {
  id: string;
  bastNumber: string;
  type: BASTType;
  date: string;
  maintenanceEndsAt: string | null;
  notes: string | null;
  projectName: string;
};

type ApprovalPendingDrawing = {
  id: string;
  drawingCode: string;
  title: string;
  category: string;
  version: number;
  fileUrl: string | null;
  updatedAt: string;
  projectId: string | null;
  projectName: string | null;
  uploadedByName: string;
};

type Selection =
  | { kind: "po"; id: string }
  | { kind: "ticket"; id: string }
  | { kind: "direct-purchase"; id: string }
  | { kind: "wage"; id: string }
  | { kind: "termyn"; id: string }
  | { kind: "contract"; id: string }
  | { kind: "addendum"; id: string }
  | { kind: "bast"; id: string }
  | null;

type QueueRowItem = {
  id: string;
  code: string;
  title: string;
  categoryLabel: string;
  subCategoryKey: string;
  priority?: TicketPriority;
  counterparty: string;
  project: string;
  dateText: string;
  amountText: string;
  rawAmount: number;
  metaNote?: string;
};

const currency = (amount: number | string | null | undefined) =>
  amount === null || amount === undefined || amount === ""
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const dateTimeLabel = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

function isExecutive(role: UserRole) {
  return role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR;
}

const priorityLabelMap: Record<TicketPriority, string> = {
  LOW: "Rendah",
  MEDIUM: "Normal",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
};

const requestCategoryLabelMap: Record<TicketRequestCategory, string> = {
  OPS: "Operasional",
  MATERIAL: "Kebutuhan Material",
  WAREHOUSE: "Stok Gudang",
  OFFICE: "Kebutuhan Kantor",
  FIELD: "Kebutuhan Lapangan",
  APH: "APH / Perizinan",
  REIMBURSEMENT: "Reimbursement",
  KASBON: "Kasbon",
  OPERATING_EXPENSE: "Biaya Operasional",
  SHIPPING_COST: "Biaya Pengiriman",
};

const ticketTypeLabelMap: Record<TicketType, string> = {
  MATERIAL: "Permintaan Material",
  COST: "Pengajuan Biaya",
  OPERATIONAL: "Dana Operasional",
};

const approvalHistoryLabels: Record<string, string> = {
  APPROVED: "Disetujui",
  APPROVED_BY_DIR: "Disetujui Direksi",
  REJECTED_BY_DIR: "Ditolak Direksi",
  REVISION_REQUESTED_BY_DIR: "Minta Revisi",
};

function ApprovalQueueDesktopRow({
  row,
  actionLabel,
  onSelect,
}: {
  row: QueueRowItem;
  actionLabel: string;
  onSelect: (id: string) => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onSelect(row.id)}>
      <TableCell className="whitespace-normal align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono type-p3 font-semibold text-primary">
            {row.code}
          </span>
          {row.priority &&
            (row.priority === "URGENT" || row.priority === "HIGH") && (
              <Badge
                variant={
                  row.priority === "URGENT" ? "lightError" : "lightWarning"
                }
              >
                {priorityLabelMap[row.priority]}
              </Badge>
            )}
        </div>
        <p className="mt-1 type-p2 font-semibold text-foreground line-clamp-1">
          {row.title}
        </p>
        {row.metaNote && (
          <p className="mt-0.5 type-p3 text-muted-foreground line-clamp-1">
            {row.metaNote}
          </p>
        )}
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline" className="font-medium">
          {row.categoryLabel}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal align-top">
        <p className="type-p2 font-medium text-foreground">
          {row.counterparty}
        </p>
        <p className="mt-0.5 type-p3 text-muted-foreground line-clamp-1">
          {row.project}
        </p>
      </TableCell>
      <TableCell className="align-top type-p3 text-muted-foreground">
        {row.dateText}
      </TableCell>
      <TableCell className="align-top text-right type-p2 font-semibold text-foreground">
        {row.amountText}
      </TableCell>
      <TableCell className="align-top text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row.id);
          }}
        >
          <Eye className="size-4" />
          {actionLabel}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ApprovalQueueMobileCard({
  row,
  actionLabel,
  onSelect,
}: {
  row: QueueRowItem;
  actionLabel: string;
  onSelect: (id: string) => void;
}) {
  return (
    <article
      onClick={() => onSelect(row.id)}
      className="cursor-pointer rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 active:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono type-p3 font-semibold text-primary">
            {row.code}
          </span>
          <Badge variant="outline">{row.categoryLabel}</Badge>
          {row.priority &&
            (row.priority === "URGENT" || row.priority === "HIGH") && (
              <Badge
                variant={
                  row.priority === "URGENT" ? "lightError" : "lightWarning"
                }
              >
                {priorityLabelMap[row.priority]}
              </Badge>
            )}
        </div>
        <span className="shrink-0 type-p3 text-muted-foreground">
          {row.dateText}
        </span>
      </div>
      <p className="mt-1.5 type-p2 font-semibold text-foreground">
        {row.title}
      </p>
      <p className="mt-0.5 type-p3 text-muted-foreground">
        {row.counterparty} · {row.project}
      </p>
      {row.metaNote && (
        <p className="mt-0.5 type-p3 text-muted-foreground">{row.metaNote}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="type-p1 font-bold text-foreground">
          {row.amountText}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row.id);
          }}
        >
          <Eye className="size-4" />
          {actionLabel}
        </Button>
      </div>
    </article>
  );
}

function ApprovalQueueTable({
  rows,
  emptyText,
  actionLabel,
  onSelect,
}: {
  rows: QueueRowItem[];
  emptyText: string;
  actionLabel: string;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="size-6" />}
        title={emptyText}
        description="Seluruh pengajuan pada kategori ini telah ditindaklanjuti."
        variant="inline"
      />
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table pagination itemLabel="pengajuan">
          <TableHeader>
            <TableRow>
              <TableHead>Dokumen &amp; Uraian</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Vendor / Pemohon &amp; Proyek</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Nilai Pengajuan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <ApprovalQueueDesktopRow
                key={row.id}
                row={row}
                actionLabel={actionLabel}
                onSelect={onSelect}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <ApprovalQueueMobileCard
            key={row.id}
            row={row}
            actionLabel={actionLabel}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

function PendingDrawingRowCard({
  drawing,
  canApprove,
  isPending,
  onApprove,
}: {
  drawing: ApprovalPendingDrawing;
  canApprove: boolean;
  isPending: boolean;
  onApprove: (drawingId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="type-p2 font-semibold text-foreground">
          <span className="font-mono">{drawing.drawingCode}</span> ·{" "}
          {drawing.title}
        </p>
        <p className="mt-0.5 type-p3 text-muted-foreground">
          {drawing.projectName ?? "Tanpa proyek"} · {drawing.category} · Rev{" "}
          {drawing.version} · Oleh {drawing.uploadedByName}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {drawing.fileUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={drawing.fileUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Buka File
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link
            href={
              drawing.projectId
                ? `/apps/drafter?projectId=${encodeURIComponent(drawing.projectId)}`
                : "/apps/drafter"
            }
          >
            Revisi
          </Link>
        </Button>
        {canApprove && (
          <Button
            type="button"
            size="sm"
            variant="success"
            disabled={isPending}
            onClick={() => onApprove(drawing.id)}
          >
            <CheckCircle2 className="size-4" />
            Setujui
          </Button>
        )}
      </div>
    </div>
  );
}

function ApprovalHistoryDesktopRow({
  entry,
}: {
  entry: ApprovalHistoryItem;
}) {
  const isApproved =
    entry.action === "APPROVED" || entry.action === "APPROVED_BY_DIR";
  const isRejected = entry.action === "REJECTED_BY_DIR";

  return (
    <TableRow>
      <TableCell className="align-top type-p3 text-muted-foreground">
        {dateTimeLabel(entry.createdAt)}
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline">{entry.category}</Badge>
      </TableCell>
      <TableCell className="whitespace-normal align-top">
        <p className="type-p2 font-medium text-foreground">{entry.reference}</p>
        {entry.notes && (
          <p className="mt-0.5 type-p3 text-muted-foreground">
            Catatan: {entry.notes}
          </p>
        )}
      </TableCell>
      <TableCell className="align-top type-p2 font-medium text-foreground">
        {entry.actorName}
      </TableCell>
      <TableCell className="align-top text-right">
        <Badge
          variant={
            isApproved
              ? "default"
              : isRejected
                ? "lightError"
                : "lightWarning"
          }
        >
          {approvalHistoryLabels[entry.action] ?? entry.action}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function ApprovalHistoryMobileCard({
  entry,
}: {
  entry: ApprovalHistoryItem;
}) {
  const isApproved =
    entry.action === "APPROVED" || entry.action === "APPROVED_BY_DIR";
  const isRejected = entry.action === "REJECTED_BY_DIR";

  return (
    <article className="space-y-2 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge variant="outline">{entry.category}</Badge>
          <p className="mt-1 type-p2 font-semibold text-foreground">
            {entry.reference}
          </p>
        </div>
        <Badge
          variant={
            isApproved
              ? "default"
              : isRejected
                ? "lightError"
                : "lightWarning"
          }
          className="shrink-0"
        >
          {approvalHistoryLabels[entry.action] ?? entry.action}
        </Badge>
      </div>
      {entry.notes && (
        <p className="rounded-md bg-muted/30 px-2.5 py-1.5 type-p3 text-muted-foreground">
          Catatan: {entry.notes}
        </p>
      )}
      <div className="flex items-center justify-between type-p3 text-muted-foreground">
        <span className="font-medium text-foreground">{entry.actorName}</span>
        <span>{dateTimeLabel(entry.createdAt)}</span>
      </div>
    </article>
  );
}

export default function ExecutiveApprovalHub({
  purchaseOrders,
  tickets,
  approvalHistory,
  directPurchases,
  wages,
  termyns,
  contracts,
  addendums,
  bastDocuments,
  pendingDrawings = [],
  role,
  currentUserId,
  initialTab,
  initialOpenSheet,
}: {
  purchaseOrders: ApprovalPurchaseOrder[];
  tickets: ApprovalTicket[];
  approvalHistory: ApprovalHistoryItem[];
  directPurchases: ApprovalDirectPurchase[];
  wages: ApprovalWage[];
  termyns: ApprovalTermyn[];
  contracts: ApprovalContract[];
  addendums: ApprovalAddendum[];
  bastDocuments: ApprovalBast[];
  pendingDrawings?: ApprovalPendingDrawing[];
  role: UserRole;
  currentUserId: string;
  initialTab?: string;
  initialOpenSheet?: string;
}) {
  const router = useRouter();
  const tabAliases: Record<string, string> = {
    po: "po",
    "purchase-orders": "po",
    "direct-purchase": "direct-purchase",
    "direct-purchases": "direct-purchase",
    tickets: "direct-purchase",
    wages: "wages",
    subcontract: "wages",
    history: "history",
  };
  const [activeTab, setActiveTab] = useState(
    tabAliases[initialTab ?? ""] ?? "po",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [financialFilter, setFinancialFilter] = useState<
    "ALL" | "TICKET" | "DIRECT_PURCHASE"
  >("ALL");
  const [constructionFilter, setConstructionFilter] = useState<
    "ALL" | "WAGE" | "TERMYN" | "CONTRACT" | "ADDENDUM" | "BAST"
  >("ALL");
  const [historyFilter, setHistoryFilter] = useState<string>("ALL");

  const [selection, setSelection] = useState<Selection>(() => {
    if (!initialOpenSheet) return null;
    if (purchaseOrders.some((item) => item.publicCode === initialOpenSheet)) {
      return { kind: "po", id: initialOpenSheet };
    }
    if (tickets.some((item) => item.id === initialOpenSheet)) {
      return { kind: "ticket", id: initialOpenSheet };
    }
    if (directPurchases.some((item) => item.id === initialOpenSheet)) {
      return { kind: "direct-purchase", id: initialOpenSheet };
    }
    if (wages.some((item) => item.id === initialOpenSheet)) {
      return { kind: "wage", id: initialOpenSheet };
    }
    if (termyns.some((item) => item.id === initialOpenSheet)) {
      return { kind: "termyn", id: initialOpenSheet };
    }
    if (contracts.some((item) => item.publicCode === initialOpenSheet)) {
      return { kind: "contract", id: initialOpenSheet };
    }
    if (addendums.some((item) => item.id === initialOpenSheet)) {
      return { kind: "addendum", id: initialOpenSheet };
    }
    if (bastDocuments.some((item) => item.id === initialOpenSheet)) {
      return { kind: "bast", id: initialOpenSheet };
    }
    return null;
  });

  const [signedPo, setSignedPo] = useState<{
    order: ApprovalPurchaseOrder;
    qrDataUrl: string;
    approvedByName: string;
    approvedAt: string;
  } | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [wageAmount, setWageAmount] = useState(
    () =>
      wages.find((item) => item.id === initialOpenSheet)?.proposedTotalWage ??
      "",
  );
  const [wageReason, setWageReason] = useState("");
  const [ticketDecision, setTicketDecision] = useState<
    "REJECT" | "REVISION" | null
  >(null);
  const [ticketDecisionReason, setTicketDecisionReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedPo =
    selection?.kind === "po"
      ? purchaseOrders.find((item) => item.publicCode === selection.id)
      : undefined;
  const selectedTicket =
    selection?.kind === "ticket"
      ? tickets.find((item) => item.id === selection.id)
      : undefined;
  const selectedDirectPurchase =
    selection?.kind === "direct-purchase"
      ? directPurchases.find((item) => item.id === selection.id)
      : undefined;
  const selectedWage =
    selection?.kind === "wage"
      ? wages.find((item) => item.id === selection.id)
      : undefined;
  const selectedTermyn =
    selection?.kind === "termyn"
      ? termyns.find((item) => item.id === selection.id)
      : undefined;
  const selectedContract =
    selection?.kind === "contract"
      ? contracts.find((item) => item.publicCode === selection.id)
      : undefined;
  const selectedAddendum =
    selection?.kind === "addendum"
      ? addendums.find((item) => item.id === selection.id)
      : undefined;
  const selectedBast =
    selection?.kind === "bast"
      ? bastDocuments.find((item) => item.id === selection.id)
      : undefined;

  const closeModal = () => {
    setSelection(null);
    setTicketDecision(null);
    setTicketDecisionReason("");
  };

  const runApproval = (
    action: () => Promise<{
      success: boolean;
      message: string;
      qrDataUrl?: string;
      actorName?: string;
      approvedAt?: string;
    }>,
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          toast.success(result.message);
          if (result.qrDataUrl && selection?.kind === "po") {
            const order = purchaseOrders.find(
              (item) => item.publicCode === selection.id,
            );
            if (order) {
              setSignedPo({
                order,
                qrDataUrl: result.qrDataUrl,
                approvedByName: result.actorName ?? "Direksi",
                approvedAt:
                  result.approvedAt ?? dateLabel(new Date().toISOString()),
              });
            }
          }
          closeModal();
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Executive approval action failed:", error);
        toast.error("Persetujuan gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const runTicketDecision = () => {
    if (!selectedTicket || !ticketDecision) return;
    const decision = ticketDecision;
    const reason = ticketDecisionReason.trim();
    if (reason.length < 3 || reason.length > 2000) {
      toast.error("Alasan wajib diisi (3–2.000 karakter).");
      return;
    }

    runApproval(() =>
      decision === "REJECT"
        ? selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
          ? rejectEquipmentRequest(selectedTicket.id, reason)
          : rejectTicketByDirector(
              selectedTicket.id,
              selectedTicket.type,
              reason,
            )
        : selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
          ? requestEquipmentRequestRevision(selectedTicket.id, reason)
          : requestTicketRevisionByDirector(
              selectedTicket.id,
              selectedTicket.type,
              reason,
            ),
    );
  };

  const handleApproveDrawing = (drawingId: string) => {
    startTransition(async () => {
      try {
        const res = await reviewDrawingDocument(
          drawingId,
          "APPROVED",
          "Disetujui melalui Otorisasi Direksi.",
        );
        if (res.success) {
          toast.success(res.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Drawing review failed:", error);
        toast.error("Persetujuan gambar gagal diproses.");
      }
    });
  };

  const poRows: QueueRowItem[] = useMemo(
    () =>
      purchaseOrders.map((order) => {
        const subtotal = order.items.reduce(
          (total, item) => total + item.totalPrice,
          0,
        );
        const grandTotal = subtotal * (order.includeTax ? 1.11 : 1);
        return {
          id: order.publicCode,
          code: order.poNumber,
          title: `${order.vendorName} (${order.items.length} item material)`,
          categoryLabel: order.includeTax ? "PO + PPN 11%" : "Purchase Order",
          subCategoryKey: "PO",
          counterparty: order.vendorName,
          project: order.projectSiteName,
          dateText: dateLabel(order.createdAt),
          amountText: currency(grandTotal),
          rawAmount: grandTotal,
          metaNote: `${order.ticketNumber ? `Ref Tiket: ${order.ticketNumber}` : "PO Gudang"} · Diperiksa: ${order.financeReviewerName ?? "Keuangan"}`,
        };
      }),
    [purchaseOrders],
  );

  const financialRows: QueueRowItem[] = useMemo(
    () => [
      ...tickets.map((ticket) => {
        const amt = Number(ticket.totalAmount ?? 0);
        const fieldCostLabel = getFieldCostLabel(ticket.fieldCategory);
        const categoryLabel =
          fieldCostLabel ??
          (ticket.ticketType && ticket.ticketType in RENTAL_TICKET_TYPE_LABELS
            ? RENTAL_TICKET_TYPE_LABELS[ticket.ticketType]
            : ticketTypeLabelMap[ticket.type] ?? "Tiket");
        return {
          id: `ticket:${ticket.id}`,
          code: ticket.ticketNumber,
          title: ticket.title,
          categoryLabel,
          subCategoryKey: "TICKET",
          priority: ticket.priority,
          counterparty: ticket.requesterName,
          project: ticket.projectName ?? "Operasional / Gudang Umum",
          dateText: dateLabel(ticket.createdAt),
          amountText: currency(ticket.totalAmount),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: ticket.rentalDetails
            ? `${ticket.rentalDetails.assetName} · ${ticket.rentalDetails.landlordName ?? ticket.rentalDetails.codeOrPlate ?? ""}`.trim()
            : ticket.recipientName
              ? `Penerima: ${ticket.recipientName} (${ticket.bankName ?? "Bank"} ${ticket.accountNumber ?? ""})`
              : `${ticket.items.length} item rincian`,
        };
      }),
      ...directPurchases.map((purchase) => {
        const amt = Number(purchase.totalAmount ?? 0);
        return {
          id: `purchase:${purchase.id}`,
          code: purchase.purchaseNumber,
          title: `Pembelian Langsung · ${purchase.vendorName}`,
          categoryLabel: "Belanja Langsung",
          subCategoryKey: "DIRECT_PURCHASE",
          counterparty: `${purchase.vendorName} (Oleh: ${purchase.createdByName})`,
          project: purchase.projectName ?? "Gudang Material",
          dateText: dateLabel(purchase.createdAt),
          amountText: currency(purchase.totalAmount),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: `${purchase.items.length} item material${purchase.ticketNumber ? ` · Tiket ${purchase.ticketNumber}` : ""}`,
        };
      }),
    ],
    [tickets, directPurchases],
  );

  const wageRows: QueueRowItem[] = useMemo(
    () => [
      ...wages.map((wage) => {
        const amt = Number(wage.proposedTotalWage ?? 0);
        return {
          id: `wage:${wage.id}`,
          code: "USULAN-UPAH",
          title: wage.title,
          categoryLabel: "Usulan Upah",
          subCategoryKey: "WAGE",
          counterparty: `Pengusul: ${wage.proposedByName}`,
          project: wage.projectName,
          dateText: dateLabel(wage.createdAt),
          amountText: currency(wage.proposedTotalWage),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: `${wage.location ?? "Lokasi proyek"}${wage.proposedVolume && wage.proposedUnit ? ` · Vol: ${wage.proposedVolume} ${wage.proposedUnit}` : ""}`,
        };
      }),
      ...termyns.map((termyn) => {
        const amt = Number(termyn.netAmount ?? 0);
        return {
          id: `termyn:${termyn.id}`,
          code: `${termyn.contractNumber} · T-${termyn.termynNumber}`,
          title: `Termin Ke-${termyn.termynNumber} (${termyn.claimedPercent}%) · ${termyn.subkonName}`,
          categoryLabel: "Termin Subkon",
          subCategoryKey: "TERMYN",
          counterparty: termyn.subkonName,
          project: termyn.projectName,
          dateText: dateLabel(termyn.createdAt),
          amountText: currency(termyn.netAmount),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: `Bruto ${currency(termyn.grossAmount)} · Retensi ${currency(termyn.retentionAmount)}`,
        };
      }),
      ...contracts.map((contract) => {
        const amt = Number(contract.contractValue ?? 0);
        return {
          id: `contract:${contract.publicCode}`,
          code: contract.contractNumber,
          title: `Kontrak SPK · ${contract.subkonName}`,
          categoryLabel: "SPK Subkon",
          subCategoryKey: "CONTRACT",
          counterparty: contract.subkonName,
          project: contract.projectName,
          dateText: dateLabel(contract.createdAt),
          amountText: currency(contract.contractValue),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: contract.workScope,
        };
      }),
      ...addendums.map((addendum) => {
        const amt = Number(addendum.budgetChange ?? 0);
        return {
          id: `addendum:${addendum.id}`,
          code: addendum.addendumNumber,
          title: `Addendum / CCO (+${addendum.timeExtension} Hari)`,
          categoryLabel: "Addendum / CCO",
          subCategoryKey: "ADDENDUM",
          counterparty: "Perubahan Kontrak Proyek",
          project: addendum.projectName,
          dateText: dateLabel(addendum.createdAt),
          amountText: currency(addendum.budgetChange),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: addendum.reason,
        };
      }),
      ...bastDocuments.map((bast) => ({
        id: `bast:${bast.id}`,
        code: bast.bastNumber,
        title: `Berita Acara Serah Terima (${bast.type})`,
        categoryLabel: `BAST ${bast.type}`,
        subCategoryKey: "BAST",
        counterparty: "Serah Terima Konstruksi",
        project: bast.projectName,
        dateText: dateLabel(bast.date),
        amountText: "Dokumen Teknis",
        rawAmount: 0,
        metaNote: bast.maintenanceEndsAt
          ? `Akhir pemeliharaan: ${dateLabel(bast.maintenanceEndsAt)}`
          : bast.notes ?? undefined,
      })),
    ],
    [wages, termyns, contracts, addendums, bastDocuments],
  );

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");

  const filteredPoRows = useMemo(
    () =>
      poRows.filter((row) => {
        if (!normalizedQuery) return true;
        const haystack =
          `${row.code} ${row.title} ${row.categoryLabel} ${row.counterparty} ${row.project} ${row.metaNote ?? ""}`.toLocaleLowerCase(
            "id-ID",
          );
        return haystack.includes(normalizedQuery);
      }),
    [poRows, normalizedQuery],
  );

  const filteredFinancialRows = useMemo(
    () =>
      financialRows.filter((row) => {
        if (financialFilter !== "ALL" && row.subCategoryKey !== financialFilter)
          return false;
        if (!normalizedQuery) return true;
        const haystack =
          `${row.code} ${row.title} ${row.categoryLabel} ${row.counterparty} ${row.project} ${row.metaNote ?? ""}`.toLocaleLowerCase(
            "id-ID",
          );
        return haystack.includes(normalizedQuery);
      }),
    [financialRows, financialFilter, normalizedQuery],
  );

  const filteredWageRows = useMemo(
    () =>
      wageRows.filter((row) => {
        if (
          constructionFilter !== "ALL" &&
          row.subCategoryKey !== constructionFilter
        )
          return false;
        if (!normalizedQuery) return true;
        const haystack =
          `${row.code} ${row.title} ${row.categoryLabel} ${row.counterparty} ${row.project} ${row.metaNote ?? ""}`.toLocaleLowerCase(
            "id-ID",
          );
        return haystack.includes(normalizedQuery);
      }),
    [wageRows, constructionFilter, normalizedQuery],
  );

  const filteredHistory = useMemo(
    () =>
      approvalHistory.filter((entry) => {
        if (historyFilter !== "ALL" && entry.category !== historyFilter)
          return false;
        if (!normalizedQuery) return true;
        const haystack =
          `${entry.reference} ${entry.category} ${entry.actorName} ${entry.notes ?? ""}`.toLocaleLowerCase(
            "id-ID",
          );
        return haystack.includes(normalizedQuery);
      }),
    [approvalHistory, historyFilter, normalizedQuery],
  );

  const totalPendingCount =
    poRows.length + financialRows.length + wageRows.length;
  const totalExposureAmount = useMemo(() => {
    const poSum = poRows.reduce((sum, r) => sum + r.rawAmount, 0);
    const finSum = financialRows.reduce((sum, r) => sum + r.rawAmount, 0);
    const wageSum = wageRows.reduce((sum, r) => sum + r.rawAmount, 0);
    return poSum + finSum + wageSum;
  }, [poRows, financialRows, wageRows]);

  const selectPoRow = (key: string) => {
    setSignedPo(null);
    setTicketDecision(null);
    setTicketDecisionReason("");
    setSelection({ kind: "po", id: key });
  };

  const chooseFinancialRow = (key: string) => {
    const [kind, id] = key.split(":", 2);
    setSignedPo(null);
    setTicketDecision(null);
    setTicketDecisionReason("");
    if (kind === "purchase") {
      setSelection({ kind: "direct-purchase", id });
    } else if (kind === "ticket") {
      setSelection({ kind, id });
    }
  };

  const chooseWageRow = (key: string) => {
    const [kind, id] = key.split(":", 2);
    setSignedPo(null);
    if (
      kind === "wage" ||
      kind === "termyn" ||
      kind === "contract" ||
      kind === "addendum" ||
      kind === "bast"
    ) {
      setSelection({ kind, id });
      if (kind === "wage") {
        setWageAmount(
          wages.find((item) => item.id === id)?.proposedTotalWage ?? "",
        );
        setWageReason("");
      }
    }
  };

  const historyCategories = useMemo(() => {
    const set = new Set<string>();
    approvalHistory.forEach((item) => set.add(item.category));
    return Array.from(set);
  }, [approvalHistory]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pusat Otorisasi Direksi"
        description="Kendali persetujuan Purchase Order (Sign QR), pencairan dana tiket, upah lapangan, termin subkon, dan dokumen konstruksi."
        badge={
          <Badge variant={isExecutive(role) ? "default" : "secondary"}>
            {isExecutive(role) ? "Otorisasi Aktif" : "Mode Tinjauan"}
          </Badge>
        }
        actions={
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nomor PO, tiket, vendor, proyek..."
              className="pl-9"
              aria-label="Cari pengajuan persetujuan"
            />
          </div>
        }
      />

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="type-p3 font-medium text-muted-foreground">
                Total Antrean
              </span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Clock className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 type-kpi text-foreground">
              {totalPendingCount} Pengajuan
            </p>
            <p className="mt-0.5 type-p3 text-muted-foreground">
              Menunggu keputusan Direksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="type-p3 font-medium text-muted-foreground">
                Nilai Otorisasi
              </span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Landmark className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 type-kpi text-primary">
              {currency(totalExposureAmount)}
            </p>
            <p className="mt-0.5 type-p3 text-muted-foreground">
              Akumulasi PO, tiket, upah &amp; subkon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="type-p3 font-medium text-muted-foreground">
                PO &amp; Pengadaan
              </span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 type-kpi text-foreground">
              {purchaseOrders.length} PO · {directPurchases.length} Belanja
            </p>
            <p className="mt-0.5 type-p3 text-muted-foreground">
              Siap tanda tangan QR Direksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="type-p3 font-medium text-muted-foreground">
                Tiket &amp; Konstruksi
              </span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 type-kpi text-foreground">
              {tickets.length} Tiket · {wageRows.length} Proyek
              {pendingDrawings.length > 0
                ? ` · ${pendingDrawings.length} DED`
                : ""}
            </p>
            <p className="mt-0.5 type-p3 text-muted-foreground">
              Upah, termin, SPK, CCO, BAST &amp; DED
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Signed PO QR Result Card */}
      {signedPo && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <Badge variant="default" className="mb-1">
                QR SIGNATURE DITERBITKAN
              </Badge>
              <CardTitle className="type-h3">
                PO {qrTitle || signedPo.order.poNumber} Disahkan
              </CardTitle>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSignedPo(null)}
            >
              Tutup Pratinjau
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
              <Image
                src={signedPo.qrDataUrl}
                alt={`QR persetujuan PO ${signedPo.order.poNumber}`}
                width={96}
                height={96}
                className="size-24 rounded-lg border bg-white p-1.5"
              />
              <div className="space-y-1">
                <p className="type-p2 font-semibold text-foreground">
                  Disahkan secara digital oleh: {signedPo.approvedByName}
                </p>
                <p className="type-p3 text-muted-foreground">
                  Waktu pengesahan: {signedPo.approvedAt}
                </p>
                <p className="type-p3 text-muted-foreground">
                  Vendor: {signedPo.order.vendorName} · Proyek:{" "}
                  {signedPo.order.projectSiteName}
                </p>
              </div>
            </div>
            <UniversalDocumentPreview
              title={`Purchase Order ${signedPo.order.poNumber}`}
              documentNumber={signedPo.order.poNumber}
              src={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(signedPo.order.publicCode)}`}
            />
          </CardContent>
        </Card>
      )}

      {/* Pill Navigation Bar */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-2 lg:grid-cols-4">
        <Button
          type="button"
          variant={activeTab === "po" ? "default" : "ghost"}
          className="justify-between"
          onClick={() => setActiveTab("po")}
        >
          <span className="flex items-center gap-2 truncate">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">Persetujuan PO</span>
          </span>
          <Badge variant={activeTab === "po" ? "secondary" : "outline"}>
            {filteredPoRows.length}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={activeTab === "direct-purchase" ? "default" : "ghost"}
          className="justify-between"
          onClick={() => setActiveTab("direct-purchase")}
        >
          <span className="flex items-center gap-2 truncate">
            <Wallet className="size-4 shrink-0" />
            <span className="truncate">Dana &amp; Tiket</span>
          </span>
          <Badge
            variant={activeTab === "direct-purchase" ? "secondary" : "outline"}
          >
            {filteredFinancialRows.length}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={activeTab === "wages" ? "default" : "ghost"}
          className="justify-between"
          onClick={() => setActiveTab("wages")}
        >
          <span className="flex items-center gap-2 truncate">
            <HardHat className="size-4 shrink-0" />
            <span className="truncate">Upah &amp; Proyek</span>
          </span>
          <Badge variant={activeTab === "wages" ? "secondary" : "outline"}>
            {filteredWageRows.length + pendingDrawings.length}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={activeTab === "history" ? "default" : "ghost"}
          className="justify-between"
          onClick={() => setActiveTab("history")}
        >
          <span className="flex items-center gap-2 truncate">
            <History className="size-4 shrink-0" />
            <span className="truncate">Riwayat</span>
          </span>
          <Badge variant={activeTab === "history" ? "secondary" : "outline"}>
            {filteredHistory.length}
          </Badge>
        </Button>
      </div>

      {/* TAB 1: PERSETUJUAN PO */}
      {activeTab === "po" && (
        <Card>
          <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="type-h3">
                Antrean Purchase Order (Sign QR)
              </CardTitle>
              <p className="type-p3 text-muted-foreground">
                PO yang telah diverifikasi Keuangan dan menunggu pengesahan QR
                Direksi.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              {filteredPoRows.length} Dokumen
            </Badge>
          </CardHeader>
          <CardContent>
            <ApprovalQueueTable
              rows={filteredPoRows}
              emptyText="Tidak ada Purchase Order yang menunggu persetujuan."
              actionLabel={isExecutive(role) ? "Tinjau" : "Detail"}
              onSelect={selectPoRow}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 2: DANA & TIKET */}
      {activeTab === "direct-purchase" && (
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="type-h3">
                  Persetujuan Dana Tiket &amp; Belanja
                </CardTitle>
                <p className="type-p3 text-muted-foreground">
                  Permintaan kasbon, reimbursement, sewa rumah/kendaraan,
                  material, dan belanja langsung.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={financialFilter === "ALL" ? "default" : "outline"}
                  onClick={() => setFinancialFilter("ALL")}
                >
                  Semua ({financialRows.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={financialFilter === "TICKET" ? "default" : "outline"}
                  onClick={() => setFinancialFilter("TICKET")}
                >
                  Tiket ({tickets.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    financialFilter === "DIRECT_PURCHASE"
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setFinancialFilter("DIRECT_PURCHASE")}
                >
                  Belanja ({directPurchases.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ApprovalQueueTable
              rows={filteredFinancialRows}
              emptyText="Tidak ada pengajuan tiket atau belanja langsung."
              actionLabel={isExecutive(role) ? "Tinjau" : "Detail"}
              onSelect={chooseFinancialRow}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 3: UPAH, SUBKON & PROYEK */}
      {activeTab === "wages" && (
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="type-h3">
                  Upah, Termin Subkon, SPK, CCO &amp; BAST
                </CardTitle>
                <p className="type-p3 text-muted-foreground">
                  Otorisasi nilai upah kerja, termin subkon, kontrak SPK,
                  addendum, dan BAST.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={constructionFilter === "ALL" ? "default" : "outline"}
                  onClick={() => setConstructionFilter("ALL")}
                >
                  Semua ({wageRows.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "WAGE" ? "default" : "outline"
                  }
                  onClick={() => setConstructionFilter("WAGE")}
                >
                  Upah ({wages.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "TERMYN" ? "default" : "outline"
                  }
                  onClick={() => setConstructionFilter("TERMYN")}
                >
                  Termin ({termyns.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "CONTRACT" ? "default" : "outline"
                  }
                  onClick={() => setConstructionFilter("CONTRACT")}
                >
                  SPK ({contracts.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "ADDENDUM" ? "default" : "outline"
                  }
                  onClick={() => setConstructionFilter("ADDENDUM")}
                >
                  CCO ({addendums.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "BAST" ? "default" : "outline"
                  }
                  onClick={() => setConstructionFilter("BAST")}
                >
                  BAST ({bastDocuments.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {pendingDrawings.length > 0 && (
              <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="type-p2 font-bold text-foreground">
                      Antrean Gambar Kerja / DED ({pendingDrawings.length})
                    </h3>
                    <p className="type-p3 text-muted-foreground">
                      Dokumen teknis yang menunggu persetujuan direksi.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/apps/drafter">Buka Drafter</Link>
                  </Button>
                </div>
                <div className="space-y-2">
                  {pendingDrawings.map((drawing) => (
                    <PendingDrawingRowCard
                      key={drawing.id}
                      drawing={drawing}
                      canApprove={isExecutive(role)}
                      isPending={isPending}
                      onApprove={handleApproveDrawing}
                    />
                  ))}
                </div>
              </div>
            )}
            <ApprovalQueueTable
              rows={filteredWageRows}
              emptyText="Tidak ada usulan upah atau dokumen konstruksi."
              actionLabel={isExecutive(role) ? "Tinjau" : "Detail"}
              onSelect={chooseWageRow}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 4: RIWAYAT KEPUTUSAN */}
      {activeTab === "history" && (
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="type-h3">
                  Riwayat Keputusan Eksekutif
                </CardTitle>
                <p className="type-p3 text-muted-foreground">
                  Rekam jejak 100 keputusan terakhir atas dokumen pengadaan dan
                  proyek.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={historyFilter === "ALL" ? "default" : "outline"}
                  onClick={() => setHistoryFilter("ALL")}
                >
                  Semua ({approvalHistory.length})
                </Button>
                {historyCategories.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={historyFilter === cat ? "default" : "outline"}
                    onClick={() => setHistoryFilter(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredHistory.length === 0 ? (
              <EmptyState
                icon={<History className="size-6" />}
                title="Belum ada riwayat keputusan"
                description="Riwayat keputusan eksekutif yang sesuai filter akan tampil di sini."
                variant="inline"
              />
            ) : (
              <>
                <div className="space-y-2.5 md:hidden">
                  {filteredHistory.map((entry) => (
                    <ApprovalHistoryMobileCard key={entry.id} entry={entry} />
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table pagination itemLabel="riwayat">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu Keputusan</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Referensi &amp; Catatan</TableHead>
                        <TableHead>Pejabat</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((entry) => (
                        <ApprovalHistoryDesktopRow
                          key={entry.id}
                          entry={entry}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL TINJAUAN & KEPUTUSAN EKSEKUTIF (STICKY FOOTER SERAGAM) */}
      <GlobalModal
        isOpen={selection !== null}
        onClose={closeModal}
        title={
          selectedPo
            ? `Purchase Order · ${selectedPo.poNumber}`
            : selectedTicket
              ? `Tiket · ${selectedTicket.ticketNumber}`
              : selectedDirectPurchase
                ? `Belanja Langsung · ${selectedDirectPurchase.purchaseNumber}`
                : selectedWage
                  ? `Usulan Upah · ${selectedWage.title}`
                  : selectedTermyn
                    ? `Termin Subkon · ${selectedTermyn.contractNumber} (T-${selectedTermyn.termynNumber})`
                    : selectedContract
                      ? `SPK Subkon · ${selectedContract.contractNumber}`
                      : selectedAddendum
                        ? `Addendum CCO · ${selectedAddendum.addendumNumber}`
                        : selectedBast
                          ? `BAST ${selectedBast.type} · ${selectedBast.bastNumber}`
                          : "Persetujuan Eksekutif"
        }
        description="Periksa kelengkapan dokumen, rincian anggaran, dan tujuan pembayaran sebelum otorisasi."
        className="sm:max-w-3xl"
        footerNote={
          isExecutive(role)
            ? "Keputusan yang dikonfirmasi akan tercatat di Audit Log PT. Skala Prioritas Engineering."
            : "Mode tinjauan. Otorisasi dilakukan oleh Direktur / Wakil Direktur."
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {selectedPo && isExecutive(role) && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setQrTitle(selectedPo.poNumber);
                  runApproval(() =>
                    approvePurchaseOrder(selectedPo.publicCode),
                  );
                }}
              >
                <QrCode className="size-4" />
                {isPending ? "Memproses..." : "Approve QR"}
              </Button>
            )}

            {selectedDirectPurchase && isExecutive(role) && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runApproval(() =>
                    approveDirectStockPurchaseByDirector(
                      selectedDirectPurchase.id,
                    ),
                  )
                }
              >
                <CheckCircle2 className="size-4" />
                {isPending ? "Memproses..." : "Setujui"}
              </Button>
            )}

            {selectedTicket && isExecutive(role) && (
              <>
                {ticketDecision ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        setTicketDecision(null);
                        setTicketDecisionReason("");
                      }}
                    >
                      Batal
                    </Button>
                    <Button
                      type="button"
                      variant={
                        ticketDecision === "REJECT" ? "destructive" : "default"
                      }
                      disabled={
                        isPending || ticketDecisionReason.trim().length < 3
                      }
                      onClick={runTicketDecision}
                    >
                      {isPending
                        ? "Memproses..."
                        : ticketDecision === "REJECT"
                          ? "Konfirmasi Tolak"
                          : "Kirim Revisi"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        setTicketDecision("REJECT");
                        setTicketDecisionReason("");
                      }}
                    >
                      <XCircle className="size-4" />
                      Tolak
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setTicketDecision("REVISION");
                        setTicketDecisionReason("");
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Minta Revisi
                    </Button>
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runApproval(() =>
                          selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
                            ? approveEquipmentRequest(selectedTicket.id)
                            : approveByDirector(
                                selectedTicket.id,
                                selectedTicket.type,
                              ),
                        )
                      }
                    >
                      <CheckCircle2 className="size-4" />
                      {isPending
                        ? "Memproses..."
                        : selectedTicket.ticketType ===
                              EQUIPMENT_REQUEST_TYPE ||
                            selectedTicket.type === TicketType.MATERIAL
                          ? "Teruskan Logistik"
                          : "Setujui Dana"}
                    </Button>
                  </>
                )}
              </>
            )}

            {selectedWage && isExecutive(role) && (
              <Button
                type="submit"
                form="approval-wage-form"
                disabled={isPending}
              >
                <CheckCircle2 className="size-4" />
                {isPending ? "Memproses..." : "Setujui Upah"}
              </Button>
            )}

            {selectedTermyn && isExecutive(role) && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runApproval(() => approveSubkonTermyn(selectedTermyn.id))
                }
              >
                <CheckCircle2 className="size-4" />
                {isPending ? "Memproses..." : "Setujui Termin"}
              </Button>
            )}

            {selectedContract && isExecutive(role) && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() =>
                    runApproval(() =>
                      approveSubkonContract(
                        selectedContract.publicCode,
                        "REJECTED",
                      ),
                    )
                  }
                >
                  <XCircle className="size-4" />
                  Tolak SPK
                </Button>
                <Button
                  type="button"
                  disabled={
                    isPending ||
                    selectedContract.createdById === currentUserId
                  }
                  onClick={() =>
                    runApproval(() =>
                      approveSubkonContract(
                        selectedContract.publicCode,
                        "ACTIVE",
                      ),
                    )
                  }
                >
                  <CheckCircle2 className="size-4" />
                  {isPending ? "Memproses..." : "Setujui SPK"}
                </Button>
              </>
            )}

            {selectedAddendum && isExecutive(role) && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() =>
                    runApproval(() =>
                      approveProjectAddendum(selectedAddendum.id, "REJECTED"),
                    )
                  }
                >
                  <XCircle className="size-4" />
                  Tolak CCO
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runApproval(() =>
                      approveProjectAddendum(selectedAddendum.id, "APPROVED"),
                    )
                  }
                >
                  <CheckCircle2 className="size-4" />
                  {isPending ? "Memproses..." : "Setujui CCO"}
                </Button>
              </>
            )}

            {selectedBast && isExecutive(role) && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runApproval(() => approveBAST(selectedBast.id))
                }
              >
                <CheckCircle2 className="size-4" />
                {isPending ? "Memproses..." : "Sahkan BAST"}
              </Button>
            )}

            <Button variant="outline" type="button" onClick={closeModal}>
              Tutup
            </Button>
          </div>
        }
      >
        <div className="mt-2 space-y-4">
          {/* 1. DETAIL PURCHASE ORDER */}
          {selectedPo && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Vendor Penyedia
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedPo.vendorName}
                  </p>
                  {selectedPo.vendorPhone && (
                    <p className="type-p3 text-muted-foreground">
                      Telp: {selectedPo.vendorPhone}
                    </p>
                  )}
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Lokasi Proyek / Peruntukan
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedPo.projectSiteName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {selectedPo.ticketNumber
                      ? `Referensi Tiket: ${selectedPo.ticketNumber}`
                      : "Pengadaan Stok Gudang"}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Metode &amp; Rekening Pembayaran
                  </p>
                  <p className="type-p2 font-medium text-foreground">
                    {selectedPo.paymentMethod === "TRANSFER"
                      ? `Transfer · ${selectedPo.paymentBankName ?? "Bank"} (${selectedPo.paymentAccountNumber ?? "—"})`
                      : "Tunai / Cash"}
                  </p>
                  {selectedPo.paymentAccountName && (
                    <p className="type-p3 text-muted-foreground">
                      a.n. {selectedPo.paymentAccountName}
                    </p>
                  )}
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Verifikasi Bagian Keuangan
                  </p>
                  <p className="type-p2 font-medium text-foreground">
                    {selectedPo.financeReviewerName ?? "Telah Diperiksa"}
                  </p>
                  {selectedPo.financeReviewedAt && (
                    <p className="type-p3 text-muted-foreground">
                      Pada: {selectedPo.financeReviewedAt}
                    </p>
                  )}
                </div>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Material</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPo.items.map((item, idx) => (
                    <TableRow key={`${item.itemName}-${idx}`}>
                      <TableCell className="whitespace-normal font-medium">
                        {item.itemName}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {currency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {currency(item.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  {(() => {
                    const sub = selectedPo.items.reduce(
                      (s, i) => s + i.totalPrice,
                      0,
                    );
                    const tax = selectedPo.includeTax ? sub * 0.11 : 0;
                    return (
                      <>
                        {selectedPo.includeTax && (
                          <>
                            <TableRow>
                              <TableCell
                                colSpan={3}
                                className="text-right text-muted-foreground"
                              >
                                Subtotal
                              </TableCell>
                              <TableCell className="text-right">
                                {currency(sub)}
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell
                                colSpan={3}
                                className="text-right text-muted-foreground"
                              >
                                PPN 11%
                              </TableCell>
                              <TableCell className="text-right">
                                {currency(tax)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                        <TableRow className="text-primary">
                          <TableCell colSpan={3} className="text-right font-bold">
                            Total Nilai PO
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {currency(sub + tax)}
                          </TableCell>
                        </TableRow>
                      </>
                    );
                  })()}
                </TableFooter>
              </Table>

              <UniversalDocumentPreview
                title={`Purchase Order ${selectedPo.poNumber}`}
                documentNumber={selectedPo.poNumber}
                src={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(selectedPo.publicCode)}`}
              />
            </div>
          )}

          {/* 2. DETAIL TIKET & PENCAIRAN DANA */}
          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">
                      {selectedTicket.ticketType &&
                      selectedTicket.ticketType in RENTAL_TICKET_TYPE_LABELS
                        ? RENTAL_TICKET_TYPE_LABELS[selectedTicket.ticketType]
                        : ticketTypeLabelMap[selectedTicket.type] ??
                          selectedTicket.type}
                    </Badge>
                    {selectedTicket.requestCategory && (
                      <Badge variant="outline">
                        {requestCategoryLabelMap[
                          selectedTicket.requestCategory
                        ] ?? selectedTicket.requestCategory}
                      </Badge>
                    )}
                    {getFieldCostLabel(selectedTicket.fieldCategory) && (
                      <Badge variant="secondary">
                        {getFieldCostLabel(selectedTicket.fieldCategory)}
                      </Badge>
                    )}
                    {selectedTicket.priority && (
                      <Badge
                        variant={
                          selectedTicket.priority === "URGENT"
                            ? "lightError"
                            : selectedTicket.priority === "HIGH"
                              ? "lightWarning"
                              : "secondary"
                        }
                      >
                        Prioritas: {priorityLabelMap[selectedTicket.priority]}
                      </Badge>
                    )}
                  </div>
                  <h3 className="type-h3 text-foreground">
                    {selectedTicket.title}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="type-p3 text-muted-foreground">
                    Total Pengajuan Dana
                  </p>
                  <p className="type-kpi text-primary">
                    {currency(selectedTicket.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">Pemohon</p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedTicket.requesterName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Tanggal: {dateLabel(selectedTicket.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Proyek / Lokasi
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedTicket.projectName ?? "Operasional / Gudang Umum"}
                  </p>
                </div>

                {selectedTicket.type !== TicketType.MATERIAL && (
                  <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      Rekening Penerima Pencairan Dana
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Nama Penerima
                        </span>
                        <p className="type-p2 font-semibold">
                          {selectedTicket.recipientName ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Bank Tujuan
                        </span>
                        <p className="type-p2 font-semibold">
                          {selectedTicket.bankName ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Nomor Rekening
                        </span>
                        <p className="font-mono type-p2 font-semibold text-primary">
                          {selectedTicket.accountNumber ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTicket.rentalDetails && (
                  <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-primary">
                      {selectedTicket.rentalDetails.rentalType === "HOUSE"
                        ? "Rincian Sewa Rumah / Mess"
                        : "Rincian Sewa Kendaraan"}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Nama Aset
                        </span>
                        <p className="type-p2 font-semibold text-foreground">
                          {selectedTicket.rentalDetails.assetName}
                        </p>
                      </div>
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Lingkup Penggunaan
                        </span>
                        <p className="type-p2 font-medium text-foreground">
                          {selectedTicket.rentalDetails.usageScope ===
                          "OPERATIONAL"
                            ? "Operasional Kantor / Umum"
                            : "Khusus Proyek"}
                        </p>
                      </div>
                      {selectedTicket.rentalDetails.codeOrPlate && (
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Nopol / Kode Unit
                          </span>
                          <p className="font-mono type-p2 font-semibold text-foreground">
                            {selectedTicket.rentalDetails.codeOrPlate}
                          </p>
                        </div>
                      )}
                      {selectedTicket.rentalDetails.propertyAddress && (
                        <div className="sm:col-span-2">
                          <span className="type-p3 text-muted-foreground">
                            Alamat / Lokasi
                          </span>
                          <p className="type-p2 text-foreground">
                            {selectedTicket.rentalDetails.propertyAddress}
                          </p>
                        </div>
                      )}
                      {(selectedTicket.rentalDetails.landlordName ||
                        selectedTicket.rentalDetails.landlordPhone) && (
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Pemilik / Ibu Kos
                          </span>
                          <p className="type-p2 text-foreground">
                            {selectedTicket.rentalDetails.landlordName ?? "—"}
                            {selectedTicket.rentalDetails.landlordPhone
                              ? ` · ${selectedTicket.rentalDetails.landlordPhone}`
                              : ""}
                          </p>
                        </div>
                      )}
                      {typeof selectedTicket.rentalDetails.occupantCount ===
                        "number" && (
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Jumlah Penghuni
                          </span>
                          <p className="type-p2 font-medium text-foreground">
                            {selectedTicket.rentalDetails.occupantCount} Orang
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Periode Sewa
                        </span>
                        <p className="type-p2 text-foreground">
                          {selectedTicket.rentalDetails.periodType
                            ? RENTAL_PERIOD_TYPE_LABELS[
                                selectedTicket.rentalDetails.periodType
                              ]
                            : "Bulanan"}
                          {selectedTicket.rentalDetails.duration
                            ? ` (${selectedTicket.rentalDetails.duration}x)`
                            : ""}
                        </p>
                      </div>
                      {(selectedTicket.rentalDetails.startDate ||
                        selectedTicket.rentalDetails.endDate) && (
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Tanggal Berlaku
                          </span>
                          <p className="type-p2 text-foreground">
                            {dateLabel(selectedTicket.rentalDetails.startDate)}{" "}
                            s.d.{" "}
                            {dateLabel(selectedTicket.rentalDetails.endDate)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(selectedTicket.description ||
                  selectedTicket.requestPaymentDescription) && (
                  <div className="sm:col-span-2">
                    <p className="type-p3 text-muted-foreground">
                      Keterangan / Justifikasi Pengajuan
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-2.5 type-p2">
                      {selectedTicket.description ||
                        selectedTicket.requestPaymentDescription}
                    </p>
                  </div>
                )}
              </div>

              {selectedTicket.items.length > 0 && (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="mb-2 type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                    Rincian Item Tiket ({selectedTicket.items.length} Item)
                  </p>
                  <ul className="divide-y divide-border">
                    {selectedTicket.items.map((item, index) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                        key={`${item.itemName}-${index}`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="type-p2 font-medium text-foreground">
                              {item.itemName}
                            </span>
                            {item.categoryHint ===
                              TicketCategoryHint.CONTRACT && (
                              <Badge variant="outline">
                                Kontrak Material Alam
                              </Badge>
                            )}
                          </div>
                          {item.categoryHint === TicketCategoryHint.CONTRACT &&
                            item.materialContract && (
                              <p className="type-p3 text-muted-foreground">
                                {item.materialContract.contractNumber} ·{" "}
                                {item.materialContract.vendorName}
                                {item.estimatedCost
                                  ? ` · ${currency(item.estimatedCost)}/${item.unit}`
                                  : ""}
                              </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {item.quantity} {item.unit}
                          </Badge>
                          {item.categoryHint === TicketCategoryHint.CONTRACT &&
                            item.estimatedCost && (
                              <span className="type-p3 font-semibold text-foreground">
                                {currency(
                                  Number(item.estimatedCost) * item.quantity,
                                )}
                              </span>
                            )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selectedTicket.attachmentUrl ||
                selectedTicket.purchaseReceiptUrl ||
                (selectedTicket.receiptUrls &&
                  selectedTicket.receiptUrls.length > 0)) && (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="mb-2 type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                    Dokumen Lampiran &amp; Bukti
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.attachmentUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={selectedTicket.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="size-4" />
                          Lampiran Utama
                        </a>
                      </Button>
                    )}
                    {selectedTicket.purchaseReceiptUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={selectedTicket.purchaseReceiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="size-4" />
                          Nota Pembelian
                        </a>
                      </Button>
                    )}
                    {selectedTicket.receiptUrls?.map((url, idx) => (
                      <Button
                        key={`${url}-${idx}`}
                        asChild
                        size="sm"
                        variant="outline"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="size-4" />
                          Nota #{idx + 1}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {isExecutive(role) && ticketDecision && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                  <FormLabel
                    htmlFor="ticket-decision-reason"
                    className="type-p2 font-semibold"
                  >
                    {ticketDecision === "REJECT"
                      ? "Alasan Penolakan Tiket (Wajib)"
                      : "Catatan Revisi untuk Pemohon (Wajib)"}
                  </FormLabel>
                  <Textarea
                    id="ticket-decision-reason"
                    value={ticketDecisionReason}
                    maxLength={2000}
                    onChange={(event) =>
                      setTicketDecisionReason(event.target.value)
                    }
                    placeholder={
                      ticketDecision === "REJECT"
                        ? "Jelaskan alasan penolakan pengajuan ini..."
                        : "Jelaskan bagian nominal atau dokumen yang perlu diperbaiki..."
                    }
                    className="min-h-20"
                  />
                </div>
              )}
            </div>
          )}

          {/* 3. DETAIL PEMBELIAN LANGSUNG */}
          {selectedDirectPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Nama Vendor / Toko
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedDirectPurchase.vendorName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Oleh: {selectedDirectPurchase.createdByName} ·{" "}
                    {dateLabel(selectedDirectPurchase.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Proyek &amp; Pembayaran
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedDirectPurchase.projectName ?? "Stok Gudang Umum"}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {selectedDirectPurchase.paymentMethod === "TRANSFER"
                      ? `Transfer · ${selectedDirectPurchase.paymentBankName ?? "Bank"} ${selectedDirectPurchase.paymentAccountNumber ?? ""}`
                      : "Tunai / Cash"}
                  </p>
                </div>
                {selectedDirectPurchase.notes && (
                  <div className="sm:col-span-2">
                    <p className="type-p3 text-muted-foreground">Catatan</p>
                    <p className="type-p2">{selectedDirectPurchase.notes}</p>
                  </div>
                )}
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Material</TableHead>
                    <TableHead className="text-right">Kuantitas</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDirectPurchase.items.map((item, index) => (
                    <TableRow key={`${item.itemName}-${index}`}>
                      <TableCell className="whitespace-normal font-medium">
                        {item.itemName}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.unitPrice ? currency(item.unitPrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.totalPrice ? currency(item.totalPrice) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="text-primary">
                    <TableCell colSpan={3} className="text-right font-bold">
                      Total Pembelian Langsung
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {currency(selectedDirectPurchase.totalAmount)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* 4. DETAIL USULAN UPAH TITIK KERJA */}
          {selectedWage && (
            <form
              id="approval-wage-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isExecutive(role)) return;
                runApproval(() =>
                  approveProjectWorkPointWage(
                    selectedWage.id,
                    wageAmount,
                    wageReason,
                  ),
                );
              }}
            >
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Proyek &amp; Titik Pekerjaan
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedWage.projectName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Titik Kerja: {selectedWage.title} (
                    {selectedWage.location ?? "Lokasi proyek"})
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Pengusul Lapangan
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedWage.proposedByName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Tanggal Usulan: {dateLabel(selectedWage.createdAt)}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-2 rounded-xl border border-border p-4 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="type-p3 text-muted-foreground">
                    Volume Pekerjaan
                  </dt>
                  <dd className="mt-1 type-p2 font-semibold text-foreground">
                    {selectedWage.proposedVolume && selectedWage.proposedUnit
                      ? `${selectedWage.proposedVolume} ${selectedWage.proposedUnit}`
                      : "Borongan / Paket"}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="type-p3 text-muted-foreground">
                    Harga Satuan Usulan
                  </dt>
                  <dd className="mt-1 type-p2 font-semibold text-foreground">
                    {selectedWage.proposedUnitPrice
                      ? currency(selectedWage.proposedUnitPrice)
                      : "—"}
                  </dd>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <dt className="type-p3 font-medium text-primary">
                    Total Upah Diusulkan
                  </dt>
                  <dd className="mt-1 type-p1 font-bold text-primary">
                    {currency(selectedWage.proposedTotalWage)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FormLabel
                    htmlFor="wage-approved-amount"
                    className="type-p2 font-semibold"
                  >
                    Nilai Upah Disetujui (Rp)
                  </FormLabel>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWageAmount(selectedWage.proposedTotalWage)
                    }
                  >
                    Samakan Usulan
                  </Button>
                </div>
                <Input
                  id="wage-approved-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={wageAmount}
                  onChange={(event) => setWageAmount(event.target.value)}
                  className="font-semibold"
                />

                <div className="space-y-1.5">
                  <FormLabel
                    htmlFor="wage-audit-reason"
                    className="type-p2 font-semibold"
                  >
                    Catatan Audit Persetujuan
                  </FormLabel>
                  <Textarea
                    id="wage-audit-reason"
                    maxLength={2000}
                    required
                    value={wageReason}
                    onChange={(event) => setWageReason(event.target.value)}
                    placeholder="Contoh: Disetujui sesuai volume lapangan..."
                    className="min-h-20"
                  />
                </div>
              </div>
            </form>
          )}

          {/* 5. DETAIL TERMIN SUBKON */}
          {selectedTermyn && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Subkontraktor &amp; Nomor SPK
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedTermyn.subkonName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Kontrak: {selectedTermyn.contractNumber} · Termin Ke-
                    {selectedTermyn.termynNumber}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Proyek &amp; Klaim Progres
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedTermyn.projectName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Progres: {selectedTermyn.claimedPercent}% · Pengusul:{" "}
                    {selectedTermyn.createdByName}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="type-p3 text-muted-foreground">Nilai Bruto</dt>
                  <dd className="mt-1 type-p2 font-semibold text-foreground">
                    {currency(selectedTermyn.grossAmount)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="type-p3 text-muted-foreground">
                    Potongan Retensi
                  </dt>
                  <dd className="mt-1 type-p2 font-semibold text-foreground">
                    {currency(selectedTermyn.retentionAmount)}
                  </dd>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <dt className="type-p3 font-medium text-primary">
                    Nilai Bersih
                  </dt>
                  <dd className="mt-1 type-p1 font-bold text-primary">
                    {currency(selectedTermyn.netAmount)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* 6. DETAIL KONTRAK SPK SUBKON */}
          {selectedContract && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Subkontraktor / Mandor
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedContract.subkonName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Nomor SPK: {selectedContract.contractNumber}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Proyek &amp; Nilai Kontrak SPK
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedContract.projectName}
                  </p>
                  <p className="type-p1 font-bold text-primary">
                    {currency(selectedContract.contractValue)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                  Lingkup Pekerjaan
                </p>
                <p className="mt-1.5 whitespace-pre-wrap type-p2 text-foreground">
                  {selectedContract.workScope}
                </p>
              </div>

              {selectedContract.createdById === currentUserId && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 type-p3 text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0 text-primary" />
                  <span>
                    Kontrak SPK dibuat oleh akun Anda. Sesuai prinsip Four-Eyes,
                    persetujuan akhir harus oleh pejabat lain.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 7. DETAIL ADDENDUM / CCO */}
          {selectedAddendum && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
                <div>
                  <p className="type-p3 text-muted-foreground">Proyek</p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedAddendum.projectName}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Perubahan Pagu
                  </p>
                  <p className="type-p1 font-bold text-primary">
                    {currency(selectedAddendum.budgetChange)}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Perpanjangan Waktu
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    +{selectedAddendum.timeExtension} Hari
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                  Alasan Teknis Addendum / CCO
                </p>
                <p className="mt-1.5 whitespace-pre-wrap type-p2 text-foreground">
                  {selectedAddendum.reason}
                </p>
              </div>
            </div>
          )}

          {/* 8. DETAIL BAST PHO / FHO */}
          {selectedBast && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Jenis Serah Terima
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    BAST {selectedBast.type} (
                    {selectedBast.type === "PHO"
                      ? "Provisional Hand Over"
                      : "Final Hand Over"}
                    )
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">Proyek</p>
                  <p className="type-p2 font-semibold text-foreground">
                    {selectedBast.projectName}
                  </p>
                </div>
                <div>
                  <p className="type-p3 text-muted-foreground">
                    Tanggal Serah Terima
                  </p>
                  <p className="type-p2 font-semibold text-foreground">
                    {dateLabel(selectedBast.date)}
                  </p>
                  {selectedBast.maintenanceEndsAt && (
                    <p className="type-p3 text-muted-foreground">
                      Akhir Pemeliharaan:{" "}
                      {dateLabel(selectedBast.maintenanceEndsAt)}
                    </p>
                  )}
                </div>
              </div>

              {selectedBast.notes && (
                <div className="rounded-xl border border-border p-4">
                  <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                    Catatan Serah Terima
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap type-p2 text-foreground">
                    {selectedBast.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </GlobalModal>
    </div>
  );
}
