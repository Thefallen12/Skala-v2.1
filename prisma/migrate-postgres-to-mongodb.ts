import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { Client as PostgresClient } from "pg";
import type { QueryResultRow } from "pg";

const STORAGE_SCALE = 1_000;
const applyChanges = process.argv.includes("--apply");
const decimalFields: Record<string, ReadonlySet<string>> = {
  MaterialRequest: new Set(["estimatedCost"]),
  Project: new Set(["pagu", "landArea", "budget"]),
  ProjectWorkPoint: new Set([
    "proposedVolume",
    "proposedUnitPrice",
    "proposedTotalWage",
    "approvedTotalWage",
  ]),
  StockMovement: new Set(["quantity", "totalCost"]),
  StockItem: new Set(["stockQuantity", "minimumStock", "unitPrice"]),
  StockPurchase: new Set(["quantity", "unitPrice"]),
  DirectStockPurchase: new Set(["totalAmount"]),
  DirectStockPurchaseItem: new Set(["quantity", "unitPrice", "totalPrice"]),
  WageAuditLog: new Set(["oldWage", "newWage"]),
  ProjectWageDisbursement: new Set(["amount"]),
  EquipmentMaster: new Set(["hourlyRate", "currentHM"]),
  SubkonContract: new Set(["contractValue", "retentionPct"]),
  SubkonTermyn: new Set([
    "claimedPercent",
    "grossAmount",
    "retentionAmount",
    "netAmount",
  ]),
  EquipmentLog: new Set(["hmStart", "hmEnd", "effectiveHours", "fuelLiter"]),
  ProjectAddendum: new Set(["budgetChange"]),
  Ticket: new Set(["totalAmount"]),
  DeliveryOrder: new Set(["departureKilometer"]),
  Vehicle: new Set(["currentKilometer"]),
  VehicleTripLog: new Set([
    "kilometerStart",
    "kilometerEnd",
    "distanceKm",
    "fuelLiter",
    "fuelEfficiencyKmPerL",
  ]),
  VehicleFuelRequest: new Set([
    "estimatedDistanceKm",
    "exceptionDistanceKm",
    "estimatedFuelLiter",
    "unitPrice",
    "requestedAmount",
    "fuelEfficiencyKmPerL",
  ]),
  TicketItem: new Set(["estimatedCost"]),
};
const nullableUniqueFields: Record<string, readonly string[]> = {
  PaymentTransaction: ["confirmationOrderNumber"],
  VehicleTripLog: ["deliveryOrderId"],
  Invoice: ["publicCode", "subkonTermynId"],
  Cashflow: ["paymentTransactionId"],
  OrderConfirmation: ["publicCode", "paymentTransactionId"],
};

interface RuntimeField {
  name: string;
  kind: string;
  type: string;
  dbName?: string | null;
  isRequired: boolean;
  hasDefaultValue: boolean;
  isId?: boolean;
}

interface RuntimeModel {
  dbName?: string | null;
  fields: RuntimeField[];
  uniqueFields?: string[][];
}

interface RuntimeEnum {
  values: { name: string; dbName: string | null }[];
}

interface RuntimeDataModel {
  models: Record<string, RuntimeModel>;
  enums: Record<string, RuntimeEnum>;
}

interface PrismaDelegate {
  count(): Promise<number>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  findMany(): Promise<Record<string, unknown>[]>;
}

function sourceConnectionString(): string {
  const configured = process.env.POSTGRES_SOURCE_URL ?? process.env.DATABASE_URL;
  if (!configured) {
    throw new Error("Set POSTGRES_SOURCE_URL or DATABASE_URL for the PostgreSQL source.");
  }

  const url = new URL(configured);
  if (!process.env.POSTGRES_SOURCE_URL && url.hostname === "pooled.db.prisma.io") {
    url.hostname = "db.prisma.io";
  }
  return url.toString();
}

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function scaledInteger(value: unknown): bigint {
  return BigInt(
    new Prisma.Decimal(String(value))
      .mul(STORAGE_SCALE)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(0),
  );
}

