"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  Clock3,
  ExternalLink,
  Eye,
  FilePenLine,
  FileText,
  Fuel,
  Layers,
  PackageCheck,
  Pencil,
  Plus,
  Send,
  Store,
  TicketCheck,
  Truck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  createEquipmentLog,
  createEquipmentMaster,
} from "@/app/actions/construction";
import { issueOperationalDocument } from "@/app/actions/documents";
import { canOperateLogisticsActions } from "@/lib/user-access";
import {
  approvePurchaseOrder,
  markPurchaseOrderSentToVendor,
  reviewPurchaseOrder,
  submitPurchaseOrderForFinanceReview,
} from "@/app/actions/orders";
import { getJakartaDateKey } from "@/lib/habit-date";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import LogisticsWorkspace from "@/app/components/apps/tickets/LogisticsWorkspace";
import DocumentSignoffQueue, {
  type DocumentSignoffTask,
} from "@/app/components/apps/documents/DocumentSignoffQueue";
import PurchaseOrderConfirmationQueue, {
  type PurchaseOrderConfirmationRow,
} from "@/app/components/apps/logistics/PurchaseOrderConfirmationQueue";
import PurchaseOrderInvoiceUpload from "@/app/components/apps/logistics/PurchaseOrderInvoiceUpload";
import PurchaseOrderReceiptAction from "@/app/components/apps/logistics/PurchaseOrderReceiptAction";
import VehicleFleetPanel from "@/app/components/apps/logistics/VehicleFleetPanel";
import VehicleOperationsPanel from "@/app/components/apps/logistics/VehicleOperationsPanel";
import EquipmentVehicleRentalPanel from "@/app/components/apps/logistics/EquipmentVehicleRentalPanel";
import MaterialContractsPanel from "@/app/components/apps/logistics/MaterialContractsPanel";
import type { RentalItemRow } from "@/app/actions/rentals";
import type {
  ContractTicketDeliveryOption,
  MaterialContractRow,
  MaterialDeliveryRow,
  TicketMaterialContractOption,
  VendorInvoiceRow,
} from "@/lib/material-contracts";
import { VendorFormDialog } from "@/app/components/forms/VendorFormDialog";
import type { VehicleSummary } from "@/app/actions/vehicles";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import {
  OperationalDocumentKind,
  POPaymentMethod,
  POStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getVendorBankAccounts,
  type VendorBankAccountOption,
} from "@/lib/vendor-bank-accounts";

type LogisticsStockItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stockQuantity: string;
  minimumStock: string;
  unitPrice: string;
  createdAt: string;
};

type DirectStockPurchaseRow = {
  id: string;
  purchaseNumber: string;
  vendorName: string;
  status: "PENDING_RECEIPT" | "RECEIVED";
  isApprovedByDirector: boolean;
  totalAmount: string;
  hasFinanceProof: boolean;
  createdAt: string;
  receivedAt: string | null;
  arrivalPhotoUrl: string | null;
  receivedPhotos: string[];
  vendorInvoiceUrl: string | null;
  vendorInvoiceUploadedAt: string | null;
  vendorInvoiceUploadedBy: { name: string | null } | null;
  items: { id: string; itemName: string; quantity: string; unit: string }[];
  receivedBy: { name: string | null } | null;
  ticket: { id: string; ticketNumber: string; title: string } | null;
};

type LogisticsVendor = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts: VendorBankAccountOption[];
  rating: number;
};

type HubPurchaseOrder = {
  id: string;
  publicCode: string;
  poNumber: string;
  vendorName: string;
  paymentMethod: POPaymentMethod;
  paymentTerms: string | null;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  receivedAt: string | null;
  ticketId: string | null;
  vendorInvoiceUrl: string | null;
  invoiceId: string | null;
  vendorPoSentAt: string | null;
  includeTax: boolean;
  items: {
    itemCode: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];
};

type HubDeliveryOrder = {
  id: string;
  publicCode: string;
  doNumber: string;
  status: string;
  createdAt: string;
  ticketId: string | null;
  vehicleId: string | null;
  vehiclePlateNumber: string | null;
  executiveApproved: boolean;
};

type EquipmentLogRow = {
  id: string;
  equipmentName: string;
  operatorName: string | null;
  date: string;
  hmStart: string;
  hmEnd: string;
  effectiveHours: string;
  fuelLiter: string;
  notes: string | null;
  projectName: string;
};

type EquipmentMasterRow = {
  id: string;
  code: string;
  name: string;
  currentHM: string;
  status: string;
};

type DocumentSelection = {
  kind: "po" | "do";
  code: string;
  number: string;
  executiveApproval: string;
} | null;

type PoModalAction = {
  mode: "invoice" | "receipt";
  order: HubPurchaseOrder;
} | null;

