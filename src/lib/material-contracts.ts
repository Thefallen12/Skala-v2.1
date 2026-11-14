import { UserRole } from "@prisma/client";
import { z } from "zod";
import type { PaymentVendorBankOption } from "@/app/components/apps/finance/PaymentModal";

export const MATERIAL_DELIVERY_PROOF_CLOUDINARY_FOLDER =
  "skala_prioritas/material_delivery_proofs";

export const BULK_MATERIAL_TYPE_OPTIONS = [
  "PASIR",
  "BATU",
  "BATU SPLIT",
  "SIRTU",
  "TANAH URUG",
  "KORAL",
] as const;

export const BULK_MATERIAL_UNIT_OPTIONS = [
  { value: "RIT", label: "RIT (Ritase / Truk)" },
  { value: "M3", label: "M3 (Kubikasi)" },
  { value: "TON", label: "TON (Tonase)" },
] as const;

export const MATERIAL_CONTRACT_MANAGER_ROLES: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];

export const MATERIAL_DELIVERY_RECORDER_ROLES: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.FIELD_TEAM,
  UserRole.KOORDINATOR,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.MOVER,
];

export const MATERIAL_BILLING_FINANCE_ROLES: UserRole[] = [
  UserRole.FINANCE,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];

export function canManageMaterialContracts(role: UserRole): boolean {
  return MATERIAL_CONTRACT_MANAGER_ROLES.includes(role);
}

export function canRecordMaterialDeliveries(role: UserRole): boolean {
  return MATERIAL_DELIVERY_RECORDER_ROLES.includes(role);
}

export function canBillAndPayVendorContracts(role: UserRole): boolean {
  return MATERIAL_BILLING_FINANCE_ROLES.includes(role);
}

export type MaterialDeliveryBillingStatusValue = "UNBILLED" | "BILLED";
export type VendorInvoiceStatusValue = "UNPAID" | "PARTIAL" | "PAID";

export type MaterialContractRow = {
  id: string;
  contractNumber: string;
  vendorId: string | null;
  vendorName: string;
  vendorBankAccounts: PaymentVendorBankOption[];
  materialType: string;
  unitPrice: number;
  unit: string;
  estimatedVolume: number | null;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdByName: string | null;
  createdAt: string;
  totalDeliveriesCount: number;
  unbilledDeliveriesCount: number;
  totalDeliveredVolume: number;
  unbilledVolume: number;
  unbilledEstimatedAmount: number;
};

