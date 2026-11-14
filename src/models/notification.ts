import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    userId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 180 },
    message: { type: String, required: true, maxlength: 2000 },
    type: {
      type: String,
      enum: ["INFO", "SUCCESS", "WARNING", "APPROVAL"],
      default: "INFO",
    },
    isRead: { type: Boolean, default: false },
    actionUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "Notification", versionKey: false },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification =
  models.Notification ||
  model("Notification", notificationSchema, "Notification");

export default Notification;
