import "dotenv/config";
import { Long, MongoClient } from "mongodb";
import { Prisma } from "@prisma/client";

const uri = process.env.MONGODB_URI?.trim();
if (!uri || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
  throw new Error(
    "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.",
  );
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const databaseName = new URL(uri).pathname.slice(1) || "test";
  const collection = client.db(databaseName).collection("Vehicle");
  const documents = await collection
    .find({
      $or: [
        { currentKilometer: { $type: "string" } },
        { currentKilometer: { $type: "double" } },
        { currentKilometer: { $type: "decimal" } },
        { currentKilometer: { $type: "int" } },
      ],
    })
    .project({ _id: 1, currentKilometer: 1 })
    .toArray();

  let repaired = 0;
  for (const document of documents) {
    const rawValue = String(document.currentKilometer);
    if (!/^\d+(?:\.\d{1,3})?$/.test(rawValue)) {
      throw new Error(
        `Vehicle ${document._id} has an invalid currentKilometer value.`,
      );
    }

    // Integer strings are legacy scaled values; decimal values are human KM.
    const scaledValue = rawValue.includes(".")
      ? new Prisma.Decimal(rawValue)
          .mul(1_000)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(0)
      : rawValue;

    await collection.updateOne(
      { _id: document._id },
      { $set: { currentKilometer: Long.fromString(scaledValue) } },
    );
    repaired += 1;
  }

  console.log(`Repaired ${repaired} Vehicle.currentKilometer value(s).`);
} finally {
  await client.close();
}
