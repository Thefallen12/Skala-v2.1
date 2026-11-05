"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import {
  createEquipmentLog,
  createEquipmentMaster,
} from "@/app/actions/construction";
import { createVendor, updateVendor } from "@/app/actions/vendors";
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
import {
  VendorBankAccountsEditor,
  type EditableVendorBankAccount,
} from "@/app/components/forms/VendorBankAccountsEditor";
import type { VehicleSummary } from "@/app/actions/vehicles";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Boxes, FileText, Fuel, Pencil, TicketCheck, Truck } from "lucide-react";
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
  status: string;
  createdAt: string;
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
  const [vendorAccounts, setVendorAccounts] = useState<EditableVendorBankAccount[]>([]);
  const [vendorMessage, setVendorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
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

  const submitVendor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      bankAccounts: vendorAccounts.map(
        ({ label, bankName, bankAccount, bankHolder, isPrimary }) => ({
          label,
          bankName,
          bankAccount,
          bankHolder,
          isPrimary,
        }),
      ),
    };
    setVendorMessage("");
    startTransition(async () => {
      try {
        const result = editingVendor
          ? await updateVendor(editingVendor.id, input)
          : await createVendor(input);
        setVendorMessage(result.message);
        if (result.success) {
          setVendorSheetOpen(false);
          setEditingVendor(null);
          router.refresh();
        }
      } catch (error) {
        console.error("Vendor save failed:", error);
        setVendorMessage("Vendor gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="space-y-5"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-muted p-2">
        <TabsTrigger value="tickets" className="gap-2">
          <TicketCheck className="size-4" />
          Tiket Masuk
        </TabsTrigger>
        <TabsTrigger value="stock" className="gap-2">
          <Boxes className="size-4" />
          Stok Gudang
        </TabsTrigger>
        <TabsTrigger value="documents" className="gap-2">
          <FileText className="size-4" />
          Dokumen PO & DO
        </TabsTrigger>
        <TabsTrigger value="equipment" className="gap-2">
          <Fuel className="size-4" />
          Logistik, Kendaraan & BBM
        </TabsTrigger>
        <TabsTrigger value="vehicles" className="gap-2">
          <Truck className="size-4" />
          Data Kendaraan & Armada
        </TabsTrigger>
        <TabsTrigger value="vendors">Katalog Vendor</TabsTrigger>
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
              {purchaseOrders.map((order) => {
                return (
                  <article
                    key={order.publicCode}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary">
                        {order.poNumber} · {order.vendorName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="lightSuccess">Disetujui Eksekutif</Badge>
                      {role === UserRole.LOGISTICS ? (
                        <PurchaseOrderInvoiceUpload
                          publicCode={order.publicCode}
                          invoiceUrl={order.vendorInvoiceUrl}
                          invoiceId={order.invoiceId}
                          vendorPoSentAt={order.vendorPoSentAt}
                          ticketLinked={Boolean(order.ticketId)}
                          items={order.items}
                          includeTax={order.includeTax}
                          invoiceDate={invoiceDate}
                        />
                      ) : (
                        <Badge
                          variant={order.vendorPoSentAt ? "lightSuccess" : "outline"}
                        >
                          {order.vendorPoSentAt
                            ? "PO dikirim ke vendor"
                            : "Menunggu pengiriman PO"}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openDocumentPreview({
                            kind: "po",
                            code: order.publicCode,
                            number: order.poNumber,
                            executiveApproval: "PO disetujui oleh Direksi",
                          })
                        }
                      >
                        Preview PO Terbit
                      </Button>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openDocumentPreview({
                              kind: "do",
                              code: order.publicCode,
                              number: order.doNumber,
                              executiveApproval:
                                "DO terhubung ke PO/tiket yang disetujui Direksi",
                            })
                          }
                        >
                          Preview Surat Jalan
                        </Button>
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
                setVendorMessage("");
                setEditingVendor(null);
                setVendorAccounts([]);
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setVendorMessage("");
                            setEditingVendor(vendor);
                            setVendorAccounts(
                              getVendorBankAccounts(vendor).map((account) => ({
                                ...account,
                                label: account.label ?? "",
                              })),
                            );
                            setVendorSheetOpen(true);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </Button>
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
        <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Log Alat Berat & BBM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={projects.length === 0}
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
        <VehicleOperationsPanel
          vehicles={vehicles}
          logs={vehicleTripLogs}
          projects={projects}
          deliveryOrders={deliveryOrders}
          canManageVehicles={
            role === UserRole.LOGISTICS || role === UserRole.ADMINISTRATIONS
          }
        />
        </div>
      </TabsContent>

      <GlobalModal
        isOpen={vendorSheetOpen}
        onClose={() => {
          setVendorSheetOpen(false);
          setEditingVendor(null);
          setVendorAccounts([]);
        }}
        title={editingVendor ? "Edit Vendor" : "Tambah Vendor Baru"}
        description="Simpan beberapa rekening dan tandai rekening utama. Rekening dapat dipilih saat membuat pembelian."
        className="sm:max-w-2xl"
      >
          <form
            key={editingVendor?.id ?? "new-vendor"}
            className="mt-6 space-y-4"
            onSubmit={submitVendor}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendor-name">Nama Vendor</Label>
                <Input id="vendor-name" name="name" maxLength={180} required defaultValue={editingVendor?.name ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-category">Kategori</Label>
                <Input id="vendor-category" name="category" maxLength={100} required defaultValue={editingVendor?.category ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-phone">Kontak / Telepon</Label>
                <Input id="vendor-phone" name="phone" maxLength={60} defaultValue={editingVendor?.phone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-email">Email</Label>
                <Input id="vendor-email" name="email" type="email" maxLength={180} defaultValue={editingVendor?.email ?? ""} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="vendor-address">Alamat</Label>
                <Input id="vendor-address" name="address" maxLength={500} defaultValue={editingVendor?.address ?? ""} />
              </div>
              <VendorBankAccountsEditor
                accounts={vendorAccounts}
                onChange={setVendorAccounts}
                disabled={isPending}
                idPrefix="vendor"
              />
            </div>
            {vendorMessage && (
              <p className="text-sm text-muted-foreground" role="status">
                {vendorMessage}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setVendorSheetOpen(false);
                  setEditingVendor(null);
                  setVendorAccounts([]);
                }}
              >
                Tutup
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Menyimpan..."
                  : editingVendor
                    ? "Simpan Perubahan"
                    : "Simpan Vendor"}
              </Button>
            </div>
          </form>
      </GlobalModal>

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
                src={`/api/documents/${selection.kind}?publicCode=${encodeURIComponent(selection.code)}`}
                className="mt-4 h-[70vh] w-full rounded-lg border"
              />
              <div className="mt-3 flex justify-end">
                <Button variant="outline" asChild>
                  <Link href="/apps/documents/issued">Buka Dokumen Terbit</Link>
                </Button>
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
            <label className="block space-y-1 text-sm">
              Proyek
              <select className="h-10 w-full rounded-md border bg-background px-3" name="projectId" required>
                <option value="">Pilih proyek</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.kelompokTani} · {project.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              Master alat (opsional)
              <select className="h-10 w-full rounded-md border bg-background px-3" name="equipmentMasterId" defaultValue="">
                <option value="">Catat tanpa master</option>
                {equipmentMasters.map((equipment) => (
                  <option value={equipment.id} key={equipment.id}>
                    {equipment.code} · {equipment.name} (HM {equipment.currentHM})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Nama alat
                <input className="h-10 w-full rounded-md border bg-background px-3" name="equipmentName" maxLength={120} required />
              </label>
              <label className="space-y-1 text-sm">
                Operator
                <input className="h-10 w-full rounded-md border bg-background px-3" name="operatorName" maxLength={120} />
              </label>
              <label className="space-y-1 text-sm">
                Tanggal
                <input className="h-10 w-full rounded-md border bg-background px-3" name="date" type="date" required defaultValue={today} />
              </label>
              <label className="space-y-1 text-sm">
                HM awal
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hmStart" type="number" min="0" step="0.01" required />
              </label>
              <label className="space-y-1 text-sm">
                HM akhir
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hmEnd" type="number" min="0" step="0.01" required />
              </label>
              <label className="space-y-1 text-sm">
                Jam efektif
                <input className="h-10 w-full rounded-md border bg-background px-3" name="effectiveHours" type="number" min="0" max="24" step="0.01" required />
              </label>
              <label className="space-y-1 text-sm">
                BBM (liter)
                <input className="h-10 w-full rounded-md border bg-background px-3" name="fuelLiter" type="number" min="0" step="0.01" required />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              Catatan
              <textarea className="min-h-20 w-full rounded-md border bg-background p-3" name="notes" maxLength={2000} />
            </label>
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
            <label className="block space-y-1 text-sm">
              Nama alat
              <input className="h-10 w-full rounded-md border bg-background px-3" name="name" maxLength={160} required />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Merek
                <input className="h-10 w-full rounded-md border bg-background px-3" name="brand" maxLength={120} />
              </label>
              <label className="space-y-1 text-sm">
                No. plat / seri
                <input className="h-10 w-full rounded-md border bg-background px-3" name="licensePlate" maxLength={80} />
              </label>
              <label className="space-y-1 text-sm">
                Tarif operasional per jam
                <input className="h-10 w-full rounded-md border bg-background px-3" name="hourlyRate" type="number" min="0" step="0.01" required defaultValue="0" />
              </label>
              <label className="space-y-1 text-sm">
                HM saat registrasi
                <input className="h-10 w-full rounded-md border bg-background px-3" name="currentHM" type="number" min="0" step="0.01" required defaultValue="0" />
              </label>
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