function PurchaseOrderRowCard({
  order,
  role,
  isPending,
  onSubmitDraft,
  onReviewPo,
  onApprovePo,
  onMarkPoSent,
  onOpenInvoiceModal,
  onOpenReceiptModal,
  onPreviewDocument,
}: {
  order: HubPurchaseOrder;
  role: TicketPageRole;
  isPending: boolean;
  onSubmitDraft: (publicCode: string) => void;
  onReviewPo: (publicCode: string) => void;
  onApprovePo: (publicCode: string) => void;
  onMarkPoSent: (publicCode: string) => void;
  onOpenInvoiceModal: (order: HubPurchaseOrder) => void;
  onOpenReceiptModal: (order: HubPurchaseOrder) => void;
  onPreviewDocument: (selection: NonNullable<DocumentSelection>) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col items-start space-y-1">
        <p
          className="type-p1 break-words font-semibold text-primary"
          title={`${order.poNumber} · ${order.vendorName}`}
        >
          {order.poNumber} · {order.vendorName}
        </p>
        <p className="type-p3 tabular-nums text-muted-foreground">
          {new Date(order.createdAt).toLocaleDateString("id-ID")}
        </p>

        {order.status === POStatus.PENDING_FINANCE_REVIEW && (
          <Badge variant="lightWarning">Menunggu Keuangan</Badge>
        )}
        {order.status === POStatus.PENDING_APPROVAL && (
          <Badge variant="lightInfo">Menunggu Direktur</Badge>
        )}
        {order.status === POStatus.DRAFT && (
          <Badge variant="gray">Draft PO</Badge>
        )}
        {order.status === POStatus.REJECTED && (
          <Badge variant="lightError">Ditolak</Badge>
        )}
        {order.status === POStatus.CANCELLED && (
          <Badge variant="gray">Dibatalkan</Badge>
        )}

        {order.ticketId && order.paidAt && (
          <Badge variant="lightSuccess">PO Lunas · Siap DO</Badge>
        )}
        {!order.ticketId && order.paidAt && (
          <div className="space-y-1 pt-0.5">
            <Badge variant={order.receivedAt ? "lightSuccess" : "lightWarning"}>
              {order.receivedAt ? "Barang Diterima" : "Menunggu Pengiriman"}
            </Badge>
            <p className="type-p3 text-muted-foreground">
              {order.receivedAt
                ? `Diterima ${new Date(order.receivedAt).toLocaleString("id-ID")}`
                : "PO lunas; konfirmasi setelah barang tiba."}
            </p>
          </div>
        )}
        {order.vendorPoSentAt && (
          <p className="type-p3 text-muted-foreground">
            Dikirim {new Date(order.vendorPoSentAt).toLocaleString("id-ID")}
          </p>
        )}
        {order.status === POStatus.APPROVED &&
          canOperateLogisticsActions(role) &&
          order.vendorPoSentAt &&
          !order.vendorInvoiceUrl &&
          order.paidAt && (
            <p className="type-p3 text-muted-foreground">
              Nota dicatat pada detail tiket terkait.
            </p>
          )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {order.status === POStatus.DRAFT ? (
          <>
            <ActionIconButton
              label={
                canOperateLogisticsActions(role)
                  ? "Lanjutkan Draft"
                  : "Lihat Draft"
              }
              tooltip={
                canOperateLogisticsActions(role)
                  ? "Lanjutkan Draft"
                  : "Lihat Draft"
              }
              icon={FilePenLine}
              href={`/d/${encodeURIComponent(order.publicCode)}`}
            />
            {canOperateLogisticsActions(role) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => onSubmitDraft(order.publicCode)}
              >
                <Send className="size-3.5" aria-hidden="true" />
                Ajukan
              </Button>
            )}
          </>
        ) : order.status !== POStatus.APPROVED ? (
          <>
            <ActionIconButton
              label="Lihat PO"
              tooltip="Lihat PO"
              icon={Eye}
              href={`/d/${encodeURIComponent(order.publicCode)}`}
            />
            {order.status === POStatus.PENDING_FINANCE_REVIEW &&
              (role === UserRole.FINANCE ||
                role === UserRole.ADMINISTRATIONS ||
                role === UserRole.DIRECTOR ||
                role === UserRole.DEPUTY_DIRECTOR) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onReviewPo(order.publicCode)}
                >
                  Verifikasi
                </Button>
              )}
            {order.status === POStatus.PENDING_APPROVAL &&
              (role === UserRole.DIRECTOR ||
                role === UserRole.DEPUTY_DIRECTOR ||
                role === UserRole.ADMINISTRATIONS) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outlinesuccess"
                  disabled={isPending}
                  onClick={() => onApprovePo(order.publicCode)}
                >
                  Setujui
                </Button>
              )}
          </>
        ) : (
          <>
            {canOperateLogisticsActions(role) && (
              <>
                {!order.vendorPoSentAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onMarkPoSent(order.publicCode)}
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    Kirim Vendor
                  </Button>
                ) : order.vendorInvoiceUrl ? (
                  <>
                    <ActionIconButton
                      label="Lihat invoice vendor"
                      tooltip="Lihat Nota"
                      icon={ExternalLink}
                      href={order.vendorInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                    />
                    {order.invoiceId && (
                      <ActionIconButton
                        label="Cetak invoice"
                        tooltip="Cetak Invoice"
                        icon={FileText}
                        href={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(order.invoiceId)}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    )}
                  </>
                ) : !order.paidAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onOpenInvoiceModal(order)}
                  >
                    <Upload className="size-3.5" aria-hidden="true" />
                    Unggah Nota
                  </Button>
                ) : null}

                {!order.ticketId && order.paidAt && !order.receivedAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outlinesuccess"
                    disabled={isPending}
                    onClick={() => onOpenReceiptModal(order)}
                  >
                    <PackageCheck className="size-3.5" aria-hidden="true" />
                    Terima Barang
                  </Button>
                )}
              </>
            )}

            <ActionIconButton
              label="Preview PO Terbit"
              tooltip="Preview PO"
              icon={Eye}
              onClick={() =>
                onPreviewDocument({
                  kind: "po",
                  code: order.publicCode,
                  number: order.poNumber,
                  executiveApproval: "PO disetujui oleh Direksi",
                })
              }
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Disetujui"
                  className="flex size-9 items-center justify-center rounded-md border border-success text-success"
                  role="img"
                  tabIndex={0}
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Disetujui</TooltipContent>
            </Tooltip>
            {!order.vendorPoSentAt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-label="Menunggu dikirim"
                    className="flex size-9 items-center justify-center rounded-md border border-amber-500 text-amber-500"
                    role="img"
                    tabIndex={0}
                  >
                    <Clock3 className="size-4" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Menunggu dikirim</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function DeliveryOrderRowCard({
  order,
  onPreview,
}: {
  order: HubDeliveryOrder;
  onPreview: (selection: NonNullable<DocumentSelection>) => void;
}) {
  return (
    <article className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
      <div>
        <p className="type-p1 font-semibold text-primary">{order.doNumber}</p>
        <p className="type-p3 mt-0.5 text-muted-foreground">
          {new Date(order.createdAt).toLocaleDateString("id-ID")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline">{order.status}</Badge>
        {order.executiveApproved ? (
          <ActionIconButton
            label="Preview Surat Jalan"
            tooltip="Preview DO"
            icon={Eye}
            onClick={() =>
              onPreview({
                kind: "do",
                code: order.publicCode,
                number: order.doNumber,
                executiveApproval:
                  "DO terhubung ke PO/tiket yang disetujui Direksi",
              })
            }
          />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Menunggu Direksi
          </Button>
        )}
      </div>
    </article>
  );
}

function VendorMobileCard({
  vendor,
  onEdit,
}: {
  vendor: LogisticsVendor;
  onEdit: (vendor: LogisticsVendor) => void;
}) {
  const accounts = getVendorBankAccounts(vendor);
  const primaryAccount =
    accounts.find((account) => account.isPrimary) ?? accounts[0];
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="min-w-0 space-y-1">
        <p className="type-p1 font-semibold text-foreground">{vendor.name}</p>
        <p className="type-p3 text-muted-foreground">
          {vendor.category} · {vendor.phone ?? vendor.email ?? "Tanpa kontak"}
        </p>
        <p className="type-p3 font-mono text-muted-foreground">
          {primaryAccount?.bankName ?? "—"} ·{" "}
          {primaryAccount?.bankAccount ?? "—"}
          {accounts.length > 1 && ` (+${accounts.length - 1} rek)`}
        </p>
      </div>
      <ActionIconButton
        type="button"
        label={`Edit vendor ${vendor.name}`}
        tooltip="Edit Vendor"
        icon={Pencil}
        onClick={() => onEdit(vendor)}
      />
    </div>
  );
}

function EquipmentLogMobileCard({ log }: { log: EquipmentLogRow }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-p1 font-semibold text-foreground">
            {log.equipmentName}
          </p>
          <p className="type-p3 text-muted-foreground">
            {new Date(`${log.date}T00:00:00`).toLocaleDateString("id-ID")} ·{" "}
            {log.projectName}
          </p>
        </div>
        <span className="type-p2 shrink-0 font-semibold text-primary">
          {log.effectiveHours} jam
        </span>
      </div>
      <div className="type-p3 flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
        <span>
          HM: {log.hmStart} – {log.hmEnd}
        </span>
        <span className="font-semibold text-foreground">
          BBM: {log.fuelLiter} L
        </span>
      </div>
      <p className="type-p3 text-muted-foreground">
        Operator: {log.operatorName ?? "Tidak dicatat"}
      </p>
    </div>
  );
}

