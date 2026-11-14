import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const documentNumberSequenceSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    kind: { type: String, required: true },
    year: { type: Number, required: true },
    value: { type: Number, default: 0 },
  },
  { collection: "DocumentNumberSequence", versionKey: false },
);

documentNumberSequenceSchema.index({ kind: 1, year: 1 }, { unique: true });

const DocumentNumberSequence =
  models.DocumentNumberSequence ||
  model(
    "DocumentNumberSequence",
    documentNumberSequenceSchema,
    "DocumentNumberSequence",
  );

export default DocumentNumberSequence;
