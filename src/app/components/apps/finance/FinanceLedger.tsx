"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CreditCard,
  ExternalLink,
  Eye,
  Landmark,
  Minus,
  Pencil,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import {
  createFinanceAccount,
  replaceCashflowProof,
} from "@/app/actions/finance-cashflow";
import FinancePaymentProofReplacement, {
  type ReplacingProofTarget,
} from "@/app/components/apps/finance/FinancePaymentProofReplacement";
import IncomingFundModal, {
  type FinanceAccountOption,
  type FinanceProjectOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { parseClientAssetCode, withLocalPhotoPreview } from "@/lib/photo-urls";
import { PaymentType } from "@prisma/client";

export type FinanceAccountCard = FinanceAccountOption;

export type FinanceCashflowRow = {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  sourceDesc: string;
  paymentMethod: "TRANSFER" | "CASH" | "DEPOSIT" | null;
  senderName: string | null;
  transferGroupId: string | null;
  proofUrl: string | null;
  createdAt: string;
  paymentTransactionId: string | null;
  paymentTransaction: {
    proofOfTransferUrl: string | null;
    proofEditDisabledUrls?: string[];
    ticket: { ticketNumber: string; title: string } | null;
    po: {
      poNumber: string;
      vendorName: string;
      ticket: { ticketNumber: string; title: string } | null;
    } | null;
    directStockPurchase: {
      purchaseNumber: string;
      vendorName: string;
      ticket: { ticketNumber: string; title: string } | null;
    } | null;
  } | null;
  account: { id: string; accountName: string };
  project: { kelompokTani: string } | null;
  recorder: { name: string };
};

export type FinanceHistoricalPayment = {
  id: string;
  amount: number;
  paidAt: string;
  paymentType: PaymentType;
  proofUrl: string | null;
  proofEditDisabledUrls?: string[];
  category: string;
  sourceDesc: string;
};

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const isImageUrl = (url: string) =>
  /\.(?:jpe?g|png|webp)$/i.test(url.split(/[?#]/, 1)[0]);

const isLegacySharedProofUrl = (url: string | null) =>
  Boolean(url && /\/file\.(?:jpe?g|png|webp|pdf)(?:[?#]|$)/i.test(url));

const isCashflowProofFolderUrl = (url: string | null) =>
  Boolean(url && url.includes("cashflow_proofs/"));

const isPdfProofUrl = (url: string) =>
  /\.pdf(?:[?#]|$)/i.test(url.split(/[?#]/, 1)[0]) ||
  url.startsWith("/api/tickets/receipts/");

const paymentMethodLabel = (
  method: "TRANSFER" | "CASH" | "DEPOSIT" | string | null,
) => {
  if (method === "CASH") return "Kas Tunai (Cash)";
  if (method === "DEPOSIT") return "Setor Tunai / Deposit";
  return "Transfer Bank";
};

const financeInstitutions = {
  Bank: [
    "Bank BCA",
    "Bank Mandiri",
    "Bank BNI",
    "Bank BRI",
    "Bank BSI",
    "Bank CIMB Niaga",
    "Bank Permata",
    "Bank Danamon",
    "Bank BTN",
    "Bank Syariah Lainnya",
  ],
  Ewallet: ["GoPay", "OVO", "Dana", "ShopeePay", "LinkAja"],
  Cash: ["Kas Kecil (Petty Cash)", "Kas Operasional Tunai", "Kas Proyek Tunai"],
} as const;

const paymentTypeLabel = (type: PaymentType) => {
  if (type === PaymentType.DOWN_PAYMENT) return "Down Payment";
  if (type === PaymentType.PROGRESS_PAYMENT) return "Termin";
  return "Pelunasan";
};

const getAccountIcon = (accountName: string) => {
  if (/ovo|gopay|dana|shopeepay|linkaja/i.test(accountName)) {
    return CreditCard;
  }
  if (/kas|petty|tunai/i.test(accountName)) {
    return Wallet;
  }
  return Landmark;
};

type UnifiedLedgerRow = {
  id: string;
  cashflowId: string | null;
  createdAt: string;
  direction: "IN" | "OUT";
  badgeLabel: string;
  description: string;
  subDescription: string;
  accountId: string | null;
  accountName: string;
  methodAndCounterparty: string;
  amount: number;
  proofUrl: string | null;
  rawProofUrl: string | null;
  proofEditDisabledUrls: string[];
  paymentTransactionId: string | null;
};

export default function FinanceLedger({
  accounts,
  cashflows,
  historicalPayments,
  projects,
  canManage,
  canEditProof = false,
  fundMode,
  onFundModeChange,
  typeFilter,
  onTypeFilterChange,
  onPreviewProof,
}: {
  accounts: FinanceAccountOption[];
  cashflows: FinanceCashflowRow[];
  historicalPayments: FinanceHistoricalPayment[];
  projects: FinanceProjectOption[];
  canManage: boolean;
  canEditProof?: boolean;
  fundMode: "incoming" | "outgoing" | "transfer" | null;
  onFundModeChange: (mode: "incoming" | "outgoing" | "transfer" | null) => void;
  typeFilter: "IN" | "OUT" | null;
  onTypeFilterChange: (filter: "IN" | "OUT" | null) => void;
  onPreviewProof: (
    url: string,
    label: string,
    paymentTransactionId?: string | null,
  ) => void;
}) {
  const router = useRouter();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [replacingProofTarget, setReplacingProofTarget] =
    useState<ReplacingProofTarget | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? null;

  const totalBalance = accounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  );

  const allLedgerRows = useMemo<UnifiedLedgerRow[]>(() => {
    const cfRows: UnifiedLedgerRow[] = cashflows.map((cf) => {
      const isIn = cf.type === "IN";
      const badgeLabel = cf.transferGroupId
        ? isIn
          ? "Transfer Masuk"
          : "Transfer Keluar"
        : isIn
          ? "Dana Masuk"
          : "Kas Keluar";
      const payment = cf.paymentTransaction;
      const paymentTicket =
        payment?.ticket ??
        payment?.po?.ticket ??
        payment?.directStockPurchase?.ticket;
      const description = paymentTicket
        ? `Pembayaran ${paymentTicket.ticketNumber} · ${paymentTicket.title}`
        : payment?.po
          ? `Pembayaran ${payment.po.poNumber} · ${payment.po.vendorName}`
          : payment?.directStockPurchase
            ? `Pembayaran ${payment.directStockPurchase.purchaseNumber} · ${payment.directStockPurchase.vendorName}`
            : cf.sourceDesc;
      const rawProofUrl = payment?.proofOfTransferUrl ?? cf.proofUrl ?? null;

      return {
        id: `cf-${cf.id}`,
        cashflowId: cf.id,
        createdAt: cf.createdAt,
        direction: cf.type,
        badgeLabel,
        description,
        subDescription: [
          cf.project?.kelompokTani ? `Proyek: ${cf.project.kelompokTani}` : null,
          `Oleh ${cf.recorder.name}`,
        ]
          .filter(Boolean)
          .join(" · "),
        accountId: cf.account.id,
        accountName: cf.account.accountName,
        methodAndCounterparty: [
          paymentMethodLabel(cf.paymentMethod),
          cf.senderName,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: cf.amount,
        proofUrl: rawProofUrl ? withLocalPhotoPreview(rawProofUrl) : null,
        rawProofUrl,
        proofEditDisabledUrls: payment?.proofEditDisabledUrls ?? [],
        paymentTransactionId: cf.paymentTransactionId,
      };
    });

    const histRows: UnifiedLedgerRow[] = historicalPayments.map((hp) => ({
      id: `hp-${hp.id}`,
      cashflowId: null,
      createdAt: hp.paidAt,
      direction: "OUT" as const,
      badgeLabel: `${hp.category} (${paymentTypeLabel(hp.paymentType)})`,
      description: hp.sourceDesc,
      subDescription: `Pembayaran ${hp.category}`,
      accountId: null,
      accountName: "Riwayat Pembayaran",
      methodAndCounterparty: paymentTypeLabel(hp.paymentType),
      amount: hp.amount,
      proofUrl: hp.proofUrl ? withLocalPhotoPreview(hp.proofUrl) : null,
      rawProofUrl: hp.proofUrl ?? null,
      proofEditDisabledUrls: hp.proofEditDisabledUrls ?? [],
      paymentTransactionId: hp.id,
    }));

    return [...cfRows, ...histRows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [cashflows, historicalPayments]);

  const selectedAccountStats = useMemo(() => {
    if (!selectedAccount) return null;
    let totalIn = 0;
    let totalOut = 0;
    for (const row of allLedgerRows) {
      if (row.accountId !== selectedAccount.id) continue;
      if (row.direction === "IN") totalIn += row.amount;
      else totalOut += row.amount;
    }
    return { totalIn, totalOut };
  }, [allLedgerRows, selectedAccount]);

  const visibleLedgerRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allLedgerRows.filter((row) => {
      if (selectedAccount && row.accountId !== selectedAccount.id) {
        return false;
      }
      if (typeFilter && row.direction !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.description.toLowerCase().includes(q) ||
        row.subDescription.toLowerCase().includes(q) ||
        row.accountName.toLowerCase().includes(q) ||
        row.badgeLabel.toLowerCase().includes(q) ||
        row.methodAndCounterparty.toLowerCase().includes(q)
      );
    });
  }, [allLedgerRows, selectedAccount, typeFilter, searchQuery]);

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const accountName = newAccountName.trim();
    const accountNumber = String(formData.get("accountNumber") ?? "");
    const holderName = String(formData.get("holderName") ?? "");

    if (!accountName) {
      setAccountMessage("Pilih jenis rekening / kas terlebih dahulu.");
      return;
    }

    setAccountMessage("");
    startTransition(async () => {
      try {
        const result = await createFinanceAccount({
          accountName,
          accountNumber,
          holderName,
        });
        if (!result.success) {
          setAccountMessage(result.message);
          toast.error(result.message);
          return;
        }
        toast.success(result.message || "Rekening / buku kas ditambahkan.");
        form.reset();
        setNewAccountName("");
        setAccountModalOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Create finance account failed:", error);
        const errMsg = "Gagal membuat buku bank/kas. Silakan coba kembali.";
        setAccountMessage(errMsg);
        toast.error(errMsg);
      }
    });
  };

  const renderProofAction = (row: UnifiedLedgerRow) => {
    const {
      proofUrl,
      rawProofUrl,
      description,
      cashflowId,
      paymentTransactionId,
      proofEditDisabledUrls,
    } = row;
    if (!proofUrl || !rawProofUrl) {
      if (canEditProof && cashflowId) {
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setReplacingProofTarget({
                targetKey: `cf:${cashflowId}`,
                label: description,
                buttonLabel: "Ganti",
                allowAllProofFormats: true,
                onSubmitFile: async (file) => {
                  const formData = new FormData();
                  formData.set("cashflowId", cashflowId);
                  formData.set("proof", file);
                  return replaceCashflowProof(formData);
                },
              })
            }
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Unggah Bukti
          </Button>
        );
      }
      return <span className="type-p3 text-muted-foreground">—</span>;
    }

    const isImage = isImageUrl(proofUrl);
    const isLegacySharedProof = isLegacySharedProofUrl(rawProofUrl);
    const isEditableCashflowFolder = isCashflowProofFolderUrl(rawProofUrl);
    const isProofEditDisabled = proofEditDisabledUrls.includes(rawProofUrl);

    const canReplaceViaPaymentTransaction =
      canEditProof &&
      Boolean(paymentTransactionId) &&
      !isProofEditDisabled &&
      !isLegacySharedProof &&
      !isEditableCashflowFolder &&
      (isImage || isPdfProofUrl(rawProofUrl));

    const canReplaceViaCashflow =
      canEditProof &&
      Boolean(cashflowId) &&
      (!paymentTransactionId ||
        isLegacySharedProof ||
        isEditableCashflowFolder);

    const openCashflowReplacement = () => {
      if (!cashflowId) return;
      setReplacingProofTarget({
        targetKey: `cf:${cashflowId}`,
        label: description,
        buttonLabel: isImage ? "Edit" : "Ganti",
        allowAllProofFormats: true,
        onSubmitFile: async (file) => {
          const formData = new FormData();
          formData.set("cashflowId", cashflowId);
          formData.set("proof", file);
          return replaceCashflowProof(formData);
        },
      });
    };

    const assetMeta = parseClientAssetCode(rawProofUrl);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {assetMeta && (
          <Badge
            variant="outline"
            className="font-mono text-[10px]"
            title={`${assetMeta.kindLabel} (${assetMeta.assetCode})`}
          >
            {assetMeta.assetCode}
          </Badge>
        )}
        {isLegacySharedProof && (
          <Badge
            variant="outlineWarning"
            title="URL bukti lama (/file.*) berpotensi tertukar dengan transaksi lain — disarankan diganti"
          >
            Bukti Lama
          </Badge>
        )}
        {isImage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPreviewProof(proofUrl, description, paymentTransactionId)}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            Lihat Bukti
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <a href={proofUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Buka Dokumen
            </a>
          </Button>
        )}
        {canReplaceViaPaymentTransaction && paymentTransactionId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setReplacingProofTarget({
                targetKey: `pt:${paymentTransactionId}:0`,
                paymentTransactionId,
                existingProofUrl: rawProofUrl,
                proofIndex: 0,
                label: description,
                buttonLabel: isImage ? "Edit" : "Unggah Ulang",
              })
            }
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {isImage ? "Edit" : "Ganti"}
          </Button>
        ) : canReplaceViaCashflow ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              isLegacySharedProof
                ? "border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:text-amber-400"
                : undefined
            }
            title={
              isLegacySharedProof
                ? "Ganti bukti lama (/file.*) dengan berkas transaksi yang benar"
                : undefined
            }
            onClick={openCashflowReplacement}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {isImage ? "Edit" : "Ganti"}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Bagian Atas: Kartu Saldo Buku Bank / Kas */}
      <Card className="p-5 space-y-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Buku Kas</Badge>
              <span className="type-p3 text-muted-foreground">
                Total Saldo:{" "}
                <strong className="text-foreground">
                  {currency(totalBalance)}
                </strong>
              </span>
            </div>
            <h2 className="type-h2 mt-1 text-foreground">
              Rekening Bank, E-Wallet &amp; Kas
            </h2>
            <p className="type-p3 text-muted-foreground">
              Klik kartu rekening untuk menyaring mutasi khusus rekening tersebut.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAccountModalOpen(true)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Tambah Akun
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                onClick={() => onFundModeChange("incoming")}
              >
                <Plus className="size-4" aria-hidden="true" />
                Dana Masuk
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onFundModeChange("outgoing")}
              >
                <Minus className="size-4" aria-hidden="true" />
                Dana Keluar
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onFundModeChange("transfer")}
              >
                <ArrowRightLeft className="size-4" aria-hidden="true" />
                Transfer Kas
              </Button>
            </div>
          )}
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Belum ada buku bank atau kas"
            description="Tambahkan rekening bank, e-wallet, atau kas tunai untuk memulai pencatatan."
            action={
              canManage ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAccountModalOpen(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Tambah Akun
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {accounts.map((account) => {
              const Icon = getAccountIcon(account.accountName);
              const isSelected = selectedAccount?.id === account.id;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() =>
                    setSelectedAccountId(isSelected ? null : account.id)
                  }
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs"
                      : "border-border/80 bg-muted/15 hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="type-p1 truncate font-semibold text-foreground">
                          {account.accountName}
                        </p>
                        {isSelected && <Badge variant="default">Aktif</Badge>}
                      </div>
                      <p className="type-p3 mt-0.5 truncate text-muted-foreground">
                        {account.accountNumber
                          ? `${account.accountNumber} · ${account.holderName}`
                          : `Kas Tunai · ${account.holderName}`}
                      </p>
                    </div>
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="type-kpi mt-4 text-foreground">
                    {currency(account.balance)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bagian Bawah: Tabel Buku Mutasi Arus Kas */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            {selectedAccount ? (
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-7 px-2 text-xs text-primary"
                  onClick={() => setSelectedAccountId(null)}
                >
                  <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
                  Kembali ke Semua Buku Kas
                </Button>
                <h2 className="text-base font-bold text-foreground">
                  Buku Mutasi Rekening: {selectedAccount.accountName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedAccount.accountNumber ?? "Kas Tunai"} · Atas Nama{" "}
                  <strong>{selectedAccount.holderName}</strong>
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Buku Besar Mutasi Arus Kas (Semua Rekening)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Menampilkan {visibleLedgerRows.length} catatan transaksi dari seluruh buku kas/bank.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari uraian, proyek, pengirim..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="flex items-center rounded-lg border border-border p-0.5">
              {(
                [
                  [null, "Semua Mutasi"],
                  ["IN", "Dana Masuk (+)"],
                  ["OUT", "Dana Keluar (-)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onTypeFilterChange(value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    typeFilter === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ringkasan Akun Terpilih */}
        {selectedAccount && selectedAccountStats && (
          <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted-foreground">
                Saldo Saat Ini ({selectedAccount.accountName})
              </span>
              <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                {currency(selectedAccount.balance)}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                Total Dana Masuk ke Akun Ini
              </span>
              <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                +{currency(selectedAccountStats.totalIn)}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                Total Dana Keluar dari Akun Ini
              </span>
              <p className="mt-0.5 text-base font-bold tabular-nums text-primary">
                -{currency(selectedAccountStats.totalOut)}
              </p>
            </div>
          </div>
        )}

        {/* Daftar Mobile */}
        <div className="space-y-3 md:hidden">
          {visibleLedgerRows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Tidak ada catatan mutasi"
              description="Belum ada transaksi yang sesuai dengan filter saat ini."
            />
          ) : (
            visibleLedgerRows.map((row) => {
              const isIn = row.direction === "IN";
              return (
                <div
                  key={row.id}
                  className="space-y-2.5 rounded-xl border border-border/80 bg-muted/10 p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="type-p1 font-semibold text-foreground">
                        {row.description}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </p>
                    </div>
                    <Badge variant={isIn ? "default" : "outline"}>
                      {row.badgeLabel}
                    </Badge>
                  </div>
                  <p
                    className={`type-h3 tabular-nums ${
                      isIn ? "text-foreground" : "text-primary"
                    }`}
                  >
                    {isIn ? "+" : "-"}
                    {currency(row.amount)}
                  </p>
                  <div className="type-p3 grid gap-1 text-muted-foreground">
                    <p>
                      Buku Kas/Bank:{" "}
                      <strong className="text-foreground">
                        {row.accountName}
                      </strong>
                    </p>
                    <p>Metode: {row.methodAndCounterparty}</p>
                    {row.subDescription && <p>{row.subDescription}</p>}
                  </div>
                  <div className="flex justify-end pt-1">
                    {renderProofAction(row)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tabel Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <Table pageSize={10} itemLabel="mutasi">
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Deskripsi &amp; Proyek</TableHead>
                <TableHead>Buku Kas / Bank</TableHead>
                <TableHead>Metode &amp; Pihak Terkait</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead className="text-right">Bukti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLedgerRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="type-p2 py-8 text-center text-muted-foreground"
                  >
                    Tidak ada catatan mutasi yang sesuai dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                visibleLedgerRows.map((row) => {
                  const isIn = row.direction === "IN";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="type-p3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isIn ? "default" : "outline"}>
                          {row.badgeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="type-p2 font-medium text-foreground">
                          {row.description}
                        </div>
                        <div className="type-p3 text-muted-foreground">
                          {row.subDescription}
                        </div>
                      </TableCell>
                      <TableCell className="type-p2 font-medium">
                        {row.accountName}
                      </TableCell>
                      <TableCell className="type-p3 text-muted-foreground">
                        {row.methodAndCounterparty}
                      </TableCell>
                      <TableCell
                        className={`type-p2 text-right font-semibold tabular-nums whitespace-nowrap ${
                          isIn ? "text-foreground" : "text-primary"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {isIn ? (
                            <ArrowDownLeft
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowUpRight
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                          {isIn ? "+" : "-"}
                          {currency(row.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {renderProofAction(row)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <IncomingFundModal
        open={fundMode !== null}
        onClose={() => onFundModeChange(null)}
        mode={fundMode ?? "incoming"}
        accounts={accounts}
        projects={projects}
      />

      <GlobalModal
        isOpen={accountModalOpen}
        onClose={() => {
          setAccountModalOpen(false);
          setNewAccountName("");
          setAccountMessage("");
        }}
        title="Tambah Rekening / Kas"
        icon={<Wallet aria-hidden="true" className="size-5" />}
        description="Daftarkan rekening bank, e-wallet, atau kas tunai. Saldo awal akun baru adalah Rp 0."
        className="max-h-[calc(100dvh-1rem)] sm:max-h-[85vh] sm:max-w-md"
        bodyClassName="overscroll-y-contain"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAccountModalOpen(false);
                setNewAccountName("");
                setAccountMessage("");
              }}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="finance-account-form"
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Simpan Akun"}
            </Button>
          </>
        }
      >
        <form
          id="finance-account-form"
          className="space-y-4"
          onSubmit={submitAccount}
        >
          <div className="space-y-2">
            <Label htmlFor="finance-account-name">Jenis Rekening / Kas</Label>
            <Select
              value={newAccountName}
              onValueChange={setNewAccountName}
              disabled={isPending}
            >
              <SelectTrigger id="finance-account-name" className="w-full">
                <SelectValue placeholder="Pilih bank, e-wallet, atau kas tunai" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Bank</SelectLabel>
                  {financeInstitutions.Bank.map((institution) => (
                    <SelectItem key={institution} value={institution}>
                      {institution}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>E-Wallet</SelectLabel>
                  {financeInstitutions.Ewallet.map((institution) => (
                    <SelectItem key={institution} value={institution}>
                      {institution}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Kas Tunai</SelectLabel>
                  {financeInstitutions.Cash.map((institution) => (
                    <SelectItem key={institution} value={institution}>
                      {institution}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-account-number">
              Nomor Rekening (opsional untuk Kas)
            </Label>
            <Input
              id="finance-account-number"
              name="accountNumber"
              maxLength={80}
              placeholder="Contoh: 1234567890"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-account-holder">
              Atas Nama / Pemegang Kas
            </Label>
            <Input
              id="finance-account-holder"
              name="holderName"
              required
              maxLength={120}
              placeholder="Contoh: PT. Skala Prioritas Engineering"
            />
          </div>
          {accountMessage && (
            <p className="type-p2 text-destructive" role="alert">
              {accountMessage}
            </p>
          )}
        </form>
      </GlobalModal>

      <FinancePaymentProofReplacement
        key={
          replacingProofTarget
            ? (replacingProofTarget.targetKey ??
              `${replacingProofTarget.paymentTransactionId ?? ""}:${replacingProofTarget.proofIndex ?? 0}`)
            : "ledger-proof-replace-closed"
        }
        open={replacingProofTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReplacingProofTarget(null);
        }}
        showTrigger={false}
        paymentTransactionId={replacingProofTarget?.paymentTransactionId}
        existingProofUrl={replacingProofTarget?.existingProofUrl}
        proofIndex={replacingProofTarget?.proofIndex}
        label={replacingProofTarget?.label ?? ""}
        buttonLabel={replacingProofTarget?.buttonLabel ?? "Edit"}
        allowAllProofFormats={replacingProofTarget?.allowAllProofFormats}
        onSubmitFile={replacingProofTarget?.onSubmitFile}
        onSaved={() => {
          setReplacingProofTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}