type SignedOperationalDocumentRow = {
  id: string;
  documentNumber: string;
  kind: OperationalDocumentKind;
  title: string;
  signerName: string;
  signedAt: string;
  ticketNumber: string;
  ticketTitle: string;
};

export default function LogisticsHub({
  tickets,
  projects,
  role,
  vendors,
  stockItems,
  stockPurchases,
  purchaseOrderConfirmations,
  documentSignoffTasks,
  signedOperationalDocuments = [],
  purchaseOrders,
  deliveryOrders,
  equipmentLogs,
  equipmentMasters,
  vehicleTripLogs,
  vehicles,
  rentals = [],
  materialContracts = [],
  materialContractOptions = [],
  materialDeliveries = [],
  contractTickets = [],
  vendorInvoices = [],
  initialTab,
  initialOpenSheet,
  today,
  invoiceDate,
}: {
  tickets: TicketRow[];
  projects: TicketProjectOption[];
  role: TicketPageRole;
  vendors: LogisticsVendor[];
  stockItems: LogisticsStockItem[];
  stockPurchases: DirectStockPurchaseRow[];
  purchaseOrderConfirmations: PurchaseOrderConfirmationRow[];
  documentSignoffTasks: DocumentSignoffTask[];
  signedOperationalDocuments?: SignedOperationalDocumentRow[];
  purchaseOrders: HubPurchaseOrder[];
  deliveryOrders: HubDeliveryOrder[];
  equipmentLogs: EquipmentLogRow[];
  equipmentMasters: EquipmentMasterRow[];
  vehicleTripLogs: VehicleTripLogRow[];
  vehicles: VehicleSummary[];
  rentals?: RentalItemRow[];
  materialContracts?: MaterialContractRow[];
  materialContractOptions?: TicketMaterialContractOption[];
  materialDeliveries?: MaterialDeliveryRow[];
  contractTickets?: ContractTicketDeliveryOption[];
  vendorInvoices?: VendorInvoiceRow[];
  initialTab?: string;
  initialOpenSheet?: string;
  today: string;
  invoiceDate: string;
}) {
  const allowedTabs = [
    "tickets",
    "stock",
    "documents",
    "equipment",
    "vehicles",
    "vendors",
    "bulk-contracts",
  ];
  const resolvedTab = allowedTabs.includes(initialTab ?? "")
    ? initialTab!
    : "tickets";
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [selection, setSelection] = useState<DocumentSelection>(null);
  const [activePoAction, setActivePoAction] = useState<PoModalAction>(null);
  const router = useRouter();
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);
  const [equipmentMasterSheetOpen, setEquipmentMasterSheetOpen] =
    useState(false);
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<LogisticsVendor | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  // Equipment log modal controlled fields
  const [eqLogProjectId, setEqLogProjectId] = useState("");
  const [eqLogMasterId, setEqLogMasterId] = useState("__NONE__");
  const [eqLogName, setEqLogName] = useState("");
  const [eqLogOperator, setEqLogOperator] = useState("");
  const [eqLogDate, setEqLogDate] = useState(() => today || getJakartaDateKey());
  const [eqLogHmStart, setEqLogHmStart] = useState("");
  const [eqLogHmEnd, setEqLogHmEnd] = useState("");
  const [eqLogHours, setEqLogHours] = useState("");
  const [eqLogFuel, setEqLogFuel] = useState("");
  const [eqLogNotes, setEqLogNotes] = useState("");

  const projectOptions = useMemo<ComboboxOption[]>(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.kelompokTani} · ${p.title}`,
        keywords: [p.kelompokTani, p.title],
      })),
    [projects],
  );

  const submitDraftPurchaseOrder = (publicCode: string) => {
    startTransition(async () => {
      try {
        const result = await submitPurchaseOrderForFinanceReview(publicCode);
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Purchase order finance submission failed:", error);
        toast.error("Draft PO gagal diajukan. Silakan coba kembali.");
      }
    });
  };

  const handleReviewPO = (publicCode: string) => {
    startTransition(async () => {
      try {
        const result = await reviewPurchaseOrder(publicCode);
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("PO finance review failed:", error);
        toast.error("Pemeriksaan PO gagal. Silakan coba kembali.");
      }
    });
  };

  const handleApprovePO = (publicCode: string) => {
    startTransition(async () => {
      try {
        const result = await approvePurchaseOrder(publicCode);
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("PO approval failed:", error);
        toast.error("Persetujuan PO gagal. Silakan coba kembali.");
      }
    });
  };

  const handleMarkPoSent = (publicCode: string) => {
    startTransition(async () => {
      try {
        const result = await markPurchaseOrderSentToVendor(publicCode);
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Purchase order vendor dispatch failed:", error);
        toast.error("Pengiriman PO gagal dicatat. Silakan coba kembali.");
      }
    });
  };

  const canOperateLogistics = canOperateLogisticsActions(role);

  const handleIssueOperationalDocument = (documentId: string) => {
    startTransition(async () => {
      try {
        const result = await issueOperationalDocument(documentId);
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Operational document issuance failed:", error);
        toast.error("Dokumen gagal diterbitkan. Silakan coba kembali.");
      }
    });
  };

  const submitEquipmentLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eqLogProjectId) {
      toast.error("Pilih proyek terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createEquipmentLog({
          projectId: eqLogProjectId,
          equipmentMasterId: eqLogMasterId === "__NONE__" ? "" : eqLogMasterId,
          equipmentName: eqLogName,
          operatorName: eqLogOperator,
          date: eqLogDate,
          hmStart: Number(eqLogHmStart),
          hmEnd: Number(eqLogHmEnd),
          effectiveHours: Number(eqLogHours),
          fuelLiter: Number(eqLogFuel),
          notes: eqLogNotes,
        });
        if (result.success) {
          toast.success(result.message);
          setEquipmentSheetOpen(false);
          setEqLogName("");
          setEqLogOperator("");
          setEqLogHmStart("");
          setEqLogHmEnd("");
          setEqLogHours("");
          setEqLogFuel("");
          setEqLogNotes("");
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Equipment log action failed:", error);
        toast.error("Log alat gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const submitEquipmentMaster = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createEquipmentMaster({
          name: String(data.get("name") ?? ""),
          brand: String(data.get("brand") ?? ""),
          licensePlate: String(data.get("licensePlate") ?? ""),
          hourlyRate: Number(data.get("hourlyRate")),
          currentHM: Number(data.get("currentHM")),
        });
        if (result.success) {
          toast.success(result.message);
          form.reset();
          setEquipmentMasterSheetOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Equipment master submission failed:", error);
        toast.error("Master alat gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const purchaseTicketsForStock = useMemo(
    () =>
      tickets
        .filter(
          (ticket) =>
            ticket.type === TicketType.MATERIAL &&
            ticket.status === TicketStatus.PROCESSED_LOGISTIC,
        )
        .map(({ id, ticketNumber, title, items, directStockPurchases }) => {
          const activePurchases = (directStockPurchases ?? []).filter(
            (purchase) => purchase.status === "PENDING_RECEIPT",
          );
          const activeStockIds = new Set(
            activePurchases.flatMap((purchase) =>
              (purchase.items ?? [])
                .map((purchaseItem) => purchaseItem.stockItemId)
                .filter((stockId): stockId is string => Boolean(stockId)),
            ),
          );
          const activeNameUnits = new Set(
            activePurchases.flatMap((purchase) =>
              (purchase.items ?? []).map(
                (purchaseItem) =>
                  `${purchaseItem.itemName.trim().toLowerCase()}::${purchaseItem.unit.trim().toLowerCase()}`,
              ),
            ),
          );
          const eligibleItems = items
            .filter((item) => {
              if (
                item.status !== "PENDING" ||
                item.poItemId ||
                item.doItemId
              ) {
                return false;
              }
              if (item.stockItemId && activeStockIds.has(item.stockItemId)) {
                return false;
              }
              const key = `${item.itemName.trim().toLowerCase()}::${item.unit.trim().toLowerCase()}`;
              return !activeNameUnits.has(key);
            })
            .map((item) => ({
              ticketItemId: item.id,
              stockItemId: item.stockItemId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              estimatedCost: item.estimatedCost,
            }));
          return {
            id,
            ticketNumber,
            title,
            items: eligibleItems,
          };
        })
        .filter((ticket) => ticket.items.length > 0),
    [tickets],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="space-y-5"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5 md:grid-cols-4 lg:grid-cols-7">
        <TabsTrigger
          value="tickets"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <TicketCheck className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Tiket Masuk</span>
        </TabsTrigger>
        <TabsTrigger
          value="stock"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <Boxes className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Stok Gudang</span>
        </TabsTrigger>
        <TabsTrigger
          value="documents"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">PO, KO &amp; DO</span>
        </TabsTrigger>
        <TabsTrigger
          value="equipment"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <Fuel className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Sewa &amp; Alat</span>
        </TabsTrigger>
        <TabsTrigger
          value="vehicles"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <Truck className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Armada</span>
        </TabsTrigger>
        <TabsTrigger
          value="vendors"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <Store className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Vendor</span>
        </TabsTrigger>
        <TabsTrigger
          value="bulk-contracts"
          className="type-p3 h-auto justify-start gap-2 rounded-lg px-3 py-2 font-semibold"
        >
          <Layers className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Kontrak Material</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tickets">
        <LogisticsWorkspace
          tickets={tickets}
          projects={projects}
          role={role}
          vendors={vendors}
          vehicles={vehicles}
          stockItems={stockItems}
          materialContracts={materialContractOptions}
          materialDeliveryContracts={materialContracts}
          contractTickets={contractTickets}
          initialOpenSheet={initialOpenSheet}
        />
      </TabsContent>

      <TabsContent value="stock">
        <LogisticsWorkspace
          tickets={[]}
          projects={projects}
          role={role}
          vendors={vendors}
          vehicles={vehicles}
          mode="stock"
          stockItems={stockItems}
          stockPurchases={stockPurchases}
          purchaseTickets={purchaseTicketsForStock}
        />
      </TabsContent>

      <TabsContent value="documents">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="type-h3">Penerbitan PO, KO &amp; DO</CardTitle>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Penerbitan PO, tanda tangan KO &amp; DO, serta pengiriman resmi berada di Logistik.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canOperateLogistics && (
                  <>
                    <Button size="sm" asChild>
                      <Link href="/apps/orders/new?type=po">
                        <Plus className="mr-1.5 size-4" aria-hidden="true" />
                        Terbitkan PO
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/apps/orders/new?type=do">
                        <Truck className="mr-1.5 size-4" aria-hidden="true" />
                        Terbitkan DO
                      </Link>
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link href="/apps/orders">
                    <FileText className="mr-1.5 size-4" aria-hidden="true" />
                    Daftar Order
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>

          <DocumentSignoffQueue
            tasks={documentSignoffTasks}
            title="Tanda Tangan KO & DO"
            description="Logistik menandatangani KO dan DO sebelum pengiriman vendor atau lapangan."
          />

          {canOperateLogistics && signedOperationalDocuments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="type-h3">
                  Dokumen PO &amp; DO Siap Terbit ({signedOperationalDocuments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {signedOperationalDocuments.map((doc) => (
                  <article
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="type-p1 font-semibold text-primary">
                          {doc.documentNumber}
                        </span>
                        <Badge variant="outline">
                          {doc.kind === OperationalDocumentKind.PURCHASE_ORDER
                            ? "PO"
                            : "DO"}
                        </Badge>
                      </div>
                      <p className="type-p3 text-muted-foreground">
                        {doc.ticketNumber} · {doc.title}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        Ditandatangani {doc.signerName} ·{" "}
                        {new Date(doc.signedAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleIssueOperationalDocument(doc.id)}
                    >
                      <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden="true" />
                      Terbitkan
                    </Button>
                  </article>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="type-h3">Purchase Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {purchaseOrders.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Belum Ada PO"
                    description="Purchase Order yang dibuat akan tampil di daftar ini."
                  />
                ) : (
                  purchaseOrders.map((order) => (
                    <PurchaseOrderRowCard
                      key={order.publicCode}
                      order={order}
                      role={role}
                      isPending={isPending}
                      onSubmitDraft={submitDraftPurchaseOrder}
                      onReviewPo={handleReviewPO}
                      onApprovePo={handleApprovePO}
                      onMarkPoSent={handleMarkPoSent}
                      onOpenInvoiceModal={(target) =>
                        setActivePoAction({ mode: "invoice", order: target })
                      }
                      onOpenReceiptModal={(target) =>
                        setActivePoAction({ mode: "receipt", order: target })
                      }
                      onPreviewDocument={setSelection}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="type-h3">Delivery Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deliveryOrders.length === 0 ? (
                  <EmptyState
                    icon={Truck}
                    title="Belum Ada DO"
                    description="Delivery Order yang diterbitkan akan tampil di daftar ini."
                  />
                ) : (
                  deliveryOrders.map((order) => (
                    <DeliveryOrderRowCard
                      key={order.publicCode}
                      order={order}
                      onPreview={setSelection}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {canOperateLogistics && (
              <Card className="xl:col-span-2">
                <CardContent className="pt-6">
                  <PurchaseOrderConfirmationQueue
                    rows={purchaseOrderConfirmations}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="vendors">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="type-h2">Katalog Vendor</CardTitle>
            <Button
              type="button"
              onClick={() => {
                setEditingVendor(null);
                setVendorSheetOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              + Vendor
            </Button>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <EmptyState
                icon={Store}
                title="Belum Ada Vendor"
                description="Tambahkan vendor supplier atau penyedia jasa ke katalog."
              />
            ) : (
              <>
                <div className="space-y-2.5 md:hidden">
                  {vendors.map((vendor) => (
                    <VendorMobileCard
                      key={vendor.id}
                      vendor={vendor}
                      onEdit={(v) => {
                        setEditingVendor(v);
                        setVendorSheetOpen(true);
                      }}
                    />
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table itemLabel="vendor">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>No. Rek</TableHead>
                        <TableHead>Kontak</TableHead>
                        <TableHead className="w-24 text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.map((vendor) => {
                        const accounts = getVendorBankAccounts(vendor);
                        const primaryAccount =
                          accounts.find((account) => account.isPrimary) ??
                          accounts[0];
                        return (
                          <TableRow key={vendor.id}>
                            <TableCell className="type-p2 font-medium">
                              {vendor.name}
                            </TableCell>
                            <TableCell className="type-p2">
                              {vendor.category}
                            </TableCell>
                            <TableCell className="type-p2">
                              {primaryAccount?.bankName ?? "—"}
                              {accounts.length > 1 && (
                                <span className="type-p3 ml-1 text-muted-foreground">
                                  +{accounts.length - 1} rek
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="type-p2 font-mono">
                              {primaryAccount?.bankAccount ?? "—"}
                            </TableCell>
                            <TableCell className="type-p2">
                              {vendor.phone ?? vendor.email ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <ActionIconButton
                                type="button"
                                label={`Edit vendor ${vendor.name}`}
                                tooltip="Edit Vendor"
                                icon={Pencil}
                                onClick={() => {
                                  setEditingVendor(vendor);
                                  setVendorSheetOpen(true);
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vehicles">
        <VehicleFleetPanel
          vehicles={vehicles}
          canManage={canOperateLogistics}
        />
      </TabsContent>

      <TabsContent value="bulk-contracts">
        <MaterialContractsPanel
          role={role}
          contracts={materialContracts}
          deliveries={materialDeliveries}
          contractTickets={contractTickets}
          vendorInvoices={vendorInvoices}
          vendors={vendors.map((v) => ({
            id: v.id,
            name: v.name,
            category: v.category,
          }))}
          projects={projects}
        />
      </TabsContent>

      <TabsContent value="equipment">
        <div className="space-y-6">
          <Tabs defaultValue="rentals" className="space-y-5">
            <div className="flex flex-col items-start justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="type-h2 text-foreground">
                  Operasional &amp; Sewa
                </h2>
                <p className="type-p2 text-muted-foreground">
                  Sewa alat, kendaraan &amp; rumah tukang, log HM alat berat, serta operasional armada.
                </p>
              </div>
              <TabsList className="h-auto flex-wrap gap-1 rounded-lg border bg-muted/70 p-1">
                <TabsTrigger value="rentals" className="gap-1.5 px-3 py-1.5">
                  <Building2 className="size-4" aria-hidden="true" />
                  <span>Sewa Alat &amp; Rumah</span>
                </TabsTrigger>
                <TabsTrigger
                  value="equipment-logs"
                  className="gap-1.5 px-3 py-1.5"
                >
                  <Clock className="size-4" aria-hidden="true" />
                  <span>Log Alat &amp; BBM</span>
                </TabsTrigger>
                <TabsTrigger
                  value="vehicle-operations"
                  className="gap-1.5 px-3 py-1.5"
                >
                  <Truck className="size-4" aria-hidden="true" />
                  <span>Operasional Armada</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="rentals">
              <EquipmentVehicleRentalPanel
                rentals={rentals}
                projects={projects}
                vendors={vendors}
                canManage={
                  role === UserRole.LOGISTICS ||
                  role === UserRole.ADMINISTRATIONS ||
                  role === UserRole.DIRECTOR ||
                  role === UserRole.KOORDINATOR
                }
              />
            </TabsContent>

            <TabsContent value="equipment-logs">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="type-h3">
                    Log Alat Berat &amp; BBM
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={projects.length === 0}
                      onClick={() => {
                        setEqLogProjectId("");
                        setEqLogMasterId("__NONE__");
                        setEquipmentSheetOpen(true);
                      }}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      + Log Alat
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEquipmentMasterSheetOpen(true)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      + Master Alat
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="rounded-xl border border-border p-4">
                    <h3 className="type-h3 text-foreground">
                      Master Alat Terdaftar
                    </h3>
                    {equipmentMasters.length === 0 ? (
                      <p className="type-p2 mt-2 text-muted-foreground">
                        Belum ada master alat.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y">
                        {equipmentMasters.map((equipment) => (
                          <li
                            className="type-p2 flex flex-wrap justify-between gap-2 py-2"
                            key={equipment.id}
                          >
                            <span className="font-medium">
                              {equipment.code} · {equipment.name}
                            </span>
                            <span className="type-p3 text-muted-foreground tabular-nums">
                              HM {equipment.currentHM} · {equipment.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {equipmentLogs.length === 0 ? (
                    <EmptyState
                      icon={Fuel}
                      title="Belum Ada Log Alat Berat"
                      description="Catat jam kerja HM dan penggunaan BBM alat berat di sini."
                    />
                  ) : (
                    <>
                      <div className="space-y-2 md:hidden">
                        {equipmentLogs.map((log) => (
                          <EquipmentLogMobileCard key={log.id} log={log} />
                        ))}
                      </div>

                      <div className="hidden md:block">
                        <Table itemLabel="log alat">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tanggal / Proyek</TableHead>
                              <TableHead>Alat / Operator</TableHead>
                              <TableHead>HM Awal–Akhir</TableHead>
                              <TableHead className="text-right">
                                Jam Efektif
                              </TableHead>
                              <TableHead className="text-right">BBM</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {equipmentLogs.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="whitespace-normal">
                                  <p className="type-p2 font-medium">
                                    {new Date(
                                      `${log.date}T00:00:00`,
                                    ).toLocaleDateString("id-ID")}
                                  </p>
                                  <p className="type-p3 text-muted-foreground">
                                    {log.projectName}
                                  </p>
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  <p className="type-p2 font-medium">
                                    {log.equipmentName}
                                  </p>
                                  <p className="type-p3 text-muted-foreground">
                                    {log.operatorName ?? "Tanpa operator"}
                                  </p>
                                </TableCell>
                                <TableCell className="type-p2 tabular-nums">
                                  {log.hmStart} – {log.hmEnd}
                                </TableCell>
                                <TableCell className="type-p2 text-right tabular-nums">
                                  {log.effectiveHours} jam
                                </TableCell>
                                <TableCell className="type-p2 text-right font-semibold tabular-nums">
                                  {log.fuelLiter} L
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vehicle-operations">
              <VehicleOperationsPanel
                vehicles={vehicles}
                logs={vehicleTripLogs}
                projects={projects}
                deliveryOrders={deliveryOrders}
                canManageVehicles={canOperateLogistics}
              />
            </TabsContent>
          </Tabs>
        </div>
      </TabsContent>

      {/* HOISTED SINGLE PO ACTION CONTROLLERS (ZERO components inside PO rows!) */}
      {activePoAction?.mode === "invoice" && (
        <PurchaseOrderInvoiceUpload
          key={`po-inv:${activePoAction.order.publicCode}`}
          open
          hideTrigger
          onOpenChange={(isOpen) => {
            if (!isOpen) setActivePoAction(null);
          }}
          publicCode={activePoAction.order.publicCode}
          invoiceUrl={activePoAction.order.vendorInvoiceUrl}
          invoiceId={activePoAction.order.invoiceId}
          vendorPoSentAt={activePoAction.order.vendorPoSentAt}
          ticketLinked={Boolean(activePoAction.order.paidAt)}
          items={activePoAction.order.items}
          includeTax={activePoAction.order.includeTax}
          invoiceDate={invoiceDate}
          paymentMethod={activePoAction.order.paymentMethod}
          paymentTerms={activePoAction.order.paymentTerms}
          paymentBankName={activePoAction.order.paymentBankName}
          paymentAccountNumber={activePoAction.order.paymentAccountNumber}
          paymentAccountName={activePoAction.order.paymentAccountName}
        />
      )}

      {activePoAction?.mode === "receipt" && (
        <PurchaseOrderReceiptAction
          key={`po-rec:${activePoAction.order.publicCode}`}
          open
          hideTrigger
          onOpenChange={(isOpen) => {
            if (!isOpen) setActivePoAction(null);
          }}
          publicCode={activePoAction.order.publicCode}
          poNumber={activePoAction.order.poNumber}
        />
      )}

      <VendorFormDialog
        isOpen={vendorSheetOpen}
        onClose={() => {
          setVendorSheetOpen(false);
          setEditingVendor(null);
        }}
        vendor={editingVendor}
        onSaved={() => router.refresh()}
      />

      <GlobalModal
        isOpen={selection !== null}
        onClose={() => setSelection(null)}
        title={selection?.number ?? "Preview Dokumen"}
        description={
          selection
            ? `${selection.executiveApproval} · Dokumen resmi`
            : "Pratinjau dokumen resmi PO/DO."
        }
        className="sm:max-w-3xl"
        footer={
          selection ? (
            <Button type="button" variant="outline" onClick={() => setSelection(null)}>
              Tutup
            </Button>
          ) : undefined
        }
      >
        {selection && (
          <div className="space-y-3">
            <p className="type-p2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200">
              {selection.executiveApproval}. Informasi persetujuan dan QR
              verifikasi ditampilkan pada dokumen.
            </p>
            <iframe
              title={`Pratinjau dokumen ${selection.number}`}
              src={`/api/documents/transactions?kind=${selection.kind.toUpperCase()}&publicCode=${encodeURIComponent(selection.code)}&format=html`}
              className="h-[70vh] w-full rounded-lg border"
            />
          </div>
        )}
      </GlobalModal>

      <GlobalModal
        isOpen={equipmentSheetOpen}
        onClose={() => {
          if (!isPending) setEquipmentSheetOpen(false);
        }}
        title="Catat Log Alat & BBM"
        description="HM master diperbarui otomatis bila master alat dipilih."
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setEquipmentSheetOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="hub-equipment-log-form"
              disabled={isPending || projects.length === 0 || !eqLogProjectId}
            >
              {isPending ? "Menyimpan..." : "Simpan Log"}
            </Button>
          </>
        }
      >
        <form
          id="hub-equipment-log-form"
          className="space-y-4"
          onSubmit={submitEquipmentLog}
        >
          <div className="space-y-1.5">
            <Label htmlFor="hl-project" className="type-p2 font-medium">
              Proyek <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="hl-project"
              options={projectOptions}
              value={eqLogProjectId}
              onValueChange={setEqLogProjectId}
              placeholder="Pilih proyek..."
              searchPlaceholder="Cari nama proyek..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hl-master" className="type-p2 font-medium">
              Master Alat (Opsional)
            </Label>
            <Select
              value={eqLogMasterId}
              onValueChange={(value) => {
                setEqLogMasterId(value);
                if (value !== "__NONE__") {
                  const found = equipmentMasters.find((m) => m.id === value);
                  if (found) {
                    setEqLogName(found.name);
                    setEqLogHmStart(found.currentHM);
                  }
                }
              }}
            >
              <SelectTrigger id="hl-master" className="w-full">
                <SelectValue placeholder="Pilih master alat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__">Catat tanpa master</SelectItem>
                {equipmentMasters.map((equipment) => (
                  <SelectItem value={equipment.id} key={equipment.id}>
                    {equipment.code} · {equipment.name} (HM{" "}
                    {equipment.currentHM})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hl-name" className="type-p2 font-medium">
                Nama Alat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hl-name"
                maxLength={120}
                required
                value={eqLogName}
                onChange={(e) => setEqLogName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hl-operator" className="type-p2 font-medium">
                Operator
              </Label>
              <Input
                id="hl-operator"
                maxLength={120}
                value={eqLogOperator}
                onChange={(e) => setEqLogOperator(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hl-date" className="type-p2 font-medium">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                id="hl-date"
                value={eqLogDate}
                onValueChange={setEqLogDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hl-hm-start" className="type-p2 font-medium">
                HM Awal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hl-hm-start"
                type="number"
                min="0"
                step="0.01"
                required
                value={eqLogHmStart}
                onChange={(e) => setEqLogHmStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hl-hm-end" className="type-p2 font-medium">
                HM Akhir <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hl-hm-end"
                type="number"
                min="0"
                step="0.01"
                required
                value={eqLogHmEnd}
                onChange={(e) => setEqLogHmEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hl-hours" className="type-p2 font-medium">
                Jam Efektif <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hl-hours"
                type="number"
                min="0"
                max="24"
                step="0.01"
                required
                value={eqLogHours}
                onChange={(e) => setEqLogHours(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="hl-fuel" className="type-p2 font-medium">
                BBM (Liter) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hl-fuel"
                type="number"
                min="0"
                step="0.01"
                required
                value={eqLogFuel}
                onChange={(e) => setEqLogFuel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hl-notes" className="type-p2 font-medium">
              Catatan
            </Label>
            <Textarea
              id="hl-notes"
              rows={2}
              maxLength={2000}
              value={eqLogNotes}
              onChange={(e) => setEqLogNotes(e.target.value)}
            />
          </div>
        </form>
      </GlobalModal>

      <GlobalModal
        isOpen={equipmentMasterSheetOpen}
        onClose={() => {
          if (!isPending) setEquipmentMasterSheetOpen(false);
        }}
        title="Daftarkan Master Alat"
        description="Nomor alat dibuat otomatis; HM awal menjadi dasar log berikutnya."
        className="sm:max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setEquipmentMasterSheetOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="hub-equipment-master-form"
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Simpan Master"}
            </Button>
          </>
        }
      >
        <form
          id="hub-equipment-master-form"
          className="space-y-4"
          onSubmit={submitEquipmentMaster}
        >
          <div className="space-y-1.5">
            <Label htmlFor="hm-name" className="type-p2 font-medium">
              Nama Alat <span className="text-destructive">*</span>
            </Label>
            <Input id="hm-name" name="name" maxLength={160} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hm-brand" className="type-p2 font-medium">
                Merek
              </Label>
              <Input id="hm-brand" name="brand" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hm-plate" className="type-p2 font-medium">
                No. Plat / Seri
              </Label>
              <Input id="hm-plate" name="licensePlate" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hm-rate" className="type-p2 font-medium">
                Tarif / Jam <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hm-rate"
                name="hourlyRate"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hm-current" className="type-p2 font-medium">
                HM Awal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hm-current"
                name="currentHM"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue="0"
              />
            </div>
          </div>
        </form>
      </GlobalModal>
    </Tabs>
  );
}
