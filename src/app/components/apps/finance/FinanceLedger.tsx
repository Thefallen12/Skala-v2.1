"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import { createFinanceAccount } from "@/app/actions/finance-cashflow";
import IncomingFundModal, {
  type FinanceAccountOption,
  type FinanceProjectOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { withLocalPhotoPreview } from "@/lib/photo-urls";
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
  proofUrl: string;
  createdAt: string;
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
};

export default function FinanceLedger({
  accounts,
  cashflows,
  historicalPayments,
  projects,
  canManage,
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
  fundMode: "incoming" | "outgoing" | "transfer" | null;
  onFundModeChange: (mode: "incoming" | "outgoing" | "transfer" | null) => void;
  typeFilter: "IN" | "OUT" | null;
  onTypeFilterChange: (filter: "IN" | "OUT" | null) => void;
  onPreviewProof: (url: string, label: string) => void;
}) {
  const router = useRouter();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
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

      return {
        id: `cf-${cf.id}`,
        createdAt: cf.createdAt,
        direction: cf.type,
        badgeLabel,
        description: cf.sourceDesc,
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
        proofUrl: cf.proofUrl ? withLocalPhotoPreview(cf.proofUrl) : null,
      };
    });

    const histRows: UnifiedLedgerRow[] = historicalPayments.map((hp) => ({
      id: `hp-${hp.id}`,
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
    const accountName = String(formData.get("accountName") ?? "");
    const accountNumber = String(formData.get("accountNumber") ?? "");
    const holderName = String(formData.get("holderName") ?? "");

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
          return;
        }
        form.reset();
        setAccountModalOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Create finance account failed:", error);
        setAccountMessage("Gagal membuat buku bank/kas. Silakan coba kembali.");
      }
    });
  };

  const renderProofAction = (proofUrl: string | null, label: string) => {
    if (!proofUrl) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    if (isImageUrl(proofUrl)) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPreviewProof(proofUrl, label)}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <Eye className="size-3.5" />
          Lihat Bukti
        </Button>
      );
    }
    return (
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
      >
        <a href={proofUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="size-3.5" />
          Buka Dokumen
        </a>
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Bagian Atas: Kartu Saldo Buku Bank / Kas */}
      <Card className="p-5 space-y-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">BUKU KAS &amp; REKENING</Badge>
              <span className="text-xs text-muted-foreground">
                Total Saldo Gabungan:{" "}
                <strong className="text-foreground">
                  {currency(totalBalance)}
                </strong>
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              Daftar Rekening Bank, E-Wallet &amp; Kas Tunai
            </h2>
            <p className="text-xs text-muted-foreground">
              Klik salah satu kartu rekening untuk menyaring buku mutasi khusus rekening tersebut.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAccountModalOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Tambah Rekening / Kas
              </Button>
              <Button
                type="button"
                onClick={() => onFundModeChange("incoming")}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="size-4" />
                Catat Dana Masuk
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onFundModeChange("outgoing")}
                className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Minus className="size-4" />
                Catat Dana Keluar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onFundModeChange("transfer")}
                className="gap-1.5"
              >
                <ArrowRightLeft className="size-4" />
                Transfer Antar Kas
              </Button>
            </div>
          )}
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada buku bank atau kas. Klik{" "}
            <strong>Tambah Rekening / Kas</strong> untuk memulai pencatatan.
          </div>
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
                        <p className="truncate font-semibold text-foreground">
                          {account.accountName}
                        </p>
                        {isSelected && (
                          <Badge variant="default" className="text-[10px]">
                            Aktif
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {account.accountNumber
                          ? `${account.accountNumber} · ${account.holderName}`
                          : `Kas Tunai · ${account.holderName}`}
                      </p>
                    </div>
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-4 text-xl font-bold tracking-tight tabular-nums text-foreground">
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
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              Tidak ada transaksi yang sesuai dengan filter saat ini.
            </div>
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
                      <p className="font-semibold text-foreground">
                        {row.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </p>
                    </div>
                    <Badge variant={isIn ? "default" : "outline"}>
                      {row.badgeLabel}
                    </Badge>
                  </div>
                  <p
                    className={`text-base font-bold tabular-nums ${
                      isIn ? "text-foreground" : "text-primary"
                    }`}
                  >
                    {isIn ? "+" : "-"}
                    {currency(row.amount)}
                  </p>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <p>
                      Buku Kas/Bank:{" "}
                      <strong className="text-foreground">
                        {row.accountName}
                      </strong>
                    </p>
                    <p>Metode: {row.methodAndCounterparty}</p>
                    {row.subDescription && <p>{row.subDescription}</p>}
                  </div>
                  <div className="pt-1">
                    {renderProofAction(row.proofUrl, row.description)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tabel Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <Table>
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
                    className="py-8 text-center text-muted-foreground"
                  >
                    Tidak ada catatan mutasi yang sesuai dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                visibleLedgerRows.map((row) => {
                  const isIn = row.direction === "IN";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isIn ? "default" : "outline"}>
                          {row.badgeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {row.description}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.subDescription}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {row.accountName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.methodAndCounterparty}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums whitespace-nowrap ${
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
                        {renderProofAction(row.proofUrl, row.description)}
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
        onClose={() => setAccountModalOpen(false)}
        title="Tambah Rekening / Buku Kas"
        icon={<Wallet aria-hidden="true" className="size-5" />}
        description="Daftarkan rekening bank, e-wallet, atau kas tunai. Saldo awal akun baru adalah Rp 0."
        className="max-h-[calc(100dvh-1rem)] sm:max-h-[85vh] sm:max-w-md"
        bodyClassName="overscroll-y-contain"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountModalOpen(false)}
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
            <select
              id="finance-account-name"
              name="accountName"
              required
              defaultValue=""
              className="border-input focus-visible:ring-ring h-10 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
            >
              <option value="" disabled>
                Pilih bank, e-wallet, atau kas tunai
              </option>
              <optgroup label="Bank">
                {financeInstitutions.Bank.map((institution) => (
                  <option key={institution} value={institution}>
                    {institution}
                  </option>
                ))}
              </optgroup>
              <optgroup label="E-Wallet">
                {financeInstitutions.Ewallet.map((institution) => (
                  <option key={institution} value={institution}>
                    {institution}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Kas Tunai">
                {financeInstitutions.Cash.map((institution) => (
                  <option key={institution} value={institution}>
                    {institution}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-account-number">
              Nomor Rekening (opsional untuk Kas Tunai)
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
            <p className="text-sm text-destructive" role="alert">
              {accountMessage}
            </p>
          )}
        </form>
      </GlobalModal>
    </div>
  );
}
