"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import {
  createEquipmentLog,
  createEquipmentMaster,
} from "@/app/actions/construction";
import { submitPurchaseOrderForFinanceReview } from "@/app/actions/orders";
import LogisticsWorkspace from "@/app/components/apps/tickets/LogisticsWorkspace";
import DocumentSignoffQueue, {
  type DocumentSignoffTask,
} from "@/app/components/apps/documents/DocumentSignoffQueue";
import PurchaseOrderConfirmationQueue, {
  type PurchaseOrderConfirmationRow,
} from "@/app/components/apps/logistics/PurchaseOrderConfirmationQueue";
import PurchaseOrderInvoiceUpload from "@/app/components/apps/logistics/PurchaseOrderInvoiceUpload";
import VehicleFleetPanel from "@/app/components/apps/logistics/VehicleFleetPanel";
import VehicleOperationsPanel from "@/app/components/apps/logistics/VehicleOperationsPanel";
import EquipmentVehicleRentalPanel from "@/app/components/apps/logistics/EquipmentVehicleRentalPanel";
import type { RentalItemRow } from "@/app/actions/rentals";
import { VendorFormDialog } from "@/app/components/forms/VendorFormDialog";
import type { VehicleSummary } from "@/app/actions/vehicles";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import { POPaymentMethod, POStatus, UserRole } from "@prisma/client";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NativeDataTable } from "@/components/ui/native-data-table";
import PurchaseOrderReceiptAction from "@/app/components/apps/logistics/PurchaseOrderReceiptAction";
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
  Boxes,
  CheckCircle2,
  Clock3,
  Eye,
  FilePenLine,
  FileText,
  Fuel,
  Pencil,
  Send,
  Store,
  TicketCheck,
  Truck,
} from "lucide-react";
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

