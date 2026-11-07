import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sanitizeDocumentTemplateHtml } from "@/lib/documents/sanitize-template-html";
import { createBrandedQrDataUrl } from "@/lib/documents/qr-code";
import { readDocumentTemplateImage } from "@/lib/document-template-images";
import { documentVerificationPath } from "@/lib/documents/verification-url";

export type DocumentLineItem = {
  itemCode?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  notes?: string;
  unitPrice: string;
  amount: string;
};

type DocumentLineItemField =
  | "item_code"
  | "item_description"
  | "item_qty"
  | "item_unit"
  | "item_unit_price";

export type DocumentData = Record<
  string,
  string | number | boolean | Date | DocumentLineItem[] | null | undefined
>;

export type GeneratedDocument = {
  name: string;
  html: string;
  issuedDocumentId: string;
  documentNumber: string;
  verificationUrl: string;
  pageMargins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type GenerateDocumentOptions = {
  issuedById: string;
  relatedRecordId?: string;
  verificationBaseUrl: string;
  existingIssuedDocumentId?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(
  value: Exclude<DocumentData[string], DocumentLineItem[]>,
): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(value);
  }
  return String(value);
}

function renderLineItems(
  value: DocumentLineItem[],
  isDeliveryOrder: boolean,
): string {
  return value
    .map(
      (item) =>
        isDeliveryOrder
          ? `<tr>
              <td>${escapeHtml(item.itemCode ?? "")}</td>
              <td>${escapeHtml(item.description)}</td>
              <td class="number">${escapeHtml(String(item.quantity))}</td>
              <td>${escapeHtml(item.unit ?? "")}</td>
              <td>${escapeHtml(item.notes ?? "")}</td>
            </tr>`
          : `<tr>
                <td>${escapeHtml(
                  item.unit ? `${item.description} (${item.unit})` : item.description,
                )}</td>
                <td class="number">${escapeHtml(String(item.quantity))}</td>
              <td class="money">${escapeHtml(item.unitPrice)}</td>
              <td class="money">${escapeHtml(item.amount)}</td>
            </tr>`,
    )
    .join("");
}

function renderItemsTable(
  items: DocumentLineItem[],
  isDeliveryOrder: boolean,
): string {
  const headers = isDeliveryOrder
    ? "<th>KODE BARANG / ITEM CODE</th><th>MATERIAL</th><th>JUMLAH</th><th>SATUAN</th>"
    : '<th>DESCRIPTION</th><th class="number">QTY</th><th class="money">UNIT PRICE</th><th class="money">AMOUNT</th>';
  const classes = isDeliveryOrder ? "items do-items" : "items po-items";
  return `<table class="${classes}"><thead><tr>${headers}</tr></thead><tbody>${renderLineItems(items, isDeliveryOrder)}</tbody></table>`;
}

function renderLineItemField(
  items: DocumentLineItem[],
  field: DocumentLineItemField,
  isDeliveryOrder: boolean,
): string {
  if (field === "item_unit_price" && isDeliveryOrder) return "";

  return items
    .map((item) => {
      const value =
        field === "item_code"
          ? item.itemCode ?? ""
          : field === "item_description"
          ? item.description
          : field === "item_qty"
            ? item.quantity
            : field === "item_unit"
              ? item.unit ?? ""
              : item.unitPrice;
      return escapeHtml(String(value));
    })
    .join("<br />");
}

