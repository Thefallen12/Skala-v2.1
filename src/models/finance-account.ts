import { model, models, Schema } from "mongoose";

const financeAccountSchema = new Schema(
  {
    _id: { type: String },
    accountName: { type: String, required: true },
    accountNumber: { type: String, default: null },
    holderName: { type: String, required: true },
    balance: { type: Number, default: 0 },
  },
  { collection: "FinanceAccount", versionKey: false },
);

const FinanceAccount =
  models.FinanceAccount ||
  model("FinanceAccount", financeAccountSchema, "FinanceAccount");

export default FinanceAccount;
