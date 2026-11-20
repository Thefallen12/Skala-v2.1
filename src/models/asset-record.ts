import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

export interface AssetRecordDocument {
  _id: string;
  assetCode: string;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  projectSlug: string;
  kind: string;
  sequenceNumber: number;
  docType: string | null;
  provider: "cloudinary" | "gdrive" | "local_private" | "legacy";
  publicId: string | null;
  driveFileId: string | null;
  url: string;
  fileUrl: string | null;
  folder: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  entityType: string | null;
  entityId: string | null;
  ticketId: string | null;
  uploadedById: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const assetRecordSchema = new Schema<AssetRecordDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    assetCode: { type: String, required: true, trim: true, uppercase: true },
    projectId: { type: String, default: null },
    projectName: { type: String, default: null },
    projectCode: { type: String, default: null },
    projectSlug: { type: String, required: true, trim: true, uppercase: true },
    kind: { type: String, required: true, trim: true, uppercase: true },
    sequenceNumber: { type: Number, required: true },
    docType: { type: String, default: null },
    provider: {
      type: String,
      required: true,
      enum: ["cloudinary", "gdrive", "local_private", "legacy"],
      default: "cloudinary",
    },
    publicId: { type: String, default: null },
    driveFileId: { type: String, default: null },
    url: { type: String, required: true },
    fileUrl: { type: String, default: null },
    folder: { type: String, default: null },
    mimeType: { type: String, default: null },
    originalFilename: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    ticketId: { type: String, default: null },
    uploadedById: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: "AssetRecord",
    timestamps: true,
    versionKey: false,
  },
);

assetRecordSchema.index({ assetCode: 1 }, { unique: true });
assetRecordSchema.index({ projectId: 1, kind: 1, createdAt: -1 });
assetRecordSchema.index({ projectSlug: 1, kind: 1 });
assetRecordSchema.index({ url: 1 });
assetRecordSchema.index({ publicId: 1 });
assetRecordSchema.index({ driveFileId: 1 });
assetRecordSchema.index({ entityType: 1, entityId: 1 });

export const AssetRecordModel =
  models.AssetRecord || model<AssetRecordDocument>("AssetRecord", assetRecordSchema);

export interface DriveFolderCacheDocument {
  _id: string;
  cacheKey: string;
  folderId: string;
  parentId: string | null;
  updatedAt: Date;
}

const driveFolderCacheSchema = new Schema<DriveFolderCacheDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    cacheKey: { type: String, required: true },
    folderId: { type: String, required: true },
    parentId: { type: String, default: null },
  },
  {
    collection: "DriveFolderCache",
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
  },
);

driveFolderCacheSchema.index({ cacheKey: 1 }, { unique: true });

export const DriveFolderCacheModel =
  models.DriveFolderCache ||
  model<DriveFolderCacheDocument>("DriveFolderCache", driveFolderCacheSchema);

export default AssetRecordModel;
