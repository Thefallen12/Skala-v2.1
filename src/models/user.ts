import { model, models, Schema } from "mongoose";

const userSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    role: { type: String, required: true },
  },
  { collection: "User", strict: false, versionKey: false },
);

const User = models.User || model("User", userSchema, "User");

export default User;
