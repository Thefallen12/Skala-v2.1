"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { reviewPurchaseOrder } from "@/app/actions/orders";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  prepareFinanceProofFile,
} from "@/lib/finance-proof-client";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  completeVehicleFuelRequestReview,
  processVehicleFuelRequest,
} from "@/app/actions/vehicle-fuel";
import {
  paySubkonTermyn,
  releaseSubkonRetention,
  reviewSubkonTermynFinance,
} from "@/app/actions/construction";
import {
  submitPaymentRecord,
} from "@/app/actions/tickets";
import type { TicketActionResult } from "@/app/actions/tickets";
import { submitEquipmentRentalPayment } from "@/app/actions/equipment-requests";
import { EQUIPMENT_REQUEST_TYPE } from "@/lib/equipment-request";
import FinanceDashboard, {
  type FinanceDashboardTransaction,
  type FinanceExpenseCategory,
  type FinanceDashboardMonth,
} from "@/app/components/apps/finance/FinanceDashboard";
import PaymentModal, {
  type PaymentModalTarget,
  type PaymentVendorBankOption,
} from "@/app/components/apps/finance/PaymentModal";
import type { VendorBankAccountOption } from "@/lib/vendor-bank-accounts";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import FinancePaymentProofUpload from "@/app/components/apps/finance/FinancePaymentProofUpload";
import FinancePaymentProofReplacement from "@/app/components/apps/finance/FinancePaymentProofReplacement";
import OfficeExpenseModal from "@/app/components/apps/finance/OfficeExpenseModal";
import EditOfficeExpenseModal from "@/app/components/apps/finance/EditOfficeExpenseModal";
import FinanceLedger, {
  type FinanceCashflowRow,
  type FinanceHistoricalPayment,
} from "@/app/components/apps/finance/FinanceLedger";
import type {
  FinanceAccountOption,
  FinanceProjectOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import DocumentPdfGenerator, {
  type DocumentTemplateOption,
} from "@/app/components/apps/documents/DocumentPdfGenerator";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import VehicleTripLogTable from "@/app/components/apps/logistics/VehicleTripLogTable";
import RentalBillingQueue from "@/app/components/apps/finance/RentalBillingQueue";
import VendorContractBillingPanel from "@/app/components/apps/finance/VendorContractBillingPanel";
import type { RentalItemRow } from "@/app/actions/rentals";
import type {
  MaterialContractRow,
  VendorInvoiceRow,
} from "@/lib/material-contracts";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TablePaginationControls,
} from "@/components/ui/table";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import {
  GlobalModal,
} from "@/components/ui/global-modal";
import DocumentSignoffQueue, {
  type DocumentSignoffTask,
} from "@/app/components/apps/documents/DocumentSignoffQueue";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  photoDownloadHref,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import {
  formatRupiahNumber,
  parseRupiahInput,
  terbilangRupiah,
} from "@/lib/indonesian-currency";
import {
  POPaymentMethod,
  PaymentType,
  TicketRequestCategory,
  TicketType,
  UserRole,
} from "@prisma/client";
import {
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Fuel,
  History,
  Plus,
  Pencil,
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";

const CASH_DIRECT_PURCHASE_DESTINATION = "Pembayaran tunai pembelian langsung";

function formatVendorTransferDestination(details: {
  bankName: string | null | undefined;
  accountNumber: string | null | undefined;
  accountName: string | null | undefined;
  fallbackOwner?: string | null;
}): string {
  const bankName = details.bankName?.trim();
  const accountNumber = details.accountNumber?.trim();
  if (!bankName || !accountNumber) return "";
  const holder = details.accountName?.trim() || details.fallbackOwner?.trim();
  return holder
    ? `Ditransfer ke: ${bankName}, ${accountNumber}, a.n. ${holder}`
    : `Ditransfer ke: ${bankName}, ${accountNumber}`;
}

function toPaymentVendorBankOptions(
  accounts: VendorBankAccountOption[] | undefined,
  fallbackOwner?: string | null,
): PaymentVendorBankOption[] {
  return (accounts ?? []).flatMap((account) => {
    const destination = formatVendorTransferDestination({
      bankName: account.bankName,
      accountNumber: account.bankAccount,
      accountName: account.bankHolder,
      fallbackOwner,
    });
    if (!destination) return [];
    return [
      {
        id: account.id,
        label: `${account.label ? `${account.label} · ` : ""}${account.bankName} · ${account.bankAccount}${account.bankHolder ? ` (a.n. ${account.bankHolder})` : ""}`,
        destination,
        isPrimary: account.isPrimary,
      },
    ];
  });
}

type FinanceOrder = {
  id: string;
  publicCode: string;
  poNumber: string;
  vendorName: string;
  vendorAddress: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  createdAt: string;
  paidAt?: string | null;
  paymentReceiptUrl?: string | null;
  vendorInvoiceUrl: string | null;
  invoiceGrandTotal?: number | null;
  paymentMethod: "CASH" | "TRANSFER";
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  vendorBankAccounts?: VendorBankAccountOption[];
  paymentTerms: string | null;
  includeTax: boolean;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }[];
  paymentTransactions?: PaymentTransaction[];
};

type PaymentTransaction = {
  id: string;
  paymentType: PaymentType;
  amount: number;
  transferDestination: string;
  status: string;
  proofOfTransferUrl: string | null;
  additionalProofUrls: string[];
  proofEditDisabledUrls: string[];
  paidAt: string | null;
};

type FinanceTicket = {
  id: string;
  ticketType?: string | null;
  ticketNumber: string;
  title: string;
  type: TicketType;
  hasApprovedPo?: boolean;
  poNumber?: string | null;
  totalAmount: string | null;
  purchaseReceiptUrl: string | null;
  receiptUrls: string[];
  requesterName: string;
  recipientName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  transferDestination: string | null;
  requestCategory: TicketRequestCategory | null;
  requestPaymentMethod: POPaymentMethod | null;
  requestPaymentDescription: string | null;
  vendorBankName: string | null;
  vendorAccountNumber: string | null;
  vendorAccountName: string | null;
  vendorBankAccounts?: VendorBankAccountOption[];
  projectName: string | null;
  paymentTransactions: PaymentTransaction[];
};

type FinanceDirectPurchase = {
  id: string;
  purchaseNumber: string;
  vendorName: string;
  paymentMethod: POPaymentMethod;
  totalAmount: string;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  vendorBankAccounts?: VendorBankAccountOption[];
  vendorInvoiceUrl: string | null;
  createdAt: string;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }[];
  paymentTransactions: PaymentTransaction[];
};

type FinanceHistoryTransaction = {
  id: string;
  reference: string;
  title: string;
  targetKind: FinancePaymentRow["kind"];
  targetId: string;
  paymentType: PaymentType;
  amount: number;
  transferDestination: string;
  proofOfTransferUrl: string | null;
  additionalProofUrls: string[];
  proofEditDisabledUrls: string[];
  paidAt: string | null;
};

type FinanceTermyn = {
  id: string;
  contractNumber: string;
  subkonName: string;
  projectName: string;
  termynNumber: number;
  claimedPercent: string;
  grossAmount: string;
  retentionAmount: string;
  netAmount: string;
  status: string;
};

type FinanceOfficeExpense = {
  id: string;
  expenseType: string;
  description: string;
  amount: number;
  paymentMethod: string;
  proofUrls: string[];
  createdAt: string;
  recipientName: string;
  recipientRole: UserRole;
  account: { accountName: string };
};

type FinanceFundUsageSummary = {
  userId: string;
  name: string;
  role: UserRole;
  totalAmount: number;
  categories: { type: string; amount: number; count: number }[];
};

type RetentionContract = {
  id: string;
  contractNumber: string;
  subkonName: string;
  projectName: string;
  retainedAmount: string;
  eligible: boolean;
};

type Selection =
  | { kind: "po"; id: string }
  | { kind: "standalone-po"; id: string }
  | { kind: "direct-purchase"; id: string }
  | { kind: "ticket"; id: string }
  | null;

type FinancePaymentRow = PaymentModalTarget & {
  kind: "ticket" | "standalone-po" | "direct-purchase";
};

const internalFundingCategories = [
  TicketRequestCategory.REIMBURSEMENT,
  TicketRequestCategory.KASBON,
  TicketRequestCategory.OPERATING_EXPENSE,
] as const;

const currency = (amount: number | string | null) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

const expenseTypeLabels: Record<string, string> = {
  SALARY: "Gaji",
  ADVANCE: "Kasbon / Ambilan",
  REIMBURSEMENT: "Reimbursement",
};

function FinanceAccountField({
  id,
  accounts,
  disabled,
  required = true,
}: {
  id: string;
  accounts: FinanceAccountOption[];
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Dibayar Dari (Buku Bank/Kas)</Label>
      <select
        id={id}
        name="financeAccountId"
        required={required}
        defaultValue=""
        disabled={disabled || accounts.length === 0}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
      >
        <option value="" disabled>
          Pilih akun sumber pembayaran
        </option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.accountName} · {currency(account.balance)}
          </option>
        ))}
      </select>
      {accounts.length === 0 && (
        <p className="text-sm text-destructive" role="alert">
          Buat buku bank/kas terlebih dahulu di tab Buku Kas &amp; Arus Dana.
        </p>
      )}
    </div>
  );
}

const PAYMENT_HISTORY_PAGE_SIZE = 10;

const paymentReceiptHref = withLocalPhotoPreview;

