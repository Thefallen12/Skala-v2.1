"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Filter,
  Search,
  Truck,
  Wrench,
  Building2,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import type { RentalItemRow, RentalPaymentStatus } from "@/app/actions/rentals";
import { processRentalPayment } from "@/app/actions/rentals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import { NativeDataTable } from "@/components/ui/native-data-table";

type FinanceAccountOption = {
  id: string;
  accountName: string;
  holderName?: string;
  accountNumber: string | null;
  balance: number;
};

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function RentalBillingQueue({
  rentals = [],
  financeAccounts = [],
  canManage = true,
}: {
  rentals: RentalItemRow[];
  financeAccounts: FinanceAccountOption[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [filterTab, setFilterTab] = useState<"PENDING" | "PAID" | "ALL">("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalItemRow | null>(null);

  // Form states
  const [formAccountId, setFormAccountId] = useState(financeAccounts[0]?.id ?? "");
  const [formProofUrl, setFormProofUrl] = useState("");
  const [formBankName, setFormBankName] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formAccountName, setFormAccountName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Statistics
  const pendingRentals = useMemo(
    () => rentals.filter((r) => r.paymentStatus === "PENDING_PAYMENT"),
    [rentals],
  );
  const totalPendingAmount = useMemo(
    () => pendingRentals.reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0),
    [pendingRentals],
  );
  const paidRentals = useMemo(
    () => rentals.filter((r) => r.paymentStatus === "PAID"),
    [rentals],
  );
  const totalPaidAmount = useMemo(
    () => paidRentals.reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0),
    [paidRentals],
  );

  // Filtered list
  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      if (filterTab === "PENDING" && r.paymentStatus !== "PENDING_PAYMENT") return false;
      if (filterTab === "PAID" && r.paymentStatus !== "PAID") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesVendor = r.vendorName.toLowerCase().includes(q);
        const matchesPlate = (r.codeOrPlate ?? "").toLowerCase().includes(q);
        const matchesProject = (r.projectName ?? "").toLowerCase().includes(q);
        if (!matchesName && !matchesVendor && !matchesPlate && !matchesProject) return false;
      }
      return true;
    });
  }, [rentals, filterTab, searchQuery]);

  const openPaymentModal = (rental: RentalItemRow) => {
    setSelectedRental(rental);
    setFormBankName(rental.paymentBankName ?? "");
    setFormAccountNumber(rental.paymentAccountNumber ?? "");
    setFormAccountName(rental.paymentAccountName ?? "");
    setFormProofUrl("");
    setFormNotes("");
    setFormAccountId(financeAccounts[0]?.id ?? "");
    setActionMessage(null);
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRental) return;

    if (!formProofUrl.trim()) {
      setActionMessage({ text: "Harap isi link / URL bukti transfer pembayaran.", error: true });
      return;
    }

    setActionMessage(null);
    startTransition(async () => {
      const res = await processRentalPayment({
        rentalId: selectedRental.id,
        proofOfPaymentUrl: formProofUrl.trim(),
        paymentBankName: formBankName.trim() || undefined,
        paymentAccountNumber: formAccountNumber.trim() || undefined,
        paymentAccountName: formAccountName.trim() || undefined,
        financeNotes: formNotes.trim() || undefined,
        financeAccountId: formAccountId || undefined,
      });

      if (res.success) {
        setPaymentModalOpen(false);
        requestNotificationFeedRefresh();
        router.refresh();
      } else {
        setActionMessage({ text: res.message, error: true });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tagihan Menunggu Pembayaran
            </CardTitle>
            <Clock className="size-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {pendingRentals.length} Unit
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              Total: {formatCurrency(totalPendingAmount)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Diajukan oleh tim logistik lapangan
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tagihan Sewa Sudah Lunas
            </CardTitle>
            <CheckCircle2 className="size-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {paidRentals.length} Unit
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              Total: {formatCurrency(totalPaidAmount)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Telah ditransfer &amp; tercatat ke arus kas
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Seluruh Unit Disewa
            </CardTitle>
            <Truck className="size-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {rentals.length} Kontrak Sewa
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Alat berat, molen, genset &amp; armada pengangkut
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <span>Antrean Tagihan Sewa Alat &amp; Kendaraan</span>
                <Badge variant="outline" className="text-xs">
                  {filteredRentals.length} Tagihan
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Tinjau tagihan sewa harian, mingguan, maupun bulanan yang diajukan oleh tim Logistik Lapangan untuk diproses pencairannya.
              </CardDescription>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-2 border-t">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari unit, vendor, nopol, proyek..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Status Filter Tab Pills */}
            <div className="flex h-9 items-center rounded-lg border bg-background/80 p-1 text-xs">
              <span className="px-2 text-muted-foreground flex items-center gap-1 font-medium whitespace-nowrap">
                <Filter className="size-3.5" /> Status Tagihan:
              </span>
              <button
                type="button"
                onClick={() => setFilterTab("PENDING")}
                className={`h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterTab === "PENDING"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Menunggu Pembayaran ({pendingRentals.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("PAID")}
                className={`h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterTab === "PAID"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Sudah Lunas ({paidRentals.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("ALL")}
                className={`h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterTab === "ALL"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Semua ({rentals.length})
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <NativeDataTable itemLabel="tagihan sewa">
            <table className="app-data-table w-full min-w-[900px] text-sm">
              <thead className="bg-[#102A4D] text-left text-white text-xs">
                <tr>
                  <th className="p-3">Unit Sewa</th>
                  <th className="p-3">Vendor / Pemilik &amp; Rekening</th>
                  <th className="p-3">Periode &amp; Durasi</th>
                  <th className="p-3">Jadwal Sewa</th>
                  <th className="p-3 text-right">Total Tagihan</th>
                  <th className="p-3">Status Pembayaran</th>
                  <th className="p-3">Proyek</th>
                  {canManage && <th className="p-3 text-center w-36">Aksi Keuangan</th>}
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filteredRentals.map((r) => {
                  const isPaid = r.paymentStatus === "PAID";
                  const isPendingPay = r.paymentStatus === "PENDING_PAYMENT";
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                      {/* Unit Sewa */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {r.type === "EQUIPMENT" ? "🚜" : "🚚"}
                          </span>
                          <div>
                            <span className="font-semibold text-primary block text-sm">
                              {r.name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              {r.category && <span>{r.category}</span>}
                              {r.codeOrPlate && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
                                  {r.codeOrPlate}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Vendor & Rekening */}
                      <td className="p-3">
                        <span className="font-semibold text-foreground block">{r.vendorName}</span>
                        {r.vendorPhone && (
                          <span className="text-[11px] text-muted-foreground block">
                            📞 {r.vendorPhone}
                          </span>
                        )}
                        <div className="mt-1 text-[11px] text-primary/80 font-mono bg-muted/50 rounded px-1.5 py-0.5 inline-block">
                          {r.paymentBankName || "Bank —"}: {r.paymentAccountNumber || "No Rek —"}
                          {r.paymentAccountName && ` (a/n ${r.paymentAccountName})`}
                        </div>
                      </td>

                      {/* Periode & Durasi */}
                      <td className="p-3">
                        <span className="font-semibold text-xs text-foreground block">
                          Sewa {r.rentalPeriodType === "DAILY" ? "Harian" : r.rentalPeriodType === "WEEKLY" ? "Mingguan" : "Bulanan"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.duration} {r.rentalPeriodType === "DAILY" ? "Hari" : r.rentalPeriodType === "WEEKLY" ? "Minggu" : "Bulan"}
                        </span>
                      </td>

                      {/* Jadwal Sewa */}
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-xs text-foreground">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                          <span>
                            {new Date(r.startDate).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          s/d {new Date(r.endDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>

                      {/* Total Tagihan */}
                      <td className="p-3 text-right">
                        <div className="font-bold text-sm text-primary">
                          {formatCurrency(r.totalCost)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Tarif: {formatCurrency(r.ratePerPeriod)}
                        </span>
                      </td>

                      {/* Status Pembayaran */}
                      <td className="p-3">
                        {isPaid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                              <CheckCircle2 className="size-3" /> Lunas
                            </span>
                            {r.paidAt && (
                              <span className="block text-[10px] text-muted-foreground">
                                {new Date(r.paidAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                        ) : isPendingPay ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                              <Clock className="size-3" /> Menunggu Pembayaran
                            </span>
                            {r.billingSubmittedAt && (
                              <span className="block text-[10px] text-muted-foreground">
                                Diajukan {new Date(r.billingSubmittedAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border">
                            Belum Diajukan Logistik
                          </span>
                        )}
                      </td>

                      {/* Proyek */}
                      <td className="p-3">
                        <span className="font-medium text-xs text-foreground block max-w-[180px] truncate" title={r.projectName ?? "-"}>
                          {r.projectName ?? "Tanpa proyek"}
                        </span>
                      </td>

                      {/* Aksi Keuangan */}
                      {canManage && (
                        <td className="p-3 text-center">
                          {isPaid ? (
                            r.proofOfPaymentUrl ? (
                              <a
                                href={r.proofOfPaymentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                              >
                                <ExternalLink className="size-3.5" /> Bukti Bayar
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">Lunas</span>
                            )
                          ) : (
                            <Button
                              type="button"
                              onClick={() => openPaymentModal(r)}
                              className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm gap-1"
                            >
                              <CreditCard className="size-3.5" /> Bayar Tagihan
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filteredRentals.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="size-10 text-muted-foreground/40 mb-2" />
                        <p className="font-semibold text-sm">Tidak ada tagihan sewa pada status ini</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Tagihan sewa yang diajukan oleh tim logistik lapangan akan muncul di antrean ini.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </NativeDataTable>
        </CardContent>
      </Card>

      {/* Payment Confirmation Modal */}
      <GlobalModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Proses Pembayaran Tagihan Sewa"
        description="Konfirmasi pelunasan tagihan sewa alat / kendaraan dan catat otomatis ke Arus Kas Keuangan."
        className="sm:max-w-xl"
      >
        {selectedRental && (
          <form onSubmit={handleConfirmPayment} className="mt-4 space-y-4">
            {actionMessage && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  actionMessage.error
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                }`}
              >
                {actionMessage.text}
              </div>
            )}

            {/* Bill Summary Banner */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Unit Sewa:</span>
                  <p className="text-sm font-bold text-primary">
                    {selectedRental.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vendor: <strong className="text-foreground">{selectedRental.vendorName}</strong>
                    {selectedRental.projectName && ` · ${selectedRental.projectName}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Total Tagihan:</span>
                  <div className="text-lg font-bold text-emerald-600">
                    {formatCurrency(selectedRental.totalCost)}
                  </div>
                </div>
              </div>
            </div>

            {/* Vendor Bank Details */}
            <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Building2 className="size-3.5 text-primary" /> Rekening Tujuan Transfer (Vendor)
              </span>
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <div>
                  <Label className="text-[11px] font-semibold text-foreground block mb-1">Nama Bank</Label>
                  <Input
                    placeholder="mis. BCA / Mandiri"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-foreground block mb-1">No. Rekening</Label>
                  <Input
                    placeholder="1234567890"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    className="h-8 text-xs bg-background font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-foreground block mb-1">Atas Nama Rekening</Label>
                  <Input
                    placeholder="Nama pemilik rekening"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Source Account & Proof */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">
                  Rekening Kas / Bank Pembayar (Buku Keuangan) *
                </Label>
                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  required
                  className="h-9 w-full rounded-md border bg-background px-3 text-xs font-medium"
                >
                  {financeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountName} — Saldo: {formatCurrency(acc.balance)}{acc.accountNumber ? ` (${acc.accountNumber})` : ""}
                    </option>
                  ))}
                  {financeAccounts.length === 0 && (
                    <option value="">— Tidak ada buku kas aktif —</option>
                  )}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saldo akun kas/bank yang dipilih akan otomatis dipotong sebesar {formatCurrency(selectedRental.totalCost)}.
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">
                  Link / URL Bukti Transfer Pelunasan *
                </Label>
                <Input
                  placeholder="https://... atau path bukti bayar"
                  value={formProofUrl}
                  onChange={(e) => setFormProofUrl(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">
                  Catatan Pembayaran (Opsional)
                </Label>
                <Input
                  placeholder="Catatan pelunasan, nomor referensi bank..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentModalOpen(false)}
                disabled={isPending}
                className="h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="h-9 px-5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
              >
                <CheckCircle2 className="size-4" />
                {isPending ? "Memproses Pembayaran..." : "Konfirmasi Pembayaran Lunas"}
              </Button>
            </div>
          </form>
        )}
      </GlobalModal>
    </div>
  );
}
