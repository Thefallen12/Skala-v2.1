"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  type EquipmentRequestType,
} from "@/lib/equipment-request";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BASTType,
  POPaymentMethod,
  TicketPriority,
  TicketRequestCategory,
  TicketType,
  UserRole,
} from "@prisma/client";
import {
  FileText,
  Wallet,
  HardHat,
  History,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ExternalLink,
  QrCode,
  Building2,
  Landmark,
  ShieldCheck,
  Clock,
  Eye,
  AlertCircle,
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

type ApprovalTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description?: string | null;
  type: TicketType;
  ticketType?: EquipmentRequestType | null;
  priority?: TicketPriority;
  requestCategory?: TicketRequestCategory | null;
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
  items: { itemName: string; quantity: number; unit: string }[];
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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-12 text-center">
        <CheckCircle2 className="mb-2 size-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">{emptyText}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Seluruh pengajuan pada kategori ini telah ditindaklanjuti.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Dokumen &amp; Uraian</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Vendor / Pemohon &amp; Proyek</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3 text-right">Nilai Pengajuan</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                className="cursor-pointer transition-colors hover:bg-muted/40"
              >
                <td className="px-4 py-3.5 align-top">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {row.code}
                    </span>
                    {row.priority &&
                      (row.priority === "URGENT" || row.priority === "HIGH") && (
                        <Badge
                          variant={
                            row.priority === "URGENT"
                              ? "lightError"
                              : "lightWarning"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {priorityLabelMap[row.priority]}
                        </Badge>
                      )}
                  </div>
                  <p className="mt-0.5 font-semibold text-foreground line-clamp-1">
                    {row.title}
                  </p>
                  {row.metaNote && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {row.metaNote}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <Badge variant="outline" className="font-medium">
                    {row.categoryLabel}
                  </Badge>
                </td>
                <td className="px-4 py-3.5 align-top">
                  <p className="font-medium text-foreground">
                    {row.counterparty}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {row.project}
                  </p>
                </td>
                <td className="px-4 py-3.5 align-top whitespace-nowrap text-xs text-muted-foreground">
                  {row.dateText}
                </td>
                <td className="px-4 py-3.5 align-top text-right whitespace-nowrap font-semibold text-foreground">
                  {row.amountText}
                </td>
                <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-primary/30 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(row.id);
                    }}
                  >
                    <Eye className="size-3.5" />
                    {actionLabel}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={() => onSelect(row.id)}
            className="cursor-pointer rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 active:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-primary">
                  {row.code}
                </span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {row.categoryLabel}
                </Badge>
                {row.priority &&
                  (row.priority === "URGENT" || row.priority === "HIGH") && (
                    <Badge
                      variant={
                        row.priority === "URGENT"
                          ? "lightError"
                          : "lightWarning"
                      }
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {priorityLabelMap[row.priority]}
                    </Badge>
                  )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {row.dateText}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-foreground">
              {row.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.counterparty} · {row.project}
            </p>
            {row.metaNote && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.metaNote}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
              <span className="text-sm font-bold text-foreground">
                {row.amountText}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-primary/30 px-2.5 text-xs text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(row.id);
                }}
              >
                <Eye className="size-3" />
                {actionLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

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

  const [message, setMessage] = useState("");
  const [signedPo, setSignedPo] = useState<{
    order: ApprovalPurchaseOrder;
    qrDataUrl: string;
    approvedByName: string;
    approvedAt: string;
  } | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [wageAmount, setWageAmount] = useState(() =>
    wages.find((item) => item.id === initialOpenSheet)?.proposedTotalWage ?? "",
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

  const runApproval = (
    action: () => Promise<{
      success: boolean;
      message: string;
      qrDataUrl?: string;
      actorName?: string;
      approvedAt?: string;
    }>,
  ) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.success) {
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
          setSelection(null);
          setTicketDecision(null);
          setTicketDecisionReason("");
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Executive approval action failed:", error);
        setMessage("Persetujuan gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const runTicketDecision = () => {
    if (!selectedTicket || !ticketDecision) return;
    const decision = ticketDecision;
    const reason = ticketDecisionReason.trim();
    if (reason.length < 3 || reason.length > 2000) {
      setMessage("Alasan wajib diisi (3–2.000 karakter).");
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

  // Build rich queue rows
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
        return {
          id: `ticket:${ticket.id}`,
          code: ticket.ticketNumber,
          title: ticket.title,
          categoryLabel:
            ticket.ticketType === EQUIPMENT_REQUEST_TYPE
              ? "Permintaan Alat & Kendaraan"
              : ticketTypeLabelMap[ticket.type] ?? "Tiket",
          subCategoryKey: "TICKET",
          priority: ticket.priority,
          counterparty: ticket.requesterName,
          project: ticket.projectName ?? "Operasional / Gudang Umum",
          dateText: dateLabel(ticket.createdAt),
          amountText: currency(ticket.totalAmount),
          rawAmount: Number.isFinite(amt) ? amt : 0,
          metaNote: ticket.recipientName
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

  // Search & Sub-filter logic
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");
  const matchesQuery = (row: QueueRowItem) => {
    if (!normalizedQuery) return true;
    const haystack =
      `${row.code} ${row.title} ${row.categoryLabel} ${row.counterparty} ${row.project} ${row.metaNote ?? ""}`.toLocaleLowerCase(
        "id-ID",
      );
    return haystack.includes(normalizedQuery);
  };

  const filteredPoRows = useMemo(
    () => poRows.filter(matchesQuery),
    [poRows, normalizedQuery],
  );

  const filteredFinancialRows = useMemo(
    () =>
      financialRows.filter((row) => {
        if (financialFilter !== "ALL" && row.subCategoryKey !== financialFilter)
          return false;
        return matchesQuery(row);
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
        return matchesQuery(row);
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

  // Executive KPI calculations
  const totalPendingCount =
    poRows.length + financialRows.length + wageRows.length;
  const totalExposureAmount = useMemo(() => {
    const poSum = poRows.reduce((sum, r) => sum + r.rawAmount, 0);
    const finSum = financialRows.reduce((sum, r) => sum + r.rawAmount, 0);
    const wageSum = wageRows.reduce((sum, r) => sum + r.rawAmount, 0);
    return poSum + finSum + wageSum;
  }, [poRows, financialRows, wageRows]);

  const approvalHistoryLabels: Record<string, string> = {
    APPROVED: "Disetujui",
    APPROVED_BY_DIR: "Disetujui Direksi",
    REJECTED_BY_DIR: "Ditolak Direksi",
    REVISION_REQUESTED_BY_DIR: "Minta Revisi",
  };

  const selectPoRow = (key: string) => {
    setMessage("");
    setSignedPo(null);
    setTicketDecision(null);
    setTicketDecisionReason("");
    setSelection({ kind: "po", id: key });
  };

  const chooseFinancialRow = (key: string) => {
    const [kind, id] = key.split(":", 2);
    setMessage("");
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
    setMessage("");
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
      {/* Executive Header */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                EXECUTIVE APPROVAL HUB
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                PT. Skala Prioritas Engineering (SPE)
              </span>
              <Badge variant={isExecutive(role) ? "default" : "secondary"}>
                {isExecutive(role)
                  ? "Otorisasi Direksi Aktif"
                  : "Mode Tinjauan Eksekutif"}
              </Badge>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Pusat Otorisasi &amp; Keputusan Direksi
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Kendali terpadu untuk persetujuan Purchase Order (Sign QR), pencairan dana tiket, upah lapangan, termin subkon, dan dokumen konstruksi.
            </p>
          </div>

          {/* Global Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nomor PO, tiket, vendor, proyek..."
              className="h-10 pl-9 text-sm"
            />
          </div>
        </div>

        {/* 4 Executive KPI Cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Antrean Persetujuan
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Clock className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-foreground">
              {totalPendingCount} Pengajuan
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Menunggu tinjauan &amp; keputusan Direksi
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Nilai Menunggu Otorisasi
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Landmark className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-primary">
              {currency(totalExposureAmount)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Akumulasi PO, tiket dana, upah &amp; subkon
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                PO &amp; Pengadaan Material
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-foreground">
              {purchaseOrders.length} PO · {directPurchases.length} Belanja
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Telah diperiksa Keuangan &amp; siap Sign QR
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Tiket, Upah &amp; Konstruksi
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-foreground">
              {tickets.length} Tiket · {wageRows.length} Proyek
              {pendingDrawings.length > 0 ? ` · ${pendingDrawings.length} DED` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Upah kerja, termin, SPK, CCO, BAST &amp; DED
            </p>
          </div>
        </div>
      </div>

      {/* Status Notification Banner */}
      {message && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
            <span>{message}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setMessage("")}
          >
            Tutup
          </Button>
        </div>
      )}

      {/* Signed PO QR Result Card */}
      {signedPo && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <Badge variant="default" className="mb-1">
                QR SIGNATURE BERHASIL DITERBITKAN
              </Badge>
              <CardTitle className="text-base">
                Purchase Order {qrTitle || signedPo.order.poNumber} Telah Disahkan
              </CardTitle>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSignedPo(null)}
            >
              Sembunyikan Pratinjau
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
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">
                  Disahkan secara digital oleh: {signedPo.approvedByName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Waktu pengesahan: {signedPo.approvedAt}
                </p>
                <p className="text-xs text-muted-foreground">
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

      {/* Streamlined Pill Navigation Bar (Consistent with Finance Hub) */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveTab("po")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all sm:text-sm ${
            activeTab === "po"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-muted/60"
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">1. Persetujuan PO</span>
          </span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "po"
                ? "bg-black/20 text-white"
                : "bg-primary/15 text-primary"
            }`}
          >
            {filteredPoRows.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("direct-purchase")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all sm:text-sm ${
            activeTab === "direct-purchase"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-muted/60"
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <Wallet className="size-4 shrink-0" />
            <span className="truncate">2. Dana &amp; Tiket</span>
          </span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "direct-purchase"
                ? "bg-black/20 text-white"
                : "bg-primary/15 text-primary"
            }`}
          >
            {filteredFinancialRows.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("wages")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all sm:text-sm ${
            activeTab === "wages"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-muted/60"
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <HardHat className="size-4 shrink-0" />
            <span className="truncate">3. Upah &amp; Proyek</span>
          </span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "wages"
                ? "bg-black/20 text-white"
                : "bg-primary/15 text-primary"
            }`}
          >
            {filteredWageRows.length + pendingDrawings.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all sm:text-sm ${
            activeTab === "history"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-muted/60"
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <History className="size-4 shrink-0" />
            <span className="truncate">4. Riwayat Keputusan</span>
          </span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "history"
                ? "bg-black/20 text-white"
                : "bg-primary/15 text-primary"
            }`}
          >
            {filteredHistory.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PERSETUJUAN PO */}
      {activeTab === "po" && (
        <Card>
          <CardHeader className="flex flex-col gap-1 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Antrean Purchase Order (Siap Tanda Tangan QR Direksi)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Daftar PO yang telah diverifikasi oleh bagian Keuangan dan menunggu pengesahan QR Direksi.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              {filteredPoRows.length} Dokumen PO
            </Badge>
          </CardHeader>
          <CardContent>
            <ApprovalQueueTable
              rows={filteredPoRows}
              emptyText="Tidak ada Purchase Order yang menunggu persetujuan Direksi."
              actionLabel={isExecutive(role) ? "Tinjau & Sign QR" : "Lihat PO"}
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
                <CardTitle className="text-base">
                  Persetujuan Pencairan Dana Tiket &amp; Belanja Langsung
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tinjau permintaan kasbon operasional, reimbursement, biaya resmi, material, serta belanja langsung gudang.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={financialFilter === "ALL" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFinancialFilter("ALL")}
                >
                  Semua ({financialRows.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={financialFilter === "TICKET" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFinancialFilter("TICKET")}
                >
                  Tiket &amp; Dana ({tickets.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    financialFilter === "DIRECT_PURCHASE" ? "default" : "outline"
                  }
                  className="h-7 text-xs"
                  onClick={() => setFinancialFilter("DIRECT_PURCHASE")}
                >
                  Belanja Langsung ({directPurchases.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ApprovalQueueTable
              rows={filteredFinancialRows}
              emptyText="Tidak ada pengajuan tiket atau pembelian langsung yang menunggu persetujuan."
              actionLabel={
                isExecutive(role) ? "Tinjau & Putuskan" : "Lihat Detail"
              }
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
                <CardTitle className="text-base">
                  Persetujuan Upah Kerja, Termin Subkon, SPK, CCO &amp; BAST
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Otorisasi nilai upah titik kerja lapangan, pencairan termin subkontraktor, kontrak SPK, addendum, dan BAST.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={constructionFilter === "ALL" ? "default" : "outline"}
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
                  onClick={() => setConstructionFilter("WAGE")}
                >
                  Usulan Upah ({wages.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    constructionFilter === "TERMYN" ? "default" : "outline"
                  }
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
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
                    <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">
                      Antrean Gambar Kerja / DED ({pendingDrawings.length})
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Dokumen teknis yang diunggah drafter dan menunggu persetujuan direksi.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link href="/apps/drafter">Buka Workspace Drafter</Link>
                  </Button>
                </div>
                <div className="space-y-2">
                  {pendingDrawings.map((drawing) => (
                    <div
                      key={drawing.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          <span className="font-mono">{drawing.drawingCode}</span> ·{" "}
                          {drawing.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {drawing.projectName ?? "Tanpa proyek"} · {drawing.category} · Rev{" "}
                          {drawing.version} · Oleh {drawing.uploadedByName}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {drawing.fileUrl && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                            <a href={drawing.fileUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-3" />
                              Buka File
                            </a>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                          <Link
                            href={
                              drawing.projectId
                                ? `/apps/drafter?projectId=${encodeURIComponent(drawing.projectId)}`
                                : "/apps/drafter"
                            }
                          >
                            Tinjau / Revisi
                          </Link>
                        </Button>
                        {isExecutive(role) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="success"
                            className="h-7 text-[11px]"
                            disabled={isPending}
                            onClick={() => {
                              startTransition(async () => {
                                const res = await reviewDrawingDocument(
                                  drawing.id,
                                  "APPROVED",
                                  "Disetujui melalui Otorisasi Direksi.",
                                );
                                setMessage(res.message);
                                if (res.success) router.refresh();
                              });
                            }}
                          >
                            <CheckCircle2 className="size-3" />
                            Setujui
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ApprovalQueueTable
              rows={filteredWageRows}
              emptyText="Tidak ada usulan upah, termin, atau dokumen konstruksi yang menunggu persetujuan."
              actionLabel={
                isExecutive(role) ? "Tinjau & Setujui" : "Lihat Detail"
              }
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
                <CardTitle className="text-base">
                  Log Audit &amp; Riwayat Keputusan Eksekutif
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Rekam jejak 100 keputusan terakhir atas dokumen PO, tiket, pembelian langsung, upah, termin, dan proyek.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={historyFilter === "ALL" ? "default" : "outline"}
                  className="h-7 text-xs"
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
                    className="h-7 text-xs"
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
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada riwayat keputusan yang sesuai dengan filter.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Waktu Keputusan</th>
                      <th className="px-4 py-3">Kategori</th>
                      <th className="px-4 py-3">Referensi Dokumen &amp; Catatan</th>
                      <th className="px-4 py-3">Pejabat Otorisasi</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.map((entry) => {
                      const isApproved =
                        entry.action === "APPROVED" ||
                        entry.action === "APPROVED_BY_DIR";
                      const isRejected = entry.action === "REJECTED_BY_DIR";
                      return (
                        <tr key={entry.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                            {new Intl.DateTimeFormat("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Jakarta",
                            }).format(new Date(entry.createdAt))}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline" className="font-medium">
                              {entry.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-foreground">
                              {entry.reference}
                            </p>
                            {entry.notes && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Catatan: {entry.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-xs font-medium text-foreground">
                            {entry.actorName}
                          </td>
                          <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                            <Badge
                              variant={
                                isApproved
                                  ? "default"
                                  : isRejected
                                    ? "lightError"
                                    : "lightWarning"
                              }
                            >
                              {approvalHistoryLabels[entry.action] ??
                                entry.action}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL TINJAUAN & KEPUTUSAN EKSEKUTIF */}
      <GlobalModal
        isOpen={selection !== null}
        onClose={() => {
          setSelection(null);
          setTicketDecision(null);
          setTicketDecisionReason("");
          setMessage("");
        }}
        title={
          selectedPo
            ? `Tinjauan Purchase Order · ${selectedPo.poNumber}`
            : selectedTicket
              ? `Tinjauan Tiket · ${selectedTicket.ticketNumber}`
              : selectedDirectPurchase
                ? `Pembelian Langsung · ${selectedDirectPurchase.purchaseNumber}`
                : selectedWage
                  ? `Evaluasi Usulan Upah · ${selectedWage.title}`
                  : selectedTermyn
                    ? `Pencairan Termin Subkon · ${selectedTermyn.contractNumber} (Termin ${selectedTermyn.termynNumber})`
                    : selectedContract
                      ? `Persetujuan SPK Subkon · ${selectedContract.contractNumber}`
                      : selectedAddendum
                        ? `Persetujuan Addendum / CCO · ${selectedAddendum.addendumNumber}`
                        : selectedBast
                          ? `Pengesahan BAST ${selectedBast.type} · ${selectedBast.bastNumber}`
                          : "Detail Persetujuan Eksekutif"
        }
        description="Periksa kelengkapan dokumen, rincian anggaran, dan tujuan pembayaran sebelum menerbitkan otorisasi."
        className="sm:max-w-3xl"
        footerNote={
          isExecutive(role)
            ? "Keputusan yang dikonfirmasi akan langsung tercatat di Audit Log PT. Skala Prioritas Engineering."
            : "Anda berada dalam mode tinjauan. Pengesahan akhir dilakukan oleh Direktur / Wakil Direktur."
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
                <QrCode className="mr-1.5 size-4" />
                {isPending ? "Memproses Sign QR..." : "Approve & Sign QR"}
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
                <CheckCircle2 className="mr-1.5 size-4" />
                {isPending
                  ? "Memproses..."
                  : "Setujui Pengajuan Pembelian Langsung"}
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
                <CheckCircle2 className="mr-1.5 size-4" />
                {isPending ? "Memproses..." : "Setujui Pencairan Termin"}
              </Button>
            )}

            {selectedBast && isExecutive(role) && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runApproval(() => approveBAST(selectedBast.id))
                }
              >
                <CheckCircle2 className="mr-1.5 size-4" />
                {isPending ? "Memproses..." : "Setujui & Sahkan BAST"}
              </Button>
            )}

            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setSelection(null);
                setTicketDecision(null);
                setTicketDecisionReason("");
              }}
            >
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
                  <p className="text-xs text-muted-foreground">Vendor Penyedia</p>
                  <p className="font-semibold text-foreground">
                    {selectedPo.vendorName}
                  </p>
                  {selectedPo.vendorPhone && (
                    <p className="text-xs text-muted-foreground">
                      Telp: {selectedPo.vendorPhone}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Lokasi Proyek / Peruntukan
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedPo.projectSiteName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedPo.ticketNumber
                      ? `Referensi Tiket: ${selectedPo.ticketNumber}`
                      : "Pengadaan Stok Gudang"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Metode &amp; Rekening Pembayaran
                  </p>
                  <p className="font-medium text-foreground">
                    {selectedPo.paymentMethod === "TRANSFER"
                      ? `Transfer · ${selectedPo.paymentBankName ?? "Bank"} (${selectedPo.paymentAccountNumber ?? "—"})`
                      : "Tunai / Cash"}
                  </p>
                  {selectedPo.paymentAccountName && (
                    <p className="text-xs text-muted-foreground">
                      a.n. {selectedPo.paymentAccountName}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Verifikasi Bagian Keuangan
                  </p>
                  <p className="font-medium text-foreground">
                    {selectedPo.financeReviewerName ?? "Telah Diperiksa"}
                  </p>
                  {selectedPo.financeReviewedAt && (
                    <p className="text-xs text-muted-foreground">
                      Pada: {selectedPo.financeReviewedAt}
                    </p>
                  )}
                </div>
              </div>

              {/* Rincian Item PO */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Nama Material</th>
                      <th className="px-3 py-2.5 text-right">Volume</th>
                      <th className="px-3 py-2.5 text-right">Harga Satuan</th>
                      <th className="px-3 py-2.5 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedPo.items.map((item, idx) => (
                      <tr key={`${item.itemName}-${idx}`}>
                        <td className="px-3 py-2 font-medium">{item.itemName}</td>
                        <td className="px-3 py-2 text-right">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {currency(item.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {currency(item.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/20 text-xs font-semibold">
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
                              <tr>
                                <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">
                                  Subtotal
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  {currency(sub)}
                                </td>
                              </tr>
                              <tr>
                                <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">
                                  PPN 11%
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  {currency(tax)}
                                </td>
                              </tr>
                            </>
                          )}
                          <tr className="text-sm text-primary">
                            <td colSpan={3} className="px-3 py-2.5 text-right font-bold">
                              Total Nilai PO
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold">
                              {currency(sub + tax)}
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>

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
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">
                      {ticketTypeLabelMap[selectedTicket.type] ??
                        selectedTicket.type}
                    </Badge>
                    {selectedTicket.requestCategory && (
                      <Badge variant="outline">
                        {requestCategoryLabelMap[
                          selectedTicket.requestCategory
                        ] ?? selectedTicket.requestCategory}
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
                  <h3 className="mt-1 text-base font-bold text-foreground">
                    {selectedTicket.title}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Total Pengajuan Dana
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {currency(selectedTicket.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Pemohon</p>
                  <p className="font-semibold text-foreground">
                    {selectedTicket.requesterName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tanggal Pengajuan: {dateLabel(selectedTicket.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Proyek / Lokasi
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedTicket.projectName ?? "Operasional / Gudang Umum"}
                  </p>
                </div>

                {selectedTicket.type !== TicketType.MATERIAL && (
                  <div className="sm:col-span-2 rounded-lg bg-muted/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Rekening Penerima Pencairan Dana
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Nama Penerima:
                        </span>
                        <p className="font-semibold">
                          {selectedTicket.recipientName ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Bank Tujuan:
                        </span>
                        <p className="font-semibold">
                          {selectedTicket.bankName ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Nomor Rekening:
                        </span>
                        <p className="font-mono font-semibold text-primary">
                          {selectedTicket.accountNumber ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {(selectedTicket.description ||
                  selectedTicket.requestPaymentDescription) && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Keterangan / Justifikasi Pengajuan
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-2.5 text-sm">
                      {selectedTicket.description ||
                        selectedTicket.requestPaymentDescription}
                    </p>
                  </div>
                )}
              </div>

              {/* Daftar Item Tiket */}
              {selectedTicket.items.length > 0 && (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Rincian Item Tiket ({selectedTicket.items.length} Item)
                  </p>
                  <ul className="divide-y divide-border text-sm">
                    {selectedTicket.items.map((item, index) => (
                      <li
                        className="flex items-center justify-between py-2"
                        key={`${item.itemName}-${index}`}
                      >
                        <span className="font-medium text-foreground">
                          {item.itemName}
                        </span>
                        <Badge variant="secondary">
                          {item.quantity} {item.unit}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lampiran Nota / Bukti */}
              {(selectedTicket.attachmentUrl ||
                selectedTicket.purchaseReceiptUrl ||
                (selectedTicket.receiptUrls &&
                  selectedTicket.receiptUrls.length > 0)) && (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dokumen Lampiran &amp; Bukti Pendukung
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.attachmentUrl && (
                      <a
                        href={selectedTicket.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        <ExternalLink className="size-3.5" />
                        Lihat Lampiran Utama
                      </a>
                    )}
                    {selectedTicket.purchaseReceiptUrl && (
                      <a
                        href={selectedTicket.purchaseReceiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        <ExternalLink className="size-3.5" />
                        Bukti Nota Pembelian
                      </a>
                    )}
                    {selectedTicket.receiptUrls?.map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <ExternalLink className="size-3.5" />
                        Lampiran Nota #{idx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Panel Keputusan Direksi untuk Tiket */}
              {isExecutive(role) && (
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Tindakan Otorisasi Direksi
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() =>
                        runApproval(() =>
                          selectedTicket.ticketType ===
                            EQUIPMENT_REQUEST_TYPE
                            ? approveEquipmentRequest(selectedTicket.id)
                            : approveByDirector(
                                selectedTicket.id,
                                selectedTicket.type,
                              ),
                        )
                      }
                    >
                      <CheckCircle2 className="mr-1.5 size-4" />
                      {isPending
                        ? "Memproses..."
                        : selectedTicket.ticketType ===
                            EQUIPMENT_REQUEST_TYPE ||
                          selectedTicket.type === TicketType.MATERIAL
                          ? "Setujui & Teruskan ke Logistik"
                          : "Setujui Pencairan Dana"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setMessage("");
                        setTicketDecision("REVISION");
                        setTicketDecisionReason("");
                      }}
                    >
                      <RotateCcw className="mr-1.5 size-4" />
                      Minta Revisi
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        setMessage("");
                        setTicketDecision("REJECT");
                        setTicketDecisionReason("");
                      }}
                    >
                      <XCircle className="mr-1.5 size-4" />
                      Tolak
                    </Button>
                  </div>

                  {ticketDecision && (
                    <div className="space-y-3 rounded-lg border border-border bg-background p-3.5">
                      <FormLabel className="block space-y-1.5 text-sm font-medium">
                        <span>
                          {ticketDecision === "REJECT"
                            ? "Alasan Penolakan Tiket (Wajib diisi)"
                            : "Catatan Revisi untuk Pemohon (Wajib diisi)"}
                        </span>
                        <Textarea
                          value={ticketDecisionReason}
                          maxLength={2000}
                          onChange={(event) =>
                            setTicketDecisionReason(event.target.value)
                          }
                          placeholder={
                            ticketDecision === "REJECT"
                              ? "Jelaskan alasan penolakan pengajuan ini..."
                              : "Jelaskan bagian nominal/dokumen yang perlu diperbaiki..."
                          }
                          className="min-h-20 font-normal"
                        />
                      </FormLabel>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            ticketDecision === "REJECT"
                              ? "destructive"
                              : "default"
                          }
                          disabled={
                            isPending ||
                            ticketDecisionReason.trim().length < 3
                          }
                          onClick={runTicketDecision}
                        >
                          {isPending
                            ? "Memproses..."
                            : ticketDecision === "REJECT"
                              ? "Konfirmasi Tolak Tiket"
                              : "Kirim Permintaan Revisi"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => {
                            setTicketDecision(null);
                            setTicketDecisionReason("");
                          }}
                        >
                          Batal
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. DETAIL PEMBELIAN LANGSUNG (DIRECT STOCK PURCHASE) */}
          {selectedDirectPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Nama Vendor / Toko</p>
                  <p className="font-semibold text-foreground">
                    {selectedDirectPurchase.vendorName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Diajukan oleh: {selectedDirectPurchase.createdByName} ·{" "}
                    {dateLabel(selectedDirectPurchase.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Proyek &amp; Metode Pembayaran
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedDirectPurchase.projectName ?? "Stok Gudang Umum"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDirectPurchase.paymentMethod === "TRANSFER"
                      ? `Transfer · ${selectedDirectPurchase.paymentBankName ?? "Bank"} ${selectedDirectPurchase.paymentAccountNumber ?? ""}`
                      : "Pembayaran Tunai / Cash"}
                  </p>
                </div>
                {selectedDirectPurchase.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Catatan</p>
                    <p className="text-sm">{selectedDirectPurchase.notes}</p>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Item Material</th>
                      <th className="px-3 py-2.5 text-right">Kuantitas</th>
                      <th className="px-3 py-2.5 text-right">Harga Satuan</th>
                      <th className="px-3 py-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedDirectPurchase.items.map((item, index) => (
                      <tr key={`${item.itemName}-${index}`}>
                        <td className="px-3 py-2 font-medium">{item.itemName}</td>
                        <td className="px-3 py-2 text-right">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.unitPrice ? currency(item.unitPrice) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {item.totalPrice ? currency(item.totalPrice) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/20">
                    <tr className="text-sm font-bold text-primary">
                      <td colSpan={3} className="px-3 py-2.5 text-right">
                        Total Pembelian Langsung
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {currency(selectedDirectPurchase.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 4. DETAIL USULAN UPAH TITIK KERJA */}
          {selectedWage && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                runApproval(() =>
                  approveProjectWorkPointWage(
                    selectedWage.id,
                    wageAmount,
                    wageReason,
                  ),
                );
              }}
            >
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Proyek &amp; Titik Pekerjaan
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedWage.projectName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Titik Kerja: {selectedWage.title} (
                    {selectedWage.location ?? "Lokasi proyek"})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Pengusul Lapangan
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedWage.proposedByName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tanggal Usulan: {dateLabel(selectedWage.createdAt)}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-2 rounded-xl border border-border p-4 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Volume Pekerjaan
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {selectedWage.proposedVolume && selectedWage.proposedUnit
                      ? `${selectedWage.proposedVolume} ${selectedWage.proposedUnit}`
                      : "Borongan / Paket"}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Harga Satuan Usulan
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {selectedWage.proposedUnitPrice
                      ? currency(selectedWage.proposedUnitPrice)
                      : "—"}
                  </dd>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <dt className="text-xs font-medium text-primary">
                    Total Upah Diusulkan
                  </dt>
                  <dd className="mt-1 text-base font-bold text-primary">
                    {currency(selectedWage.proposedTotalWage)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FormLabel className="text-sm font-semibold">
                    Nilai Upah Disetujui Direksi (Rp)
                  </FormLabel>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      setWageAmount(selectedWage.proposedTotalWage)
                    }
                  >
                    Sesuaikan dengan Nilai Usulan (
                    {currency(selectedWage.proposedTotalWage)})
                  </Button>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={wageAmount}
                  onChange={(event) => setWageAmount(event.target.value)}
                  className="font-semibold"
                />

                <FormLabel className="block space-y-1.5 text-sm font-semibold">
                  <span>Catatan Audit Persetujuan / Koreksi Nilai</span>
                  <Textarea
                    maxLength={2000}
                    required
                    value={wageReason}
                    onChange={(event) => setWageReason(event.target.value)}
                    placeholder="Contoh: Disetujui sesuai volume lapangan / Dikoreksi menyesuaikan standar harga satuan proyek..."
                    className="min-h-20 font-normal"
                  />
                </FormLabel>

                {isExecutive(role) && (
                  <Button type="submit" className="w-full" disabled={isPending}>
                    <CheckCircle2 className="mr-1.5 size-4" />
                    {isPending
                      ? "Memproses..."
                      : `Setujui Upah (${currency(wageAmount || 0)})`}
                  </Button>
                )}
              </div>
            </form>
          )}

          {/* 5. DETAIL TERMIN SUBKON */}
          {selectedTermyn && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Subkontraktor &amp; Nomor SPK
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedTermyn.subkonName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kontrak: {selectedTermyn.contractNumber} · Termin Ke-
                    {selectedTermyn.termynNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Proyek &amp; Klaim Progres
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedTermyn.projectName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Progres Fisik Diklaim: {selectedTermyn.claimedPercent}% ·
                    Pengusul: {selectedTermyn.createdByName}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">Nilai Bruto</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {currency(selectedTermyn.grossAmount)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Potongan Retensi
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {currency(selectedTermyn.retentionAmount)}
                  </dd>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <dt className="text-xs font-medium text-primary">
                    Nilai Bersih Dibayarkan
                  </dt>
                  <dd className="mt-1 text-base font-bold text-primary">
                    {currency(selectedTermyn.netAmount)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* 6. DETAIL KONTRAK SPK SUBKON */}
          {selectedContract && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Subkontraktor / Mandor
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedContract.subkonName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nomor SPK: {selectedContract.contractNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Proyek &amp; Nilai Kontrak SPK
                  </p>
                  <p className="font-semibold text-foreground">
                    {selectedContract.projectName}
                  </p>
                  <p className="text-base font-bold text-primary">
                    {currency(selectedContract.contractValue)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lingkup Pekerjaan (Work Scope)
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {selectedContract.workScope}
                </p>
              </div>

              {selectedContract.createdById === currentUserId && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0 text-primary" />
                  <span>
                    Kontrak SPK ini dibuat oleh akun Anda. Sesuai kebijakan pengendalian internal (Four-Eyes Principle), persetujuan harus dilakukan oleh pejabat otorisasi lain.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="flex-1"
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
                  <CheckCircle2 className="mr-1.5 size-4" />
                  {isPending ? "Memproses..." : "Setujui & Aktifkan SPK"}
                </Button>
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
                  <XCircle className="mr-1.5 size-4" />
                  Tolak SPK
                </Button>
              </div>
            </div>
          )}

          {/* 7. DETAIL ADDENDUM / CCO */}
          {selectedAddendum && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Proyek</p>
                  <p className="font-semibold text-foreground">
                    {selectedAddendum.projectName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Perubahan Pagu Anggaran
                  </p>
                  <p className="font-bold text-primary">
                    {currency(selectedAddendum.budgetChange)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Perpanjangan Waktu
                  </p>
                  <p className="font-semibold text-foreground">
                    +{selectedAddendum.timeExtension} Hari Kalender
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Alasan Teknis Addendum / Contract Change Order (CCO)
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {selectedAddendum.reason}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() =>
                    runApproval(() =>
                      approveProjectAddendum(selectedAddendum.id, "APPROVED"),
                    )
                  }
                >
                  <CheckCircle2 className="mr-1.5 size-4" />
                  {isPending ? "Memproses..." : "Setujui Addendum / CCO"}
                </Button>
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
                  <XCircle className="mr-1.5 size-4" />
                  Tolak CCO
                </Button>
              </div>
            </div>
          )}

          {/* 8. DETAIL BAST PHO / FHO */}
          {selectedBast && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Jenis Serah Terima
                  </p>
                  <p className="font-semibold text-foreground">
                    BAST {selectedBast.type} (
                    {selectedBast.type === "PHO"
                      ? "Provisional Hand Over"
                      : "Final Hand Over"}
                    )
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proyek</p>
                  <p className="font-semibold text-foreground">
                    {selectedBast.projectName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Tanggal Serah Terima
                  </p>
                  <p className="font-semibold text-foreground">
                    {dateLabel(selectedBast.date)}
                  </p>
                  {selectedBast.maintenanceEndsAt && (
                    <p className="text-xs text-muted-foreground">
                      Akhir Pemeliharaan:{" "}
                      {dateLabel(selectedBast.maintenanceEndsAt)}
                    </p>
                  )}
                </div>
              </div>

              {selectedBast.notes && (
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Catatan Berita Acara Serah Terima
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
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
