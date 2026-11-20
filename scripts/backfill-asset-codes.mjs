#!/usr/bin/env node
/**
 * Backfill / Audit Asset Codes in MongoDB (`AssetRecord`, `DocumentNumberSequence`,
 * `ProjectProgressPhoto`, `ProjectWorkPointProgressPhoto`).
 *
 * Usage:
 *   node scripts/backfill-asset-codes.mjs --dry-run
 *   node scripts/backfill-asset-codes.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const val = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const { PrismaClient } = require("@prisma/client");
const mongoose = require("mongoose");

const ASSET_KIND_META = {
  FTO: "FOTO_PROGRES",
  TTK: "FOTO_TITIK",
  SRV: "SURVEY",
  SJN: "SURAT_JALAN",
  BLJ: "BELANJA",
  BBM: "BBM",
  DRW: "DRAWING",
  BKT: "BUKTI_TRANSFER",
  BON: "BON",
  KWT: "KWITANSI",
  INV: "INVOICE",
  USR: "PROFIL",
  TPL: "TEMPLATE",
};

const ASSET_CODE_REGEX =
  /([A-Z0-9]{2,28})-(FTO|TTK|SRV|SJN|BLJ|BBM|DRW|BKT|BON|KWT|INV|USR|TPL)-(\d+)X/i;

function normalizeProjectSlugBase(value) {
  if (!value) return "UMUM";
  const cleaned = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /^(rehab(ilitasi)?(\s+lahan)?(\s+sawah)?|poktan|kelompok\s*tani|kth|kel\.?\s*tani)\s*[-–:]\s*/i,
      "",
    )
    .trim();
  const compact = cleaned.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  if (compact.length < 2) return "UMUM";
  return compact.slice(0, 20);
}

function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.indexOf("upload");
    const authIndex = segments.indexOf("authenticated");
    const markerIndex = uploadIndex >= 0 ? uploadIndex : authIndex;
    if (markerIndex < 0 || segments.length <= markerIndex + 1) return null;
    const assetPath = segments
      .slice(markerIndex + 1)
      .filter((seg) => !/^v\d+$/.test(seg));
    if (assetPath.length === 0) return null;
    const isRaw = segments[1] === "raw";
    if (!isRaw) {
      assetPath[assetPath.length - 1] = assetPath.at(-1).replace(/\.[^.]+$/, "");
    }
    return assetPath.join("/");
  } catch {
    return null;
  }
}

function inferProvider(url) {
  if (!url) return "legacy";
  if (url.includes("res.cloudinary.com")) return "cloudinary";
  if (url.includes("/api/files/gdrive/")) return "gdrive";
  if (url.startsWith("/api/")) return "local_private";
  return "legacy";
}

