import { config } from "dotenv";
import { MongoClient } from "mongodb";

config();

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  throw new Error("MONGODB_URI is required to migrate the invoice-number index.");
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const invoices = client.db().collection("Invoice");
  const existingIndexes = await invoices.listIndexes().toArray();
  const existingIndex = existingIndexes.find(
    (index) => index.key?.invoiceNumber === 1,
  );
  const existingIsPartialUnique =
    existingIndex?.unique === true &&
    existingIndex.partialFilterExpression?.invoiceNumber?.$type === "string";

  if (existingIsPartialUnique) {
    console.info("Invoice-number index already allows invoices without a number.");
  } else {
    const duplicate = await invoices
      .aggregate([
        { $match: { invoiceNumber: { $type: "string" } } },
        { $group: { _id: "$invoiceNumber", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ])
      .next();
    if (duplicate) {
      throw new Error(
        "Duplicate invoice numbers exist; resolve them before changing the unique index.",
      );
    }

    if (existingIndex) {
      await invoices.dropIndex(existingIndex.name);
    }

    try {
      await invoices.createIndex(
        { invoiceNumber: 1 },
        {
          name: "Invoice_invoiceNumber_key",
          unique: true,
          partialFilterExpression: { invoiceNumber: { $type: "string" } },
        },
      );
    } catch (error) {
      if (existingIndex?.unique) {
        await invoices.createIndex(existingIndex.key, {
          name: existingIndex.name,
          unique: true,
          ...(existingIndex.sparse ? { sparse: true } : {}),
          ...(existingIndex.partialFilterExpression
            ? { partialFilterExpression: existingIndex.partialFilterExpression }
            : {}),
        });
      }
      throw error;
    }
    console.info("Invoice-number index now enforces uniqueness only when a number is provided.");
  }
} finally {
  await client.close();
}
