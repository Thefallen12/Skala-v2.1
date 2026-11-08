"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { reviewPurchaseOrder } from "@/app/actions/orders";
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
import FinanceDashboard, {
  type FinanceDashboardTransaction,
  type FinanceExpenseCategory,
  type FinanceDashboardMonth,
} from "@/app/components/apps/finance/FinanceDashboard";
import PaymentModal, {
  type PaymentModalTarget,
} from "@/app/components/apps/finance/PaymentModal";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import FinancePaymentProofUpload from "@/app/components/apps/finance/FinancePaymentProofUpload";
import FinancePaymentProofReplacement from "@/app/components/apps/finance/FinancePaymentProofReplacement";
import OfficeExpenseModal from "@/app/components/apps/finance/OfficeExpenseModal";
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
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";

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
  paidAt: string | null;
};

type FinanceTicket = {
  id: string;
  ticketNumber: string;
  title: string;
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
  projectName: string | null;
  paymentTransactions: PaymentTransaction[];
};

type FinanceDirectPurchase = {
  id: string;
  purchaseNumber: string;
  vendorName: string;
  totalAmount: string;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
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

const PAYMENT_HISTORY_PAGE_SIZE = 5;

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
}) {
  const router = useRouter();
  const legacyOperationalTabs = ["subcontract", "fuel-logs", "fuel-requests"];
  const tabAliases: Record<string, string> = {
    "po-check": "check",
    payments: "payment",
    check: "check",
    payment: "payment",
    history: "history",
    operations: "operations",
    ledger: "ledger",
    "office-expense": "office-expense",
  };
  const resolvedTab = legacyOperationalTabs.includes(initialTab ?? "")
    ? "operations"
    : tabAliases[initialTab ?? ""] ?? "check";
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [ledgerFundMode, setLedgerFundMode] = useState<
    "incoming" | "transfer" | null
  >(null);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"IN" | "OUT" | null>(
    null,
  );
  const [officeExpenseOpen, setOfficeExpenseOpen] = useState(false);
  const canManageOfficeExpenses =
    role === UserRole.FINANCE || role === UserRole.ADMINISTRATIONS;
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
  const [fuelDisbursementMethods, setFuelDisbursementMethods] = useState<
    Record<string, POPaymentMethod>
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
    ...tickets.map((ticket) => ({
      id: ticket.id,
      kind: "ticket" as const,
      reference: ticket.ticketNumber,
      title: ticket.title,
      grandTotal: Number(ticket.totalAmount ?? 0),
      paidAmount: ticket.paymentTransactions.reduce(
        (total, payment) => total + payment.amount,
        0,
      ),
      isFirstPayment: ticket.paymentTransactions.length === 0,
      transferDestination:
        ticket.transferDestination ??
        (ticket.vendorBankName && ticket.vendorAccountNumber
          ? `Ditransfer ke: ${ticket.vendorBankName}, ${ticket.vendorAccountNumber}, a.n. ${ticket.vendorAccountName ?? ""}`
          : ""),
      isInternalFunding: internalFundingCategories.some(
        (category) => category === ticket.requestCategory,
      ),
      requesterName: ticket.requesterName,
      receiptUrls: ticket.receiptUrls,
    })),
    ...standalonePayments.map((order) => ({
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
      transferDestination:
        order.paymentBankName && order.paymentAccountNumber
          ? `Ditransfer ke: ${order.paymentBankName}, ${order.paymentAccountNumber}, a.n. ${order.paymentAccountName ?? order.vendorName}`
          : "",
    })),
    ...directPurchases.map((purchase) => ({
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
      transferDestination:
        purchase.paymentBankName && purchase.paymentAccountNumber
          ? `Ditransfer ke: ${purchase.paymentBankName}, ${purchase.paymentAccountNumber}, a.n. ${purchase.paymentAccountName ?? purchase.vendorName}`
          : "",
    })),
  ].filter((row) => Number.isFinite(row.grandTotal) && row.grandTotal > 0);
  const pendingPaymentCount = paymentRows.filter(
    (row) => row.grandTotal - row.paidAmount > 0.005,
  ).length;
  const pendingPaymentRows = paymentRows.filter(
    (row) => row.grandTotal - row.paidAmount > 0.005,
  );
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
        if (result.success) router.refresh();
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
    const transferProof = data.get("transferProof");
    const financeAccountId = String(data.get("financeAccountId") ?? "");
    const input = {
      disbursementMethod,
      transferDestination: String(data.get("transferDestination") ?? ""),
      financeAccountId,
      financeNote: String(data.get("financeNote") ?? ""),
      ...(transferProof instanceof File && transferProof.size > 0
        ? { transferProof }
        : {}),
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
        if (result.success) router.refresh();
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
        if (result.success) router.refresh();
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
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pembayaran terlebih dahulu.");
      return;
    }
    const amount =
      currentPaymentType === PaymentType.FULL_PAYMENT
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
        const result: TicketActionResult = await submitPaymentRecord({
          target,
          files: receiptUrl,
          transferDestination,
          financeAccountId,
          paymentType: currentPaymentType,
          amount,
        });
        setMessage(result.message);
        if (result.success) {
          setReceiptUrl([]);
          setPaymentAmount("");
          setPaymentType(PaymentType.FULL_PAYMENT);
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
            {url.startsWith("/api/tickets/receipts/") && (
              <FinancePaymentProofReplacement
                paymentTransactionId={paymentTransactionId}
                label={label}
                onSaved={() => router.refresh()}
              />
            )}
          </div>
        );
      }

      return (
        <ActionIconButton
          type="button"
          label={`Lihat pratinjau ${label}`}
          tooltip={`Lihat foto ${label}`}
          icon={Eye}
          onClick={(event) => {
            event.stopPropagation();
            setReceiptPreview({ label, url });
          }}
        />
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <ActionIconButton
          label={`Lihat bukti transfer ${label}`}
          tooltip="Lihat Bukti Transfer"
          icon={ExternalLink}
          href={paymentReceiptHref(url)}
          target="_blank"
          rel="noreferrer"
          onLinkClick={(event) => event.stopPropagation()}
        />
        {url.startsWith("/api/tickets/receipts/") && (
          <FinancePaymentProofReplacement
            paymentTransactionId={paymentTransactionId}
            label={label}
            onSaved={() => router.refresh()}
          />
        )}
      </div>
    );
  };

  const renderPaymentProof = (
    paymentTransactionId: string,
    url: string | null,
    additionalUrls: string[],
    label: string,
  ) => {
    const urls = [url, ...additionalUrls].filter(
      (proofUrl): proofUrl is string => Boolean(proofUrl),
    );
    if (urls.length === 0) {
      return <span className="text-muted-foreground">Tidak ada bukti</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((proofUrl, index) => (
          <div key={`${proofUrl}-${index}`}>
            {renderSinglePaymentProof(
              paymentTransactionId,
              proofUrl,
              urls.length > 1 ? `${label} ${index + 1}` : label,
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
        transactions={dashboardTransactions}
        expenseCategories={expenseCategories}
        monthInflow={monthInflow}
        monthOutflow={monthOutflow}
        onNavigate={navigateFromDashboard}
        onOpenIncoming={openIncomingFund}
        onPreviewProof={(url, label) => setReceiptPreview({ url, label })}
      />

      <DocumentSignoffQueue
        tasks={documentSignoffTasks}
        title="Tanda Tangan & Konfirmasi Dokumen"
        description="Invoice ditandatangani Keuangan lalu diketahui Direktur. KO ditandatangani Logistik lalu diketahui Keuangan."
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-5"
      >
        <TabsList
          className={`grid h-auto w-full ${canManageOfficeExpenses ? "grid-cols-6" : "grid-cols-5"} gap-1 rounded-xl border border-border/70 bg-muted/40 p-1.5 min-[480px]:grid-cols-2 min-[480px]:gap-2 min-[480px]:p-2 xl:grid-cols-6`}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="check"
                aria-label={`Perlu Diperiksa (PO & Tiket), ${purchaseOrders.length}`}
                className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
              >
                <FileCheck2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                  1. Perlu Diperiksa (PO & Tiket)
                </span>
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  {purchaseOrders.length}
                </Badge>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Perlu Diperiksa (PO & Tiket)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="payment"
                aria-label={`Antrean Pembayaran, ${pendingPaymentCount}`}
                className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
              >
                <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                  2. Antrean Pembayaran
                </span>
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  {pendingPaymentCount}
                </Badge>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Antrean Pembayaran</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="history"
                aria-label={`Riwayat & Bukti Transfer, ${paymentHistoryRows.length}`}
                className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
              >
                <History className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                  3. Riwayat & Bukti Transfer
                </span>
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  {paymentHistoryRows.length}
                </Badge>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Riwayat & Bukti Transfer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="ledger"
                aria-label={`Buku Kas & Arus Dana, ${cashflows.length}`}
                className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
              >
                <Wallet className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                  4. Buku Kas &amp; Arus Dana
                </span>
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  {cashflows.length}
                </Badge>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Buku Kas & Arus Dana</TooltipContent>
          </Tooltip>
          {canManageOfficeExpenses && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="office-expense"
                  aria-label={`Pengeluaran Kantor & Tim, ${officeExpenses.length}`}
                  className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
                >
                  <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                    5. Pengeluaran Kantor &amp; Tim
                  </span>
                  <Badge
                    variant="secondary"
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                  >
                    {officeExpenses.length}
                  </Badge>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pengeluaran Kantor & Tim</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="operations"
                aria-label={`Operasional Lainnya, ${termyns.length + vehicleTripLogs.length + vehicleFuelRequests.length}`}
                className="relative h-11 min-h-11 min-w-0 justify-center gap-0 rounded-lg p-0 leading-none data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm min-[480px]:h-auto min-[480px]:justify-start min-[480px]:gap-2 min-[480px]:whitespace-normal min-[480px]:px-3 min-[480px]:py-2 min-[480px]:text-left min-[480px]:leading-snug"
              >
                <Fuel className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only min-[480px]:not-sr-only min-[480px]:min-w-0 min-[480px]:flex-1">
                  Operasional Lainnya
                </span>
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px] leading-none min-[480px]:static min-[480px]:h-auto min-[480px]:min-w-0 min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  {termyns.length + vehicleTripLogs.length + vehicleFuelRequests.length}
                </Badge>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Operasional Lainnya</TooltipContent>
          </Tooltip>
        </TabsList>

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
                  className="bg-orange-600 text-white hover:bg-orange-700"
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
                  <NativeDataTable itemLabel="pengeluaran">
                    <table className="app-data-table w-full min-w-[850px] text-left text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 pr-3">Tanggal</th>
                          <th className="py-2 pr-3">Penerima</th>
                          <th className="py-2 pr-3">Tipe</th>
                          <th className="py-2 pr-3 text-right">Nominal</th>
                          <th className="py-2 pr-3">Sumber Akun</th>
                          <th className="py-2">Status Bukti</th>
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
                              <td className="py-2">
                                <div className="flex flex-col items-start gap-1">
                                  <Badge variant="success">
                                    Lengkap · {expense.proofUrls.length} bukti
                                  </Badge>
                                  {expense.proofUrls.map((url, index) => (
                                    <ActionIconButton
                                      key={url}
                                      type="button"
                                      label={`Lihat bukti ${typeLabel} ${index + 1} untuk ${expense.recipientName}`}
                                      tooltip={`Lihat bukti ${index + 1}`}
                                      icon={Eye}
                                      onClick={() =>
                                        setReceiptPreview({
                                          url,
                                          label: `Bukti ${typeLabel} · ${expense.recipientName} (${index + 1})`,
                                        })
                                      }
                                    />
                                  ))}
                                </div>
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
              <CardTitle>PO Menunggu Checked By Finance</CardTitle>
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
                    ? "Tidak ada PO draft yang menunggu pemeriksaan."
                    : "Tidak ada PO yang cocok dengan pencarian."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nomor Ref</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviewOrders.map((order) => (
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
                          <TableCell>{order.vendorName}</TableCell>
                          <TableCell>
                            {new Date(order.createdAt).toLocaleDateString("id-ID")}
                          </TableCell>
                          <TableCell>{order.items.length}</TableCell>
                          <TableCell className="text-right">
                            {role === UserRole.FINANCE && !order.paidAt && (
                              <ActionIconButton
                                label={`Tandai PO ${order.poNumber} diperiksa`}
                                tooltip="Tandai Diperiksa"
                                icon={FileCheck2}
                                disabled={isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runReview(order.publicCode);
                                }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Pembelian langsung menunggu persetujuan eksekutif terlebih dahulu;
                setelah disetujui, tagihan masuk ke antrean pembayaran.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <div id="finance-payment-tab">
          <TabsContent value="payment">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Tagihan & Pembelian Disetujui</CardTitle>
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
                      <TableHead>Nomor Ref</TableHead>
                      <TableHead>Tagihan (Grand Total)</TableHead>
                      <TableHead>Total Terbayar</TableHead>
                      <TableHead>Sisa Hutang</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPendingPaymentRows.map((row) => {
                      const balance =
                        Math.round((row.grandTotal - row.paidAmount) * 100) /
                        100;
                      const outstanding = Math.max(0, balance);
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
                            <span className="font-semibold">{row.reference}</span>
                            <span className="block text-xs text-muted-foreground">
                              {row.title}
                            </span>
                          </TableCell>
                          <TableCell>{currency(row.grandTotal)}</TableCell>
                          <TableCell>{currency(row.paidAmount)}</TableCell>
                          <TableCell className="font-medium">
                            {currency(outstanding)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                balance <= 0
                                  ? "success"
                                  : row.paidAmount > 0
                                    ? "warning"
                                    : "error"
                              }
                            >
                              {balance <= 0
                                ? "LUNAS"
                                : row.paidAmount > 0
                                  ? "DIBAYAR SEBAGIAN"
                                  : "BELUM DIBAYAR"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {row.paidAmount > 0 && (
                                <ActionIconButton
                                  type="button"
                                  label={`Lihat bukti pembayaran ${row.title}`}
                                  tooltip="Lihat Bukti"
                                  icon={Eye}
                                  disabled={isPending}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openPaymentHistory(row);
                                  }}
                                />
                              )}
                              {outstanding > 0 && (
                                <ActionIconButton
                                  label={`Catat pembayaran ${row.title}`}
                                  tooltip={`Catat pembayaran ${row.title}`}
                                  icon={Wallet}
                                  disabled={
                                    isPending || role !== UserRole.FINANCE
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPaymentModalSelection({
                                      kind: row.kind,
                                      id: row.id,
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPendingPaymentRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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
                        Bukti pembayaran (PDF/JPG/PNG/WEBP, maks. 5 MB)
                        <Input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          required
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              setTermynReceipts((current) => ({
                                ...current,
                                [termyn.id]: file,
                              }));
                            }
                          }}
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
                        Bukti transfer retensi
                        <Input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          required
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              setRetentionReceipts((current) => ({
                                ...current,
                                [contract.id]: file,
                              }));
                            }
                          }}
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
                        <ActionIconButton
                          label={`Lihat bukti transfer permintaan ${request.doNumber}`}
                          tooltip="Lihat bukti transfer"
                          icon={ExternalLink}
                          href={photoDownloadHref(request.transferProofUrl)}
                          target="_blank"
                          rel="noreferrer"
                        />
                      )}
                    </div>
                  )}
                  {request.financeNote && (
                    <p className="text-sm text-muted-foreground">
                      Catatan Keuangan: {request.financeNote}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <ActionIconButton
                      label={`Lihat foto speedometer sebelum isi untuk DO ${request.doNumber}`}
                      tooltip="Foto speedometer sebelum isi"
                      icon={ExternalLink}
                      href={photoDownloadHref(request.beforeFillingPhotoUrl)}
                      target="_blank"
                      rel="noreferrer"
                    />
                    {request.afterFillingPhotoUrl && (
                      <ActionIconButton
                        label={`Lihat foto speedometer setelah isi untuk DO ${request.doNumber}`}
                        tooltip="Foto speedometer setelah isi"
                        icon={ExternalLink}
                        href={photoDownloadHref(request.afterFillingPhotoUrl)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    )}
                    {request.receiptPhotoUrl && (
                      <ActionIconButton
                        label={`Lihat bon BBM untuk DO ${request.doNumber}`}
                        tooltip="Bon BBM"
                        icon={ExternalLink}
                        href={photoDownloadHref(request.receiptPhotoUrl)}
                        target="_blank"
                        rel="noreferrer"
                      />
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
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            required
                            disabled={isPending}
                          />
                          <span className="text-xs text-muted-foreground">
                            PDF/JPG/PNG/WEBP, maksimal 5 MB.
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
                        className="grid gap-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 md:grid-cols-[1fr_auto]"
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
          </Tabs>
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
        description="Pemeriksaan dokumen dan transaksi tersimpan di satu panel."
        hideHeader={Boolean(previewOrder)}
        className="sm:max-w-2xl"
        footer={
          previewOrder ? undefined : (
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
          <div className={previewOrder ? "flex min-h-0 flex-1 flex-col" : "mt-6 space-y-4"}>
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
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                {activeStandaloneOrder.paidAt
                  ? `PO ini sudah lunas pada ${new Date(activeStandaloneOrder.paidAt).toLocaleDateString("id-ID")}.`
                  : "PO ini sudah lunas."}
                {activeStandaloneOrder.paymentReceiptUrl && (
                  <ActionIconButton
                    label={`Lihat bukti pelunasan PO ${activeStandaloneOrder.poNumber}`}
                    tooltip="Lihat bukti pelunasan"
                    icon={ExternalLink}
                    href={photoDownloadHref(
                      activeStandaloneOrder.paymentReceiptUrl,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  />
                )}
              </div>
            )}
            {activeStandaloneOrder?.vendorInvoiceUrl && (
              <ActionIconButton
                label={`Lihat invoice/bon PO ${activeStandaloneOrder.poNumber} dari Logistik`}
                tooltip="Lihat invoice/bon dari Logistik"
                icon={ExternalLink}
                href={photoDownloadHref(activeStandaloneOrder.vendorInvoiceUrl)}
                target="_blank"
                rel="noreferrer"
              />
            )}
            {activeStandaloneOrder && role === UserRole.FINANCE && !isPaymentSettled && (
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
                      activeStandaloneOrder.paymentBankName &&
                      activeStandaloneOrder.paymentAccountNumber
                        ? `Ditransfer ke: ${activeStandaloneOrder.paymentBankName} & ${activeStandaloneOrder.paymentAccountNumber}`
                        : "Pembayaran cash untuk restock gudang"
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
                <p className="text-sm">
                  Total tagihan: <strong>{currency(paymentTotal)}</strong> · Dibayar:{" "}
                  <strong>{currency(paidAmount)}</strong> · Sisa:{" "}
                  <strong>{currency(remainingAmount)}</strong>
                </p>
                {activeDirectPurchase.vendorInvoiceUrl && (
                  <ActionIconButton
                    label="Lihat invoice atau bon faktur pembelian langsung"
                    tooltip="Lihat Invoice / BON Faktur"
                    icon={ExternalLink}
                    href={photoDownloadHref(activeDirectPurchase.vendorInvoiceUrl)}
                    target="_blank"
                    rel="noreferrer"
                  />
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
                    <div className="space-y-2">
                      <Label htmlFor="direct-purchase-transfer-destination">
                        Tujuan Transfer (Bank, No Rekening, Atas Nama)
                      </Label>
                      <Input
                        key={activeDirectPurchase.id}
                        id="direct-purchase-transfer-destination"
                        name="transferDestination"
                        defaultValue={
                          activeDirectPurchase.paymentBankName &&
                          activeDirectPurchase.paymentAccountNumber
                            ? `Ditransfer ke: ${activeDirectPurchase.paymentBankName}, ${activeDirectPurchase.paymentAccountNumber}, a.n. ${activeDirectPurchase.paymentAccountName ?? activeDirectPurchase.vendorName}`
                            : ""
                        }
                        placeholder="Bank, nomor rekening, atas nama penerima"
                        maxLength={300}
                        required
                        disabled={isPending}
                      />
                    </div>
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
                        (currentPaymentType !== PaymentType.FULL_PAYMENT &&
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
                <div className="space-y-1 rounded-lg border p-4 text-sm">
                  <p>
                    Nilai: <strong>{currency(activeTicket.totalAmount)}</strong>
                  </p>
                  {activeTicket.requestCategory ===
                    TicketRequestCategory.APH && (
                    <>
                      <p>
                        Type pembayaran:{" "}
                        {activeTicket.requestPaymentMethod ===
                        POPaymentMethod.CASH
                          ? "Cash"
                          : "Transfer"}
                      </p>
                      {activeTicket.requestPaymentMethod ===
                        POPaymentMethod.TRANSFER && (
                        <p>
                          Tujuan transfer:{" "}
                          {activeTicket.transferDestination || "—"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">
                        Keterangan:{" "}
                        {activeTicket.requestPaymentDescription || "—"}
                      </p>
                    </>
                  )}
                  <p>Penerima: {activeTicket.recipientName ?? "Tidak dicantumkan"}</p>
                  <p>Bank: {activeTicket.bankName ?? "Tidak dicantumkan"}</p>
                  <p>Rekening: {activeTicket.accountNumber ?? "Tidak dicantumkan"}</p>
                  <p>Rekening PO: {activeTicket.vendorBankName ?? "Tidak dicantumkan"} · {activeTicket.vendorAccountNumber ?? "—"} · {activeTicket.vendorAccountName ?? "—"}</p>
                  <p>
                    Total dibayar: <strong>{currency(paidAmount)}</strong> ·
                    Sisa tagihan: <strong>{currency(remainingAmount)}</strong>
                  </p>
                  {activeTicket.purchaseReceiptUrl && (
                    <ActionIconButton
                      label={`Lihat invoice atau bon dari Logistik untuk tiket ${activeTicket.ticketNumber}`}
                      tooltip="Lihat invoice/bon dari Logistik"
                      icon={ExternalLink}
                      href={photoDownloadHref(activeTicket.purchaseReceiptUrl)}
                      target="_blank"
                      rel="noreferrer"
                    />
                  )}
                </div>
                <DocumentPdfGenerator
                  key={`TICKET:${activeTicket.id}`}
                  recordType="TICKET"
                  recordId={activeTicket.id}
                  documentNumber={activeTicket.ticketNumber}
                  templates={documentTemplates}
                />
                {role === UserRole.FINANCE && (
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
                        (currentPaymentType !== PaymentType.FULL_PAYMENT &&
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
            ? `${selectedPaymentRow.kind}:${selectedPaymentRow.id}:${selectedPaymentRow.grandTotal}:${selectedPaymentRow.paidAmount}:${selectedPaymentRow.isFirstPayment}`
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
    </div>
  );
}