export default function LogisticsHub({
  tickets,
  projects,
  role,
  vendors,
  stockItems,
  stockPurchases,
  purchaseOrderConfirmations,
  documentSignoffTasks,
  purchaseOrders,
  deliveryOrders,
  equipmentLogs,
  equipmentMasters,
  vehicleTripLogs,
  vehicles,
  rentals = [],
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
  purchaseOrders: HubPurchaseOrder[];
  deliveryOrders: HubDeliveryOrder[];
  equipmentLogs: EquipmentLogRow[];
  equipmentMasters: EquipmentMasterRow[];
  vehicleTripLogs: VehicleTripLogRow[];
  vehicles: VehicleSummary[];
  rentals?: RentalItemRow[];
  initialTab?: string;
  initialOpenSheet?: string;
  today: string;
  invoiceDate: string;
}) {
  const allowedTabs = ["tickets", "stock", "documents", "equipment", "vehicles"];
  const resolvedTab = allowedTabs.includes(initialTab ?? "")
    ? initialTab!
    : "tickets";
  const [activeTab, setActiveTab] = useState(resolvedTab);
  const [selection, setSelection] = useState<DocumentSelection>(null);
  const router = useRouter();
  const [equipmentMessage, setEquipmentMessage] = useState("");
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);
  const [equipmentMasterSheetOpen, setEquipmentMasterSheetOpen] = useState(false);
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<LogisticsVendor | null>(null);
  const [purchaseOrderMessage, setPurchaseOrderMessage] = useState("");
  const [purchaseOrderMessageIsError, setPurchaseOrderMessageIsError] =
    useState(false);
  const [isPending, startTransition] = useTransition();
  const submitDraftPurchaseOrder = (publicCode: string) => {
    setPurchaseOrderMessage("");
    setPurchaseOrderMessageIsError(false);
    startTransition(async () => {
      try {
        const result = await submitPurchaseOrderForFinanceReview(publicCode);
        setPurchaseOrderMessage(result.message);
        setPurchaseOrderMessageIsError(!result.success);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Purchase order finance submission failed:", error);
        setPurchaseOrderMessage("Draft PO gagal diajukan. Silakan coba kembali.");
        setPurchaseOrderMessageIsError(true);
      }
    });
  };
  const openDocumentPreview = (document: NonNullable<DocumentSelection>) => {
    setSelection(document);
  };

  const submitEquipmentLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input = {
      projectId: String(formData.get("projectId") ?? ""),
      equipmentMasterId: String(formData.get("equipmentMasterId") ?? ""),
      equipmentName: String(formData.get("equipmentName") ?? ""),
      operatorName: String(formData.get("operatorName") ?? ""),
      date: String(formData.get("date") ?? ""),
      hmStart: Number(formData.get("hmStart")),
      hmEnd: Number(formData.get("hmEnd")),
      effectiveHours: Number(formData.get("effectiveHours")),
      fuelLiter: Number(formData.get("fuelLiter")),
      notes: String(formData.get("notes") ?? ""),
    };
    setEquipmentMessage("");
    startTransition(async () => {
      try {
        const result = await createEquipmentLog(input);
        setEquipmentMessage(result.message);
        if (result.success) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        console.error("Equipment log action failed:", error);
        setEquipmentMessage("Log alat gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const submitEquipmentMaster = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setEquipmentMessage("");
    startTransition(async () => {
      try {
        const result = await createEquipmentMaster({
          name: String(data.get("name") ?? ""),
          brand: String(data.get("brand") ?? ""),
          licensePlate: String(data.get("licensePlate") ?? ""),
          hourlyRate: Number(data.get("hourlyRate")),
          currentHM: Number(data.get("currentHM")),
        });
        setEquipmentMessage(result.message);
        if (result.success) {
          form.reset();
          setEquipmentMasterSheetOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Equipment master submission failed:", error);
        setEquipmentMessage("Master alat gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="space-y-5"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5 sm:grid-cols-3 xl:grid-cols-6">
        <TabsTrigger
          value="tickets"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <TicketCheck className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">1. Tiket Masuk</span>
        </TabsTrigger>
        <TabsTrigger
          value="stock"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <Boxes className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">2. Stok Gudang</span>
        </TabsTrigger>
        <TabsTrigger
          value="documents"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">3. Dokumen PO &amp; DO</span>
        </TabsTrigger>
        <TabsTrigger
          value="equipment"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <Fuel className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">4. Alat &amp; BBM</span>
        </TabsTrigger>
        <TabsTrigger
          value="vehicles"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <Truck className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">5. Armada</span>
        </TabsTrigger>
        <TabsTrigger
          value="vendors"
          className="h-auto justify-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <Store className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">6. Katalog Vendor</span>
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
          purchaseTickets={tickets.map(({ id, ticketNumber, title }) => ({
            id,
            ticketNumber,
            title,
          }))}
        />
      </TabsContent>

      <TabsContent value="documents">
        <div className="space-y-5">
          <DocumentSignoffQueue
            tasks={documentSignoffTasks}
            title="Tanda Tangan Dokumen Logistik"
            description="Logistik menandatangani KO dan DO. QR tanda tangan DO tersedia setelah ditandatangani dan menunjukkan status valid setelah Koordinator Lapangan mengonfirmasi."
          />
          <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {purchaseOrderMessage && (
                <p
                  className={`text-sm ${purchaseOrderMessageIsError ? "text-destructive" : "text-muted-foreground"}`}
                  role={purchaseOrderMessageIsError ? "alert" : "status"}
                >
                  {purchaseOrderMessage}
                </p>
              )}
              {purchaseOrders.map((order) => {
                return (
                  <article
                    key={order.publicCode}
                    className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col items-start">
                      <p
                        className="break-words text-sm font-semibold text-primary"
                        title={`${order.poNumber} · ${order.vendorName}`}
                      >
                        {order.poNumber} · {order.vendorName}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("id-ID")}
                      </p>
                      {!order.ticketId && order.paidAt && (
                        <div className="mt-2 space-y-1">
                          <Badge variant={order.receivedAt ? "success" : "warning"}>
                            {order.receivedAt
                              ? "Barang diterima"
                              : "Menunggu pengiriman vendor"}
                          </Badge>
                          {order.receivedAt ? (
                            <p className="text-xs text-muted-foreground">
                              Diterima{" "}
                              {new Date(order.receivedAt).toLocaleString("id-ID")}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              PO lunas; konfirmasikan setelah barang tiba.
                            </p>
                          )}
                        </div>
                      )}
                      {order.vendorPoSentAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Dikirim {new Date(order.vendorPoSentAt).toLocaleString("id-ID")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-row items-start gap-2">
                      <div className="flex flex-nowrap items-start gap-1.5">
                      {order.status === POStatus.DRAFT ? (
                        <>
                          <div className="flex w-10 flex-col items-center">
                            <ActionIconButton
                              label={
                                role === UserRole.LOGISTICS ||
                                role === UserRole.ADMINISTRATIONS
                                  ? "Lanjutkan Draft"
                                  : "Lihat Draft"
                              }
                              tooltip={
                                role === UserRole.LOGISTICS ||
                                role === UserRole.ADMINISTRATIONS
                                  ? "Lanjutkan Draft"
                                  : "Lihat Draft"
                              }
                              icon={FilePenLine}
                              href={`/d/${encodeURIComponent(order.publicCode)}`}
                            />
                          </div>
                          {(role === UserRole.LOGISTICS ||
                            role === UserRole.ADMINISTRATIONS) && (
                            <div className="flex w-10 flex-col items-center">
                              <ActionIconButton
                                label={
                                  isPending ? "Mengajukan PO..." : "Ajukan ke Keuangan"
                                }
                                tooltip={
                                  isPending ? "Mengajukan PO..." : "Ajukan ke Keuangan"
                                }
                                icon={Send}
                                onClick={() => submitDraftPurchaseOrder(order.publicCode)}
                                disabled={isPending}
                                className="text-orange-500 hover:text-white"
                              />
                            </div>
                          )}
                        </>
                      ) : order.status !== POStatus.APPROVED ? (
                        <div className="flex w-12 flex-col items-center">
                          <ActionIconButton
                            label="Lihat PO"
                            tooltip="Lihat PO"
                            icon={Eye}
                            href={`/d/${encodeURIComponent(order.publicCode)}`}
                          />
                        </div>
                      ) : role === UserRole.LOGISTICS ? (
                        <>
                          <PurchaseOrderInvoiceUpload
                            publicCode={order.publicCode}
                            invoiceUrl={order.vendorInvoiceUrl}
                            invoiceId={order.invoiceId}
                            vendorPoSentAt={order.vendorPoSentAt}
                            ticketLinked={Boolean(order.ticketId)}
                            items={order.items}
                            includeTax={order.includeTax}
                            invoiceDate={invoiceDate}
                            paymentMethod={order.paymentMethod}
                            paymentTerms={order.paymentTerms}
                            paymentBankName={order.paymentBankName}
                            paymentAccountNumber={order.paymentAccountNumber}
                            paymentAccountName={order.paymentAccountName}
                          />
                          {!order.ticketId &&
                            order.paidAt &&
                            !order.receivedAt && (
                              <PurchaseOrderReceiptAction
                                publicCode={order.publicCode}
                              />
                            )}
                        </>
                      ) : null}
                      {order.status === POStatus.APPROVED && (
                        <div className="flex w-10 flex-col items-center">
                          <ActionIconButton
                            label="Preview PO Terbit"
                            tooltip="Preview PO Terbit"
                            icon={Eye}
                            onClick={() =>
                              openDocumentPreview({
                                kind: "po",
                                code: order.publicCode,
                                number: order.poNumber,
                                executiveApproval: "PO disetujui oleh Direksi",
                              })
                            }
                          />
                        </div>
                      )}
                      </div>
                      <div className="flex flex-row items-start gap-1.5">
                        {order.status === POStatus.APPROVED && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                aria-label="Disetujui"
                                className="flex size-10 items-center justify-center rounded-md border border-success text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                role="img"
                                tabIndex={0}
                              >
                                <CheckCircle2 className="size-5" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Disetujui</TooltipContent>
                          </Tooltip>
                        )}
                        {order.status !== POStatus.APPROVED && (
                          <Badge
                            className="h-6 shrink-0 whitespace-nowrap px-2 text-[0.6875rem]"
                            variant="outline"
                          >
                            {order.status === POStatus.PENDING_FINANCE_REVIEW ? (
                              <>
                                <Clock3 className="size-4" aria-hidden="true" />
                                <span className="sr-only">Menunggu Keuangan</span>
                              </>
                            )
                              : order.status === POStatus.PENDING_APPROVAL ? (
                                <>
                                  <Clock3 className="size-4" aria-hidden="true" />
                                  <span className="sr-only">
                                    Menunggu Persetujuan Direksi
                                  </span>
                                </>
                              )
                                : order.status === POStatus.REJECTED
                                  ? "Ditolak"
                                  : order.status === POStatus.CANCELLED
                                    ? "Dibatalkan"
                                    : "Draft"}
                          </Badge>
                        )}
                        {order.status === POStatus.APPROVED && !order.vendorPoSentAt && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                aria-label="Menunggu pengiriman"
                                className="flex size-10 items-center justify-center rounded-md border border-amber-500 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                role="img"
                                tabIndex={0}
                              >
                                <Clock3 className="size-5" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Menunggu pengiriman</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {purchaseOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">Belum ada PO.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Delivery Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliveryOrders.map((order) => {
                return (
                  <article
                    key={order.publicCode}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-semibold text-primary">{order.doNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{order.status}</Badge>
                      {order.executiveApproved ? (
                        <ActionIconButton
                          label="Preview Surat Jalan"
                          tooltip="Preview Surat Jalan"
                          icon={Eye}
                          onClick={() =>
                            openDocumentPreview({
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
                          Belum Ada Persetujuan Eksekutif
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
              {deliveryOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">Belum ada DO.</p>
              )}
            </CardContent>
          </Card>
          {role === UserRole.LOGISTICS && (
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
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Katalog Vendor</CardTitle>
            <Button
              type="button"
              onClick={() => {
                setEditingVendor(null);
                setVendorSheetOpen(true);
              }}
            >
              Tambah Vendor Baru
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
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
                    const primaryAccount = accounts.find((account) => account.isPrimary) ?? accounts[0];
                    return (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>{vendor.category}</TableCell>
                      <TableCell>
                        {primaryAccount?.bankName ?? "—"}
                        {accounts.length > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            +{accounts.length - 1} rekening
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{primaryAccount?.bankAccount ?? "—"}</TableCell>
                      <TableCell>{vendor.phone ?? vendor.email ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <ActionIconButton
                          type="button"
                          label={`Edit vendor ${vendor.name}`}
                          tooltip="Edit vendor"
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
                  {vendors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Belum ada vendor di katalog.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vehicles">
        <VehicleFleetPanel
          vehicles={vehicles}
          canManage={
            role === UserRole.LOGISTICS || role === UserRole.ADMINISTRATIONS
          }
        />
      </TabsContent>

      <TabsContent value="equipment">
        <div className="space-y-6">
          <Tabs defaultValue="rentals" className="space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Operasional &amp; Sewa Alat / BBM</h2>
                <p className="text-xs text-muted-foreground">
                  Pencatatan sewa alat &amp; kendaraan (harian, mingguan, bulanan), log HM operasional alat berat, dan operasional armada.
                </p>
              </div>
              <TabsList className="h-10 bg-muted/70 p-1 rounded-lg border">
                <TabsTrigger
                  value="rentals"
                  className="h-8 text-xs font-semibold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  🚜 Sewa Alat &amp; Kendaraan
                </TabsTrigger>
                <TabsTrigger
                  value="equipment-logs"
                  className="h-8 text-xs font-semibold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  ⏱️ Log Alat &amp; BBM
                </TabsTrigger>
                <TabsTrigger
                  value="vehicle-operations"
                  className="h-8 text-xs font-semibold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  🚚 Operasional Kendaraan
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
                <CardHeader>
                  <CardTitle>Log Alat Berat & BBM</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={projects.length === 0}
                      className="h-9 px-4 text-xs font-semibold"
                      onClick={() => {
                        setEquipmentMessage("");
                        setEquipmentSheetOpen(true);
                      }}
                    >
                      Catat Log Alat & BBM
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-4 text-xs font-semibold"
                      onClick={() => {
                        setEquipmentMessage("");
                        setEquipmentMasterSheetOpen(true);
                      }}
                    >
                      Daftarkan Master Alat
                    </Button>
                  </div>
                  {equipmentMessage && (
                    <p className="text-sm" role="status">{equipmentMessage}</p>
                  )}
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold text-primary">Master alat terdaftar</h3>
                    <ul className="mt-2 divide-y text-sm">
                      {equipmentMasters.map((equipment) => (
                        <li className="flex flex-wrap justify-between gap-2 py-2" key={equipment.id}>
                          <span>{equipment.code} · {equipment.name}</span>
                          <span className="text-muted-foreground">
                            HM {equipment.currentHM} · {equipment.status}
                          </span>
                        </li>
                      ))}
                      {equipmentMasters.length === 0 && (
                        <li className="py-2 text-muted-foreground">Belum ada master alat.</li>
                      )}
                    </ul>
                  </div>
                  <NativeDataTable itemLabel="log alat">
                    <table className="app-data-table w-full min-w-[760px] text-sm">
                      <thead className="bg-[#102A4D] text-left text-white">
                        <tr>
                          <th className="p-3">Tanggal / Proyek</th>
                          <th className="p-3">Alat / Operator</th>
                          <th className="p-3">HM Awal–Akhir</th>
                          <th className="p-3">Jam Efektif</th>
                          <th className="p-3">BBM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentLogs.map((log) => (
                          <tr className="border-b" key={log.id}>
                            <td className="p-3">
                              {new Date(`${log.date}T00:00:00`).toLocaleDateString("id-ID")}
                              <span className="block text-xs text-muted-foreground">{log.projectName}</span>
                            </td>
                            <td className="p-3">
                              {log.equipmentName}
                              <span className="block text-xs text-muted-foreground">{log.operatorName ?? "Operator tidak dicatat"}</span>
                            </td>
                            <td className="p-3">{log.hmStart} – {log.hmEnd}</td>
                            <td className="p-3">{log.effectiveHours} jam</td>
                            <td className="p-3">{log.fuelLiter} L</td>
                          </tr>
                        ))}
                        {equipmentLogs.length === 0 && (
                          <tr>
                            <td className="p-5 text-center text-muted-foreground" colSpan={5}>
                              Belum ada log alat berat.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </NativeDataTable>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vehicle-operations">
              <VehicleOperationsPanel
                vehicles={vehicles}
                logs={vehicleTripLogs}
                projects={projects}
                deliveryOrders={deliveryOrders}
                canManageVehicles={
                  role === UserRole.LOGISTICS || role === UserRole.ADMINISTRATIONS
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </TabsContent>

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
        title={selection?.number ?? "Preview dokumen"}
        description={
          selection
            ? `${selection.executiveApproval} · Dokumen resmi`
            : "Pratinjau dokumen resmi PO/DO."
        }
        className="sm:max-w-3xl"
      >
          {selection && (
            <>
              <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {selection.executiveApproval}. Informasi persetujuan dan QR
                verifikasi ditampilkan pada dokumen.
              </p>
              <iframe
                title={`Pratinjau dokumen ${selection.number}`}
                src={`/api/documents/transactions?kind=${selection.kind.toUpperCase()}&publicCode=${encodeURIComponent(selection.code)}&format=html`}
                className="mt-4 h-[70vh] w-full rounded-lg border"
              />
              <div className="mt-3 flex justify-end">
                <ActionIconButton
                  label="Buka dokumen terbit"
                  tooltip="Buka Dokumen Terbit"
                  icon={FileText}
                  href="/apps/documents/issued"
                />
              </div>
            </>
          )}
      </GlobalModal>

      <GlobalModal
        isOpen={equipmentSheetOpen}
        onClose={() => setEquipmentSheetOpen(false)}
        title="Log Alat Berat & BBM"
        description="HM master diperbarui atomik bila alat dipilih. HM awal harus sama dengan pembacaan terakhir master."
        className="sm:max-w-xl"
      >
          <form className="mt-6 space-y-4" onSubmit={submitEquipmentLog}>
            <FormLabel className="block space-y-1 text-sm">
              Proyek
              <select className="h-10 w-full rounded-md border bg-background px-3" name="projectId" required>
                <option value="">Pilih proyek</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.kelompokTani} · {project.title}
                  </option>
                ))}
              </select>
            </FormLabel>
            <FormLabel className="block space-y-1 text-sm">
              Master alat (opsional)
              <select className="h-10 w-full rounded-md border bg-background px-3" name="equipmentMasterId" defaultValue="">
                <option value="">Catat tanpa master</option>
                {equipmentMasters.map((equipment) => (
                  <option value={equipment.id} key={equipment.id}>
                    {equipment.code} · {equipment.name} (HM {equipment.currentHM})
                  </option>
                ))}
              </select>
            </FormLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormLabel className="space-y-1 text-sm">
                Nama alat
                <input className="h-10 w-full rounded-md border bg-background px-3" name="equipmentName" maxLength={120} required />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                Operator
                <input className="h-10 w-full rounded-md border bg-background px-3" name="operatorName" maxLength={120} />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                Tanggal
                <input className="h-10 w-full rounded-md border bg-background px-3" name="date" type="date" required defaultValue={today} />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                HM awal
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hmStart" type="number" min="0" step="0.01" required />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                HM akhir
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hmEnd" type="number" min="0" step="0.01" required />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                Jam efektif
                <input className="h-10 w-full rounded-md border bg-background px-3" name="effectiveHours" type="number" min="0" max="24" step="0.01" required />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                BBM (liter)
                <input className="h-10 w-full rounded-md border bg-background px-3" name="fuelLiter" type="number" min="0" step="0.01" required />
              </FormLabel>
            </div>
            <FormLabel className="block space-y-1 text-sm">
              Catatan
              <textarea className="min-h-20 w-full rounded-md border bg-background p-3" name="notes" maxLength={2000} />
            </FormLabel>
            {equipmentMessage && <p className="text-sm" role="status">{equipmentMessage}</p>}
            <Button type="submit" disabled={isPending || projects.length === 0}>
              {isPending ? "Menyimpan..." : "Simpan Log"}
            </Button>
          </form>
      </GlobalModal>

      <GlobalModal
        isOpen={equipmentMasterSheetOpen}
        onClose={() => setEquipmentMasterSheetOpen(false)}
        title="Daftarkan Master Alat"
        description="Nomor alat dibuat otomatis; HM awal digunakan sebagai dasar log berikutnya."
        className="sm:max-w-lg"
      >
          <form className="mt-6 space-y-4" onSubmit={submitEquipmentMaster}>
            <FormLabel className="block space-y-1 text-sm">
              Nama alat
              <input className="h-10 w-full rounded-md border bg-background px-3" name="name" maxLength={160} required />
            </FormLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormLabel className="space-y-1 text-sm">
                Merek
                <input className="h-10 w-full rounded-md border bg-background px-3" name="brand" maxLength={120} />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                No. plat / seri
                <input className="h-10 w-full rounded-md border bg-background px-3" name="licensePlate" maxLength={80} />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                Tarif operasional per jam
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hourlyRate" type="number" min="0" step="0.01" required defaultValue="0" />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                HM saat registrasi
                <input className="h-10 w-full rounded-md border bg-background px-3" name="currentHM" type="number" min="0" step="0.01" required defaultValue="0" />
              </FormLabel>
            </div>
            {equipmentMessage && <p className="text-sm" role="status">{equipmentMessage}</p>}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan Master Alat"}
            </Button>
          </form>
      </GlobalModal>
    </Tabs>
  );
}
