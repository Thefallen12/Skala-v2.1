import { randomUUID } from "node:crypto";
import { model, models, Schema, type InferSchemaType } from "mongoose";
import {
  DEFAULT_EQUIPMENT_TIME_UNIT,
  EQUIPMENT_REQUEST_TYPE,
  EQUIPMENT_TIME_UNITS,
} from "@/lib/equipment-request";

export const TICKET_TYPES = [
  "MATERIAL",
  "COST",
  "OPERATIONAL",
  EQUIPMENT_REQUEST_TYPE,
] as const;

const equipmentDetailsSchema = new Schema(
  {
    equipmentName: { type: String, default: null, trim: true },
    startDate: { type: Date, default: null },
    duration: { type: Number, default: null, min: 0 },
    timeUnit: {
      type: String,
      enum: EQUIPMENT_TIME_UNITS,
      default: DEFAULT_EQUIPMENT_TIME_UNIT,
    },
    fulfillmentSource: {
      type: String,
      enum: ["INTERNAL", "EXTERNAL_VENDOR"],
      default: null,
    },
    vendorName: { type: String, default: null, trim: true },
    quotedCost: { type: Number, default: null, min: 0 },
    processedById: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { _id: false },
);

const ticketSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    ticketNumber: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null },
    type: {
      type: String,
      required: true,
      enum: TICKET_TYPES.filter((type) => type !== EQUIPMENT_REQUEST_TYPE),
    },
    ticketType: { type: String, enum: TICKET_TYPES, default: null },
    equipmentDetails: { type: equipmentDetailsSchema, default: null },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    status: { type: String, default: "DRAFT" },
    fulfillmentStatus: { type: String, default: "PENDING" },
    totalAmount: { type: Schema.Types.BigInt, default: null },
    requestedAmount: { type: Number, default: null },
    isApprovedByDirector: { type: Boolean, default: false },
    attachmentUrl: { type: String, default: null },
    receiptUrls: { type: [String], default: [] },
    paymentProofUrl: { type: String, default: null },
    requestCategory: { type: String, default: null },
    fieldCategory: { type: String, default: null },
    shippingDetails: { type: Schema.Types.Mixed, default: null },
    relatedPoIds: { type: [String], default: [] },
    relatedTicketIds: { type: [String], default: [] },
    requestPaymentMethod: { type: String, default: null },
    requestPaymentDescription: { type: String, default: null },
    recipientName: { type: String, default: null },
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    purchaseReceiptUrl: { type: String, default: null },
    transferReceiptUrl: { type: String, default: null },
    transferDestination: { type: String, default: null },
    deliveryReceiptUrl: { type: String, default: null },
    deliveryOrderReceiptUrl: { type: String, default: null },
    moverAssigneeId: { type: String, default: null },
    requesterId: { type: String, required: true },
    projectId: { type: String, default: null },
  },
  {
    collection: "Ticket",
    timestamps: true,
    versionKey: false,
  },
);

ticketSchema.index({ status: 1, type: 1 });
ticketSchema.index({ ticketType: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ requesterId: 1 });
ticketSchema.index({ projectId: 1 });
ticketSchema.index({ moverAssigneeId: 1, status: 1 });

export type TicketDocument = InferSchemaType<typeof ticketSchema>;

const Ticket =
  models.Ticket || model("Ticket", ticketSchema, "Ticket");

export default Ticket;
