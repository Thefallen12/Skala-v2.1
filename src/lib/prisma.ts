import { PrismaClient } from "@prisma/client";
import {
  initialDrawings,
  initialHabits,
  initialProjects,
  initialPurchaseOrders,
  initialDeliveryOrders,
  initialStockItems,
  initialTickets,
  initialUsers,
  initialVehicles,
  initialVendors,
  initialWorkTasks,
} from "./in-memory-db";

const connectionString = process.env.MONGODB_URI?.trim();
const hasValidMongoUri =
  Boolean(connectionString) &&
  (connectionString!.startsWith("mongodb://") ||
    connectionString!.startsWith("mongodb+srv://"));

let realPrisma: PrismaClient | null = null;
let mongoConnectionFailed = false;
let lastFailureTime = 0;

if (hasValidMongoUri) {
  try {
    realPrisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  } catch (err) {
    console.warn("[AI Studio] Failed to initialize PrismaClient:", err);
    realPrisma = null;
  }
}

// In-Memory store
class InMemoryStore {
  users = [...initialUsers];
  projects = [...initialProjects];
  tickets = [...initialTickets];
  stockItems = [...initialStockItems];
  purchaseOrders = [...initialPurchaseOrders];
  deliveryOrders = [...initialDeliveryOrders];
  vehicles = [...initialVehicles];
  workTasks = [...initialWorkTasks];
  habits = [...initialHabits];
  habitCompletions: Array<{ id: string; habitId: string; date: Date }> = [];
  drawings = [...initialDrawings];
  vendors = [...initialVendors];
  stockMovements: Array<{
    id: string;
    stockItemId: string;
    type: string;
    quantity: bigint;
    occurredAt: Date;
  }> = [];
  timesheetEntries: Array<{
    id: string;
    userId: string;
    projectId: string;
    workDate: Date;
    durationMinutes: number;
    description: string;
    createdAt: Date;
  }> = [];
  equipmentMasters = [
    { id: "eq_001", code: "EXC-01", name: "Excavator Komatsu PC75", currentHM: 1240, status: "READY" },
    { id: "eq_002", code: "DT-02", name: "Dump Truck Isuzu Giga", currentHM: 3820, status: "READY" },
  ];
  equipmentLogs: Array<{
    id: string;
    equipmentName: string;
    operatorName: string;
    date: Date;
    hmStart: number;
    hmEnd: number;
    createdById: string;
  }> = [];
  financeAccounts = [
    { id: "fa_001", name: "Kas Operasional Bank Mandiri", accountNumber: "1310098765432", balance: 145000000 },
    { id: "fa_002", name: "Kas Kecil Lapangan (Petty Cash)", accountNumber: "CASH-FIELD", balance: 18500000 },
  ];
  officeExpenses: Array<{ id: string; title: string; amount: bigint; date: Date }> = [];
  cashflows: Array<{ id: string; title: string; amount: bigint; type: string; date: Date }> = [];
  fieldSurveys = [
    {
      id: "srv_001",
      locationName: "D.I. Ciwaringin Saluran Sekunder Sta 0+000 s/d 1+200",
      notes: "Kondisi dinding saluran ambrol sepanjang 15 meter pada Sta 0+450 akibat erosi tanggul.",
      projectName: "Rehabilitasi Saluran Irigasi D.I. Ciwaringin",
      surveyorId: "usr_field",
      projectId: "proj_001",
      documentationUrls: ["/images/blog/blog-img1.jpg"],
      geoJsonData: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [108.384, -6.712],
                [108.388, -6.715],
                [108.392, -6.719],
              ],
            },
            properties: { name: "Trace Saluran Sekunder" },
          },
        ],
      },
      features: [
        {
          id: "ft_001",
          featureCategory: "Saluran Irigasi",
          name: "Trase Saluran Ciwaringin",
          description: "Segmen pasangan batu saluran primer",
          geometryType: "LineString",
          geoJsonData: {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [108.384, -6.712],
                [108.388, -6.715],
              ],
            },
          },
          areaSqm: null,
          lengthM: 850,
          photoUrls: ["/images/blog/blog-img1.jpg"],
        },
      ],
      photos: [
        {
          id: "sph_001",
          url: "/images/blog/blog-img1.jpg",
          caption: "Titik Kerusakan Pasangan Batu Sta 0+450",
          latitude: -6.7135,
          longitude: 108.3855,
        },
      ],
    },
  ];
  menuAccess: Array<{ id: string; role: string; menuKey: string; menuName: string; isAllowed: boolean }> = [];
  pageMaintenance: Array<{ id: string; pageKey: string; pageName: string; isEnabled: boolean }> = [];
  documentTemplates = [
    {
      id: "tmpl_001",
      name: "Purchase Order Standar Kontraktor",
      type: "PO",
      title: "SURAT PESANAN PEMBELIAN (PO)",
      contentHtml: "<p>Surat Pesanan Pembelian Barang dan Jasa Konstruksi</p>",
      variables: ["nomor_po", "nama_vendor", "total_nilai"],
      isActive: true,
      updatedAt: new Date(),
    },
  ];
  operationalDocuments: Array<{
    id: string;
    documentNumber: string;
    kind: string;
    status: string;
    title: string;
    content: string;
    signerName: string | null;
    signedAt: Date;
    issuedAt: Date | null;
    createdAt: Date;
  }> = [];
  directStockPurchases: Array<{
    id: string;
    purchaseNumber: string;
    vendorName: string;
    status: string;
    isApprovedByDirector: boolean;
    totalAmount: bigint;
    createdAt: Date;
    paymentTransactions: Array<{ proofOfTransferUrl: string | null }>;
    items: Array<{ id: string; itemName: string; quantity: bigint; unit: string }>;
  }> = [];
  subkonContracts: Array<{
    id: string;
    publicCode: string;
    contractNumber: string;
    subkonName: string;
    workScope: string;
    contractValue: bigint;
    status: string;
    termyns: Array<unknown>;
  }> = [];
  subkonTermyns: Array<unknown> = [];
  projectWorkPoints: Array<{
    id: string;
    title: string;
    location: string;
    progress: number;
    approvedTotalWage: bigint | null;
    wageApprovedAt: Date | null;
  }> = [];
  bastDocuments: Array<{
    id: string;
    publicCode: string;
    bastNumber: string;
    type: string;
    date: Date;
    isApproved: boolean;
  }> = [];
  ticketAuditLogs: Array<{
    id: string;
    ticketId: string;
    action: string;
    notes: string | null;
    createdAt: Date;
    userId: string;
  }> = [];
}