export type MaterialDeliveryRow = {
  id: string;
  contractId: string;
  contractNumber: string;
  vendorName: string;
  materialType: string;
  unitPrice: number;
  unit: string;
  projectId: string;
  projectName: string;
  deliveryDate: string;
  doNumber: string;
  vehiclePlate: string | null;
  driverName: string | null;
  quantityReceived: number;
  estimatedAmount: number;
  billingStatus: MaterialDeliveryBillingStatusValue;
  vendorInvoiceId: string | null;
  vendorInvoiceNumber: string | null;
  receivedById: string | null;
  receivedByName: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type VendorInvoiceDeliverySummary = {
  id: string;
  doNumber: string;
  deliveryDate: string;
  projectId: string;
  projectName: string;
  vehiclePlate: string | null;
  driverName: string | null;
  quantityReceived: number;
  subtotal: number;
  proofUrl: string | null;
};

export type VendorInvoicePaymentRow = {
  id: string;
  paymentType: "DOWN_PAYMENT" | "PROGRESS_PAYMENT" | "FULL_PAYMENT";
  paymentMethod: "CASH" | "TRANSFER";
  amount: number;
  transferDestination: string;
  proofOfTransferUrl: string;
  financeAccountId: string | null;
  financeAccountName: string | null;
  notes: string | null;
  processedByName: string;
  paidAt: string;
};

export type VendorInvoiceRow = {
  id: string;
  invoiceNumber: string;
  contractId: string;
  contractNumber: string;
  vendorId: string | null;
  vendorName: string;
  vendorBankAccounts: PaymentVendorBankOption[];
  materialType: string;
  unit: string;
  unitPrice: number;
  deliveryIds: string[];
  deliveryCount: number;
  projectNames: string[];
  deliveries: VendorInvoiceDeliverySummary[];
  totalQuantity: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string | null;
  status: VendorInvoiceStatusValue;
  notes: string | null;
  processedByName: string | null;
  paidAt: string | null;
  createdAt: string;
  payments: VendorInvoicePaymentRow[];
};

export type MaterialContractsBundle = {
  contracts: MaterialContractRow[];
  deliveries: MaterialDeliveryRow[];
  vendorInvoices: VendorInvoiceRow[];
};

export function roundMaterialNumber(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateContractDeliverySubtotal(
  quantityReceived: number,
  unitPrice: number,
): number {
  return roundMaterialNumber(quantityReceived * unitPrice, 2);
}

export function formatMaterialVolume(volume: number, unit: string): string {
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(volume);
  return `${formatted} ${unit}`;
}

export const createMaterialContractSchema = z.object({
  contractNumber: z
    .string()
    .trim()
    .max(80, "Nomor kontrak maksimal 80 karakter.")
    .optional()
    .nullable(),
  vendorId: z.string().trim().optional().nullable(),
  vendorName: z
    .string()
    .trim()
    .min(2, "Nama vendor / supplier wajib diisi.")
    .max(160, "Nama vendor terlalu panjang."),
  materialType: z
    .string()
    .trim()
    .min(2, "Jenis material wajib diisi.")
    .max(60, "Jenis material terlalu panjang.")
    .default("PASIR"),
  unitPrice: z.coerce
    .number()
    .positive("Harga satuan kontrak harus lebih dari 0."),
  unit: z
    .string()
    .trim()
    .min(1, "Satuan material wajib diisi (mis. RIT atau M3).")
    .max(20, "Satuan terlalu panjang."),
  estimatedVolume: z.coerce
    .number()
    .positive("Kuota volume kontrak harus lebih dari 0.")
    .optional()
    .nullable(),
  startDate: z.string().trim().min(10, "Tanggal mulai kontrak wajib diisi."),
  endDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional().nullable(),
});

export type CreateMaterialContractInput = z.input<
  typeof createMaterialContractSchema
>;

export const recordMaterialDeliverySchema = z.object({
  contractId: z.string().trim().min(1, "Kontrak material wajib dipilih."),
  projectId: z.string().trim().min(1, "Proyek tujuan pengiriman wajib dipilih."),
  ticketId: z.string().trim().optional().nullable(),
  deliveryDate: z.string().trim().min(10, "Tanggal pengiriman wajib diisi."),
  doNumber: z
    .string()
    .trim()
    .min(2, "Nomor Surat Jalan (DO) wajib diisi.")
    .max(80, "Nomor Surat Jalan maksimal 80 karakter."),
  vehiclePlate: z
    .string()
    .trim()
    .max(40, "Plat kendaraan maksimal 40 karakter.")
    .optional()
    .nullable(),
  driverName: z
    .string()
    .trim()
    .max(80, "Nama supir maksimal 80 karakter.")
    .optional()
    .nullable(),
  quantityReceived: z.coerce
    .number()
    .positive("Volume / jumlah rit diterima harus lebih dari 0."),
  notes: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional().nullable(),
});

export const createVendorInvoiceSchema = z.object({
  contractId: z.string().trim().min(1, "Kontrak wajib dipilih."),
  deliveryIds: z
    .array(z.string().trim().min(1))
    .min(1, "Pilih minimal satu Surat Jalan (DO) yang belum ditagih."),
  invoiceNumber: z
    .string()
    .trim()
    .max(80, "Nomor tagihan maksimal 80 karakter.")
    .optional()
    .nullable(),
  dueDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional().nullable(),
});

export type CreateVendorInvoiceInput = z.input<
  typeof createVendorInvoiceSchema
>;
