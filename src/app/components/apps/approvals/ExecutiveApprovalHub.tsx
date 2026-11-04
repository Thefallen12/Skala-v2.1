"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approvePurchaseOrder,
} from "@/app/actions/orders";
import {
  approveBAST,
  approveProjectAddendum,
  approveSubkonContract,
  approveSubkonTermyn,
} from "@/app/actions/construction";
import { approveProjectWorkPointWage } from "@/app/actions/project";
import {
  approveDirectStockPurchaseByDirector,
  approveByDirector,
  rejectTicketByDirector,
  requestTicketRevisionByDirector,
} from "@/app/actions/tickets";
import ErpHubBrand from "@/app/components/apps/erp/ErpHubBrand";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BASTType,
  POPaymentMethod,
  TicketType,
  UserRole,
} from "@prisma/client";
import { FileText, Wallet, HardHat } from "lucide-react";

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
  type: TicketType;
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
  totalAmount: string;
  createdAt: string;
  createdByName: string;
  items: { itemName: string; quantity: string; unit: string }[];
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
  projectName: string;
};

type ApprovalAddendum = {
  id: string;
  addendumNumber: string;
  budgetChange: string;
  timeExtension: number;
  reason: string;
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

const currency = (amount: number | string | null) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

function isExecutive(role: UserRole) {
  return role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR;
}

function QueueTable({
  rows,
  emptyText,
  onSelect,
}: {
  rows: { id: string; title: string; detail: string; amount: string }[];
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item Persetujuan</TableHead>
            <TableHead>Rincian</TableHead>
            <TableHead className="text-right">Nominal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              tabIndex={0}
              role="button"
              className="cursor-pointer"
              onClick={() => onSelect(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row.id);
                }
              }}
            >
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell className="text-muted-foreground">{row.detail}</TableCell>
              <TableCell className="text-right font-medium">{row.amount}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-10 text-center text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
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
  };
  const [activeTab, setActiveTab] = useState(
    tabAliases[initialTab ?? ""] ?? "po",
  );
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
                  result.approvedAt ??
                  dateLabel(new Date().toISOString()),
              });
            }
          }
          setSelection(null);
          setTicketDecision(null);
          setTicketDecisionReason("");
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
        ? rejectTicketByDirector(
            selectedTicket.id,
            selectedTicket.type,
            reason,
          )
        : requestTicketRevisionByDirector(
            selectedTicket.id,
            selectedTicket.type,
            reason,
          ),
    );
  };

  const poRows = purchaseOrders.map((order) => ({
    id: order.publicCode,
    title: `${order.poNumber} · ${order.vendorName}`,
    detail: `${order.ticketNumber ? `Tiket ${order.ticketNumber}` : "PO non-tiket"} · ${order.items.length} item · ${dateLabel(order.createdAt)}`,
    amount: currency(
      order.items.reduce((total, item) => total + item.totalPrice, 0) *
        (order.includeTax ? 1.11 : 1),
    ),
  }));
  const directPurchaseRows = [
    ...directPurchases.map((purchase) => ({
      id: `purchase:${purchase.id}`,
      title: `${purchase.purchaseNumber} · Pembelian langsung`,
      detail: `${purchase.vendorName} · ${purchase.createdByName} · ${dateLabel(purchase.createdAt)}`,
      amount: currency(purchase.totalAmount),
    })),
    ...tickets.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      title: `${ticket.ticketNumber} · ${ticket.title}`,
      detail: `${ticket.requesterName} · ${ticket.projectName ?? "Gudang umum"} · ${dateLabel(ticket.createdAt)}`,
      amount: currency(ticket.totalAmount),
    })),
  ];
  const approvalHistoryLabels: Record<string, string> = {
    APPROVED: "Disetujui",
    APPROVED_BY_DIR: "Disetujui",
    REJECTED_BY_DIR: "Ditolak",
    REVISION_REQUESTED_BY_DIR: "Minta Revisi",
  };
  const wageRows = [
    ...wages.map((wage) => ({
      id: `wage:${wage.id}`,
      title: `${wage.projectName} · ${wage.title}`,
      detail: `${wage.location ?? "Lokasi belum dicatat"} · Pengusul ${wage.proposedByName} · Usulan upah`,
      amount: currency(wage.proposedTotalWage),
    })),
    ...termyns.map((termyn) => ({
      id: `termyn:${termyn.id}`,
      title: `${termyn.contractNumber} · Termin ${termyn.termynNumber}`,
      detail: `${termyn.subkonName} · ${termyn.projectName} · ${termyn.claimedPercent}%`,
      amount: currency(termyn.netAmount),
    })),
    ...contracts.map((contract) => ({
      id: `contract:${contract.publicCode}`,
      title: `${contract.contractNumber} · SPK Subkon`,
      detail: `${contract.subkonName} · ${contract.projectName}`,
      amount: currency(contract.contractValue),
    })),
    ...addendums.map((addendum) => ({
      id: `addendum:${addendum.id}`,
      title: `${addendum.addendumNumber} · Addendum/CCO`,
      detail: `${addendum.projectName} · ${addendum.timeExtension} hari`,
      amount: currency(addendum.budgetChange),
    })),
    ...bastDocuments.map((bast) => ({
      id: `bast:${bast.id}`,
      title: `${bast.bastNumber} · BAST ${bast.type}`,
      detail: `${bast.projectName} · ${dateLabel(bast.date)}`,
      amount: "—",
    })),
  ];

  const selectRow = (kind: Exclude<Selection, null>["kind"]) => (key: string) => {
    setMessage("");
    setSignedPo(null);
    setTicketDecision(null);
    setTicketDecisionReason("");
    if (kind === "po") setSelection({ kind, id: key });
    else if (kind === "ticket") setSelection({ kind, id: key });
    else if (kind === "direct-purchase") setSelection({ kind, id: key });
    else if (kind === "wage") setSelection({ kind, id: key });
    else if (kind === "termyn") setSelection({ kind, id: key });
    else if (kind === "contract") setSelection({ kind, id: key });
    else if (kind === "addendum") setSelection({ kind, id: key });
    else setSelection({ kind: "bast", id: key });
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

  return (
    <div className="space-y-5">
      <ErpHubBrand
        title="Executive Approval Hub"
        description="Satu pusat kendali untuk persetujuan PO, dana pembelian, tiket, upah, termin, dan dokumen proyek."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-muted p-2">
          <TabsTrigger value="po" className="gap-2">
            <FileText className="size-4" />
            Persetujuan PO <Badge variant="secondary">{purchaseOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="direct-purchase" className="gap-2">
            <Wallet className="size-4" />
            Dana Beli Langsung & Tiket
            <Badge variant="secondary">
              {directPurchases.length + tickets.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="wages" className="gap-2">
            <HardHat className="size-4" />
            Usulan Upah & Subkon
            <Badge variant="secondary">{wageRows.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="po">
          <Card>
            <CardHeader>
              <CardTitle>PO yang Sudah Diperiksa Keuangan</CardTitle>
            </CardHeader>
            <CardContent>
              <QueueTable
                rows={poRows}
                emptyText="Tidak ada PO yang menunggu tanda tangan."
                onSelect={selectRow("po")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="direct-purchase">
          <Card>
            <CardHeader>
              <CardTitle>Persetujuan Dana Pembelian dan Tiket</CardTitle>
            </CardHeader>
            <CardContent>
              <QueueTable
                rows={directPurchaseRows}
                emptyText="Tidak ada pembelian langsung atau tiket yang menunggu persetujuan."
                onSelect={chooseFinancialRow}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wages">
          <Card>
            <CardHeader>
              <CardTitle>Persetujuan Upah, Termin, dan Dokumen Proyek</CardTitle>
            </CardHeader>
            <CardContent>
              <QueueTable
                rows={wageRows}
                emptyText="Tidak ada usulan upah atau subkon yang menunggu persetujuan."
                onSelect={chooseWageRow}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Laporan Riwayat Persetujuan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Riwayat terbaru persetujuan dokumen, pembelian, tiket, upah, termin, dan proyek.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Dokumen / Referensi</TableHead>
                  <TableHead>Keputusan</TableHead>
                  <TableHead>Oleh / Waktu</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvalHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">{entry.category}</TableCell>
                    <TableCell className="min-w-56 font-medium">{entry.reference}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {approvalHistoryLabels[entry.action] ?? entry.action}
                    </TableCell>
                    <TableCell className="min-w-40 text-xs">
                      <p>{entry.actorName}</p>
                      <p className="text-muted-foreground">
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(entry.createdAt))}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-48 max-w-md whitespace-pre-wrap text-xs text-muted-foreground">
                      {entry.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {approvalHistory.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada riwayat persetujuan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {message && (
        <p
          className="rounded-md border border-border bg-background p-3 text-sm text-foreground"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
      {signedPo && (
        <Card>
          <CardHeader>
            <CardTitle>
              PO {qrTitle || signedPo.order.poNumber} telah disetujui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 p-4">
              <Image
                src={signedPo.qrDataUrl}
                alt={`QR persetujuan PO ${signedPo.order.poNumber}`}
                width={96}
                height={96}
                className="size-24 rounded bg-white p-1"
              />
              <div className="text-sm">
                <p>
                  Disetujui oleh: <strong>{signedPo.approvedByName}</strong>
                </p>
                <p className="text-muted-foreground">
                  Waktu persetujuan: {signedPo.approvedAt}
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

      <GlobalModal
        isOpen={selection !== null}
        onClose={() => {
          setSelection(null);
          setMessage("");
        }}
        title={
          selectedPo?.poNumber ??
          selectedTicket?.ticketNumber ??
          selectedDirectPurchase?.purchaseNumber ??
          selectedWage?.title ??
          (selectedTermyn
            ? `${selectedTermyn.contractNumber} · Termin ${selectedTermyn.termynNumber}`
            : undefined) ??
          selectedContract?.contractNumber ??
          selectedAddendum?.addendumNumber ??
          selectedBast?.bastNumber ??
          "Detail persetujuan"
        }
        description="Tinjau detail dan pastikan data sebelum memberikan persetujuan."
        className="sm:max-w-2xl"
        footerNote=""
        footer={
          <Button
            variant="outline"
            type="button"
            onClick={() => setSelection(null)}
          >
            Tutup
          </Button>
        }
      >

          <div className="mt-6 space-y-4">
            {selectedPo && (
              <>
                <p className="text-sm">
                  Vendor: <strong>{selectedPo.vendorName}</strong> ·{" "}
                  {selectedPo.projectSiteName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Pemeriksa Keuangan: {selectedPo.financeReviewerName ?? "—"} ·{" "}
                  {selectedPo.financeReviewedAt ?? "Belum diperiksa"}
                </p>
                <UniversalDocumentPreview
                  title={`Purchase Order ${selectedPo.poNumber}`}
                  documentNumber={selectedPo.poNumber}
                  src={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(selectedPo.publicCode)}`}
                />
                {isExecutive(role) && (
                  <Button
                    disabled={isPending}
                    onClick={() => {
                      setQrTitle(selectedPo.poNumber);
                      runApproval(() =>
                        approvePurchaseOrder(selectedPo.publicCode),
                      );
                    }}
                  >
                    {isPending ? "Memproses..." : "Approve & Sign QR"}
                  </Button>
                )}
              </>
            )}

            {selectedTicket && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">{selectedTicket.title}</p>
                <p className="text-sm text-muted-foreground">
                  Pemohon {selectedTicket.requesterName} ·{" "}
                  {selectedTicket.projectName ?? "Gudang umum"} ·{" "}
                  {dateLabel(selectedTicket.createdAt)}
                </p>
                {selectedTicket.type !== TicketType.MATERIAL && (
                  <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-sm">
                    <dt>Penerima dana</dt>
                    <dd className="text-right">{selectedTicket.recipientName ?? "—"}</dd>
                    <dt>Bank tujuan</dt>
                    <dd className="text-right">{selectedTicket.bankName ?? "—"}</dd>
                    <dt>Nomor rekening</dt>
                    <dd className="text-right">{selectedTicket.accountNumber ?? "—"}</dd>
                  </dl>
                )}
                <ul className="divide-y">
                  {selectedTicket.items.map((item, index) => (
                    <li className="py-2 text-sm" key={`${item.itemName}-${index}`}>
                      {item.itemName} · {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
                <p className="font-semibold">{currency(selectedTicket.totalAmount)}</p>
                {isExecutive(role) && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          runApproval(() =>
                            approveByDirector(
                              selectedTicket.id,
                              selectedTicket.type,
                            ),
                          )
                        }
                      >
                        {isPending
                          ? "Memproses..."
                          : selectedTicket.type === TicketType.MATERIAL
                            ? "Setujui & Teruskan ke Logistik"
                            : "Setujui Pencairan Dana"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => {
                          setMessage("");
                          setTicketDecision("REJECT");
                          setTicketDecisionReason("");
                        }}
                      >
                        Tolak
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setMessage("");
                          setTicketDecision("REVISION");
                          setTicketDecisionReason("");
                        }}
                      >
                        Minta Revisi
                      </Button>
                    </div>
                    {ticketDecision && (
                      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                        <label className="block space-y-1 text-sm font-medium">
                          {ticketDecision === "REJECT"
                            ? "Alasan penolakan"
                            : "Catatan revisi"}
                          <Textarea
                            value={ticketDecisionReason}
                            maxLength={2000}
                            onChange={(event) =>
                              setTicketDecisionReason(event.target.value)
                            }
                            placeholder={
                              ticketDecision === "REJECT"
                                ? "Tuliskan alasan penolakan."
                                : "Jelaskan bagian yang harus diperbaiki."
                            }
                            className="min-h-20 font-normal"
                          />
                        </label>
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
                                ? "Konfirmasi Tolak"
                                : "Kirim Revisi"}
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

            {selectedDirectPurchase && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">{selectedDirectPurchase.vendorName}</p>
                <p className="text-sm text-muted-foreground">
                  Pemohon {selectedDirectPurchase.createdByName} ·{" "}
                  {dateLabel(selectedDirectPurchase.createdAt)}
                </p>
                <ul className="divide-y">
                  {selectedDirectPurchase.items.map((item, index) => (
                    <li className="py-2 text-sm" key={`${item.itemName}-${index}`}>
                      {item.itemName} · {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
                <p className="font-semibold">
                  {currency(selectedDirectPurchase.totalAmount)}
                </p>
                {isExecutive(role) && (
                  <Button
                    disabled={isPending}
                    onClick={() =>
                      runApproval(() =>
                        approveDirectStockPurchaseByDirector(
                          selectedDirectPurchase.id,
                        ),
                      )
                    }
                  >
                    {isPending ? "Memproses..." : "Setujui Pengajuan Pembelian"}
                  </Button>
                )}
              </div>
            )}

            {selectedWage && (
              <form
                className="space-y-3 rounded-lg border p-4"
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
                <p className="font-semibold">
                  {selectedWage.projectName} · {selectedWage.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedWage.location ?? "Lokasi belum dicatat"} · Pengusul:{" "}
                  {selectedWage.proposedByName}
                </p>
                <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-sm">
                  <dt>Volume pekerjaan</dt>
                  <dd className="text-right">
                    {selectedWage.proposedVolume && selectedWage.proposedUnit
                      ? `${selectedWage.proposedVolume} ${selectedWage.proposedUnit}`
                      : "Tidak dicatat pada usulan lama"}
                  </dd>
                  <dt>Harga satuan</dt>
                  <dd className="text-right">
                    {selectedWage.proposedUnitPrice
                      ? currency(selectedWage.proposedUnitPrice)
                      : "Tidak dicatat pada usulan lama"}
                  </dd>
                  <dt className="font-semibold">Total usulan</dt>
                  <dd className="text-right font-semibold">
                    {currency(selectedWage.proposedTotalWage)}
                  </dd>
                </dl>
                <label className="block space-y-1 text-sm">
                  Nilai upah disetujui (Rp)
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={wageAmount}
                    onChange={(event) => setWageAmount(event.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Catatan audit persetujuan / koreksi
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background p-3"
                    maxLength={2000}
                    required
                    value={wageReason}
                    onChange={(event) => setWageReason(event.target.value)}
                    placeholder="Tuliskan alasan persetujuan atau koreksi nilai."
                  />
                </label>
                {isExecutive(role) && (
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Memproses..." : "Setujui Upah"}
                  </Button>
                )}
              </form>
            )}

            {selectedTermyn && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">
                  {selectedTermyn.subkonName} · {selectedTermyn.projectName}
                </p>
                <p className="text-sm">
                  SPK {selectedTermyn.contractNumber} · Klaim progres{" "}
                  {selectedTermyn.claimedPercent}% · Pengusul{" "}
                  {selectedTermyn.createdByName}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt>Nilai bruto</dt>
                  <dd className="text-right">{currency(selectedTermyn.grossAmount)}</dd>
                  <dt>Retensi</dt>
                  <dd className="text-right">{currency(selectedTermyn.retentionAmount)}</dd>
                  <dt className="font-semibold">Nilai dibayar</dt>
                  <dd className="text-right font-semibold">
                    {currency(selectedTermyn.netAmount)}
                  </dd>
                </dl>
                {isExecutive(role) && (
                  <Button
                    disabled={isPending}
                    onClick={() =>
                      runApproval(() => approveSubkonTermyn(selectedTermyn.id))
                    }
                  >
                    {isPending ? "Memproses..." : "Setujui Upah/Termyn"}
                  </Button>
                )}
              </div>
            )}

            {selectedContract && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">{selectedContract.subkonName}</p>
                <p className="text-sm">{selectedContract.projectName}</p>
                <p className="whitespace-pre-wrap text-sm">
                  {selectedContract.workScope}
                </p>
                <p className="font-semibold">{currency(selectedContract.contractValue)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      isPending ||
                      selectedContract.createdById === currentUserId
                    }
                    onClick={() =>
                      runApproval(() =>
                        approveSubkonContract(selectedContract.publicCode, "ACTIVE"),
                      )
                    }
                  >
                    Setujui SPK
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      runApproval(() =>
                        approveSubkonContract(selectedContract.publicCode, "REJECTED"),
                      )
                    }
                  >
                    Tolak
                  </Button>
                </div>
              </div>
            )}

            {selectedAddendum && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">{selectedAddendum.projectName}</p>
                <p>{selectedAddendum.reason}</p>
                <p className="text-sm">
                  Perubahan pagu {currency(selectedAddendum.budgetChange)} ·
                  Perpanjangan {selectedAddendum.timeExtension} hari
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={isPending}
                    onClick={() =>
                      runApproval(() =>
                        approveProjectAddendum(selectedAddendum.id, "APPROVED"),
                      )
                    }
                  >
                    Setujui CCO
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      runApproval(() =>
                        approveProjectAddendum(selectedAddendum.id, "REJECTED"),
                      )
                    }
                  >
                    Tolak
                  </Button>
                </div>
              </div>
            )}

            {selectedBast && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">
                  BAST {selectedBast.type} · {selectedBast.projectName}
                </p>
                <p className="text-sm">Tanggal: {dateLabel(selectedBast.date)}</p>
                {selectedBast.maintenanceEndsAt && (
                  <p className="text-sm">
                    Akhir pemeliharaan: {dateLabel(selectedBast.maintenanceEndsAt)}
                  </p>
                )}
                {selectedBast.notes && (
                  <p className="whitespace-pre-wrap text-sm">{selectedBast.notes}</p>
                )}
                <Button
                  disabled={isPending}
                  onClick={() =>
                    runApproval(() => approveBAST(selectedBast.id))
                  }
                >
                  Setujui BAST
                </Button>
              </div>
            )}
          </div>
      </GlobalModal>
    </div>
  );
}