function ensureItemsTableHeaders(html: string, isDeliveryOrder: boolean): string {
  const headers = isDeliveryOrder
    ? ["KODE BARANG / ITEM CODE", "MATERIAL", "JUMLAH", "SATUAN", "KETERANGAN"]
    : ["DESCRIPTION", "QTY", "UNIT PRICE", "AMOUNT"];
  return html.replace(
    /<table\b(?=[^>]*\bclass=["'][^"']*\b(?:items|po-items|do-items)\b[^"']*["'])[^>]*>[\s\S]*?<\/table>/gi,
    (table) => {
      const headerRow = /(<thead\b[^>]*>\s*<tr\b[^>]*>)([\s\S]*?)(<\/tr>\s*<\/thead>)/i;
      if (headerRow.test(table)) {
        if (!isDeliveryOrder) return table;
        return table.replace(headerRow, (_match, opening: string) =>
          `${opening}${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead>`,
        );
      }
      return table.replace(
        /(<table\b[^>]*>)(\s*)(<tbody\b[^>]*>)/i,
        (_match, opening: string, whitespace: string, bodyOpening: string) =>
          `${opening}${whitespace}<thead><tr>${headers
            .map((label) => `<th>${label}</th>`)
            .join("")}</tr></thead>${whitespace}${bodyOpening}`,
      );
    },
  );
}

async function inlineUploadedTemplateImages(html: string) {
  const imagePaths = [
    ...new Set(
      [...html.matchAll(/src=["'](\/api\/documents\/template-images\/([A-Za-z0-9._-]{1,180}))["']/g)]
        .map((match) => ({ src: match[1], fileName: match[2] })),
    ),
  ];
  let result = html;
  for (const { src, fileName } of imagePaths) {
    const image = await readDocumentTemplateImage(fileName);
    if (!image) {
      throw new Error("Gambar pada template tidak lagi tersedia.");
    }
    const dataUrl = `data:${image.contentType};base64,${Buffer.from(image.bytes).toString("base64")}`;
    result = result.replaceAll(src, dataUrl);
  }
  return result;
}

export async function generateDocument(
  templateId: string,
  dataObj: DocumentData,
  options: GenerateDocumentOptions,
): Promise<GeneratedDocument> {
  if (typeof templateId !== "string" || !templateId.trim()) {
    throw new Error("Template dokumen tidak valid.");
  }
  if (!dataObj || typeof dataObj !== "object" || Array.isArray(dataObj)) {
    throw new Error("Data untuk dokumen tidak valid.");
  }
  if (
    !options ||
    typeof options.issuedById !== "string" ||
    !options.issuedById.trim() ||
    typeof options.verificationBaseUrl !== "string"
  ) {
    throw new Error("Informasi penerbitan dokumen tidak valid.");
  }

  const verificationBaseUrl = new URL(options.verificationBaseUrl);
  if (!["http:", "https:"].includes(verificationBaseUrl.protocol)) {
    throw new Error("URL verifikasi dokumen tidak valid.");
  }

  return prisma.$transaction(async (transaction) => {
    const template = await transaction.documentTemplate.findUnique({
      where: { id: templateId },
      select: { name: true, type: true, contentHtml: true },
    });
    if (!template) {
      throw new Error("Template dokumen tidak ditemukan.");
    }

    const now = new Date();
    const isDeliveryOrder =
      template.type === "DO" || template.type === "SURAT_JALAN";
    const typePrefix: Record<string, string> = {
      INVOICE: "INV",
      PURCHASE_ORDER: "PO",
      DO: "DO",
      SPK: "SPK",
      SURAT_JALAN: "SJ",
      BAST: "BAST",
    };
    const documentNumber = `${typePrefix[template.type]}/${now.getUTCFullYear()}/${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}/${randomUUID().toUpperCase()}`;
    const issued = options.existingIssuedDocumentId
      ? await transaction.issuedDocument.findFirst({
          where: {
            id: options.existingIssuedDocumentId,
            templateId,
            relatedRecordId: options.relatedRecordId,
            status: "VALID",
          },
          select: { id: true, documentNumber: true },
        })
      : await transaction.issuedDocument.create({
          data: {
            documentNumber,
            templateId,
            relatedRecordId: options.relatedRecordId,
            issuedById: options.issuedById,
          },
          select: { id: true, documentNumber: true },
        });
    if (!issued) {
      throw new Error("Dokumen terbit tidak valid atau telah dicabut.");
    }
    const verificationUrl = new URL(
      documentVerificationPath("issued", issued.id),
      verificationBaseUrl,
    ).toString();
    const qrImage = await createBrandedQrDataUrl(verificationUrl, 240);
    let templateHtml = template.contentHtml.replace(
      /(<table\b(?=[^>]*\bclass=["'][^"']*\b(?:items|po-items)\b[^"']*["'])[^>]*>[\s\S]*?<tbody\b[^>]*>)[\s\S]*?(<\/tbody>[\s\S]*?<\/table>)/i,
      (_table, opening: string, closing: string) =>
        `${opening}{{items_rows}}${closing}`,
    );
    templateHtml = ensureItemsTableHeaders(templateHtml, isDeliveryOrder);
    const marginValues = templateHtml.match(
      /\bdata-document-page-margins=["'](\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})["']/i,
    );
    const parsedMargins = marginValues?.slice(1, 5).map(Number);
    const pageMargins =
      parsedMargins &&
      parsedMargins.every((margin) => margin >= 5 && margin <= 50)
        ? {
            top: parsedMargins[0],
            right: parsedMargins[1],
            bottom: parsedMargins[2],
            left: parsedMargins[3],
          }
        : { top: 20, right: 20, bottom: 20, left: 20 };
    const safeTemplate = await inlineUploadedTemplateImages(
      sanitizeDocumentTemplateHtml(templateHtml),
    );
    const qrElement =
      `<img src="${qrImage}" alt="QR Signature" width="100" height="100" />`;
    const hasQrPlaceholder = /\{\{\s*qr_signature\s*\}\}/.test(safeTemplate);
    const hasDocumentNumberPlaceholder =
      /\{\{\s*nomor_dokumen\s*\}\}/.test(safeTemplate);
    const html = safeTemplate.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_placeholder, key: string) => {
        if (key === "qr_signature") return qrElement;
        if (key === "items_rows") {
          const items = dataObj.items;
          return Array.isArray(items)
            ? renderLineItems(items, isDeliveryOrder)
            : "";
        }
        if (key === "items_table") {
          const items = dataObj.items;
          return Array.isArray(items)
            ? renderItemsTable(items, isDeliveryOrder)
            : "";
        }
        if (
          key === "item_code" ||
          key === "item_description" ||
          key === "item_qty" ||
          key === "item_unit" ||
          key === "item_unit_price"
        ) {
          const items = dataObj.items;
          return Array.isArray(items)
            ? renderLineItemField(items, key, isDeliveryOrder)
            : "";
        }
        if (key === "nomor_dokumen") return escapeHtml(documentNumber);
        if (key === "nomor_surat_jalan") return escapeHtml(documentNumber);
        if (key === "verification_url") return escapeHtml(verificationUrl);
        if (!Object.hasOwn(dataObj, key)) return "";
        const value = dataObj[key];
        return Array.isArray(value)
          ? key === "items"
            ? renderLineItems(value, isDeliveryOrder)
            : ""
          : escapeHtml(formatValue(value));
      },
    );
    const documentHtml = [
      html,
      !hasDocumentNumberPlaceholder
        ? `<p class="document-number"><strong>Nomor Dokumen:</strong> ${escapeHtml(documentNumber)}</p>`
        : "",
      !hasQrPlaceholder
        ? `<div class="verification-qr"><strong>Verifikasi Dokumen</strong><br />${qrElement}</div>`
        : "",
    ].join("");

    return {
      name: template.name,
      html: documentHtml,
      issuedDocumentId: issued.id,
      documentNumber: issued.documentNumber,
      verificationUrl,
      pageMargins,
    };
  });
}
