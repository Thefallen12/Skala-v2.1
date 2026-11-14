import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const cashflowSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    sourceDesc: { type: String, required: true },
    projectId: { type: String, default: null },
    paymentMethod: { type: String, required: true },
    senderName: { type: String, default: null },
    proofUrl: { type: String, default: null },
    accountId: { type: String, required: true },
    recordedBy: { type: String, required: true },
    paymentTransactionId: { type: String, default: null },
    transferGroupId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "Cashflow", versionKey: false },
);

cashflowSchema.index(
  { paymentTransactionId: 1 },
  { unique: true, sparse: true },
);
cashflowSchema.index({ accountId: 1, createdAt: -1 });

const Cashflow = models.Cashflow || model("Cashflow", cashflowSchema, "Cashflow");

export default Cashflow;