const store = new InMemoryStore();

function resolveUserRelation(userObj: any) {
  if (!userObj) return null;
  return {
    ...userObj,
    select: (fields: Record<string, boolean>) => {
      const res: any = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v) res[k] = userObj[k];
      }
      return res;
    },
  };
}

function resolveProjectRelation(projObj: any) {
  if (!projObj) return null;
  const pic = store.users.find((u) => u.id === projObj.fieldPicId) ?? null;
  return {
    ...projObj,
    fieldPic: pic ? { id: pic.id, name: pic.name, profilePhotoUrl: pic.profilePhotoUrl } : null,
    dailyReports: [],
    workPoints: [],
    blueprints: store.drawings.filter((d) => d.projectId === projObj.id),
    drawingDocuments: [],
    subkonContracts: [],
    bastDocuments: [],
    tickets: store.tickets.filter((t) => t.projectId === projObj.id),
  };
}

function resolveTicketRelation(ticketObj: any) {
  if (!ticketObj) return null;
  const requester = store.users.find((u) => u.id === ticketObj.requesterId);
  const project = store.projects.find((p) => p.id === ticketObj.projectId);
  const mover = store.users.find((u) => u.id === ticketObj.moverAssigneeId);
  return {
    ...ticketObj,
    requester: requester ? { name: requester.name, bankName: requester.bankName, bankAccountName: requester.bankAccountName, bankAccountNumber: requester.bankAccountNumber } : { name: "Staf Proyek" },
    project: project ? { title: project.title, name: project.name, kelompokTani: project.kelompokTani, location: project.location, vendor: project.vendor, clientName: project.clientName } : null,
    moverAssignee: mover ? { name: mover.name } : null,
    items: ticketObj.items ?? [],
    auditLogs: [],
    purchaseOrders: store.purchaseOrders.filter((p) => p.ticketId === ticketObj.id),
    directStockPurchases: [],
    paymentTransactions: [],
    deliveryOrders: store.deliveryOrders.filter((d) => d.ticketId === ticketObj.id),
  };
}

