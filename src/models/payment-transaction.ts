import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const paymentTransactionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    poId: { type: String, default: null },
    ticketId: { type: String, default: null },
    directStockPurchaseId: { type: String, default: null },
    paymentType: {
      type: String,
      enum: ["FULL_PAYMENT", "DOWN_PAYMENT", "PROGRESS_PAYMENT"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    transferDestination: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "CANCELLED"],
      default: "PENDING",
    },
    processedById: { type: String, default: null },
    proofOfTransferUrl: { type: String, default: null },
    additionalProofUrls: { type: [String], default: [] },
    proofEditDisabledUrls: { type: [String], default: [] },
    paidAt: { type: Date, default: null },
    confirmationOrderNumber: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "PaymentTransaction", versionKey: false },
);

paymentTransactionSchema.index({ ticketId: 1, status: 1, createdAt: -1 });

const PaymentTransaction =
  models.PaymentTransaction ||
  model("PaymentTransaction", paymentTransactionSchema, "PaymentTransaction");

export default PaymentTransaction;
