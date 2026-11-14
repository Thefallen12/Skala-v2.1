import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const officeExpenseSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    expenseType: { type: String, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    recipientId: { type: String, required: true },
    accountId: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    proofUrls: { type: [String], default: [] },
    recordedBy: { type: String, required: true },
    cashflowId: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "OfficeExpense", versionKey: false },
);

officeExpenseSchema.index({ recipientId: 1, createdAt: -1 });
officeExpenseSchema.index({ accountId: 1, createdAt: -1 });

const OfficeExpense =
  models.OfficeExpense ||
  model("OfficeExpense", officeExpenseSchema, "OfficeExpense");

export default OfficeExpense;
