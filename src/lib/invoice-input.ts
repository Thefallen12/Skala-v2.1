import { z } from "zod";

export const invoiceItemInputSchema = z.object({
  itemCode: z.string().trim().max(100).optional().or(z.literal("")),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive().max(1_000_000_000),
  unit: z.string().trim().min(1).max(40),
  unitPrice: z.number().finite().nonnegative().max(1_000_000_000_000),
});

export const vendorInvoiceInputSchema = z.object({
  invoiceNumber: z.string().trim().max(100).optional().or(z.literal("")),
  periodOrDate: z.string().trim().max(120).optional().or(z.literal("")),
  paymentMethod: z.string().trim().max(80).optional().or(z.literal("")),
  bankAccount: z.string().trim().max(180).optional().or(z.literal("")),
  documentUrl: z.string().url().max(2048),
  tax: z.number().finite().nonnegative().max(1_000_000_000_000).default(0),
  deduction: z.number().finite().nonnegative().max(1_000_000_000_000).default(0),
  items: z.array(invoiceItemInputSchema).min(1).max(200),
}).superRefine((invoice, context) => {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  if (!Number.isFinite(subtotal) || subtotal > 1_000_000_000_000) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Subtotal invoice tidak valid.",
    });
  }
  if (invoice.tax + invoice.deduction > subtotal + invoice.tax) {
    context.addIssue({
      code: "custom",
      path: ["deduction"],
      message: "Potongan melebihi nilai tagihan.",
    });
  }
});

export type VendorInvoiceInput = z.input<typeof vendorInvoiceInputSchema>;