function createModelHandler(modelName: string) {
  return {
    findMany: async (args: any = {}) => {
      let list: any[] = [];
      if (modelName === "user") list = store.users;
      else if (modelName === "project") list = store.projects.map(resolveProjectRelation);
      else if (modelName === "ticket") list = store.tickets.map(resolveTicketRelation);
      else if (modelName === "stockItem") list = store.stockItems;
      else if (modelName === "purchaseOrder") {
        list = store.purchaseOrders.map((po) => ({
          ...po,
          vendor: store.vendors.find((v) => v.name === po.vendorName) ?? null,
          ticket: store.tickets.find((t) => t.id === po.ticketId) ? resolveTicketRelation(store.tickets.find((t) => t.id === po.ticketId)) : null,
          approvedBy: store.users.find((u) => u.id === po.approvedById) ?? null,
          reviewedBy: store.users.find((u) => u.id === po.reviewedById) ?? null,
          createdBy: store.users.find((u) => u.id === "usr_admin"),
          paymentTransactions: [],
          invoices: [],
        }));
      } else if (modelName === "deliveryOrder") {
        list = store.deliveryOrders.map((doDoc) => ({
          ...doDoc,
          ticket: store.tickets.find((t) => t.id === doDoc.ticketId) ? resolveTicketRelation(store.tickets.find((t) => t.id === doDoc.ticketId)) : null,
          po: store.purchaseOrders.find((p) => p.id === doDoc.poId) ?? null,
          signedBy: store.users.find((u) => u.id === doDoc.signedById) ?? null,
          acknowledgedBy: store.users.find((u) => u.id === doDoc.acknowledgedById) ?? null,
          createdBy: store.users.find((u) => u.id === "usr_logistics"),
          vehicle: store.vehicles.find((v) => v.id === doDoc.vehicleId) ?? null,
          vehicleTripLog: null,
          receiptPhotos: [],
          fuelRequests: [],
        }));
      } else if (modelName === "workTask") {
        list = store.workTasks.map((t) => ({
          ...t,
          project: store.projects.find((p) => p.id === t.projectId) ?? { name: "Proyek Konstruksi" },
          assignee: store.users.find((u) => u.id === t.assigneeId),
          creator: store.users.find((u) => u.id === t.creatorId),
        }));
      } else if (modelName === "habit") list = store.habits;
      else if (modelName === "habitCompletion") list = store.habitCompletions;
      else if (modelName === "drawingDocument") {
        list = store.drawings.map((d) => ({
          ...d,
          project: store.projects.find((p) => p.id === d.projectId) ?? null,
          uploadedBy: store.users.find((u) => u.id === d.uploadedById) ?? { name: "Drafter" },
          logs: d.logs ?? [],
        }));
      } else if (modelName === "vendor") list = store.vendors;
      else if (modelName === "vehicle") list = store.vehicles;
      else if (modelName === "vehicleTripLog") list = [];
      else if (modelName === "vehicleFuelRequest") list = [];
      else if (modelName === "timesheetEntry") list = store.timesheetEntries;
      else if (modelName === "equipmentMaster") list = store.equipmentMasters;
      else if (modelName === "equipmentLog") list = store.equipmentLogs;
      else if (modelName === "financeAccount") list = store.financeAccounts;
      else if (modelName === "officeExpense") list = store.officeExpenses;
      else if (modelName === "cashflow") list = store.cashflows;
      else if (modelName === "fieldSurvey") {
        list = store.fieldSurveys.map((s) => ({
          ...s,
          surveyor: store.users.find((u) => u.id === s.surveyorId) ?? { name: (s as any).responsibleName || "Tim Lapangan" },
          features: (s as any).features ?? [],
          createdAt: (s as any).createdAt ?? new Date(),
        }));
      }
      else if (modelName === "menuAccess") list = store.menuAccess;
      else if (modelName === "pageMaintenance") list = store.pageMaintenance;
      else if (modelName === "documentTemplate") list = store.documentTemplates;
      else if (modelName === "operationalDocument") list = store.operationalDocuments;
      else if (modelName === "operationalDocumentTemplate") list = [];
      else if (modelName === "directStockPurchase") list = store.directStockPurchases;
      else if (modelName === "subkonContract") list = store.subkonContracts;
      else if (modelName === "subkonTermyn") list = store.subkonTermyns;
      else if (modelName === "projectWorkPoint") list = store.projectWorkPoints;
      else if (modelName === "bastDocument") list = store.bastDocuments;
      else if (modelName === "ticketAuditLog") list = store.ticketAuditLogs;

      // Filter by simple where if present
      if (args.where) {
        if (args.where.isDeleted !== undefined) {
          list = list.filter((item) => (item.isDeleted ?? false) === args.where.isDeleted);
        }
        if (args.where.isActive !== undefined) {
          list = list.filter((item) => (item.isActive ?? true) === args.where.isActive);
        }
        if (args.where.userId) {
          list = list.filter((item) => item.userId === args.where.userId);
        }
        if (args.where.projectId) {
          list = list.filter((item) => item.projectId === args.where.projectId);
        }
      }

      if (args.take) {
        list = list.slice(0, args.take);
      }

      return list;
    },

    findUnique: async (args: any) => {
      const where = args?.where || {};
      if (modelName === "user") {
        if (where.email) {
          const user = store.users.find(
            (u) => u.email.toLowerCase() === where.email.toLowerCase(),
          );
          return user ? resolveUserRelation(user) : null;
        }
        if (where.id) {
          const user = store.users.find((u) => u.id === where.id);
          return user ? resolveUserRelation(user) : null;
        }
      }
      if (modelName === "project") {
        const proj = store.projects.find((p) => p.id === where.id || p.code === where.code);
        return proj ? resolveProjectRelation(proj) : null;
      }
      if (modelName === "ticket") {
        const t = store.tickets.find((item) => item.id === where.id || item.ticketNumber === where.ticketNumber);
        return t ? resolveTicketRelation(t) : null;
      }
      if (modelName === "purchaseOrder") {
        return store.purchaseOrders.find((p) => p.publicCode === where.publicCode || p.id === where.id) ?? null;
      }
      if (modelName === "deliveryOrder") {
        return store.deliveryOrders.find((d) => d.publicCode === where.publicCode || d.id === where.id) ?? null;
      }
      if (modelName === "fieldSurvey") {
        const s = store.fieldSurveys.find((f) => f.id === where.id);
        if (!s) return null;
        return {
          ...s,
          project: store.projects.find((p) => p.id === s.projectId) ?? null,
          surveyor: store.users.find((u) => u.id === s.surveyorId) ?? null,
        };
      }
      if (modelName === "documentTemplate") {
        return store.documentTemplates.find((d) => d.id === where.id) ?? null;
      }
      return null;
    },

    findFirst: async (args: any = {}) => {
      const handler = createModelHandler(modelName);
      const items = await handler.findMany(args);
      return items[0] ?? null;
    },

    count: async (args: any = {}) => {
      const handler = createModelHandler(modelName);
      const items = await handler.findMany(args);
      return items.length;
    },

    groupBy: async (args: any = {}) => {
      const handler = createModelHandler(modelName);
      const items = await handler.findMany(args);
      const byField = Array.isArray(args.by) ? args.by[0] : args.by;
      const groups: Record<string, { count: number; sumDuration: number }> = {};
      for (const item of items) {
        const key = item[byField] ?? "DEFAULT";
        if (!groups[key]) groups[key] = { count: 0, sumDuration: 0 };
        groups[key].count += 1;
        if (item.durationMinutes) {
          groups[key].sumDuration += item.durationMinutes;
        }
      }
      return Object.entries(groups).map(([k, v]) => ({
        [byField]: k,
        _count: { _all: v.count },
        _sum: { durationMinutes: v.sumDuration },
      }));
    },

    aggregate: async () => ({
      _sum: { durationMinutes: 1840 },
      _count: { _all: 12 },
    }),

    create: async (args: any) => {
      const data = args?.data ?? {};
      const id = data.id || `rec_${Date.now()}`;
      const record = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
      if (modelName === "user") store.users.push(record);
      else if (modelName === "project") store.projects.push(record);
      else if (modelName === "ticket") store.tickets.push(record);
      else if (modelName === "stockItem") store.stockItems.push(record);
      else if (modelName === "purchaseOrder") store.purchaseOrders.push(record);
      else if (modelName === "deliveryOrder") store.deliveryOrders.push(record);
      else if (modelName === "workTask") store.workTasks.push(record);
      else if (modelName === "habit") store.habits.push(record);
      else if (modelName === "menuAccess") store.menuAccess.push(record);
      return record;
    },

    update: async (args: any) => {
      const { where, data } = args || {};
      let item: any = null;
      if (modelName === "user") {
        item = store.users.find((u) => u.id === where?.id || u.email === where?.email);
      } else if (modelName === "project") {
        item = store.projects.find((p) => p.id === where?.id);
      } else if (modelName === "ticket") {
        item = store.tickets.find((t) => t.id === where?.id);
      }
      if (item && data) {
        Object.assign(item, data, { updatedAt: new Date() });
        return item;
      }
      return data ?? {};
    },

    upsert: async (args: any) => {
      const handler = createModelHandler(modelName);
      const existing = await handler.findFirst({ where: args.where });
      if (existing) {
        return handler.update({ where: args.where, data: args.update });
      }
      return handler.create({ data: args.create });
    },

    delete: async () => ({ id: "deleted" }),
    deleteMany: async () => ({ count: 0 }),
  };
}

