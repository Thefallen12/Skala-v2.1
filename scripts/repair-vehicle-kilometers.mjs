import "dotenv/config";
import { Long, MongoClient } from "mongodb";

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
    .find({ currentKilometer: { $type: "string" } })
    .project({ _id: 1, currentKilometer: 1 })
    .toArray();

  let repaired = 0;
  for (const document of documents) {
    if (!/^-?\d+$/.test(document.currentKilometer)) {
      throw new Error(
        `Vehicle ${document._id} has an invalid currentKilometer value.`,
      );
    }

    await collection.updateOne(
      { _id: document._id },
      { $set: { currentKilometer: Long.fromString(document.currentKilometer) } },
    );
    repaired += 1;
  }

  console.log(`Repaired ${repaired} Vehicle.currentKilometer value(s).`);
} finally {
  await client.close();
}
