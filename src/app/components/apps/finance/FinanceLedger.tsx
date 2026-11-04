"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createFinanceAccount,
  recordHistoricalPaymentCashflow,
} from "@/app/actions/finance-cashflow";
import IncomingFundModal, {
  type FinanceAccountOption,
  type FinanceProjectOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  Wallet,
} from "lucide-react";

export type FinanceCashflowRow = {
  id: string;
  type: string;
  amount: number;
  sourceDesc: string;
  paymentMethod: string;
  senderName: string | null;
  transferGroupId: string | null;
  proofUrl: string | null;
  createdAt: string;
  account: { id: string; accountName: string };
  project: { kelompokTani: string | null } | null;
  recorder: { name: string | null };
};

export type FinanceHistoricalPayment = {
  id: string;
  amount: number;
  paidAt: string;
  paymentType: string;
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

const financeInstitutions = {
  Bank: [
    "Bank Syariah Indonesia (BSI)",
    "Bank Syariah Aceh (BPD)",
    "Bank Mandiri",
    "Bank BCA",
    "Bank BTN",
    "Bank BNI",
    "Seabank",
    "Bank Jago",
  ],
  Ewallet: ["DANA", "OVO", "GoPay", "ShopeePay"],
  Cash: ["Kas Tunai"],
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
  fundMode: "incoming" | "transfer" | null;
  onFundModeChange: (mode: "incoming" | "transfer" | null) => void;
  typeFilter: "IN" | "OUT" | null;
  onTypeFilterChange: (type: "IN" | "OUT" | null) => void;
  onPreviewProof: (url: string, label: string) => void;
}) {
  const router = useRouter();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountSelections, setAccountSelections] = useState<
    Record<string, string>
  >({});
  const [historicalMessage, setHistoricalMessage] = useState("");
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const hasCashAccount = accounts.some(
    (account) => account.accountName === "Kas Tunai",
  );

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setAccountMessage("");
    startTransition(async () => {
      try {
        const result = await createFinanceAccount({
          accountName: String(formData.get("accountName") ?? ""),
          accountNumber: String(formData.get("accountNumber") ?? ""),
          holderName: String(formData.get("holderName") ?? ""),
        });
        setAccountMessage(result.message);
        if (result.success) {
          setAccountModalOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Finance account form submission failed:", error);
        setAccountMessage("Akun keuangan gagal dibuat. Silakan coba kembali.");
      }
    });
  };

  const addCashAccount = () => {
    setAccountMessage("");
    startTransition(async () => {
      try {
        const result = await createFinanceAccount({
          accountName: "Kas Tunai",
          holderName: "Kas Perusahaan",
        });
        setAccountMessage(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Cash account creation failed:", error);
        setAccountMessage("Akun Kas Tunai gagal dibuat. Silakan coba kembali.");
      }
    });
  };

  const submitHistoricalPayment = (
    event: FormEvent<HTMLFormElement>,
    payment: FinanceHistoricalPayment,
  ) => {
    event.preventDefault();
    const financeAccountId = accountSelections[payment.id];
    if (!financeAccountId) {
      setHistoricalMessage("Pilih rekening sumber untuk pembayaran historis.");
      return;
    }

    setHistoricalMessage("");
    setRecordingPaymentId(payment.id);
    startTransition(async () => {
      try {
        const result = await recordHistoricalPaymentCashflow({
          paymentTransactionId: payment.id,
          financeAccountId,
        });
        setHistoricalMessage(result.message);
        if (result.success) {
          setAccountSelections((current) => {
            const updated = { ...current };
            delete updated[payment.id];
            return updated;
          });
          router.refresh();
        }
      } catch (error) {
        console.error("Historical payment recording failed:", error);
        setHistoricalMessage(
          "Pembayaran historis gagal dicatat. Saldo rekening tidak diubah.",
        );
      } finally {
        setRecordingPaymentId(null);
      }
    });
  };

  const ledgerEntries = [
    ...cashflows.map((cashflow) => ({
      kind: "cashflow" as const,
      id: cashflow.id,
      timestamp: new Date(cashflow.createdAt).getTime(),
      cashflow,
    })),
    ...historicalPayments.map((payment) => ({
      kind: "historical" as const,
      id: payment.id,
      timestamp: new Date(payment.paidAt).getTime(),
      payment,
    })),
  ].sort((first, second) => second.timestamp - first.timestamp);
  const visibleLedgerEntries = ledgerEntries.filter((entry) => {
    if (selectedAccountId) {
      return (
        entry.kind === "cashflow" &&
        entry.cashflow.account.id === selectedAccountId &&
        entry.cashflow.type === "OUT" &&
        entry.cashflow.transferGroupId === null
      );
    }
    if (!typeFilter) return true;
    return entry.kind === "historical"
      ? typeFilter === "OUT"
      : entry.cashflow.type === typeFilter;
  });
  const selectAccount = (accountId: string) => {
    setSelectedAccountId((current) =>
      current === accountId ? null : accountId,
    );
    window.requestAnimationFrame(() => {
      document
        .getElementById("finance-cashflow-history")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Buku Kas & Arus Dana</h2>
          <p className="text-sm text-muted-foreground">
            Saldo setiap rekening dan kas berdasarkan transaksi yang tercatat.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountModalOpen(true)}
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Tambah Rekening / Kas
            </Button>
            {!hasCashAccount && (
              <Button
                type="button"
                variant="outline"
                onClick={addCashAccount}
                disabled={isPending}
              >
                <Wallet className="mr-2 size-4" aria-hidden="true" />
                Tambah Kas Tunai
              </Button>
            )}
            <Button
              type="button"
              onClick={() => onFundModeChange("incoming")}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <ArrowDownLeft className="mr-2 size-4" aria-hidden="true" />
              Catat Dana Masuk
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onFundModeChange("transfer")}
              disabled={accounts.length < 2}
            >
              <ArrowLeftRight className="mr-2 size-4" aria-hidden="true" />
              Transfer Antar Kas
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Hanya Keuangan yang dapat mengubah saldo dan mencatat transaksi.
          </p>
        )}
      </div>

      {accounts.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Pilih rekening untuk melihat riwayat transaksinya di bawah.
            </p>
            {selectedAccountId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedAccountId(null)}
              >
                Tampilkan semua rekening
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <Card
              key={account.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedAccountId === account.id}
              className={`cursor-pointer transition-colors hover:border-primary ${
                selectedAccountId === account.id
                  ? "border-primary ring-1 ring-primary"
                  : ""
              }`}
              onClick={() => selectAccount(account.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectAccount(account.id);
                }
              }}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{account.accountName}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    a.n. {account.holderName}
                    {account.accountNumber
                      ? ` · Rekening ${account.accountNumber}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <Wallet className="ml-auto size-5 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-xl font-bold text-primary">
                    {currency(account.balance)}
                  </p>
                  <p className="text-xs text-muted-foreground">Saldo saat ini</p>
                </div>
              </CardHeader>
            </Card>
          ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Wallet className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-semibold">Belum ada buku bank atau kas.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tambahkan akun penyimpanan dana sebelum mencatat penerimaan.
            </p>
          </CardContent>
        </Card>
      )}

      {accountMessage && !accountModalOpen && (
        <p className="text-sm text-muted-foreground" role="status">
          {accountMessage}
        </p>
      )}

      <Card id="finance-cashflow-history" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>
            {selectedAccountId
              ? `Riwayat Pembelanjaan / Pembayaran · ${
                  accounts.find((account) => account.id === selectedAccountId)
                    ?.accountName ?? "Rekening"
                }`
              : "Riwayat Arus Dana"}
          </CardTitle>
          {selectedAccountId ? (
            <p className="text-sm text-muted-foreground">
              Menampilkan riwayat pembelanjaan dan pembayaran dari rekening ini.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={typeFilter === null ? "default" : "outline"}
                onClick={() => onTypeFilterChange(null)}
              >
                Semua
              </Button>
              <Button
                type="button"
                size="sm"
                variant={typeFilter === "IN" ? "default" : "outline"}
                onClick={() => onTypeFilterChange("IN")}
              >
                Dana Masuk
              </Button>
              <Button
                type="button"
                size="sm"
                variant={typeFilter === "OUT" ? "default" : "outline"}
                onClick={() => onTypeFilterChange("OUT")}
              >
                Dana Keluar
              </Button>
            </div>
          )}
          {!selectedAccountId &&
            historicalPayments.length > 0 &&
            typeFilter !== "IN" && (
            <p className="text-sm text-muted-foreground">
              Pembayaran lama yang belum dicatat ditampilkan bersama arus kas.
              Pilih rekening sumber pada baris tersebut untuk mencatatnya dan
              mengurangi saldo.
            </p>
            )}
        </CardHeader>
        <CardContent>
          {historicalMessage && (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              {historicalMessage}
            </p>
          )}
          <NativeDataTable itemLabel="transaksi">
            <table className="app-data-table w-full min-w-[920px] text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-3 py-3 font-semibold">Tanggal</th>
                  <th className="px-3 py-3 font-semibold">Tipe</th>
                  <th className="px-3 py-3 font-semibold">Sumber / Deskripsi</th>
                  <th className="px-3 py-3 font-semibold">Nominal</th>
                  <th className="px-3 py-3 font-semibold">Akun</th>
                  <th className="px-3 py-3 font-semibold">Metode</th>
                  <th className="px-3 py-3 font-semibold">Bukti</th>
                </tr>
              </thead>
              <tbody>
                {visibleLedgerEntries.map((entry) => {
                  if (entry.kind === "historical") {
                    const { payment } = entry;
                    return (
                      <tr key={`historical-${payment.id}`} className="border-t">
                        <td className="whitespace-nowrap px-3 py-3">
                          {new Date(payment.paidAt).toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="warning">
                            <ArrowUpRight
                              className="mr-1 size-3"
                              aria-hidden="true"
                            />
                            Dana Keluar · Belum dicatat
                          </Badge>
                        </td>
                        <td className="max-w-[360px] px-3 py-3">
                          <p className="font-medium">{payment.sourceDesc}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.category} ·{" "}
                            {payment.paymentType === "DOWN_PAYMENT"
                              ? "DP"
                              : payment.paymentType === "PROGRESS_PAYMENT"
                                ? "Termin"
                                : "Pelunasan"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-rose-700">
                          -{currency(payment.amount)}
                        </td>
                        <td className="px-3 py-3">
                          <form
                            className="flex min-w-[280px] items-center gap-2"
                            onSubmit={(event) =>
                              submitHistoricalPayment(event, payment)
                            }
                          >
                            <select
                              aria-label={`Pilih rekening sumber untuk ${payment.sourceDesc}`}
                              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                              value={accountSelections[payment.id] ?? ""}
                              onChange={(event) =>
                                setAccountSelections((current) => ({
                                  ...current,
                                  [payment.id]: event.target.value,
                                }))
                              }
                              disabled={
                                !canManage ||
                                accounts.length === 0 ||
                                isPending
                              }
                            >
                              <option value="">
                                {accounts.length
                                  ? "Pilih rekening"
                                  : "Buat rekening terlebih dahulu"}
                              </option>
                              {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.accountName}
                                </option>
                              ))}
                            </select>
                            {canManage && (
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  !accountSelections[payment.id] ||
                                  isPending ||
                                  accounts.length === 0
                                }
                              >
                                {recordingPaymentId === payment.id
                                  ? "Mencatat..."
                                  : "Catat"}
                              </Button>
                            )}
                          </form>
                        </td>
                        <td className="px-3 py-3">
                          {payment.proofUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="link"
                              className="h-auto p-0"
                              onClick={() =>
                                onPreviewProof(
                                  payment.proofUrl!,
                                  `Bukti transfer ${payment.sourceDesc}`,
                                )
                              }
                            >
                              Lihat Bukti
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Bukti belum tersedia
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const { cashflow } = entry;
                  return (
                    <tr key={cashflow.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-3">
                        {new Date(cashflow.createdAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            cashflow.transferGroupId
                              ? "secondary"
                              : cashflow.type === "IN"
                                ? "lightSuccess"
                                : "warning"
                          }
                        >
                          {cashflow.transferGroupId ? (
                            <ArrowLeftRight
                              className="mr-1 size-3"
                              aria-hidden="true"
                            />
                          ) : cashflow.type === "IN" ? (
                            <ArrowDownLeft
                              className="mr-1 size-3"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowUpRight
                              className="mr-1 size-3"
                              aria-hidden="true"
                            />
                          )}
                          {cashflow.transferGroupId
                            ? cashflow.type === "IN"
                              ? "Transfer Masuk"
                              : "Transfer Keluar"
                            : cashflow.type === "IN"
                              ? "Dana Masuk"
                              : "Dana Keluar"}
                        </Badge>
                      </td>
                      <td className="max-w-[360px] px-3 py-3">
                        <p className="font-medium">{cashflow.sourceDesc}</p>
                        {cashflow.project && (
                          <p className="text-xs text-muted-foreground">
                            Proyek: {cashflow.project.kelompokTani || "—"}
                          </p>
                        )}
                        {cashflow.senderName && (
                          <p className="text-xs text-muted-foreground">
                            Pengirim: {cashflow.senderName}
                          </p>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 font-semibold ${
                          cashflow.type === "IN"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {cashflow.type === "IN" ? "+" : "-"}
                        {currency(cashflow.amount)}
                      </td>
                      <td className="px-3 py-3">
                        {cashflow.account.accountName}
                      </td>
                      <td className="px-3 py-3">
                        {cashflow.transferGroupId
                          ? "Antar rekening"
                          : cashflow.paymentMethod.startsWith("HISTORICAL_")
                            ? (
                                <>
                                  {cashflow.paymentMethod === "HISTORICAL_CASH"
                                    ? "Tunai"
                                    : "Transfer"}
                                  <span className="block text-xs text-muted-foreground">
                                    Histori · saldo telah dikurangi
                                  </span>
                                </>
                              )
                            : cashflow.paymentMethod === "DEPOSIT"
                              ? "Setor Tunai"
                              : cashflow.paymentMethod === "CASH"
                                ? "Tunai"
                                : "Transfer"}
                      </td>
                      <td className="px-3 py-3">
                        {cashflow.proofUrl ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="link"
                            className="h-auto p-0"
                            onClick={() =>
                              onPreviewProof(
                                cashflow.proofUrl!,
                                `Bukti transaksi ${cashflow.sourceDesc}`,
                              )
                            }
                          >
                            Lihat Bukti
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Bukti belum tersedia
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleLedgerEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      {selectedAccountId
                        ? "Belum ada riwayat pembelanjaan atau pembayaran pada rekening ini."
                        : typeFilter
                        ? `Belum ada transaksi dana ${typeFilter === "IN" ? "masuk" : "keluar"}.`
                        : "Belum ada transaksi arus kas."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </NativeDataTable>
          <p className="mt-3 text-xs text-muted-foreground">
            Ditampilkan hingga 200 transaksi terbaru. Saldo berubah otomatis
            saat pembayaran baru, dana masuk, atau transfer antar akun dicatat.
            Pembayaran lama yang dimasukkan sebagai histori juga mengurangi
            saldo akun sumber.
          </p>
        </CardContent>
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
          setAccountMessage("");
        }}
        title="Tambah Rekening / Kas"
        icon={<Wallet aria-hidden="true" className="size-5" />}
        description="Daftarkan rekening atau e-wallet. Saldo awal akun baru adalah Rp 0."
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
              className="border-input focus-visible:ring-ring w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
            >
              <option value="" disabled>
                Pilih bank, e-wallet, atau kas
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
              <optgroup label="Kas">
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
              Nomor Rekening (opsional)
            </Label>
            <Input
              id="finance-account-number"
              name="accountNumber"
              maxLength={80}
              placeholder="Kosongkan untuk kas tunai"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-account-holder">Atas Nama / Pemegang Kas</Label>
            <Input
              id="finance-account-holder"
              name="holderName"
              required
              maxLength={120}
              placeholder="Nama perusahaan atau pemegang kas"
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
