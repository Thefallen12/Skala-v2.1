import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { DocType } from "./src/generated/prisma/enums";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");

const prisma = new PrismaClient();

const editableTable = `<table class="items po-items"><thead><tr><th>DESCRIPTION</th><th class="number">QTY</th><th class="money">UNIT PRICE</th><th class="money">AMOUNT</th></tr></thead><tbody><tr><td>Contoh material</td><td>1</td><td>Rp 0</td><td>Rp 0</td></tr></tbody></table>`;

async function main() {
  const template = await prisma.documentTemplate.findFirst({
    where: {
      name: "Template Purchase Order Material",
      type: DocType.PURCHASE_ORDER,
    },
    select: { id: true, contentHtml: true, variables: true },
  });
  if (!template) throw new Error("Template Purchase Order Material tidak ditemukan.");

  const placeholderPattern =
    /<p\b[^>]*>\s*\{\{\s*items_table\s*\}\}\s*<\/p>|\{\{\s*items_table\s*\}\}/i;
  if (!placeholderPattern.test(template.contentHtml)) {
    console.log("Template sudah menggunakan tabel material yang bisa diedit.");
    return;
  }

  const variables = [
    ...new Set(
      template.variables
        .split(",")
        .map((variable) => variable.trim())
        .filter((variable) => variable && variable !== "items_table")
        .concat("items_rows"),
    ),
  ].join(",");

  await prisma.documentTemplate.update({
    where: { id: template.id },
    data: {
      contentHtml: template.contentHtml.replace(placeholderPattern, editableTable),
      variables,
    },
  });
  console.log(`Updated editable material table for template ${template.id}`);
}

main()
  .catch((error: unknown) => {
    console.error("Editable PO material table upgrade failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