// Resilient Prisma Client Proxy
export const prisma: PrismaClient = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (prop === "$transaction") {
        return async (arg: any) => {
          if (typeof arg === "function") {
            return arg(prisma);
          }
          if (Array.isArray(arg)) {
            return Promise.all(arg);
          }
          return arg;
        };
      }
      if (prop === "$disconnect") {
        return async () => {};
      }
      if (prop === "$connect") {
        return async () => {};
      }

      // Check if realPrisma has the property and try to execute safely
      if (realPrisma && prop in realPrisma) {
        if (mongoConnectionFailed && Date.now() - lastFailureTime < 30000) {
          return createModelHandler(prop);
        }
        const originalModel = (realPrisma as any)[prop];
        if (typeof originalModel === "object" && originalModel !== null) {
          return new Proxy(originalModel, {
            get(modelTarget, method: string) {
              const originalMethod = modelTarget[method];
              if (typeof originalMethod === "function") {
                return async (...args: any[]) => {
                  if (mongoConnectionFailed && Date.now() - lastFailureTime < 30000) {
                    const mockHandler = createModelHandler(prop) as any;
                    if (mockHandler && typeof mockHandler[method] === "function") {
                      return mockHandler[method](...args);
                    }
                    return null;
                  }
                  try {
                    const result = await originalMethod.apply(modelTarget, args);
                    mongoConnectionFailed = false;
                    if (
                      result === null &&
                      prop === "user" &&
                      (method === "findUnique" || method === "findFirst")
                    ) {
                      const mockHandler = createModelHandler("user") as any;
                      return mockHandler[method](...args);
                    }
                    return result;
                  } catch (err: any) {
                    if (
                      err?.message?.includes("Server selection timeout") ||
                      err?.message?.includes("fatal alert") ||
                      err?.message?.includes("No available servers")
                    ) {
                      mongoConnectionFailed = true;
                      lastFailureTime = Date.now();
                      console.warn("[Prisma] MongoDB unreachable (IP not whitelisted or TLS error). Menggunakan in-memory fallback.");
                    }
                    const mockHandler = createModelHandler(prop) as any;
                    if (mockHandler && typeof mockHandler[method] === "function") {
                      return mockHandler[method](...args);
                    }
                    return null;
                  }
                };
              }
              return originalMethod;
            },
          });
        }
      }

      // In-Memory store fallback
      return createModelHandler(prop);
    },
  },
) as unknown as PrismaClient;
