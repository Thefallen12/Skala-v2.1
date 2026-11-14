import { model, models, Schema } from "mongoose";

const purchaseOrderSchema = new Schema(
  {
    _id: { type: String },
    publicCode: { type: String, default: null },
    poNumber: { type: String, default: null },
    vendorName: { type: String, default: null },
    vendorId: { type: String, default: null },
    projectId: { type: String, default: null },
    ticketId: { type: String, default: null },
    paymentMethod: { type: String, default: "CASH" },
    paymentBankName: { type: String, default: null },
    paymentAccountNumber: { type: String, default: null },
    paymentAccountName: { type: String, default: null },
    paymentTerms: { type: String, default: null },
    includeTax: { type: Boolean, default: false },
    paymentReceiptUrl: { type: String, default: null },
    vendorInvoiceUrl: { type: String, default: null },
    paidAt: { type: Date, default: null },
    status: { type: String, default: "DRAFT" },
    createdAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
  },
  { collection: "PurchaseOrder", strict: false, versionKey: false },
);

const PurchaseOrder =
  models.PurchaseOrder ||
  model("PurchaseOrder", purchaseOrderSchema, "PurchaseOrder");

export default PurchaseOrder;