function transformRow(
  modelName: string,
  fields: RuntimeField[],
  enums: Record<string, RuntimeEnum>,
  row: QueryResultRow,
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};
  const targetFields = fields.filter(
    (field) => field.kind === "scalar" || field.kind === "enum",
  );
  const sourceFieldMap = new Map(
    targetFields.flatMap((field) => [
      [field.name, field] as const,
      ...(field.dbName && field.dbName !== field.name
        ? [[field.dbName, field] as const]
        : []),
    ]),
  );

  for (const [name, value] of Object.entries(row)) {
    const field = sourceFieldMap.get(name);
    if (!field) {
      throw new Error(`Source field ${modelName}.${name} has no target field.`);
    }

    if (value === null) {
      if (field.isRequired) {
        throw new Error(`Required source field ${modelName}.${name} is null.`);
      }
      // MongoDB unique indexes treat null as a value; omission preserves optional-field semantics.
      continue;
    } else if (decimalFields[modelName]?.has(field.name)) {
      transformed[field.name] = scaledInteger(value);
    } else if (field.type === "BigInt") {
      transformed[field.name] = BigInt(String(value));
    } else if (field.type === "String" && typeof value === "number") {
      transformed[field.name] = String(value);
    } else if (field.kind === "enum") {
      const enumValue = enums[field.type]?.values.find(
        (candidate) => candidate.name === value || candidate.dbName === value,
      );
      if (!enumValue) {
        throw new Error(
          `Source enum value for ${modelName}.${field.name} is not in the target schema.`,
        );
      }
      transformed[field.name] = enumValue.name;
    } else {
      transformed[field.name] = value;
    }
  }

  for (const field of targetFields) {
    if (
      !Object.hasOwn(transformed, field.name) &&
      field.isRequired &&
      !field.hasDefaultValue
    ) {
      throw new Error(`Required target field ${modelName}.${field.name} is missing.`);
    }
  }

  if (modelName === "DocumentNumberSequence" && !Object.hasOwn(transformed, "id")) {
    transformed.id = randomUUID();
  }

  return transformed;
}

function delegateFor(client: object, modelName: string): PrismaDelegate {
  const delegate = Reflect.get(client, modelName) as PrismaDelegate | undefined;
  if (!delegate || typeof delegate.count !== "function" ||
      typeof delegate.createMany !== "function" ||
      typeof delegate.findMany !== "function") {
    throw new Error(`Prisma delegate for ${modelName} is unavailable.`);
  }
  return delegate;
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (expected instanceof Date && actual instanceof Date) {
    return expected.getTime() === actual.getTime();
  }
  if (typeof expected === "bigint" && typeof actual === "bigint") {
    return expected === actual;
  }
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(expected - actual) <=
      Math.max(1, Math.abs(expected), Math.abs(actual)) * 1e-12;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length &&
      expected.every((value, index) => valuesMatch(value, actual[index]));
  }
  if (
    typeof expected === "object" &&
    expected !== null &&
    typeof actual === "object" &&
    actual !== null &&
    !Array.isArray(actual)
  ) {
    const expectedEntries = Object.entries(expected);
    const actualRecord = actual as Record<string, unknown>;
    return expectedEntries.length === Object.keys(actualRecord).length &&
      expectedEntries.every(
        ([key, value]) =>
          Object.hasOwn(actualRecord, key) &&
          valuesMatch(value, actualRecord[key]),
      );
  }
  return expected === actual;
}

function recordKey(
  modelName: string,
  row: Record<string, unknown>,
  model: RuntimeModel,
): string {
  const keyFields =
    modelName === "DocumentNumberSequence"
      ? ["kind", "year"]
      : model.fields.some((field) => field.isId)
        ? model.fields.filter((field) => field.isId).map((field) => field.name)
        : model.uniqueFields?.[0] ?? [];
  if (keyFields.length === 0) {
    throw new Error(`No unique key is available to verify ${modelName}.`);
  }
  return JSON.stringify(keyFields.map((field) => row[field] ?? null));
}

async function verifyModelData(
  client: object,
  modelNames: string[],
  runtime: RuntimeDataModel,
  expectedRows: Map<string, Record<string, unknown>[]>,
): Promise<void> {
  for (const modelName of modelNames) {
    const expected = expectedRows.get(modelName) ?? [];
    const model = runtime.models[modelName];
    const actual = await delegateFor(client, modelName).findMany();
    const actualByKey = new Map(
      actual.map((row) => [recordKey(modelName, row, model), row]),
    );
    if (actualByKey.size !== actual.length || expected.length !== actual.length) {
      throw new Error(
        `${modelName} record verification failed (${expected.length} source, ${actual.length} target).`,
      );
    }
    for (const expectedRow of expected) {
      const key = recordKey(modelName, expectedRow, model);
      const actualRow = actualByKey.get(key);
      if (!actualRow) {
        throw new Error(`${modelName} record verification failed (missing source key).`);
      }
      const mismatchedFields = model.fields
        .filter(
          (field) =>
            (field.kind === "scalar" || field.kind === "enum") &&
            !(modelName === "DocumentNumberSequence" && field.name === "id"),
        )
        .filter(
          (field) =>
            !valuesMatch(
              Object.hasOwn(expectedRow, field.name)
                ? expectedRow[field.name]
                : null,
              Object.hasOwn(actualRow, field.name)
                ? actualRow[field.name]
                : null,
            ),
        );
      if (mismatchedFields.length > 0) {
        throw new Error(
          `${modelName} record verification failed for fields: ${mismatchedFields.map((field) => field.name).join(", ")}.`,
        );
      }
    }
  }
}