function parseAssetCode(value) {
  if (!value) return null;
  const m = String(value).match(ASSET_CODE_REGEX);
  if (!m) return null;
  const projectSlug = m[1].toUpperCase();
  const kind = m[2].toUpperCase();
  const seq = Number.parseInt(m[3], 10);
  if (!Number.isFinite(seq) || seq <= 0) return null;
  return {
    assetCode: `${projectSlug}-${kind}-${seq}X`,
    projectSlug,
    kind,
    sequenceNumber: seq,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  console.log(`Mode: ${apply ? "APPLY (menulis ke MongoDB)" : "DRY-RUN (audit tanpa ubah DB)"}`);

  const prisma = new PrismaClient();
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI belum diatur.");
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const assetColl = db.collection("AssetRecord");
  const seqColl = db.collection("DocumentNumberSequence");

  // Load projects map for slug resolution
  const projects = await prisma.project.findMany({
    select: { id: true, code: true, name: true, title: true, kelompokTani: true },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const slugByProjectId = new Map();
  const usedSlugsByOtherProject = new Map();

  for (const p of projects) {
    const base = normalizeProjectSlugBase(p.name || p.title || p.kelompokTani || p.code);
    let resolved = base;
    if (base !== "UMUM") {
      const owner = usedSlugsByOtherProject.get(base);
      if (owner && owner !== p.id) {
        const suffix = (p.code || p.id).replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase() || "PRJ";
        resolved = `${base.slice(0, Math.max(4, 20 - suffix.length))}${suffix}`;
      }
      if (!usedSlugsByOtherProject.has(resolved)) {
        usedSlugsByOtherProject.set(resolved, p.id);
      }
    }
    slugByProjectId.set(p.id, resolved);
  }

  // Load existing AssetRecords & sequences so backfill never reuses already-issued codes
  const existingAssets = await assetColl.find({}).toArray();
  const existingByUrl = new Map();
  const usedCodes = new Set();
  const counters = new Map(); // `${scopeKey}::${kind}` -> max seq

  for (const doc of existingAssets) {
    if (doc.url) existingByUrl.set(doc.url, doc);
    if (doc.assetCode) usedCodes.add(String(doc.assetCode).toUpperCase());
    if (doc.projectSlug && doc.kind && Number.isFinite(doc.sequenceNumber)) {
      const scopeKey = doc.projectId ? `PRJ:${doc.projectId}` : doc.projectSlug === "UMUM" ? "GLOBAL:UMUM" : `SCOPE:${doc.projectSlug}`;
      const ck = `${scopeKey}::${doc.kind}`;
      counters.set(ck, Math.max(counters.get(ck) ?? 0, Number(doc.sequenceNumber)));
    }
  }

  const existingSeqs = await seqColl.find({ kind: /^ASSET:/, year: 0 }).toArray();
  for (const s of existingSeqs) {
    // s.kind = ASSET:${scopeKey}:${kind}
    const parts = String(s.kind).split(":");
    const kind = parts.pop();
    const scopeKey = parts.slice(1).join(":");
    const ck = `${scopeKey}::${kind}`;
    counters.set(ck, Math.max(counters.get(ck) ?? 0, Number(s.value ?? 0)));
  }

  function allocateCode({ projectId, fallbackScope, kind, url, existingAssetCode }) {
    const preParsed =
      parseAssetCode(existingAssetCode) ||
      parseAssetCode(url);

    let resolvedProjectId = projectId || null;
    let project = resolvedProjectId ? projectById.get(resolvedProjectId) : null;
    if (resolvedProjectId && !project) resolvedProjectId = null;

    let projectSlug = project
      ? slugByProjectId.get(project.id) || "UMUM"
      : fallbackScope
        ? normalizeProjectSlugBase(fallbackScope)
        : "UMUM";

    let scopeKey = project
      ? `PRJ:${project.id}`
      : projectSlug === "UMUM"
        ? "GLOBAL:UMUM"
        : `SCOPE:${projectSlug}`;

    if (preParsed && preParsed.kind === kind) {
      const ck = `${scopeKey}::${kind}`;
      counters.set(ck, Math.max(counters.get(ck) ?? 0, preParsed.sequenceNumber));
      usedCodes.add(preParsed.assetCode);
      return {
        assetCode: preParsed.assetCode,
        projectId: project?.id ?? null,
        projectName: project?.name || project?.title || null,
        projectCode: project?.code || null,
        projectSlug: preParsed.projectSlug,
        kind,
        sequenceNumber: preParsed.sequenceNumber,
        scopeKey,
      };
    }

    const ck = `${scopeKey}::${kind}`;
    let seq = counters.get(ck) ?? 0;
    let code = "";
    do {
      seq += 1;
      code = `${projectSlug}-${kind}-${seq}X`;
    } while (usedCodes.has(code));
    counters.set(ck, seq);
    usedCodes.add(code);

    return {
      assetCode: code,
      projectId: project?.id ?? null,
      projectName: project?.name || project?.title || null,
      projectCode: project?.code || null,
      projectSlug,
      kind,
      sequenceNumber: seq,
      scopeKey,
    };
  }

  const items = []; // candidate assets collected in deterministic chronological order

  // 1. ProjectProgressPhoto
  const progressPhotos = await prisma.projectProgressPhoto.findMany({
    include: { dailyReport: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const row of progressPhotos) {
    items.push({
      prismaModel: "projectProgressPhoto",
      prismaId: row.id,
      projectId: row.projectId || row.dailyReport?.projectId || null,
      kind: "FTO",
      url: row.url,
      publicId: row.publicId || extractCloudinaryPublicId(row.url),
      existingAssetCode: row.assetCode,
      entityType: "ProjectProgressPhoto",
      entityId: row.id,
      createdAt: row.createdAt,
    });
  }

  // 2. ProjectWorkPointProgressPhoto
  const wpPhotos = await prisma.projectWorkPointProgressPhoto.findMany({
    include: { progressReport: { select: { workPoint: { select: { projectId: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  for (const row of wpPhotos) {
    items.push({
      prismaModel: "projectWorkPointProgressPhoto",
      prismaId: row.id,
      projectId: row.projectId || row.progressReport?.workPoint?.projectId || null,
      kind: "TTK",
      url: row.url,
      publicId: row.publicId || extractCloudinaryPublicId(row.url),
      existingAssetCode: row.assetCode,
      entityType: "ProjectWorkPointProgressPhoto",
      entityId: row.id,
      createdAt: row.createdAt,
    });
  }

  // 3. FieldSurvey + SurveyPhoto + SurveyFeature
  const surveys = await prisma.fieldSurvey.findMany({
    include: { features: true, photos: true },
    orderBy: { createdAt: "asc" },
  });
  for (const s of surveys) {
    for (const url of s.documentationUrls ?? []) {
      items.push({ projectId: s.projectId, kind: "SRV", url, entityType: "FieldSurvey", entityId: s.id, createdAt: s.createdAt });
    }
    for (const ph of s.photos ?? []) {
      items.push({ projectId: s.projectId, kind: "SRV", url: ph.url, entityType: "SurveyPhoto", entityId: ph.id, createdAt: ph.createdAt });
    }
    for (const f of s.features ?? []) {
      for (const url of f.photoUrls ?? []) {
        items.push({ projectId: s.projectId, kind: "SRV", url, entityType: "SurveyFeature", entityId: f.id, createdAt: f.createdAt });
      }
    }
  }

  // 4. DeliveryOrder & DeliveryOrderProof
  const deliveryOrders = await prisma.deliveryOrder.findMany({
    include: { ticket: { select: { projectId: true } }, po: { select: { projectId: true } }, proofs: true },
    orderBy: { createdAt: "asc" },
  });
  for (const d of deliveryOrders) {
    const projectId = d.ticket?.projectId || d.po?.projectId || null;
    if (d.arrivalPhotoUrl) items.push({ projectId, ticketId: d.ticketId, kind: "SJN", url: d.arrivalPhotoUrl, entityType: "DeliveryOrder", entityId: d.id, createdAt: d.createdAt });
    if (d.deliveryReceiptUrl) items.push({ projectId, ticketId: d.ticketId, kind: "SJN", url: d.deliveryReceiptUrl, entityType: "DeliveryOrder", entityId: d.id, createdAt: d.createdAt });
    for (const p of d.proofs ?? []) {
      items.push({ projectId, ticketId: d.ticketId, kind: "SJN", url: p.url, entityType: "DeliveryOrderProof", entityId: p.id, createdAt: p.createdAt });
    }
  }

  // 5. VehicleFuelRequest
  const fuelReqs = await prisma.vehicleFuelRequest.findMany({ orderBy: { createdAt: "asc" } });
  for (const f of fuelReqs) {
    if (f.beforeFillingPhotoUrl) items.push({ projectId: f.projectId, kind: "BBM", url: f.beforeFillingPhotoUrl, entityType: "VehicleFuelRequest", entityId: f.id, createdAt: f.createdAt });
    if (f.afterFillingPhotoUrl) items.push({ projectId: f.projectId, kind: "BBM", url: f.afterFillingPhotoUrl, entityType: "VehicleFuelRequest", entityId: f.id, createdAt: f.createdAt });
    if (f.receiptPhotoUrl) items.push({ projectId: f.projectId, kind: "BON", url: f.receiptPhotoUrl, entityType: "VehicleFuelRequest", entityId: f.id, createdAt: f.createdAt });
    if (f.transferProofUrl) items.push({ projectId: f.projectId, kind: "BKT", url: f.transferProofUrl, entityType: "VehicleFuelRequest", entityId: f.id, createdAt: f.createdAt });
  }

  // 6. Ticket
  const tickets = await prisma.ticket.findMany({ orderBy: { createdAt: "asc" } });
  for (const t of tickets) {
    if (t.paymentProofUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "BKT", url: t.paymentProofUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    if (t.transferReceiptUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "BKT", url: t.transferReceiptUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    if (t.purchaseReceiptUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "BON", url: t.purchaseReceiptUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    if (t.attachmentUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "BON", url: t.attachmentUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    for (const u of t.receiptUrls ?? []) {
      items.push({ projectId: t.projectId, ticketId: t.id, kind: "BON", url: u, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    }
    if (t.deliveryReceiptUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "SJN", url: t.deliveryReceiptUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
    if (t.deliveryOrderReceiptUrl) items.push({ projectId: t.projectId, ticketId: t.id, kind: "SJN", url: t.deliveryOrderReceiptUrl, entityType: "Ticket", entityId: t.id, createdAt: t.createdAt });
  }

  // 7. PurchaseOrder
  const pos = await prisma.purchaseOrder.findMany({
    include: { ticket: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const po of pos) {
    const projectId = po.projectId || po.ticket?.projectId || null;
    if (po.vendorInvoiceUrl) items.push({ projectId, ticketId: po.ticketId, kind: "INV", url: po.vendorInvoiceUrl, entityType: "PurchaseOrder", entityId: po.id, createdAt: po.createdAt });
    if (po.paymentReceiptUrl) items.push({ projectId, ticketId: po.ticketId, kind: "BKT", url: po.paymentReceiptUrl, entityType: "PurchaseOrder", entityId: po.id, createdAt: po.createdAt });
  }

  // 8. PaymentTransaction
  const payments = await prisma.paymentTransaction.findMany({
    include: { ticket: { select: { projectId: true } }, po: { select: { projectId: true, paymentMethod: true } }, cashflow: { select: { projectId: true, paymentMethod: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const pt of payments) {
    const projectId = pt.projectId || pt.ticket?.projectId || pt.po?.projectId || pt.cashflow?.projectId || null;
    const isCash = pt.po?.paymentMethod === "CASH" || pt.cashflow?.paymentMethod === "CASH";
    const kind = isCash ? "KWT" : "BKT";
    if (pt.proofOfTransferUrl) items.push({ projectId, ticketId: pt.ticketId, kind, url: pt.proofOfTransferUrl, entityType: "PaymentTransaction", entityId: pt.id, createdAt: pt.createdAt });
    for (const u of pt.additionalProofUrls ?? []) {
      items.push({ projectId, ticketId: pt.ticketId, kind, url: u, entityType: "PaymentTransaction", entityId: pt.id, createdAt: pt.createdAt });
    }
  }

  // 9. Cashflow
  const cashflows = await prisma.cashflow.findMany({ orderBy: { createdAt: "asc" } });
  for (const c of cashflows) {
    if (!c.proofUrl) continue;
    const kind = c.paymentMethod === "CASH" ? "KWT" : "BKT";
    items.push({ projectId: c.projectId, kind, url: c.proofUrl, entityType: "Cashflow", entityId: c.id, createdAt: c.createdAt });
  }

  // 10. OfficeExpense
  const expenses = await prisma.officeExpense.findMany({ orderBy: { createdAt: "asc" } });
  for (const e of expenses) {
    const kind = e.paymentMethod === "CASH" ? "KWT" : "BON";
    for (const u of e.proofUrls ?? []) {
      items.push({ projectId: null, kind, url: u, entityType: "OfficeExpense", entityId: e.id, createdAt: e.createdAt });
    }
  }

  // 11. OrderConfirmation, DirectStockPurchase, MaterialDelivery, VendorInvoicePayment, Subkon, Rental, Invoice
  const orderConfs = await prisma.orderConfirmation.findMany({
    include: { po: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const oc of orderConfs) {
    if (oc.proofOfTransferUrl) items.push({ projectId: oc.po?.projectId || null, kind: "BKT", url: oc.proofOfTransferUrl, entityType: "OrderConfirmation", entityId: oc.id, createdAt: oc.createdAt });
  }

  const directPurchases = await prisma.directStockPurchase.findMany({
    include: { ticket: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const dsp of directPurchases) {
    const projectId = dsp.ticket?.projectId || null;
    if (dsp.vendorInvoiceUrl) items.push({ projectId, ticketId: dsp.ticketId, kind: "INV", url: dsp.vendorInvoiceUrl, entityType: "DirectStockPurchase", entityId: dsp.id, createdAt: dsp.createdAt });
    if (dsp.arrivalPhotoUrl) items.push({ projectId, ticketId: dsp.ticketId, kind: "BLJ", url: dsp.arrivalPhotoUrl, entityType: "DirectStockPurchase", entityId: dsp.id, createdAt: dsp.createdAt });
    for (const u of dsp.receivedPhotos ?? []) {
      items.push({ projectId, ticketId: dsp.ticketId, kind: "BLJ", url: u, entityType: "DirectStockPurchase", entityId: dsp.id, createdAt: dsp.createdAt });
    }
  }

  const deliveries = await prisma.materialDelivery.findMany({ orderBy: { createdAt: "asc" } });
  for (const md of deliveries) {
    if (md.proofUrl) items.push({ projectId: md.projectId, ticketId: md.ticketId, kind: "SJN", url: md.proofUrl, entityType: "MaterialDelivery", entityId: md.id, createdAt: md.createdAt });
  }

  const vipPayments = await prisma.vendorInvoicePayment.findMany({
    include: { vendorInvoice: { include: { deliveries: { select: { projectId: true }, take: 1 } } } },
    orderBy: { createdAt: "asc" },
  });
  for (const vp of vipPayments) {
    const projectId = vp.vendorInvoice?.deliveries?.[0]?.projectId || null;
    if (vp.proofOfTransferUrl) items.push({ projectId, kind: vp.paymentMethod === "CASH" ? "KWT" : "BKT", url: vp.proofOfTransferUrl, entityType: "VendorInvoicePayment", entityId: vp.id, createdAt: vp.createdAt });
  }

  const subkons = await prisma.subkonContract.findMany({ orderBy: { createdAt: "asc" } });
  for (const sc of subkons) {
    if (sc.retentionReleaseProofUrl) items.push({ projectId: sc.projectId, kind: "BKT", url: sc.retentionReleaseProofUrl, entityType: "SubkonContract", entityId: sc.id, createdAt: sc.createdAt });
  }
  const termyns = await prisma.subkonTermyn.findMany({
    include: { subkonContract: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const tm of termyns) {
    if (tm.paymentProofUrl) items.push({ projectId: tm.subkonContract?.projectId || null, kind: "BKT", url: tm.paymentProofUrl, entityType: "SubkonTermyn", entityId: tm.id, createdAt: tm.createdAt });
  }

  const rentals = await prisma.equipmentRental.findMany({ orderBy: { createdAt: "asc" } });
  for (const r of rentals) {
    if (r.proofOfPaymentUrl) items.push({ projectId: r.projectId, kind: "BKT", url: r.proofOfPaymentUrl, entityType: "EquipmentRental", entityId: r.id, createdAt: r.createdAt });
  }

  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: "asc" } });
  for (const inv of invoices) {
    if (inv.documentUrl) items.push({ projectId: inv.projectId, kind: "INV", url: inv.documentUrl, entityType: "Invoice", entityId: inv.id, createdAt: inv.createdAt });
  }

  // 12. Drawings & Blueprints & Users
  const blueprints = await prisma.blueprint.findMany({ orderBy: { createdAt: "asc" } });
  for (const b of blueprints) {
    if (b.fileUrl) items.push({ projectId: b.projectId, kind: "DRW", url: b.fileUrl, entityType: "Blueprint", entityId: b.id, createdAt: b.createdAt });
  }
  const drawings = await prisma.drawingDocument.findMany({ orderBy: { createdAt: "asc" } });
  for (const d of drawings) {
    if (d.fileUrl) items.push({ projectId: d.projectId, kind: "DRW", url: d.fileUrl, entityType: "DrawingDocument", entityId: d.id, createdAt: d.createdAt });
    if (d.thumbnailUrl) items.push({ projectId: d.projectId, kind: "DRW", url: d.thumbnailUrl, entityType: "DrawingDocument", entityId: d.id, createdAt: d.createdAt });
  }
  const users = await prisma.user.findMany({
    where: { profilePhotoUrl: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    if (u.profilePhotoUrl) items.push({ fallbackScope: "USER", kind: "USR", url: u.profilePhotoUrl, entityType: "User", entityId: u.id, createdAt: u.createdAt });
  }

  // Dedupe by URL and assign asset codes
  const assignedByUrl = new Map(existingByUrl);
  const publicIdCounts = new Map();
  let newAssetsCount = 0;
  let updatedProgressPhotos = 0;
  let updatedWorkPointPhotos = 0;
  const samples = [];

  for (const item of items) {
    const url = item.url?.trim();
    if (!url) continue;

    const pid = item.publicId || extractCloudinaryPublicId(url);
    if (pid) {
      if (!publicIdCounts.has(pid)) publicIdCounts.set(pid, new Set());
      publicIdCounts.get(pid).add(url);
    }

    let allocated = assignedByUrl.get(url);
    if (!allocated) {
      const next = allocateCode({
        projectId: item.projectId,
        fallbackScope: item.fallbackScope,
        kind: item.kind,
        url,
        existingAssetCode: item.existingAssetCode,
      });
      allocated = {
        ...next,
        docType: ASSET_KIND_META[next.kind] || next.kind,
        provider: inferProvider(url),
        publicId: pid || null,
        url,
        fileUrl: url,
        entityType: item.entityType,
        entityId: item.entityId,
        ticketId: item.ticketId || null,
      };
      assignedByUrl.set(url, allocated);
      newAssetsCount += 1;

      if (samples.length < 25) {
        samples.push({
          assetCode: allocated.assetCode,
          projectName: allocated.projectName || allocated.projectSlug,
          kind: allocated.kind,
          entityType: allocated.entityType,
          url: url.slice(0, 75),
        });
      }

      if (apply) {
        await assetColl.updateOne(
          { assetCode: allocated.assetCode },
          {
            $set: {
              projectId: allocated.projectId,
              projectName: allocated.projectName,
              projectCode: allocated.projectCode,
              projectSlug: allocated.projectSlug,
              kind: allocated.kind,
              sequenceNumber: allocated.sequenceNumber,
              docType: allocated.docType,
              provider: allocated.provider,
              publicId: allocated.publicId,
              driveFileId: null,
              url: allocated.url,
              fileUrl: allocated.fileUrl,
              entityType: allocated.entityType,
              entityId: allocated.entityId,
              ticketId: allocated.ticketId,
              deletedAt: null,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              _id: randomUUID(),
              assetCode: allocated.assetCode,
              createdAt: item.createdAt || new Date(),
            },
          },
          { upsert: true },
        );
      }
    }

    if (item.prismaModel === "projectProgressPhoto") {
      if (apply && (item.existingAssetCode !== allocated.assetCode || item.projectId)) {
        await prisma.projectProgressPhoto.update({
          where: { id: item.prismaId },
          data: {
            assetCode: allocated.assetCode,
            projectId: allocated.projectId ?? undefined,
          },
        });
        updatedProgressPhotos += 1;
      } else if (!apply && item.existingAssetCode !== allocated.assetCode) {
        updatedProgressPhotos += 1;
      }
    } else if (item.prismaModel === "projectWorkPointProgressPhoto") {
      if (apply && (item.existingAssetCode !== allocated.assetCode || item.projectId)) {
        await prisma.projectWorkPointProgressPhoto.update({
          where: { id: item.prismaId },
          data: {
            assetCode: allocated.assetCode,
            projectId: allocated.projectId ?? undefined,
          },
        });
        updatedWorkPointPhotos += 1;
      } else if (!apply && item.existingAssetCode !== allocated.assetCode) {
        updatedWorkPointPhotos += 1;
      }
    }
  }

  // Update high-water marks in DocumentNumberSequence
  let updatedSeqs = 0;
  for (const [ck, maxVal] of counters.entries()) {
    const [scopeKey, kind] = [ck.slice(0, ck.lastIndexOf("::")), ck.slice(ck.lastIndexOf("::") + 2)];
    const seqKind = `ASSET:${scopeKey}:${kind}`;
    updatedSeqs += 1;
    if (apply) {
      await seqColl.updateOne(
        { kind: seqKind, year: 0 },
        {
          $max: { value: maxVal },
          $setOnInsert: { _id: randomUUID(), kind: seqKind, year: 0 },
        },
        { upsert: true },
      );
    }
  }

  // Ensure indexes on AssetRecord
  if (apply) {
    await assetColl.createIndex({ assetCode: 1 }, { unique: true });
    await assetColl.createIndex({ projectId: 1, kind: 1, createdAt: -1 });
    await assetColl.createIndex({ url: 1 });
    await assetColl.createIndex({ publicId: 1 });
  }

  const sharedPublicIds = [...publicIdCounts.entries()]
    .filter(([, urls]) => urls.size > 1)
    .map(([pid, urls]) => ({ publicId: pid, distinctUrls: urls.size }));

  console.log("=== RINGKASAN BACKFILL KODE ASET ===");
  console.log("Total item URL ditemukan:", items.length);
  console.log("AssetRecord baru yang didaftarkan:", newAssetsCount);
  console.log("ProjectProgressPhoto terupdate:", updatedProgressPhotos);
  console.log("ProjectWorkPointProgressPhoto terupdate:", updatedWorkPointPhotos);
  console.log("Counter DocumentNumberSequence disinkronkan:", updatedSeqs);
  console.log("Legacy shared Cloudinary publicId ditemukan:", JSON.stringify(sharedPublicIds));
  console.log("Contoh kode aset:", JSON.stringify(samples, null, 2));

  await prisma.$disconnect();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