const isImageReceipt = (url: string) =>
  /\.(?:jpe?g|png|webp)$/i.test(url.split(/[?#]/, 1)[0]);

const isPdfReceipt = (url: string) =>
  /\.pdf$/i.test(url.split(/[?#]/, 1)[0]);

export default function FinanceHub({
  purchaseOrders,
  documentSignoffTasks,
  standalonePayments,
  directPurchases,
  tickets,
  termyns,
  retentionContracts,
  vehicleTripLogs,
  vehicleFuelRequests,
  documentTemplates,
  role,
  initialTab,
  initialOpenSheet,
  dashboardMonths,
  financeAccounts,
  officeExpenses,
  fundUsageSummary,
  officeExpenseRecipients,
  cashflows,
  historicalPayments,
  financeProjects,
  dashboardTransactions,
  expenseCategories,
  monthInflow,
  monthOutflow,
  financeSignerName,
  financeQrDataUrl,
  coordinatorSignerName,
  directorSignerName,
  rentals = [],
  materialContracts = [],
  vendorInvoices = [],
}: {
  purchaseOrders: FinanceOrder[];
  documentSignoffTasks: DocumentSignoffTask[];
  standalonePayments: FinanceOrder[];
  directPurchases: FinanceDirectPurchase[];
  tickets: FinanceTicket[];
  termyns: FinanceTermyn[];
  retentionContracts: RetentionContract[];
  vehicleTripLogs: VehicleTripLogRow[];
  vehicleFuelRequests: VehicleFuelRequestView[];
  documentTemplates: DocumentTemplateOption[];
  role: UserRole;
  initialTab?: string;
  initialOpenSheet?: string;
  dashboardMonths: FinanceDashboardMonth[];
  financeAccounts: FinanceAccountOption[];
  officeExpenses: FinanceOfficeExpense[];
  fundUsageSummary: FinanceFundUsageSummary[];
  officeExpenseRecipients: { id: string; name: string; role: UserRole }[];
  cashflows: FinanceCashflowRow[];
  historicalPayments: FinanceHistoricalPayment[];
  financeProjects: FinanceProjectOption[];
  dashboardTransactions: FinanceDashboardTransaction[];
  expenseCategories: FinanceExpenseCategory[];
  monthInflow: number;
  monthOutflow: number;
  financeSignerName?: string;
  financeQrDataUrl?: string | null;
  coordinatorSignerName?: string;
  directorSignerName?: string;
  rentals?: RentalItemRow[];
  materialContracts?: MaterialContractRow[];
  vendorInvoices?: VendorInvoiceRow[];
}) {
  const router = useRouter();
  const legacyOperationalTabs = ["subcontract", "rentals", "fuel-logs", "fuel-requests"];
  const tabAliases: Record<string, string> = {
    "po-check": "check",
    payments: "payment",
    check: "check",
    payment: "payment",
    "vendor-contracts": "vendor-contracts",
    history: "history",
    operations: "operations",
    ledger: "ledger",
    "office-expense": "office-expense",
  };
  const resolvedTab = legacyOperationalTabs.includes(initialTab ?? "")
    ? "operations"
    : tabAliases[initialTab ?? ""] ??
      (purchaseOrders.length > 0 ? "check" : "ledger");
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [ledgerFundMode, setLedgerFundMode] = useState<
    "incoming" | "outgoing" | "transfer" | null
  >(null);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"IN" | "OUT" | null>(
    null,
  );
  const [officeExpenseOpen, setOfficeExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinanceOfficeExpense | null>(null);
  const canManageOfficeExpenses =
    role === UserRole.FINANCE ||
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR;
  useEffect(() => {
    const targetId =
      activeTab === "ledger"
        ? "finance-ledger-tab"
        : activeTab === "payment"
          ? "finance-payment-tab"
          : activeTab === "history"
            ? "finance-history-tab"
            : null;
    if (!targetId) return;

    const scrollTimer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }, 50);

    return () => window.clearTimeout(scrollTimer);
  }, [activeTab, navigationRequest]);
  const [operationsTab, setOperationsTab] = useState(
    legacyOperationalTabs.includes(initialTab ?? "")
      ? initialTab!
      : "subcontract",
  );
  const [paymentModalSelection, setPaymentModalSelection] = useState<{
    kind: FinancePaymentRow["kind"];
    id: string;
  } | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [unavailableProofUrls, setUnavailableProofUrls] = useState<string[]>([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [paymentQueueSearch, setPaymentQueueSearch] = useState("");
  const [paymentHistorySearch, setPaymentHistorySearch] = useState("");
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1);
  const [selection, setSelection] = useState<Selection>(() => {
    if (!initialOpenSheet) return null;
    if (purchaseOrders.some((order) => order.publicCode === initialOpenSheet)) {
      return { kind: "po", id: initialOpenSheet };
    }
    if (
      standalonePayments.some((order) => order.publicCode === initialOpenSheet)
    ) {
      return { kind: "standalone-po", id: initialOpenSheet };
    }
    if (directPurchases.some((purchase) => purchase.id === initialOpenSheet)) {
      return { kind: "direct-purchase", id: initialOpenSheet };
    }
    if (tickets.some((ticket) => ticket.id === initialOpenSheet)) {
      return { kind: "ticket", id: initialOpenSheet };
    }
    return null;
  });
  const [message, setMessage] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<File[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>(
    PaymentType.FULL_PAYMENT,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [termynReceipts, setTermynReceipts] = useState<Record<string, File>>({});
  const [retentionReceipts, setRetentionReceipts] = useState<Record<string, File>>({});
  const [fuelTransferProofs, setFuelTransferProofs] = useState<Record<string, File>>({});
  const [fuelDisbursementMethods, setFuelDisbursementMethods] = useState<
    Record<string, POPaymentMethod>
  >({});
  const [directPurchasePaymentMethods, setDirectPurchasePaymentMethods] =
    useState<Record<string, POPaymentMethod>>({});
  const [directPurchaseDestinations, setDirectPurchaseDestinations] = useState<
    Record<string, string>
  >({});
  const [isPending, startTransition] = useTransition();
  const activeOrder =
    selection?.kind === "po"
      ? purchaseOrders.find((order) => order.publicCode === selection.id)
      : undefined;
  const activeStandaloneOrder =
    selection?.kind === "standalone-po"
      ? standalonePayments.find((order) => order.publicCode === selection.id)
      : undefined;
  const activeDirectPurchase =
    selection?.kind === "direct-purchase"
      ? directPurchases.find((purchase) => purchase.id === selection.id)
      : undefined;
  const activeTicket =
    selection?.kind === "ticket"
      ? tickets.find((ticket) => ticket.id === selection.id)
      : undefined;
  const previewOrder = activeOrder ?? activeStandaloneOrder;
  const paymentHistory =
    activeTicket?.paymentTransactions ??
    activeDirectPurchase?.paymentTransactions ??
    previewOrder?.paymentTransactions ??
    [];
  const paymentTotal = activeTicket
    ? Number(activeTicket.totalAmount ?? 0)
    : activeDirectPurchase
      ? Number(activeDirectPurchase.totalAmount)
      : Math.round(
          (previewOrder?.invoiceGrandTotal ??
            (previewOrder?.items ?? []).reduce(
              (sum, item) => sum + item.totalPrice,
              0,
            ) * (previewOrder?.includeTax ? 1.11 : 1)) *
            100,
        ) / 100;
  const paidAmount = paymentHistory.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const isFirstPayment = paymentHistory.length === 0;
  const currentPaymentType =
    !isFirstPayment && paymentType === PaymentType.DOWN_PAYMENT
      ? PaymentType.FULL_PAYMENT
      : paymentType;
  const remainingAmount = Math.max(
    0,
    Math.round((paymentTotal - paidAmount) * 100) / 100,
  );
  const remainingBalance =
    Math.round((paymentTotal - paidAmount) * 100) / 100;
  const isPaymentSettled = remainingBalance <= 0;
  const paymentStatusLabel = isPaymentSettled
    ? "LUNAS"
    : paidAmount > 0
      ? "DIBAYAR SEBAGIAN"
      : "BELUM DIBAYAR";
  const paymentRows: FinancePaymentRow[] = [
    ...tickets.map((ticket) => {
      const grandTotal = Number(ticket.totalAmount ?? 0);
      const paidTicketAmount = ticket.paymentTransactions.reduce(
        (total, payment) => total + payment.amount,
        0,
      );
      const needsInvoice =
        (ticket.type === TicketType.MATERIAL || Boolean(ticket.hasApprovedPo)) &&
        !ticket.purchaseReceiptUrl;
      const ticketVendorAccounts = toPaymentVendorBankOptions(
        ticket.vendorBankAccounts,
        ticket.vendorAccountName ?? ticket.recipientName ?? ticket.requesterName,
      );
      const ticketVendorBankDestination =
        formatVendorTransferDestination({
          bankName: ticket.vendorBankName,
          accountNumber: ticket.vendorAccountNumber,
          accountName: ticket.vendorAccountName,
        }) ||
        ticketVendorAccounts[0]?.destination ||
        "";
      return {
        id: ticket.id,
        kind: "ticket" as const,
        reference: ticket.poNumber
          ? `${ticket.ticketNumber} (${ticket.poNumber})`
          : ticket.ticketNumber,
        title: ticket.title,
        grandTotal,
        paidAmount: paidTicketAmount,
        isFirstPayment: ticket.paymentTransactions.length === 0,
        transferDestination:
          ticket.transferDestination ?? ticketVendorBankDestination,
        vendorBankDestination: ticketVendorBankDestination,
        vendorBankAccounts: ticketVendorAccounts,
        isInternalFunding: internalFundingCategories.some(
          (category) => category === ticket.requestCategory,
        ),
        requesterName: ticket.requesterName,
        receiptUrls: ticket.receiptUrls,
        hasInvoice: !needsInvoice,
        needsNominalInput:
          !(Number.isFinite(grandTotal) && grandTotal > 0) &&
          paidTicketAmount === 0,
      };
    }),
    ...standalonePayments.map((order) => {
      const orderVendorAccounts = toPaymentVendorBankOptions(
        order.vendorBankAccounts,
        order.vendorName,
      );
      const orderVendorBankDestination =
        formatVendorTransferDestination({
          bankName: order.paymentBankName,
          accountNumber: order.paymentAccountNumber,
          accountName: order.paymentAccountName,
          fallbackOwner: order.vendorName,
        }) ||
        orderVendorAccounts[0]?.destination ||
        "";
      return {
        id: order.publicCode,
        kind: "standalone-po" as const,
        reference: order.poNumber,
        title: `Pembelian PO · ${order.vendorName}`,
        grandTotal:
          order.invoiceGrandTotal ??
          Math.round(
            order.items.reduce((total, item) => total + item.totalPrice, 0) *
              (order.includeTax ? 1.11 : 1) *
              100,
          ) / 100,
        paidAmount: (order.paymentTransactions ?? []).reduce(
          (total, payment) => total + payment.amount,
          0,
        ),
        isFirstPayment: (order.paymentTransactions ?? []).length === 0,
        transferDestination: orderVendorBankDestination,
        vendorBankDestination: orderVendorBankDestination,
        vendorBankAccounts: orderVendorAccounts,
        hasInvoice: Boolean(order.vendorInvoiceUrl),
        needsNominalInput: false,
      };
    }),
    ...directPurchases.map((purchase) => {
      const purchaseVendorAccounts = toPaymentVendorBankOptions(
        purchase.vendorBankAccounts,
        purchase.vendorName,
      );
      const purchaseVendorBankDestination =
        formatVendorTransferDestination({
          bankName: purchase.paymentBankName,
          accountNumber: purchase.paymentAccountNumber,
          accountName: purchase.paymentAccountName,
          fallbackOwner: purchase.vendorName,
        }) ||
        purchaseVendorAccounts[0]?.destination ||
        "";
      return {
        id: purchase.id,
        kind: "direct-purchase" as const,
        reference: purchase.purchaseNumber,
        title: `Pembelian Langsung · ${purchase.vendorName}`,
        grandTotal: Number(purchase.totalAmount),
        paidAmount: purchase.paymentTransactions.reduce(
          (total, payment) => total + payment.amount,
          0,
        ),
        isFirstPayment: purchase.paymentTransactions.length === 0,
        defaultPaymentMethod: purchase.paymentMethod,
        allowPaymentMethodSelection: true,
        transferDestination:
          purchase.paymentMethod === POPaymentMethod.TRANSFER
            ? purchaseVendorBankDestination
            : "",
        vendorBankDestination: purchaseVendorBankDestination,
        vendorBankAccounts: purchaseVendorAccounts,
        hasInvoice: Boolean(purchase.vendorInvoiceUrl),
        needsNominalInput: false,
      };
    }),
  ].filter(
    (row) =>
      (Number.isFinite(row.grandTotal) && row.grandTotal > 0) ||
      Boolean(row.needsNominalInput),
  );
  const pendingPaymentRows = paymentRows.filter(
    (row) =>
      Boolean(row.needsNominalInput) ||
      row.grandTotal - row.paidAmount > 0.005,
  );
  const pendingPaymentCount = pendingPaymentRows.length;
  const normalizedReviewSearch = reviewSearch.trim().toLocaleLowerCase("id-ID");
  const filteredReviewOrders = normalizedReviewSearch
    ? purchaseOrders.filter((order) =>
        [
          order.poNumber,
          order.vendorName,
          new Date(order.createdAt).toLocaleDateString("id-ID"),
          String(order.items.length),
        ].some((value) =>
          value.toLocaleLowerCase("id-ID").includes(normalizedReviewSearch),
        ),
      )
    : purchaseOrders;
  const normalizedPaymentQueueSearch = paymentQueueSearch
    .trim()
    .toLocaleLowerCase("id-ID");
  const filteredPendingPaymentRows = normalizedPaymentQueueSearch
    ? pendingPaymentRows.filter((row) =>
        [
          row.reference,
          row.title,
          String(row.grandTotal),
          currency(row.grandTotal),
          String(row.paidAmount),
          currency(row.paidAmount),
          String(Math.max(0, row.grandTotal - row.paidAmount)),
          currency(Math.max(0, row.grandTotal - row.paidAmount)),
          row.transferDestination,
        ].some((value) =>
          value.toLocaleLowerCase("id-ID").includes(normalizedPaymentQueueSearch),
        ),
      )
    : pendingPaymentRows;
  const paymentHistoryRows: FinanceHistoryTransaction[] = [
    ...standalonePayments.flatMap((order) =>
      (order.paymentTransactions ?? []).map((payment) => ({
        ...payment,
        reference: order.poNumber,
        title: `PO · ${order.vendorName}`,
        targetKind: "standalone-po" as const,
        targetId: order.publicCode,
      })),
    ),
    ...directPurchases.flatMap((purchase) =>
      purchase.paymentTransactions.map((payment) => ({
        ...payment,
        reference: purchase.purchaseNumber,
        title: `Pembelian langsung · ${purchase.vendorName}`,
        targetKind: "direct-purchase" as const,
        targetId: purchase.id,
      })),
    ),
    ...tickets.flatMap((ticket) =>
      ticket.paymentTransactions.map((payment) => ({
        ...payment,
        reference: ticket.ticketNumber,
        title: ticket.title,
        targetKind: "ticket" as const,
        targetId: ticket.id,
      })),
    ),
  ].sort(
    (a, b) =>
      (b.paidAt ? new Date(b.paidAt).getTime() : 0) -
      (a.paidAt ? new Date(a.paidAt).getTime() : 0),
  );
  const normalizedPaymentHistorySearch = paymentHistorySearch
    .trim()
    .toLocaleLowerCase("id-ID");
  const filteredPaymentHistoryRows = normalizedPaymentHistorySearch
    ? paymentHistoryRows.filter((payment) => {
        const paymentTypeLabel =
          payment.paymentType === PaymentType.DOWN_PAYMENT
            ? "DP"
            : payment.paymentType === PaymentType.PROGRESS_PAYMENT
              ? "Termin"
              : "Pelunasan";
        const searchableValues = [
          payment.paidAt
            ? new Date(payment.paidAt).toLocaleString("id-ID")
            : "",
          payment.reference,
          payment.title,
          paymentTypeLabel,
          String(payment.amount),
          currency(payment.amount),
          payment.transferDestination,
        ];
        return searchableValues.some((value) =>
          value.toLocaleLowerCase("id-ID").includes(normalizedPaymentHistorySearch),
        );
      })
    : paymentHistoryRows;
  const paymentHistoryPageCount = Math.max(
    1,
    Math.ceil(filteredPaymentHistoryRows.length / PAYMENT_HISTORY_PAGE_SIZE),
  );
  const currentPaymentHistoryPage = Math.min(
    paymentHistoryPage,
    paymentHistoryPageCount,
  );
  const paymentHistoryPageRows = filteredPaymentHistoryRows.slice(
    (currentPaymentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE,
    currentPaymentHistoryPage * PAYMENT_HISTORY_PAGE_SIZE,
  );
  const selectedPaymentRow = paymentModalSelection
    ? paymentRows.find(
        (row) =>
          row.kind === paymentModalSelection.kind &&
          row.id === paymentModalSelection.id,
      ) ?? null
    : null;

  const openPaymentHistory = (row: FinancePaymentRow) => {
    setSelection(
      row.kind === "ticket"
        ? { kind: "ticket", id: row.id }
        : row.kind === "standalone-po"
          ? { kind: "standalone-po", id: row.id }
          : { kind: "direct-purchase", id: row.id },
    );
  };

  const runReview = (publicCode: string) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await reviewPurchaseOrder(publicCode);
        setMessage(result.message);
        if (result.success) {
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Finance PO review failed:", error);
        setMessage("Pemeriksaan PO gagal. Silakan coba kembali.");
      }
    });
  };

  const submitFuelRequestDecision = (
    event: FormEvent<HTMLFormElement>,
    requestId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const approve =
      submitter instanceof HTMLButtonElement &&
      submitter.value === "approve";
    const disbursementMethod =
      data.get("disbursementMethod") === POPaymentMethod.TRANSFER
        ? POPaymentMethod.TRANSFER
        : POPaymentMethod.CASH;
    const rawFormProof = data.get("transferProof");
    const transferProof =
      fuelTransferProofs[requestId] ??
      (rawFormProof instanceof File && rawFormProof.size > 0
        ? rawFormProof
        : undefined);
    const financeAccountId = String(data.get("financeAccountId") ?? "");
    const input = {
      disbursementMethod,
      transferDestination: String(data.get("transferDestination") ?? ""),
      financeAccountId,
      financeNote: String(data.get("financeNote") ?? ""),
      ...(transferProof ? { transferProof } : {}),
    };
    if (
      approve &&
      !financeAccountId
    ) {
      setMessage("Pilih buku kas/bank sumber dana BBM terlebih dahulu.");
      return;
    }
    if (
      approve &&
      disbursementMethod === POPaymentMethod.TRANSFER &&
      !input.transferProof
    ) {
      setMessage("Bukti transfer wajib diunggah sebelum pencairan dicatat.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await processVehicleFuelRequest(
          requestId,
          approve,
          approve ? input : { financeNote: input.financeNote },
        );
        setMessage(result.message);
        if (result.success) {
          setFuelTransferProofs((current) => {
            const next = { ...current };
            delete next[requestId];
            return next;
          });
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Finance fuel request decision failed:", error);
        setMessage("Request BBM gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const submitFuelReconciliation = (
    event: FormEvent<HTMLFormElement>,
    requestId: string,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const financeNote = String(formData.get("reconciliationNote") ?? "");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await completeVehicleFuelRequestReview(
          requestId,
          financeNote,
        );
        setMessage(result.message);
        if (result.success) {
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Finance fuel reconciliation failed:", error);
        setMessage("Rekonsiliasi BBM gagal ditutup. Silakan coba kembali.");
      }
    });
  };

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      (!activeTicket && !activeStandaloneOrder && !activeDirectPurchase) ||
      receiptUrl.length === 0
    ) {
      setMessage("Pilih PO/tiket dan unggah bukti pembayaran terlebih dahulu.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const transferDestination = String(
      formData.get("transferDestination") ?? "",
    );
    const financeAccountId = String(
      formData.get("financeAccountId") ?? "",
    );
    const rawPaymentMethod = formData.get("paymentMethod");
    const directPaymentMethod =
      rawPaymentMethod === POPaymentMethod.CASH ||
      rawPaymentMethod === POPaymentMethod.TRANSFER
        ? rawPaymentMethod
        : undefined;
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pembayaran terlebih dahulu.");
      return;
    }
    const amount =
      currentPaymentType === PaymentType.FULL_PAYMENT && paymentTotal > 0
        ? undefined
        : parseRupiahInput(paymentAmount);
    setMessage("");
    startTransition(async () => {
      try {
        const target = activeTicket
          ? { kind: "ticket" as const, id: activeTicket.id }
          : activeStandaloneOrder
            ? {
                kind: "purchase-order" as const,
                id: activeStandaloneOrder.publicCode,
              }
            : activeDirectPurchase
              ? { kind: "direct-purchase" as const, id: activeDirectPurchase.id }
              : null;
        if (!target) return;
        const result: TicketActionResult =
          activeTicket?.ticketType === EQUIPMENT_REQUEST_TYPE
            ? await submitEquipmentRentalPayment({
                ticketId: activeTicket.id,
                proof: receiptUrl,
                transferDestination,
                financeAccountId,
                paymentType: currentPaymentType,
                amount,
              })
            : await submitPaymentRecord({
                target,
                files: receiptUrl,
                transferDestination,
                financeAccountId,
                paymentType: currentPaymentType,
                amount,
                ...(directPaymentMethod
                  ? { paymentMethod: directPaymentMethod }
                  : {}),
              });
        setMessage(result.message);
        if (result.success) {
          setReceiptUrl([]);
          setPaymentAmount("");
          setPaymentType(PaymentType.FULL_PAYMENT);
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Finance ticket payment failed:", error);
        setMessage("Pembayaran gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const submitModalPayment = async (
    proof: string | File,
    transferDestination: string,
    type: PaymentType,
    amount: number,
    financeAccountId: string,
    paymentMethod?: POPaymentMethod,
  ): Promise<TicketActionResult> => {
    if (!selectedPaymentRow) {
      return { success: false, message: "Tagihan tidak ditemukan." };
    }
    if (selectedPaymentRow.kind === "ticket") {
      const equipmentTicket = tickets.find(
        (ticket) => ticket.id === selectedPaymentRow.id,
      );
      if (equipmentTicket?.ticketType === EQUIPMENT_REQUEST_TYPE) {
        return submitEquipmentRentalPayment({
          ticketId: equipmentTicket.id,
          proof,
          transferDestination:
            paymentMethod === POPaymentMethod.CASH
              ? "Tunai"
              : transferDestination,
          financeAccountId,
          paymentType: type,
          amount,
        });
      }
    }
    const target =
      selectedPaymentRow.kind === "ticket"
        ? { kind: "ticket" as const, id: selectedPaymentRow.id }
        : selectedPaymentRow.kind === "standalone-po"
          ? { kind: "purchase-order" as const, id: selectedPaymentRow.id }
          : { kind: "direct-purchase" as const, id: selectedPaymentRow.id };
    return submitPaymentRecord({
      target,
      ...(typeof proof === "string"
        ? { proofOfTransferUrl: proof }
        : { file: proof }),
      transferDestination:
        paymentMethod === POPaymentMethod.CASH
          ? "Tunai"
          : transferDestination,
      financeAccountId,
      paymentType: type,
      amount,
      ...(paymentMethod ? { paymentMethod } : {}),
    });
  };

  const handleSingleOperationalProofChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    key: string,
    setter: React.Dispatch<React.SetStateAction<Record<string, File>>>,
  ) => {
    const input = event.currentTarget;
    const rawFile = input.files?.[0];
    if (!rawFile) {
      setter((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    try {
      const prepared = await prepareFinanceProofFile(rawFile);
      setter((current) => ({ ...current, [key]: prepared }));
      setMessage("");
    } catch (error) {
      input.value = "";
      setter((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMessage(
        error instanceof Error ? error.message : "File bukti tidak valid.",
      );
    }
  };

  const submitTermynPayment = (
    event: FormEvent<HTMLFormElement>,
    termynId: string,
  ) => {
    event.preventDefault();
    const file = termynReceipts[termynId];
    if (!file) {
      setMessage("Pilih bukti transfer termin terlebih dahulu.");
      return;
    }
    const financeAccountId = String(
      new FormData(event.currentTarget).get("financeAccountId") ?? "",
    );
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pembayaran termin terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await paySubkonTermyn(
          termynId,
          file,
          financeAccountId,
        );
        setMessage(result.message);
        if (result.success) {
          setTermynReceipts((current) => {
            const next = { ...current };
            delete next[termynId];
            return next;
          });
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Subcontract termyn payment failed:", error);
        setMessage("Pembayaran termin gagal. Silakan coba kembali.");
      }
    });
  };

  const submitRetentionRelease = (
    event: FormEvent<HTMLFormElement>,
    contractId: string,
  ) => {
    event.preventDefault();
    const file = retentionReceipts[contractId];
    if (!file) {
      setMessage("Pilih bukti transfer retensi terlebih dahulu.");
      return;
    }
    const financeAccountId = String(
      new FormData(event.currentTarget).get("financeAccountId") ?? "",
    );
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pencairan retensi terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await releaseSubkonRetention(
          contractId,
          file,
          financeAccountId,
        );
        setMessage(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Subcontract retention release failed:", error);
        setMessage("Pencairan retensi gagal. Silakan coba kembali.");
      }
    });
  };

  const renderSinglePaymentProof = (
    paymentTransactionId: string,
    url: string | null,
    label: string,
    proofIndex: number,
    canEdit: boolean,
  ) => {
    if (!url) {
      return <span className="text-muted-foreground">Tidak ada bukti</span>;
    }

    if (isImageReceipt(url)) {
      if (unavailableProofUrls.includes(url)) {
        return (
          <div className="flex flex-col items-start gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground"
              role="status"
            >
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              Foto bukti tidak dapat dimuat
            </span>
            {canEdit && (
              <FinancePaymentProofReplacement
                paymentTransactionId={paymentTransactionId}
                existingProofUrl={url}
                proofIndex={proofIndex}
                label={label}
                onSaved={() => router.refresh()}
              />
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              setReceiptPreview({ label, url });
            }}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            Lihat Bukti
          </Button>
          {canEdit && (
            <FinancePaymentProofReplacement
              paymentTransactionId={paymentTransactionId}
              existingProofUrl={url}
              proofIndex={proofIndex}
              label={label}
              onSaved={() => router.refresh()}
            />
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <a
            href={paymentReceiptHref(url)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Buka Dokumen
          </a>
        </Button>
        {url.startsWith("/api/tickets/receipts/") && canEdit && (
          <FinancePaymentProofReplacement
            paymentTransactionId={paymentTransactionId}
            existingProofUrl={url}
            proofIndex={proofIndex}
            label={label}
            onSaved={() => router.refresh()}
            buttonLabel="Unggah Ulang"
          />
        )}
      </div>
    );
  };

  const renderPaymentProof = (
    paymentTransactionId: string,
    url: string | null,
    additionalUrls: string[],
    editDisabledUrls: string[],
    label: string,
  ) => {
    const urls = [url, ...additionalUrls]
      .map((proofUrl, index) => ({ proofUrl, index }))
      .filter(
        (proof): proof is { proofUrl: string; index: number } =>
          Boolean(proof.proofUrl),
      );
    if (urls.length === 0) {
      return <span className="text-muted-foreground">Tidak ada bukti</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {urls.map(({ proofUrl, index }) => (
          <div key={`${proofUrl}-${index}`}>
            {renderSinglePaymentProof(
              paymentTransactionId,
              proofUrl,
              urls.length > 1 ? `${label} ${index + 1}` : label,
              index,
              role === UserRole.FINANCE && !editDisabledUrls.includes(proofUrl),
            )}
          </div>
        ))}
      </div>
    );
  };

  const navigateFromDashboard = (
    tab: "check" | "payment" | "history" | "ledger",
    cashflowType?: "IN" | "OUT" | null,
  ) => {
    setActiveTab(tab);
    setNavigationRequest((request) => request + 1);
    if (tab === "ledger") {
      setLedgerTypeFilter(cashflowType ?? null);
    } else if (tab === "check") {
      setReviewSearch("");
    } else if (tab === "payment") {
      setPaymentQueueSearch("");
    } else {
      setPaymentHistorySearch("");
      setPaymentHistoryPage(1);
    }
  };

  const openIncomingFund = () => {
    setActiveTab("ledger");
    setLedgerTypeFilter(null);
    setLedgerFundMode("incoming");
  };

  const openTransferFund = () => {
    setActiveTab("ledger");
    setLedgerTypeFilter(null);
    setLedgerFundMode("transfer");
  };

  const reportPayables = pendingPaymentRows.map((row) => ({
    id: `${row.kind}-${row.id}`,
    reference: row.reference,
    title: row.title,
    vendorOrRequester: row.requesterName ?? row.title,
    sourceLabel:
      row.kind === "ticket"
        ? "Tiket & Permintaan"
        : row.kind === "standalone-po"
          ? "Purchase Order (PO)"
          : "Belanja Material Langsung",
    grandTotal: row.grandTotal,
    paidAmount: row.paidAmount,
    remainingAmount: Math.max(0, row.grandTotal - row.paidAmount),
    transferDestination: row.transferDestination,
  }));

  const existingTxIds = new Set(dashboardTransactions.map((tx) => tx.id));
  const extraIncomingFromCashflows: FinanceDashboardTransaction[] = cashflows
    .filter(
      (cf) =>
        cf.type === "IN" && !cf.transferGroupId && !existingTxIds.has(cf.id),
    )
    .map((cf) => ({
      id: cf.id,
      createdAt: cf.createdAt,
      type: "IN" as const,
      category: "Dana Masuk",
      sourceDesc: cf.sourceDesc,
      paymentMethod:
        cf.paymentMethod === "DEPOSIT"
          ? "Setor tunai"
          : cf.paymentMethod === "CASH"
            ? "Tunai"
            : "Transfer",
      counterparty: cf.senderName || cf.recorder.name || "—",
      accountOrDestination: cf.account.accountName,
      projectName: cf.project?.kelompokTani ?? null,
      amount: cf.amount,
      proofUrl: cf.proofUrl,
    }));

  const allDashboardTransactions = [
    ...dashboardTransactions,
    ...extraIncomingFromCashflows,
  ].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );

  return (
    <div className="space-y-5">
      <FinanceDashboard
        reviewCount={purchaseOrders.length}
        pendingPaymentCount={pendingPaymentCount}
        outstandingAmount={pendingPaymentRows.reduce(
          (total, row) =>
            total + Math.max(0, row.grandTotal - row.paidAmount),
          0,
        )}
        months={dashboardMonths}
        accounts={financeAccounts}
        transactions={allDashboardTransactions}
        expenseCategories={expenseCategories}
        monthInflow={monthInflow}
        monthOutflow={monthOutflow}
        payables={reportPayables}
        financeSignerName={financeSignerName}
        financeQrDataUrl={financeQrDataUrl}
        coordinatorSignerName={coordinatorSignerName}
        directorSignerName={directorSignerName}
        onNavigate={navigateFromDashboard}
        onOpenIncoming={openIncomingFund}
        onOpenTransfer={openTransferFund}
        onOpenOfficeExpense={
          canManageOfficeExpenses ? () => setOfficeExpenseOpen(true) : undefined
        }
        onPreviewProof={(url, label) => setReceiptPreview({ url, label })}
      />

      {documentSignoffTasks.length > 0 && (
        <DocumentSignoffQueue
          tasks={documentSignoffTasks}
          title="Tanda Tangan & Konfirmasi Dokumen"
          description="Invoice ditandatangani Keuangan lalu diketahui Direktur. KO ditandatangani Logistik lalu diketahui Keuangan."
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <div
          role="tablist"
          aria-label="Navigasi Tahapan Finance Hub"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {(
            [
              {
                value: "check",
                title: "Periksa PO",
                subtitle: "Verifikasi draft PO & pajak",
                count: `${purchaseOrders.length} PO`,
                badgeVariant:
                  purchaseOrders.length > 0
                    ? ("warning" as const)
                    : ("outline" as const),
              },
              {
                value: "payment",
                title: "Antrean Bayar",
                subtitle: "Eksekusi tagihan PO & tiket",
                count: `${pendingPaymentCount} Tagihan`,
                badgeVariant:
                  pendingPaymentCount > 0
                    ? ("error" as const)
                    : ("outline" as const),
              },
              {
                value: "vendor-contracts",
                title: "Tagihan Kontrak Vendor",
                subtitle: "Rekap DO pasir, batu & curah",
                count: `${
                  vendorInvoices.filter((invoice) => invoice.status !== "PAID")
                    .length
                } Tagihan`,
                badgeVariant:
                  vendorInvoices.some((invoice) => invoice.status !== "PAID")
                    ? ("warning" as const)
                    : ("outline" as const),
              },
              {
                value: "ledger",
                title: "Buku Kas & Mutasi",
                subtitle: "Saldo rekening & arus dana",
                count: `${financeAccounts.length} Akun`,
                badgeVariant: "outline" as const,
              },
              {
                value: "history",
                title: "Riwayat Bukti",
                subtitle: "Arsip bukti transfer lunas",
                count: `${paymentHistoryRows.length} Bukti`,
                badgeVariant: "outline" as const,
              },
              ...(canManageOfficeExpenses
                ? [
                    {
                      value: "office-expense",
                      title: "Kas Kantor",
                      subtitle: "Gaji, kasbon & reimburse",
                      count: `${officeExpenses.length} Data`,
                      badgeVariant: "outline" as const,
                    },
                  ]
                : []),
              {
                value: "operations",
                title: "Subkon & BBM",
                subtitle: "Termin subkon & klaim BBM",
                count: `${termyns.length + vehicleTripLogs.length + vehicleFuelRequests.length} Item`,
                badgeVariant: "outline" as const,
              },
            ] as const
          ).map((item, idx) => {
            const isActive = activeTab === item.value;
            const stepNum = String(idx + 1).padStart(2, "0");
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(item.value)}
                className={`group flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-left transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  isActive
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {stepNum}
                    </span>
                    <span
                      className={`truncate text-xs font-bold tracking-wide uppercase ${
                        isActive ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                  <Badge
                    variant={isActive ? "default" : item.badgeVariant}
                    className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums"
                  >
                    {item.count}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {item.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        <div id="finance-ledger-tab">
          <TabsContent value="ledger">
            <FinanceLedger
              accounts={financeAccounts}
              cashflows={cashflows}
              historicalPayments={historicalPayments}
              projects={financeProjects}
              canManage={
                role === UserRole.FINANCE ||
                role === UserRole.ADMINISTRATIONS
              }
              fundMode={ledgerFundMode}
              onFundModeChange={setLedgerFundMode}
              typeFilter={ledgerTypeFilter}
              onTypeFilterChange={setLedgerTypeFilter}
              onPreviewProof={(url, label) => setReceiptPreview({ url, label })}
            />
          </TabsContent>
        </div>

        {canManageOfficeExpenses && (
          <TabsContent value="office-expense">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Pengeluaran Kantor &amp; Operasional</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Riwayat gaji, kasbon, dan reimbursement yang dipotong dari
                    akun kas/bank.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => setOfficeExpenseOpen(true)}
                >
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  Catat Pengeluaran Internal
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <section className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-semibold">
                      Rekap Penggunaan Dana per Pengguna
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Pembayaran OPS dan reimbursement, serta gaji dan
                      kasbon/ambilan. Request gudang dan material tidak
                      termasuk.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reimbursement dihitung dari tiket yang dibayar; catatan
                      reimbursement di Pengeluaran Kantor tidak dihitung ulang.
                    </p>
                  </div>
                  {fundUsageSummary.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Belum ada pembayaran OPS, reimbursement, gaji, atau
                      kasbon/ambilan yang tercatat.
                    </p>
                  ) : (
                    <NativeDataTable itemLabel="rekap penggunaan dana">
                      <table className="app-data-table w-full min-w-[620px] text-left text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-3">Pengguna / Jenis Request</th>
                            <th className="py-2 text-right">
                              Total Dibayarkan
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {fundUsageSummary.map((user) => (
                            <tr key={user.userId} className="border-b last:border-0">
                              <td className="py-3 pr-3">
                                <p className="font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {user.role.replaceAll("_", " ")}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {user.categories.map((category) => (
                                    <span
                                      key={category.type}
                                      className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs"
                                    >
                                      {category.type === "OPS"
                                        ? "OPS"
                                        : expenseTypeLabels[category.type] ??
                                          category.type}
                                      {" · "}
                                      {category.count} transaksi ·{" "}
                                      {currency(category.amount)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-3 text-right font-semibold tabular-nums">
                                {currency(user.totalAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </NativeDataTable>
                  )}
                </section>

                <section className="space-y-3 border-t pt-6">
                  <h3 className="font-semibold">
                    Riwayat Pengeluaran Kantor &amp; Operasional
                  </h3>
                  {officeExpenses.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Belum ada pengeluaran kantor atau operasional yang dicatat.
                    </p>
                  ) : (
                  <NativeDataTable itemLabel="pengeluaran" pageSize={10}>
                    <table className="app-data-table w-full min-w-[850px] text-left text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 pr-3">Tanggal</th>
                          <th className="py-2 pr-3">Penerima</th>
                          <th className="py-2 pr-3">Tipe</th>
                          <th className="py-2 pr-3 text-right">Nominal</th>
                          <th className="py-2 pr-3">Sumber Akun</th>
                          <th className="py-2 pr-3">Status Bukti</th>
                          <th className="py-2 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {officeExpenses.map((expense) => {
                          const typeLabel =
                            expenseTypeLabels[
                              expense.expenseType as keyof typeof expenseTypeLabels
                            ] ?? expense.expenseType;
                          return (
                            <tr key={expense.id} className="border-b last:border-0">
                              <td className="py-2 pr-3">
                                {new Date(expense.createdAt).toLocaleDateString(
                                  "id-ID",
                                  { dateStyle: "medium" },
                                )}
                              </td>
                              <td className="py-2 pr-3">
                                <p className="font-medium">{expense.recipientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {expense.recipientRole.replaceAll("_", " ")}
                                </p>
                              </td>
                              <td className="py-2 pr-3">
                                <p>{typeLabel}</p>
                                <p className="max-w-56 truncate text-xs text-muted-foreground">
                                  {expense.description}
                                </p>
                              </td>
                              <td className="py-2 pr-3 text-right font-semibold">
                                {currency(expense.amount)}
                              </td>
                              <td className="py-2 pr-3">
                                <p>{expense.account.accountName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {expense.paymentMethod === "CASH"
                                    ? "Cash"
                                    : "Transfer"}
                                </p>
                              </td>
                              <td className="py-2 pr-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="success">
                                    Lengkap · {expense.proofUrls.length} bukti
                                  </Badge>
                                  {expense.proofUrls.map((url, index) => (
                                    <Button
                                      key={url}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1.5 px-2.5 text-xs"
                                      onClick={() =>
                                        setReceiptPreview({
                                          url,
                                          label: `Bukti ${typeLabel} · ${expense.recipientName} (${index + 1})`,
                                        })
                                      }
                                    >
                                      <Eye className="size-3.5" aria-hidden="true" />
                                      Bukti {index + 1}
                                    </Button>
                                  ))}
                                </div>
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                {canManageOfficeExpenses && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1.5 px-2.5 text-xs border-orange-500/40 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950/30"
                                    onClick={() => setEditingExpense(expense)}
                                  >
                                    <Pencil className="size-3.5" aria-hidden="true" />
                                    Edit
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </NativeDataTable>
                  )}
                </section>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="check">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>1. Verifikasi Purchase Order (PO Menunggu Checked By Finance)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Periksa rincian harga, pajak PPN 11%, dan rekening vendor sebelum PO diteruskan ke Direktur.
                </p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                  placeholder="Cari PO atau vendor..."
                  aria-label="Cari PO yang menunggu pemeriksaan"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredReviewOrders.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {purchaseOrders.length === 0
                    ? "Tidak ada PO draft yang menunggu pemeriksaan Finance."
                    : "Tidak ada PO yang cocok dengan pencarian."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nomor PO</TableHead>
                        <TableHead>Vendor &amp; Metode</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jumlah Item</TableHead>
                        <TableHead className="text-right">Total Nilai PO</TableHead>
                        <TableHead className="text-right">Aksi Pemeriksaan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviewOrders.map((order) => {
                        const subtotal = order.items.reduce(
                          (sum, item) => sum + item.totalPrice,
                          0,
                        );
                        const poGrandTotal =
                          Math.round(
                            subtotal * (order.includeTax ? 1.11 : 1) * 100,
                          ) / 100;
                        return (
                          <TableRow
                            key={order.publicCode}
                            className="cursor-pointer"
                            tabIndex={0}
                            onClick={() => {
                              setMessage("");
                              setSelection({ kind: "po", id: order.publicCode });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelection({ kind: "po", id: order.publicCode });
                              }
                            }}
                          >
                            <TableCell className="font-semibold">
                              {order.poNumber}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">
                                {order.vendorName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {order.paymentMethod === "CASH"
                                  ? "Tunai (Cash)"
                                  : `Transfer${order.paymentBankName ? ` · ${order.paymentBankName}` : ""}`}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString("id-ID", {
                                dateStyle: "medium",
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.items.length} item
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {currency(poGrandTotal)}
                              {order.includeTax && (
                                <span className="block text-[10px] font-normal text-muted-foreground">
                                  Termasuk PPN 11%
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {role === UserRole.FINANCE && !order.paidAt ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  disabled={isPending}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    runReview(order.publicCode);
                                  }}
                                >
                                  <FileCheck2
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  Tandai Diperiksa
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMessage("");
                                    setSelection({
                                      kind: "po",
                                      id: order.publicCode,
                                    });
                                  }}
                                >
                                  <Eye className="size-3.5" aria-hidden="true" />
                                  Lihat PO
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Klik baris PO untuk melihat dokumen lengkap. Pembelian langsung dan tiket biaya yang sudah disetujui Direktur masuk ke tab <strong>2. Antrean Bayar</strong>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <div id="finance-payment-tab">
          <TabsContent value="payment">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>2. Antrean Pembayaran Tagihan &amp; Pengajuan Disetujui</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Klik baris untuk melihat rincian tagihan, atau klik <strong>Bayar Tagihan</strong> untuk mencatat bukti pembayaran.
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={paymentQueueSearch}
                    onChange={(event) => setPaymentQueueSearch(event.target.value)}
                    placeholder="Cari tagihan atau vendor..."
                    aria-label="Cari antrean pembayaran"
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor Ref &amp; Keperluan</TableHead>
                      <TableHead>Tujuan Pembayaran / Rekening</TableHead>
                      <TableHead className="text-right">Total Tagihan</TableHead>
                      <TableHead className="text-right">Terbayar</TableHead>
                      <TableHead className="text-right">Sisa Hutang</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi Pembayaran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPendingPaymentRows.map((row) => {
                      const balance =
                        Math.round((row.grandTotal - row.paidAmount) * 100) /
                        100;
                      const outstanding = Math.max(0, balance);
                      const waitingInvoice = row.hasInvoice === false;
                      const needsNominal = Boolean(row.needsNominalInput);
                      return (
                        <TableRow
                          key={`${row.kind}:${row.id}`}
                          className="cursor-pointer"
                          tabIndex={0}
                          onClick={() => openPaymentHistory(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPaymentHistory(row);
                            }
                          }}
                        >
                          <TableCell>
                            <span className="font-semibold text-foreground">
                              {row.reference}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {row.title}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs text-xs text-muted-foreground">
                            {row.transferDestination || (
                              <span className="italic">
                                Klik baris untuk melihat tujuan
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {needsNominal ? (
                              <span className="italic text-muted-foreground">
                                Belum ditetapkan
                              </span>
                            ) : (
                              currency(row.grandTotal)
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {currency(row.paidAmount)}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                            {needsNominal ? (
                              <span className="font-normal italic text-muted-foreground">
                                Belum ditetapkan
                              </span>
                            ) : (
                              currency(outstanding)
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                waitingInvoice || needsNominal
                                  ? "warning"
                                  : balance <= 0
                                    ? "success"
                                    : row.paidAmount > 0
                                      ? "warning"
                                      : "error"
                              }
                            >
                              {waitingInvoice
                                ? "MENUNGGU INVOICE LOGISTIK"
                                : needsNominal
                                  ? "BELUM ADA NOMINAL"
                                  : balance <= 0
                                    ? "LUNAS"
                                    : row.paidAmount > 0
                                      ? "DIBAYAR SEBAGIAN"
                                      : "BELUM DIBAYAR"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {(outstanding > 0 || needsNominal) &&
                            role === UserRole.FINANCE ? (
                              waitingInvoice ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  disabled={isPending}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openPaymentHistory(row);
                                  }}
                                >
                                  <Eye className="size-3.5" aria-hidden="true" />
                                  Menunggu Invoice
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  disabled={isPending}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPaymentModalSelection({
                                      kind: row.kind,
                                      id: row.id,
                                    });
                                  }}
                                >
                                  <Wallet
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  Bayar Tagihan
                                </Button>
                              )
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPaymentHistory(row);
                                }}
                              >
                                <Eye className="size-3.5" aria-hidden="true" />
                                Rincian
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPendingPaymentRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-10 text-center text-muted-foreground"
                        >
                          {pendingPaymentRows.length === 0
                            ? "Tidak ada tagihan yang menunggu pembayaran."
                            : "Tidak ada tagihan yang cocok dengan pencarian."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>

        <div id="finance-history-tab">
          <TabsContent value="history">
            <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Riwayat & Bukti Transfer</CardTitle>
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={paymentHistorySearch}
                  onChange={(event) => {
                    setPaymentHistorySearch(event.target.value);
                    setPaymentHistoryPage(1);
                  }}
                  placeholder="Cari transaksi..."
                  aria-label="Cari riwayat pembayaran"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table pagination={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nomor Ref</TableHead>
                      <TableHead>Transaksi</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Jumlah</TableHead>
                      <TableHead>Bukti Transfer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistoryPageRows.map((payment) => (
                      <TableRow
                        key={payment.id}
                        className="cursor-pointer"
                        tabIndex={0}
                        onClick={() =>
                          setSelection(
                            payment.targetKind === "ticket"
                              ? { kind: "ticket", id: payment.targetId }
                              : payment.targetKind === "standalone-po"
                                ? { kind: "standalone-po", id: payment.targetId }
                                : { kind: "direct-purchase", id: payment.targetId },
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelection(
                              payment.targetKind === "ticket"
                                ? { kind: "ticket", id: payment.targetId }
                                : payment.targetKind === "standalone-po"
                                  ? { kind: "standalone-po", id: payment.targetId }
                                  : {
                                      kind: "direct-purchase",
                                      id: payment.targetId,
                                    },
                            );
                          }
                        }}
                      >
                        <TableCell>
                          {payment.paidAt
                            ? new Date(payment.paidAt).toLocaleString("id-ID")
                            : "—"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {payment.reference}
                        </TableCell>
                        <TableCell>{payment.title}</TableCell>
                        <TableCell>
                          {payment.paymentType === PaymentType.DOWN_PAYMENT
                            ? "DP"
                            : payment.paymentType === PaymentType.PROGRESS_PAYMENT
                              ? "Termin"
                              : "Pelunasan"}
                        </TableCell>
                        <TableCell>{currency(payment.amount)}</TableCell>
                        <TableCell>
                          {renderPaymentProof(
                            payment.id,
                            payment.proofOfTransferUrl,
                            payment.additionalProofUrls ?? [],
                            payment.proofEditDisabledUrls ?? [],
                            `Bukti transfer ${payment.reference}`,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPaymentHistoryRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          {paymentHistoryRows.length === 0
                            ? "Belum ada transaksi pembayaran berhasil."
                            : "Tidak ada transaksi yang cocok dengan pencarian."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationControls
                count={filteredPaymentHistoryRows.length}
                pageSize={PAYMENT_HISTORY_PAGE_SIZE}
                page={currentPaymentHistoryPage}
                itemLabel="transaksi"
                onPageChange={setPaymentHistoryPage}
              />
            </CardContent>
            </Card>
          </TabsContent>
        </div>

        <TabsContent value="operations">
          <Tabs
            value={operationsTab}
            onValueChange={setOperationsTab}
            className="space-y-4"
          >
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="rentals">
                🚜 Tagihan Sewa (
                {
                  rentals.filter((r) => r.paymentStatus === "PENDING_PAYMENT")
                    .length
                }
                )
              </TabsTrigger>
              <TabsTrigger value="subcontract">
                Termin & Retensi ({termyns.length})
              </TabsTrigger>
              <TabsTrigger value="fuel-logs">
                Log BBM Mover ({vehicleTripLogs.length})
              </TabsTrigger>
              <TabsTrigger value="fuel-requests">
                Reimbursement BBM (
                {
                  vehicleFuelRequests.filter(
                    (request) =>
                      request.status === "PENDING_FINANCE" ||
                      request.status === "PROOF_SUBMITTED",
                  ).length
                }
                )
              </TabsTrigger>
            </TabsList>
        <TabsContent value="subcontract">
          <Card>
            <CardHeader>
              <CardTitle>Termin Subkon & Retensi 5%</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {termyns.map((termyn) => (
                <article className="rounded-lg border p-4" key={termyn.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-primary">
                        {termyn.contractNumber} · {termyn.subkonName}
                      </p>
                      <p className="text-sm text-muted-foreground">{termyn.projectName}</p>
                      <p className="mt-2 text-sm">
                        Termin {termyn.termynNumber} · Klaim kumulatif {termyn.claimedPercent}%
                      </p>
                    </div>
                    <Badge variant="outline">{termyn.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <p>Nilai kotor: <strong>{currency(termyn.grossAmount)}</strong></p>
                    <p>Retensi (5%): <strong>{currency(termyn.retentionAmount)}</strong></p>
                    <p>
                      Nilai bersih: <strong>{currency(termyn.netAmount)}</strong>
                      <span className="mt-1 block text-muted-foreground">
                        Terbilang: {terbilangRupiah(Number(termyn.netAmount))}
                      </span>
                    </p>
                  </div>
                  {termyn.status === "FIELD_VERIFIED" && role === UserRole.FINANCE && (
                    <Button
                      className="mt-3"
                      disabled={isPending}
                      onClick={async () => {
                        const result = await reviewSubkonTermynFinance(termyn.id);
                        setMessage(result.message);
                        if (result.success) router.refresh();
                      }}
                    >
                      Checked By Finance
                    </Button>
                  )}
                  {termyn.status === "APPROVED" && role === UserRole.FINANCE && (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-3"
                      onSubmit={(event) => submitTermynPayment(event, termyn.id)}
                    >
                      <FinanceAccountField
                        id={`termyn-account-${termyn.id}`}
                        accounts={financeAccounts}
                        disabled={isPending}
                      />
                      <FormLabel className="space-y-1 text-sm">
                        Bukti pembayaran (PDF/JPG/PNG/WEBP/HEIC, maks. 5 MB)
                        <Input
                          type="file"
                          accept={FINANCE_PROOF_ACCEPT_ALL}
                          onChange={(event) =>
                            void handleSingleOperationalProofChange(
                              event,
                              termyn.id,
                              setTermynReceipts,
                            )
                          }
                        />
                      </FormLabel>
                      <Button
                        disabled={
                          !termynReceipts[termyn.id] ||
                          financeAccounts.length === 0 ||
                          isPending
                        }
                      >
                        Bayar Termin Bersih
                      </Button>
                    </form>
                  )}
                </article>
              ))}
              {termyns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Tidak ada termin yang menunggu pemeriksaan atau pembayaran.
                </p>
              )}
              <h3 className="pt-4 font-semibold text-primary">
                Pencairan Retensi setelah Masa Pemeliharaan
              </h3>
              {retentionContracts.map((contract) => (
                <article className="rounded-lg border p-4" key={contract.id}>
                  <p className="font-semibold">
                    {contract.contractNumber} · {contract.subkonName}
                  </p>
                  <p className="text-sm text-muted-foreground">{contract.projectName}</p>
                  <p className="mt-1 text-sm">
                    Total retensi tertahan: <strong>{currency(contract.retainedAmount)}</strong>
                    <span className="mt-1 block text-muted-foreground">
                      Terbilang: {terbilangRupiah(Number(contract.retainedAmount))}
                    </span>
                  </p>
                  {contract.eligible && role === UserRole.FINANCE ? (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-3"
                      onSubmit={(event) => submitRetentionRelease(event, contract.id)}
                    >
                      <FinanceAccountField
                        id={`retention-account-${contract.id}`}
                        accounts={financeAccounts}
                        disabled={isPending}
                      />
                      <FormLabel className="space-y-1 text-sm">
                        Bukti transfer retensi (PDF/JPG/PNG/WEBP/HEIC, maks. 5 MB)
                        <Input
                          type="file"
                          accept={FINANCE_PROOF_ACCEPT_ALL}
                          onChange={(event) =>
                            void handleSingleOperationalProofChange(
                              event,
                              contract.id,
                              setRetentionReceipts,
                            )
                          }
                        />
                      </FormLabel>
                      <Button
                        disabled={
                          !retentionReceipts[contract.id] ||
                          financeAccounts.length === 0 ||
                          isPending
                        }
                      >
                        Catat Pencairan Retensi
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Menunggu semua termin dibayar dan masa pemeliharaan PHO selesai.
                    </p>
                  )}
                </article>
              ))}
              {retentionContracts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Belum ada retensi subkon yang tercatat.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fuel-logs">
          <Card>
            <CardHeader>
              <CardTitle>Log Perjalanan & Estimasi BBM Mover</CardTitle>
              <p className="text-sm text-muted-foreground">
                Data odometer dan estimasi liter untuk ditindaklanjuti dalam proses reimburse di luar aplikasi.
              </p>
            </CardHeader>
            <CardContent>
              <VehicleTripLogTable
                logs={vehicleTripLogs}
                emptyMessage="Belum ada log perjalanan atau BBM untuk ditinjau."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fuel-requests">
          <Card>
            <CardHeader>
              <CardTitle>Reimbursement BBM Kendaraan</CardTitle>
              <p className="text-sm text-muted-foreground">
                Plafon dihitung dari ODO berangkat–pulang pada rasio 12 km/L. Persetujuan dan pencatatan pencairan menutup request.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {vehicleFuelRequests.map((request) => (
                <article className="space-y-3 rounded-lg border p-4" key={request.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-primary">
                        {request.doNumber} · {request.plateNumber}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.vehicleType} · {request.projectName} · Mover: {request.requestedByName}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {{
                        PENDING_FINANCE: "Menunggu Keuangan",
                        FUNDED: "Dana Diserahkan · Menunggu Bukti",
                        REJECTED: "Ditolak",
                        PROOF_SUBMITTED: "Bukti masuk · menunggu penutupan Finance",
                        COMPLETED: "Selesai · reimbursement disalurkan",
                      }[request.status]}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-4">
                    <p>Jenis BBM: <strong>{request.source === "SPBU" ? "SPBU" : "Eceran"}</strong></p>
                    <p>
                      Plafon reimbursement:{" "}
                      <strong>{currency(request.requestedAmount)}</strong>
                      <span className="mt-1 block text-muted-foreground">
                        Terbilang:{" "}
                        {terbilangRupiah(Number(request.requestedAmount))}
                      </span>
                    </p>
                    <p>Estimasi liter: <strong>{request.estimatedFuelLiter} L</strong></p>
                    <p>Harga: <strong>Rp{Number(request.unitPrice).toLocaleString("id-ID")}/L</strong></p>
                    <p>Jarak ODO aktual: <strong>{request.tripDistanceKm ?? "—"} km</strong></p>
                    <p>Jarak untuk hitung: <strong>{request.estimatedDistanceKm} km</strong></p>
                    {Number(request.exceptionDistanceKm) > 0 && (
                      <p>
                        Toleransi kondisi khusus:{" "}
                        <strong>+{request.exceptionDistanceKm} km</strong>
                        {request.exceptionReason
                          ? ` · ${request.exceptionReason}`
                          : ""}
                      </p>
                    )}
                  </div>
                  {request.disbursementMethod && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p>
                        Pencairan:{" "}
                        <strong>
                          {request.disbursementMethod === POPaymentMethod.CASH
                            ? "Tunai"
                            : "Transfer"}
                        </strong>
                      </p>
                      <p>Tujuan / penerima: {request.transferDestination}</p>
                      <p>
                        Jumlah pencairan:{" "}
                        <strong>{currency(request.requestedAmount)}</strong>
                      </p>
                      <p className="text-muted-foreground">
                        Terbilang:{" "}
                        {terbilangRupiah(Number(request.requestedAmount))}
                      </p>
                      {request.transferProofUrl && (
                        <div className="pt-2">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                          >
                            <a
                              href={photoDownloadHref(request.transferProofUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              Bukti Transfer Pencairan
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {request.financeNote && (
                    <p className="text-sm text-muted-foreground">
                      Catatan Keuangan: {request.financeNote}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    >
                      <a
                        href={photoDownloadHref(request.beforeFillingPhotoUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        Foto ODO Awal
                      </a>
                    </Button>
                    {request.afterFillingPhotoUrl && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                      >
                        <a
                          href={photoDownloadHref(request.afterFillingPhotoUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          Foto ODO Akhir
                        </a>
                      </Button>
                    )}
                    {request.receiptPhotoUrl && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                      >
                        <a
                          href={photoDownloadHref(request.receiptPhotoUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          Foto Bon BBM
                        </a>
                      </Button>
                    )}
                  </div>
                  {request.status === "PENDING_FINANCE" && role === UserRole.FINANCE && (
                    <form
                      className="grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-2"
                      onSubmit={(event) =>
                        submitFuelRequestDecision(event, request.id)
                      }
                    >
                      <FinanceAccountField
                        id={`fuel-account-${request.id}`}
                        accounts={financeAccounts}
                        disabled={isPending}
                        required={false}
                      />
                      <FormLabel className="grid gap-1 text-sm">
                        Metode penyaluran dana
                        <select
                          name="disbursementMethod"
                          value={
                            fuelDisbursementMethods[request.id] ??
                            POPaymentMethod.CASH
                          }
                          onChange={(event) =>
                            setFuelDisbursementMethods((current) => ({
                              ...current,
                              [request.id]:
                                event.target.value === POPaymentMethod.TRANSFER
                                  ? POPaymentMethod.TRANSFER
                                  : POPaymentMethod.CASH,
                            }))
                          }
                          className="h-10 rounded-md border bg-background px-3"
                          disabled={isPending}
                        >
                          <option value={POPaymentMethod.CASH}>Tunai / Cash</option>
                          <option value={POPaymentMethod.TRANSFER}>Transfer</option>
                        </select>
                      </FormLabel>
                      <FormLabel className="grid gap-1 text-sm">
                        {fuelDisbursementMethods[request.id] === POPaymentMethod.TRANSFER
                          ? "Tujuan transfer (bank, no. rekening, nama penerima)"
                          : "Nama penerima dana tunai"}
                        <Input
                          key={`${request.id}:${fuelDisbursementMethods[request.id] ?? POPaymentMethod.CASH}`}
                          name="transferDestination"
                          required
                          maxLength={300}
                          defaultValue={
                            fuelDisbursementMethods[request.id] ===
                            POPaymentMethod.TRANSFER
                              ? ""
                              : request.requestedByName
                          }
                          placeholder={
                            fuelDisbursementMethods[request.id] ===
                            POPaymentMethod.TRANSFER
                              ? "Contoh: Bank, nomor rekening, nama pemilik"
                              : "Nama Mover penerima"
                          }
                          disabled={isPending}
                        />
                      </FormLabel>
                      {fuelDisbursementMethods[request.id] ===
                        POPaymentMethod.TRANSFER && (
                        <FormLabel className="grid gap-1 text-sm md:col-span-2">
                          Bukti transfer (wajib)
                          <Input
                            name="transferProof"
                            type="file"
                            accept={FINANCE_PROOF_ACCEPT_ALL}
                            disabled={isPending}
                            onChange={(event) =>
                              void handleSingleOperationalProofChange(
                                event,
                                request.id,
                                setFuelTransferProofs,
                              )
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            PDF/JPG/PNG/WEBP/HEIC, maksimal 5 MB.
                          </span>
                        </FormLabel>
                      )}
                      <FormLabel className="grid gap-1 text-sm md:col-span-2">
                        Catatan Keuangan (opsional)
                        <Input
                          name="financeNote"
                          maxLength={1000}
                          disabled={isPending}
                        />
                      </FormLabel>
                      <div className="flex flex-wrap gap-2 md:col-span-2">
                        <Button
                          type="submit"
                          name="decision"
                          value="approve"
                          disabled={isPending || financeAccounts.length === 0}
                        >
                          {isPending ? "Memproses..." : "Setujui & Catat Pencairan"}
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="reject"
                          variant="outline"
                          formNoValidate
                          disabled={isPending}
                        >
                          Tolak Request
                        </Button>
                      </div>
                    </form>
                  )}
                  {request.status === "PROOF_SUBMITTED" &&
                    role === UserRole.FINANCE && (
                      <form
                        className="grid gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 md:grid-cols-[1fr_auto]"
                        onSubmit={(event) =>
                          submitFuelReconciliation(event, request.id)
                        }
                      >
                        <FormLabel className="grid gap-1 text-sm">
                          Catatan rekonsiliasi (opsional)
                          <Input
                            name="reconciliationNote"
                            maxLength={1000}
                            disabled={isPending}
                            placeholder="Contoh: ODO dan bukti pengisian sudah sesuai"
                          />
                        </FormLabel>
                        <Button
                          type="submit"
                          className="self-end"
                          disabled={isPending}
                        >
                          {isPending
                            ? "Menutup..."
                            : "Tandai selesai & tutup"}
                        </Button>
                      </form>
                    )}
                </article>
              ))}
              {vehicleFuelRequests.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Belum ada request dana BBM dari Mover.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rentals">
          <RentalBillingQueue
            rentals={rentals}
            financeAccounts={financeAccounts}
            canManage={
              role === UserRole.FINANCE ||
              role === UserRole.ADMINISTRATIONS ||
              role === UserRole.DIRECTOR ||
              role === UserRole.DEPUTY_DIRECTOR
            }
          />
        </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="vendor-contracts">
          <VendorContractBillingPanel
            contracts={materialContracts}
            vendorInvoices={vendorInvoices}
            financeAccounts={financeAccounts}
            canManage={
              role === UserRole.FINANCE ||
              role === UserRole.ADMINISTRATIONS ||
              role === UserRole.DIRECTOR ||
              role === UserRole.DEPUTY_DIRECTOR
            }
            onPreviewProof={(url, label) => setReceiptPreview({ url, label })}
          />
        </TabsContent>
      </Tabs>

      {message && (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground" role="status">
          {message}
        </p>
      )}

      <GlobalModal
        isOpen={selection !== null}
        onClose={() => {
          setSelection(null);
          setReceiptUrl([]);
          setPaymentAmount("");
          setPaymentType(PaymentType.FULL_PAYMENT);
          setMessage("");
          if (initialOpenSheet) {
            router.replace(`/apps/finance?tab=${activeTab}`, { scroll: false });
          }
        }}
        title={
          previewOrder?.poNumber ??
          activeDirectPurchase?.purchaseNumber ??
          activeTicket?.ticketNumber ??
          "Detail Finance"
        }
        description={
          activeTicket
            ? `${activeTicket.title}${activeTicket.projectName ? ` · Proyek: ${activeTicket.projectName}` : ""}`
            : activeDirectPurchase
              ? `Pembelian Material Langsung · ${activeDirectPurchase.vendorName}`
              : "Pemeriksaan dokumen dan transaksi tersimpan di satu panel."
        }
        hideHeader={Boolean(previewOrder)}
        className="sm:max-w-2xl"
        footer={
          previewOrder ? (
            activeOrder && role === UserRole.FINANCE && !activeOrder.paidAt ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  PO ini menunggu pemeriksaan Finance sebelum diajukan ke Direktur.
                </span>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => runReview(activeOrder.publicCode)}
                  className="gap-1.5"
                >
                  <FileCheck2 className="size-4" aria-hidden="true" />
                  Tandai PO Diperiksa (Checked)
                </Button>
              </div>
            ) : undefined
          ) : (
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setSelection(null);
              setReceiptUrl([]);
              setPaymentAmount("");
              setPaymentType(PaymentType.FULL_PAYMENT);
              setMessage("");
              if (initialOpenSheet) {
                router.replace(`/apps/finance?tab=${activeTab}`, { scroll: false });
              }
            }}
          >
            Tutup
          </Button>
          )
        }
      >
          <div className={previewOrder ? "flex min-h-0 flex-1 flex-col" : "space-y-4"}>
            {previewOrder && (
              <>
                <UniversalDocumentPreview
                  title={`Purchase Order ${previewOrder.poNumber}`}
                  documentNumber={previewOrder.poNumber}
                  src={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(previewOrder.publicCode)}`}
                  toolbarLabel={`Vendor: ${previewOrder.vendorName}`}
                  minimalToolbar
                  onClose={() => {
                    setSelection(null);
                    setReceiptUrl([]);
                    setPaymentAmount("");
                    setPaymentType(PaymentType.FULL_PAYMENT);
                    setMessage("");
                    if (initialOpenSheet) {
                      router.replace(`/apps/finance?tab=${activeTab}`, {
                        scroll: false,
                      });
                    }
                  }}
                />
              </>
            )}
            {activeStandaloneOrder && isPaymentSettled && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <span>
                  {activeStandaloneOrder.paidAt
                    ? `PO ini sudah lunas pada ${new Date(activeStandaloneOrder.paidAt).toLocaleDateString("id-ID")}.`
                    : "PO ini sudah lunas."}
                </span>
                {activeStandaloneOrder.paymentReceiptUrl && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                  >
                    <a
                      href={photoDownloadHref(
                        activeStandaloneOrder.paymentReceiptUrl,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      Lihat Bukti Pelunasan
                    </a>
                  </Button>
                )}
              </div>
            )}
            {activeStandaloneOrder?.vendorInvoiceUrl && (
              <div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                >
                  <a
                    href={photoDownloadHref(activeStandaloneOrder.vendorInvoiceUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Lihat Invoice / Bon Vendor
                  </a>
                </Button>
              </div>
            )}
            {activeStandaloneOrder && !activeStandaloneOrder.vendorInvoiceUrl && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Menunggu Logistik mengunggah invoice/bon vendor untuk PO ini.
                Pembayaran dapat diproses setelah dokumen diunggah.
              </p>
            )}
            {activeStandaloneOrder &&
              Boolean(activeStandaloneOrder.vendorInvoiceUrl) &&
              role === UserRole.FINANCE &&
              !isPaymentSettled && (
              <form className="space-y-3" onSubmit={submitPayment}>
                <section className="space-y-2 rounded-lg border p-3 text-sm">
                  <p>
                    Total tagihan: <strong>{currency(paymentTotal)}</strong>
                  </p>
                  <p>
                    Sudah dibayar: <strong>{currency(paidAmount)}</strong> · Sisa:{" "}
                    <strong>{currency(remainingAmount)}</strong>
                  </p>
                  <div className="space-y-2 pt-1">
                    <Label>Jenis pembayaran</Label>
                    <FormLabel className="flex items-center gap-2 font-normal">
                      <input
                        type="radio"
                        name="paymentType"
                        checked={currentPaymentType === PaymentType.FULL_PAYMENT}
                        onChange={() => setPaymentType(PaymentType.FULL_PAYMENT)}
                      />
                      Bayar Lunas (Full Payment)
                    </FormLabel>
                    {isFirstPayment && (
                      <FormLabel className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name="paymentType"
                          checked={currentPaymentType === PaymentType.DOWN_PAYMENT}
                          onChange={() => setPaymentType(PaymentType.DOWN_PAYMENT)}
                        />
                        Bayar Uang Muka (DP) / Sebagian
                      </FormLabel>
                    )}
                    <FormLabel className="flex items-center gap-2 font-normal">
                      <input
                        type="radio"
                        name="paymentType"
                        checked={currentPaymentType === PaymentType.PROGRESS_PAYMENT}
                        onChange={() => setPaymentType(PaymentType.PROGRESS_PAYMENT)}
                      />
                      Pembayaran Termin
                    </FormLabel>
                    <div className="space-y-2">
                      <Label htmlFor="standalone-payment-amount">
                        Nominal Pembayaran (Rp)
                      </Label>
                      <RupiahAmountInput
                        id="standalone-payment-amount"
                        value={
                          currentPaymentType === PaymentType.FULL_PAYMENT
                            ? formatRupiahNumber(remainingAmount)
                            : paymentAmount
                        }
                        onChange={setPaymentAmount}
                        required
                        disabled={
                          isPending ||
                          currentPaymentType === PaymentType.FULL_PAYMENT
                        }
                      />
                    </div>
                  </div>
                </section>
                <div className="space-y-2">
                  <Label htmlFor="standalone-po-transfer-destination">
                    Keterangan tujuan transfer
                  </Label>
                  <Input
                    key={activeStandaloneOrder.publicCode}
                    id="standalone-po-transfer-destination"
                    name="transferDestination"
                    defaultValue={
                      formatVendorTransferDestination({
                        bankName: activeStandaloneOrder.paymentBankName,
                        accountNumber: activeStandaloneOrder.paymentAccountNumber,
                        accountName: activeStandaloneOrder.paymentAccountName,
                        fallbackOwner: activeStandaloneOrder.vendorName,
                      }) || "Pembayaran cash untuk restock gudang"
                    }
                    maxLength={300}
                    required
                    disabled={isPending}
                  />
                </div>
                <FinanceAccountField
                  id="standalone-po-finance-account"
                  accounts={financeAccounts}
                  disabled={isPending}
                />
                <div className="space-y-2">
                  <Label>Bukti pembayaran</Label>
                  <FinancePaymentProofUpload
                    value={receiptUrl}
                    onChange={setReceiptUrl}
                    multiple
                    disabled={isPending}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    receiptUrl.length === 0 ||
                    financeAccounts.length === 0 ||
                    isPending ||
                    (currentPaymentType !== PaymentType.FULL_PAYMENT &&
                      parseRupiahInput(paymentAmount) <= 0)
                  }
                >
                  {isPending
                    ? "Memproses..."
                    : currentPaymentType === PaymentType.FULL_PAYMENT
                      ? "Bayar & Terima ke Gudang"
                        : currentPaymentType === PaymentType.DOWN_PAYMENT
                          ? "Catat Pembayaran DP"
                          : "Catat Pembayaran Termin"}
                </Button>
              </form>
            )}
            {activeDirectPurchase && (
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{activeDirectPurchase.vendorName}</p>
                    <p className="text-sm text-muted-foreground">
                      Dibuat {new Date(activeDirectPurchase.createdAt).toLocaleDateString("id-ID")}
                    </p>
                  </div>
                  <Badge
                    variant={
                      isPaymentSettled
                        ? "success"
                        : paidAmount > 0
                          ? "warning"
                          : "error"
                    }
                  >
                    {paymentStatusLabel}
                  </Badge>
                </div>
                <NativeDataTable itemLabel="barang">
                  <table className="app-data-table w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">Barang</th>
                        <th className="py-2 pr-3">Jumlah</th>
                        <th className="py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDirectPurchase.items.map((item, index) => (
                        <tr key={`${item.itemName}-${index}`} className="border-b last:border-0">
                          <td className="py-2 pr-3">{item.itemName}</td>
                          <td className="py-2 pr-3">{item.quantity} {item.unit}</td>
                          <td className="py-2">{currency(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </NativeDataTable>
                <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Total Tagihan</span>
                    <strong className="mt-0.5 block text-sm tabular-nums text-foreground">
                      {currency(paymentTotal)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sudah Dibayar</span>
                    <strong className="mt-0.5 block text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {currency(paidAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sisa Hutang</span>
                    <strong className="mt-0.5 block text-sm tabular-nums text-rose-600 dark:text-rose-400">
                      {currency(remainingAmount)}
                    </strong>
                  </div>
                </div>
                {activeDirectPurchase.vendorInvoiceUrl && (
                  <div>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    >
                      <a
                        href={photoDownloadHref(activeDirectPurchase.vendorInvoiceUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        Lihat Invoice / Bon Faktur
                      </a>
                    </Button>
                  </div>
                )}
                {!activeDirectPurchase.vendorInvoiceUrl && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                    Menunggu Logistik mengunggah invoice/bon faktur untuk
                    pembelian langsung ini sebelum pembayaran dapat diproses.
                  </p>
                )}
                {role === UserRole.FINANCE &&
                  activeDirectPurchase.vendorInvoiceUrl &&
                  remainingAmount > 0 && (
                  <form className="space-y-3 border-t pt-3" onSubmit={submitPayment}>
                    <section className="space-y-2 text-sm">
                      <Label>Jenis pembayaran</Label>
                      <FormLabel className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name="direct-purchase-payment-type"
                          checked={currentPaymentType === PaymentType.FULL_PAYMENT}
                          onChange={() => setPaymentType(PaymentType.FULL_PAYMENT)}
                        />
                        Bayar Lunas
                      </FormLabel>
                      {activeDirectPurchase.paymentTransactions.length === 0 && (
                        <FormLabel className="flex items-center gap-2 font-normal">
                          <input
                            type="radio"
                            name="direct-purchase-payment-type"
                            checked={currentPaymentType === PaymentType.DOWN_PAYMENT}
                            onChange={() => setPaymentType(PaymentType.DOWN_PAYMENT)}
                          />
                          Uang Muka (DP)
                        </FormLabel>
                      )}
                      <FormLabel className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name="direct-purchase-payment-type"
                          checked={currentPaymentType === PaymentType.PROGRESS_PAYMENT}
                          onChange={() => setPaymentType(PaymentType.PROGRESS_PAYMENT)}
                        />
                        Pembayaran Termin
                      </FormLabel>
                      <div className="space-y-2">
                        <Label htmlFor="direct-purchase-payment-amount">
                          Nominal Pembayaran (Rp)
                        </Label>
                        <RupiahAmountInput
                          id="direct-purchase-payment-amount"
                          value={
                            currentPaymentType === PaymentType.FULL_PAYMENT
                              ? formatRupiahNumber(remainingAmount)
                              : paymentAmount
                          }
                          onChange={setPaymentAmount}
                          required
                          disabled={
                            isPending ||
                            currentPaymentType === PaymentType.FULL_PAYMENT
                          }
                        />
                      </div>
                    </section>
                    {(() => {
                      const activeDirectMethod =
                        directPurchasePaymentMethods[
                          activeDirectPurchase.id
                        ] ?? activeDirectPurchase.paymentMethod;
                      const activeDirectVendorAccounts =
                        toPaymentVendorBankOptions(
                          activeDirectPurchase.vendorBankAccounts,
                          activeDirectPurchase.vendorName,
                        );
                      const activeDirectVendorDestination =
                        formatVendorTransferDestination({
                          bankName: activeDirectPurchase.paymentBankName,
                          accountNumber:
                            activeDirectPurchase.paymentAccountNumber,
                          accountName: activeDirectPurchase.paymentAccountName,
                          fallbackOwner: activeDirectPurchase.vendorName,
                        }) ||
                        activeDirectVendorAccounts[0]?.destination ||
                        "";
                      const currentDestinationValue =
                        directPurchaseDestinations[activeDirectPurchase.id] ??
                        (activeDirectMethod === POPaymentMethod.TRANSFER
                          ? activeDirectVendorDestination
                          : CASH_DIRECT_PURCHASE_DESTINATION);

                      return (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="direct-purchase-payment-method">
                              Metode Pembayaran
                            </Label>
                            <select
                              key={`${activeDirectPurchase.id}:method`}
                              id="direct-purchase-payment-method"
                              name="paymentMethod"
                              value={activeDirectMethod}
                              onChange={(event) => {
                                const nextMethod =
                                  event.target.value === POPaymentMethod.CASH
                                    ? POPaymentMethod.CASH
                                    : POPaymentMethod.TRANSFER;
                                setDirectPurchasePaymentMethods((current) => ({
                                  ...current,
                                  [activeDirectPurchase.id]: nextMethod,
                                }));
                                setDirectPurchaseDestinations((current) => {
                                  const existing = (
                                    current[activeDirectPurchase.id] ??
                                    currentDestinationValue
                                  ).trim();
                                  if (nextMethod === POPaymentMethod.TRANSFER) {
                                    if (
                                      !existing ||
                                      existing ===
                                        CASH_DIRECT_PURCHASE_DESTINATION
                                    ) {
                                      return {
                                        ...current,
                                        [activeDirectPurchase.id]:
                                          activeDirectVendorDestination,
                                      };
                                    }
                                    return current;
                                  }
                                  return {
                                    ...current,
                                    [activeDirectPurchase.id]:
                                      !existing ||
                                      existing === activeDirectVendorDestination
                                        ? CASH_DIRECT_PURCHASE_DESTINATION
                                        : existing,
                                  };
                                });
                              }}
                              disabled={isPending}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            >
                              <option value={POPaymentMethod.TRANSFER}>
                                Transfer
                              </option>
                              <option value={POPaymentMethod.CASH}>
                                Cash / Tunai
                              </option>
                            </select>
                          </div>
                          {activeDirectMethod === POPaymentMethod.TRANSFER &&
                            activeDirectVendorAccounts.length > 1 && (
                              <div className="space-y-2">
                                <Label htmlFor="direct-purchase-vendor-bank">
                                  Pilih Rekening Vendor
                                </Label>
                                <select
                                  id="direct-purchase-vendor-bank"
                                  value={
                                    activeDirectVendorAccounts.find(
                                      (account) =>
                                        account.destination ===
                                        currentDestinationValue.trim(),
                                    )?.id ?? ""
                                  }
                                  onChange={(event) => {
                                    const picked =
                                      activeDirectVendorAccounts.find(
                                        (account) =>
                                          account.id === event.target.value,
                                      );
                                    if (picked) {
                                      setDirectPurchaseDestinations(
                                        (current) => ({
                                          ...current,
                                          [activeDirectPurchase.id]:
                                            picked.destination,
                                        }),
                                      );
                                    }
                                  }}
                                  disabled={isPending}
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                >
                                  <option value="">
                                    Pilih rekening vendor terdaftar
                                  </option>
                                  {activeDirectVendorAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.label}
                                      {account.isPrimary ? " (Utama)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          <div className="space-y-2">
                            <Label htmlFor="direct-purchase-transfer-destination">
                              {activeDirectMethod === POPaymentMethod.CASH
                                ? "Keterangan Pembayaran Tunai"
                                : "Ditransfer Ke (Bank/Rekening/Atas Nama)"}
                            </Label>
                            <Input
                              key={activeDirectPurchase.id}
                              id="direct-purchase-transfer-destination"
                              name="transferDestination"
                              value={currentDestinationValue}
                              onChange={(event) =>
                                setDirectPurchaseDestinations((current) => ({
                                  ...current,
                                  [activeDirectPurchase.id]: event.target.value,
                                }))
                              }
                              placeholder={
                                activeDirectMethod === POPaymentMethod.CASH
                                  ? "Keterangan pembayaran tunai"
                                  : "Nama bank, nomor rekening, atas nama"
                              }
                              maxLength={300}
                              required={
                                activeDirectMethod === POPaymentMethod.TRANSFER
                              }
                              disabled={isPending}
                            />
                            {activeDirectMethod === POPaymentMethod.TRANSFER &&
                              (activeDirectVendorDestination ? (
                                <p className="text-xs text-muted-foreground">
                                  Otomatis diisi dari rekening vendor terdaftar.
                                </p>
                              ) : !currentDestinationValue.trim() ? (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  Vendor belum memiliki nomor rekening terdaftar. Isi rekening tujuan di atas.
                                </p>
                              ) : null)}
                          </div>
                        </>
                      );
                    })()}
                    <FinanceAccountField
                      id="direct-purchase-finance-account"
                      accounts={financeAccounts}
                      disabled={isPending}
                    />
                    <div className="space-y-2">
                      <Label>Bukti pembayaran</Label>
                      <FinancePaymentProofUpload
                        value={receiptUrl}
                        onChange={setReceiptUrl}
                        multiple
                        disabled={isPending}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        receiptUrl.length === 0 ||
                        financeAccounts.length === 0 ||
                        isPending ||
                        ((currentPaymentType !== PaymentType.FULL_PAYMENT ||
                          paymentTotal <= 0) &&
                          parseRupiahInput(paymentAmount) <= 0)
                      }
                    >
                      {isPending
                        ? "Memproses..."
                        : currentPaymentType === PaymentType.FULL_PAYMENT
                          ? "Selesaikan Pembayaran"
                          : currentPaymentType === PaymentType.DOWN_PAYMENT
                            ? "Catat Uang Muka"
                            : "Catat Pembayaran Termin"}
                    </Button>
                  </form>
                )}
              </section>
            )}
            {activeTicket && (
              <>
                <div className="space-y-3 rounded-xl border border-border/80 bg-muted/15 p-4 text-sm">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        Total Nilai Pengajuan
                      </span>
                      <strong className="mt-1 block text-base tabular-nums text-foreground">
                        {currency(activeTicket.totalAmount)}
                      </strong>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        Total Sudah Dibayar
                      </span>
                      <strong className="mt-1 block text-base tabular-nums text-emerald-600 dark:text-emerald-400">
                        {currency(paidAmount)}
                      </strong>
                    </div>
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                      <span className="text-xs text-rose-600 dark:text-rose-400">
                        Sisa Tagihan
                      </span>
                      <strong className="mt-1 block text-base tabular-nums text-rose-600 dark:text-rose-400">
                        {currency(remainingAmount)}
                      </strong>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/50 p-3 space-y-2">
                    <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                      Tujuan Pembayaran &amp; Rekening Penerima
                    </p>
                    <div className="grid gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">Nama Penerima</span>
                        <strong className="mt-0.5 block text-foreground">
                          {activeTicket.recipientName ?? activeTicket.requesterName}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank / Kas</span>
                        <strong className="mt-0.5 block text-foreground">
                          {activeTicket.bankName ??
                            activeTicket.vendorBankName ??
                            "Tidak dicantumkan"}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Nomor Rekening</span>
                        <strong className="mt-0.5 block font-mono text-foreground">
                          {activeTicket.accountNumber ??
                            activeTicket.vendorAccountNumber ??
                            "Tidak dicantumkan"}
                        </strong>
                      </div>
                    </div>

                    {activeTicket.requestCategory ===
                      TicketRequestCategory.APH && (
                      <div className="border-t border-border/60 pt-2 text-xs space-y-1">
                        <p>
                          Metode Pembayaran:{" "}
                          <strong>
                            {activeTicket.requestPaymentMethod ===
                            POPaymentMethod.CASH
                              ? "Tunai (Cash)"
                              : "Transfer"}
                          </strong>
                        </p>
                        {activeTicket.requestPaymentMethod ===
                          POPaymentMethod.TRANSFER && (
                          <p>
                            Tujuan Transfer:{" "}
                            <strong>
                              {activeTicket.transferDestination || "—"}
                            </strong>
                          </p>
                        )}
                        {activeTicket.requestPaymentDescription && (
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            Keterangan: {activeTicket.requestPaymentDescription}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {activeTicket.purchaseReceiptUrl && (
                    <div>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                      >
                        <a
                          href={photoDownloadHref(activeTicket.purchaseReceiptUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          Lihat Invoice / Bon dari Logistik
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
                <DocumentPdfGenerator
                  key={`TICKET:${activeTicket.id}`}
                  recordType="TICKET"
                  recordId={activeTicket.id}
                  documentNumber={activeTicket.ticketNumber}
                  templates={documentTemplates}
                />
                {(activeTicket.type === TicketType.MATERIAL ||
                  Boolean(activeTicket.hasApprovedPo)) &&
                  !activeTicket.purchaseReceiptUrl && (
                    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                      Menunggu Logistik mengunggah invoice/bon pembelian untuk
                      tiket ini sebelum pembayaran dapat diproses.
                    </p>
                  )}
                {role === UserRole.FINANCE &&
                  !(
                    (activeTicket.type === TicketType.MATERIAL ||
                      Boolean(activeTicket.hasApprovedPo)) &&
                    !activeTicket.purchaseReceiptUrl
                  ) && (
                  <form className="space-y-3" onSubmit={submitPayment}>
                    <section className="space-y-2 rounded-lg border p-3 text-sm">
                      <Label>Jenis pembayaran</Label>
                      <FormLabel className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name="paymentType"
                          checked={currentPaymentType === PaymentType.FULL_PAYMENT}
                          onChange={() => setPaymentType(PaymentType.FULL_PAYMENT)}
                        />
                        Bayar Lunas (Full Payment)
                      </FormLabel>
                      {activeTicket.paymentTransactions.length === 0 && (
                        <FormLabel className="flex items-center gap-2 font-normal">
                          <input
                            type="radio"
                            name="paymentType"
                            checked={currentPaymentType === PaymentType.DOWN_PAYMENT}
                            onChange={() => setPaymentType(PaymentType.DOWN_PAYMENT)}
                          />
                          Bayar Uang Muka (DP) / Sebagian
                        </FormLabel>
                      )}
                      <FormLabel className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name="paymentType"
                          checked={currentPaymentType === PaymentType.PROGRESS_PAYMENT}
                          onChange={() => setPaymentType(PaymentType.PROGRESS_PAYMENT)}
                        />
                        Pembayaran Termin
                      </FormLabel>
                      <div className="space-y-2">
                        <Label htmlFor="ticket-payment-amount">
                          Nominal Pembayaran (Rp)
                        </Label>
                        <RupiahAmountInput
                          id="ticket-payment-amount"
                          value={
                            currentPaymentType === PaymentType.FULL_PAYMENT &&
                            paymentTotal > 0
                              ? formatRupiahNumber(remainingAmount)
                              : paymentAmount
                          }
                          onChange={setPaymentAmount}
                          required
                          disabled={
                            isPending ||
                            (currentPaymentType === PaymentType.FULL_PAYMENT &&
                              paymentTotal > 0)
                          }
                        />
                      </div>
                    </section>
                    <div className="space-y-2">
                      <Label htmlFor="transfer-destination">
                        {activeTicket.requestCategory ===
                          TicketRequestCategory.APH &&
                        activeTicket.requestPaymentMethod ===
                          POPaymentMethod.CASH
                          ? "Keterangan pembayaran tunai"
                          : "Tujuan transfer"}
                      </Label>
                      <Input
                        key={activeTicket.id}
                        id="transfer-destination"
                        name="transferDestination"
                        defaultValue={
                          activeTicket.requestCategory ===
                            TicketRequestCategory.APH &&
                          activeTicket.requestPaymentMethod ===
                            POPaymentMethod.CASH
                            ? "Pembayaran tunai"
                            : activeTicket.transferDestination ??
                              (activeTicket.vendorBankName &&
                          activeTicket.vendorAccountNumber
                            ? `Ditransfer ke: ${activeTicket.vendorBankName} & ${activeTicket.vendorAccountNumber}`
                            : "")
                        }
                        placeholder={
                          activeTicket.requestCategory ===
                            TicketRequestCategory.APH &&
                          activeTicket.requestPaymentMethod ===
                            POPaymentMethod.CASH
                            ? "Keterangan penyerahan tunai"
                            : "Nama penerima, bank, atau nomor rekening tujuan"
                        }
                        maxLength={300}
                        required
                        disabled={isPending}
                      />
                    </div>
                    <FinanceAccountField
                      id="ticket-finance-account"
                      accounts={financeAccounts}
                      disabled={isPending}
                    />
                    <div className="space-y-2">
                      <Label>
                        {activeTicket.requestCategory ===
                          TicketRequestCategory.APH &&
                        activeTicket.requestPaymentMethod ===
                          POPaymentMethod.CASH
                          ? "Bukti penyerahan dana"
                          : "Bukti transfer"}
                      </Label>
                      <FinancePaymentProofUpload
                        value={receiptUrl}
                        onChange={setReceiptUrl}
                        multiple
                        disabled={isPending}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        receiptUrl.length === 0 ||
                        financeAccounts.length === 0 ||
                        isPending ||
                        ((currentPaymentType !== PaymentType.FULL_PAYMENT ||
                          paymentTotal <= 0) &&
                          parseRupiahInput(paymentAmount) <= 0)
                      }
                    >
                      {isPending
                        ? "Memproses..."
                        : currentPaymentType === PaymentType.FULL_PAYMENT
                          ? "Selesaikan Pembayaran"
                          : currentPaymentType === PaymentType.DOWN_PAYMENT
                            ? "Catat Pembayaran DP"
                            : "Catat Pembayaran Termin"}
                    </Button>
                  </form>
                )}
              </>
            )}
            {paymentHistory.length > 0 && (
              <section className="space-y-2 rounded-lg border p-4">
                <h3 className="font-semibold">Riwayat Pembayaran</h3>
                <NativeDataTable itemLabel="pembayaran">
                  <table className="app-data-table w-full min-w-[540px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">Tanggal</th>
                        <th className="py-2 pr-3">Jenis</th>
                        <th className="py-2 pr-3">Jumlah</th>
                        <th className="py-2 pr-3">Tujuan Transfer</th>
                        <th className="py-2">Bukti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((payment) => (
                        <tr key={payment.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {payment.paidAt
                              ? new Date(payment.paidAt).toLocaleDateString("id-ID")
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {payment.paymentType === PaymentType.DOWN_PAYMENT
                              ? "DP"
                              : payment.paymentType === PaymentType.PROGRESS_PAYMENT
                                ? "Termin"
                                : "Pelunasan"}
                          </td>
                          <td className="py-2 pr-3">{currency(payment.amount)}</td>
                          <td className="py-2 pr-3">{payment.transferDestination}</td>
                          <td className="py-2">
                            {renderPaymentProof(
                              payment.id,
                              payment.proofOfTransferUrl,
                              payment.additionalProofUrls ?? [],
                              payment.proofEditDisabledUrls ?? [],
                              `Bukti transfer ${payment.transferDestination}`,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </NativeDataTable>
                <Badge
                  variant={
                    isPaymentSettled
                      ? "success"
                      : paidAmount > 0
                        ? "warning"
                        : "error"
                  }
                >
                  {paymentStatusLabel}
                </Badge>
              </section>
            )}
            {message && (
              <p className="text-sm" role="status">
                {message}
              </p>
            )}
          </div>
      </GlobalModal>
      <PaymentModal
        key={
          selectedPaymentRow
            ? `${selectedPaymentRow.kind}:${selectedPaymentRow.id}:${selectedPaymentRow.grandTotal}:${selectedPaymentRow.paidAmount}:${selectedPaymentRow.isFirstPayment}:${selectedPaymentRow.vendorBankDestination ?? ""}`
            : "closed"
        }
        open={paymentModalSelection !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentModalSelection(null);
        }}
        target={selectedPaymentRow}
        accounts={financeAccounts}
        onPay={submitModalPayment}
      />
      <GlobalModal
        isOpen={receiptPreview !== null}
        onClose={() => setReceiptPreview(null)}
        title={receiptPreview?.label ?? "Pratinjau bukti transfer"}
        description="Pratinjau bukti transfer. Buka file penuh untuk melihat atau menyimpan bukti."
        className="max-w-4xl"
        footer={
          receiptPreview ? (
            <Button asChild variant="outline">
              <a
                href={photoDownloadHref(receiptPreview.url)}
                target="_blank"
                rel="noreferrer"
              >
                <Download aria-hidden="true" />
                Unduh Bukti Transfer
              </a>
            </Button>
          ) : null
        }
      >
          {receiptPreview && (
            <>
              <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                {isImageReceipt(receiptPreview.url) &&
                unavailableProofUrls.includes(receiptPreview.url) ? (
                  <p className="p-8 text-sm text-muted-foreground" role="status">
                    Foto bukti tidak dapat dimuat. File mungkin sudah tidak
                    tersedia di penyimpanan.
                  </p>
                ) : isImageReceipt(receiptPreview.url) ? (
                  <Image
                    key={receiptPreview.url}
                    src={paymentReceiptHref(receiptPreview.url)}
                    alt={receiptPreview.label}
                    width={1200}
                    height={900}
                    className="max-h-[65vh] max-w-full object-contain"
                    unoptimized
                    onError={() => {
                      setUnavailableProofUrls((current) =>
                        current.includes(receiptPreview.url)
                          ? current
                          : [...current, receiptPreview.url],
                      );
                    }}
                  />
                ) : isPdfReceipt(receiptPreview.url) ? (
                  <iframe
                    key={receiptPreview.url}
                    src={paymentReceiptHref(receiptPreview.url)}
                    title={`Pratinjau ${receiptPreview.label}`}
                    className="h-[65vh] w-full"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <FileText className="size-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Pratinjau tidak tersedia untuk jenis file ini.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
      </GlobalModal>
      {canManageOfficeExpenses && officeExpenseOpen && (
        <OfficeExpenseModal
          open
          onClose={() => setOfficeExpenseOpen(false)}
          accounts={financeAccounts}
          recipients={officeExpenseRecipients}
        />
      )}
      {canManageOfficeExpenses && (
        <EditOfficeExpenseModal
          open={Boolean(editingExpense)}
          onClose={() => setEditingExpense(null)}
          expense={editingExpense}
          onReceiptPreview={setReceiptPreview}
        />
      )}
    </div>
  );
}
