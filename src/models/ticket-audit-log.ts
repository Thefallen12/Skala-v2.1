import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const ticketAuditLogSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    ticketId: { type: String, required: true },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    notes: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "TicketAuditLog", versionKey: false },
);

ticketAuditLogSchema.index({ ticketId: 1, createdAt: -1 });
ticketAuditLogSchema.index({ userId: 1 });

const TicketAuditLog =
  models.TicketAuditLog ||
  model("TicketAuditLog", ticketAuditLogSchema, "TicketAuditLog");

export default TicketAuditLog;
