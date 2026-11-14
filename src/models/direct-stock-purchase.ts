import { model, models, Schema } from "mongoose";

const directStockPurchaseSchema = new Schema(
  {
    _id: { type: String },
    purchaseNumber: { type: String, default: null },
    vendorId: { type: String, default: null },
    vendorName: { type: String, default: null },
    ticketId: { type: String, default: null },
    paymentMethod: { type: String, default: "CASH" },
    totalAmount: { type: Schema.Types.BigInt, default: BigInt(0) },
    paymentBankName: { type: String, default: null },
    paymentAccountNumber: { type: String, default: null },
    paymentAccountName: { type: String, default: null },
    vendorInvoiceUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    isApprovedByDirector: { type: Boolean, default: false },
  },
  { collection: "DirectStockPurchase", strict: false, versionKey: false },
);

const DirectStockPurchase =
  models.DirectStockPurchase ||
  model(
    "DirectStockPurchase",
    directStockPurchaseSchema,
    "DirectStockPurchase",
  );

export default DirectStockPurchase;