async function ensureNullableUniqueIndexes(
  target: PrismaClient,
  runtime: RuntimeDataModel,
): Promise<void> {
  for (const [modelName, fieldNames] of Object.entries(nullableUniqueFields)) {
    const collection = runtime.models[modelName]?.dbName ?? modelName;
    for (const fieldName of fieldNames) {
      const indexName = `${collection}_${fieldName}_key`;
      await target.$runCommandRaw({
        dropIndexes: collection,
        index: indexName,
      });
      await target.$runCommandRaw({
        createIndexes: collection,
        indexes: [
          {
            key: { [fieldName]: 1 },
            name: indexName,
            unique: true,
            partialFilterExpression: { [fieldName]: { $type: "string" } },
          },
        ],
      });
    }
  }
}

async function main(): Promise<void> {
  const target = new PrismaClient();
  const runtime = Reflect.get(target, "_runtimeDataModel") as
    | RuntimeDataModel
    | undefined;
  if (!runtime?.models) {
    throw new Error("Prisma runtime model metadata is unavailable.");
  }

  const source = new PostgresClient({
    connectionString: sourceConnectionString(),
    connectionTimeoutMillis: 12_000,
    statement_timeout: 60_000,
  });

  try {
    await source.connect();
    await target.$runCommandRaw({ ping: 1 });

    const modelNames = Object.keys(runtime.models).sort();
    const sourceTables = await source.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const availableTables = new Set(sourceTables.rows.map((row) => row.table_name));
    const missingTables = modelNames.filter(
      (name) => !availableTables.has(runtime.models[name].dbName ?? name),
    );
    if (missingTables.length > 0) {
      throw new Error(`PostgreSQL source is missing tables: ${missingTables.join(", ")}`);
    }

    const collections = new Map<string, number>();
    let totalSourceRows = 0;
    const sourceRowsByModel = new Map<string, Record<string, unknown>[]>();

    for (const modelName of modelNames) {
      const model = runtime.models[modelName];
      const tableName = model.dbName ?? modelName;
      const result = await source.query(
        `SELECT * FROM public.${quotedIdentifier(tableName)}`,
      );
      const rows = result.rows.map((row) =>
        transformRow(modelName, model.fields, runtime.enums, row),
      );
      sourceRowsByModel.set(modelName, rows);
      totalSourceRows += rows.length;
      collections.set(modelName, rows.length);
    }

    const targetCounts = new Map<string, number>();
    let totalTargetRows = 0;
    for (const modelName of modelNames) {
      const count = await delegateFor(target, modelName).count();
      targetCounts.set(modelName, count);
      totalTargetRows += count;
    }

    console.log(`PostgreSQL source: ${modelNames.length} models, ${totalSourceRows} rows.`);
    console.log(`MongoDB target: ${totalTargetRows} rows across ${modelNames.length} models.`);
    for (const [modelName, count] of collections) {
      console.log(`${modelName}: ${count}`);
    }
    console.log("Decimal fields are converted to scaled integers (scale 1000).");

    if (!applyChanges) {
      if (totalTargetRows > 0 && totalTargetRows === totalSourceRows) {
        await verifyModelData(target, modelNames, runtime, sourceRowsByModel);
        console.log("Existing MongoDB records match PostgreSQL row data.");
      }
      console.log("Dry run only. No MongoDB data was written. Use --apply after reviewing.");
      return;
    }

    if (totalTargetRows !== 0) {
      throw new Error(
        "MongoDB target contains model data. Refusing to import or overwrite existing records.",
      );
    }

    await ensureNullableUniqueIndexes(target, runtime);

    await target.$transaction(
      async (transaction) => {
        for (const modelName of modelNames) {
          const rows = sourceRowsByModel.get(modelName) ?? [];
          if (rows.length === 0) continue;
          await delegateFor(transaction, modelName).createMany({ data: rows });
        }

        await verifyModelData(
          transaction,
          modelNames,
          runtime,
          sourceRowsByModel,
        );
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    console.log(`Migration committed and verified: ${totalSourceRows} rows.`);
  } finally {
    await Promise.all([source.end().catch(() => undefined), target.$disconnect()]);
  }
}

main().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.constructor.name : "Unknown error";
  const isPrismaError = errorName.includes("Prisma");
  const errorCode =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;
  console.error(
    "PostgreSQL to MongoDB migration failed:",
    isPrismaError
      ? `Database operation failed (${errorCode ?? errorName}); row details suppressed.`
      : error instanceof Error
        ? error.message
        : "Unknown error",
  );
  process.exitCode = 1;
});
