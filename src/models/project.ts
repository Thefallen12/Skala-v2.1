import { model, models, Schema } from "mongoose";

const projectSchema = new Schema(
  {
    _id: { type: String },
    title: { type: String, default: "" },
    kelompokTani: { type: String, default: "" },
  },
  { collection: "Project", strict: false, versionKey: false },
);

const Project = models.Project || model("Project", projectSchema, "Project");

export default Project;
