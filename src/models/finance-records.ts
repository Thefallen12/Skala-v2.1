import { model, models, Schema } from "mongoose";

const looseOptions = { strict: false, versionKey: false as const };

const poItemSchema = new Schema(
  {
    _id: String,
    poId: String,
    itemCode: String,
    stockItemId: String,
    itemName: String,
    quantity: Number,
    unit: String,
    unitPrice: Number,
    totalPrice: Number,
  },
  { ...looseOptions, collection: "POItem" },
);
export const POItem =
  models.POItem || model("POItem", poItemSchema, "POItem");

const stockItemSchema = new Schema(
  {
    _id: String,
    sku: String,
    name: String,
    category: String,
    unit: String,
    stockQuantity: Schema.Types.BigInt,
    minimumStock: Schema.Types.BigInt,
    unitPrice: Schema.Types.BigInt,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "LogisticsStockItem" },
);
export const StockItem =
  models.StockItem || model("StockItem", stockItemSchema, "LogisticsStockItem");

const stockPurchaseSchema = new Schema(
  {
    _id: String,
    purchaseNumber: String,
    purchaseOrderId: String,
    stockItemId: String,
    quantity: Schema.Types.BigInt,
    unitPrice: Schema.Types.BigInt,
    supplierName: String,
    reference: String,
    notes: String,
    createdById: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "StockPurchase" },
);
export const StockPurchase =
  models.StockPurchase ||
  model("StockPurchase", stockPurchaseSchema, "StockPurchase");

const stockMovementSchema = new Schema(
  {
    _id: String,
    projectId: String,
    stockItemId: String,
    type: String,
    materialName: String,
    quantity: Schema.Types.BigInt,
    totalCost: Schema.Types.BigInt,
    unit: String,
    occurredAt: Date,
    reference: String,
    notes: String,
    createdById: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "StockMovement" },
);
export const StockMovement =
  models.StockMovement ||
  model("StockMovement", stockMovementSchema, "StockMovement");

const ticketItemSchema = new Schema(
  {
    _id: String,
    ticketId: String,
    stockItemId: String,
    itemName: String,
    quantity: Number,
    unit: String,
    estimatedCost: Schema.Types.BigInt,
    categoryHint: String,
    expectedDeliveryDate: Date,
    status: String,
    poItemId: String,
    doItemId: String,
    materialContractId: String,
  },
  { ...looseOptions, collection: "TicketItem" },
);
export const TicketItem =
  models.TicketItem || model("TicketItem", ticketItemSchema, "TicketItem");

const directStockPurchaseItemSchema = new Schema(
  {
    _id: String,
    purchaseId: String,
    stockItemId: String,
    itemName: String,
    quantity: Schema.Types.BigInt,
    unit: String,
    unitPrice: Schema.Types.BigInt,
    totalPrice: Schema.Types.BigInt,
  },
  { ...looseOptions, collection: "DirectStockPurchaseItem" },
);
export const DirectStockPurchaseItem =
  models.DirectStockPurchaseItem ||
  model("DirectStockPurchaseItem", directStockPurchaseItemSchema, "DirectStockPurchaseItem");

const vendorSchema = new Schema(
  {
    _id: String,
    name: String,
    address: String,
    phone: String,
    email: String,
    bankName: String,
    bankAccount: String,
    bankHolder: String,
    isApproved: Boolean,
  },
  { ...looseOptions, collection: "Vendor" },
);
export const Vendor = models.Vendor || model("Vendor", vendorSchema, "Vendor");

const vendorBankAccountSchema = new Schema(
  {
    _id: String,
    vendorId: String,
    label: String,
    bankName: String,
    bankAccount: String,
    bankHolder: String,
    isPrimary: Boolean,
    createdAt: Date,
  },
  { ...looseOptions, collection: "VendorBankAccount" },
);
export const VendorBankAccount =
  models.VendorBankAccount ||
  model("VendorBankAccount", vendorBankAccountSchema, "VendorBankAccount");

const subkonContractSchema = new Schema(
  {
    _id: String,
    contractNumber: String,
    projectId: String,
    subkonName: String,
    workScope: String,
    retentionReleasedAt: Date,
  },
  { ...looseOptions, collection: "SubkonContract" },
);
export const SubkonContract =
  models.SubkonContract ||
  model("SubkonContract", subkonContractSchema, "SubkonContract");

const subkonTermynSchema = new Schema(
  {
    _id: String,
    subkonContractId: String,
    termynNumber: Number,
    claimedPercent: Schema.Types.BigInt,
    grossAmount: Schema.Types.BigInt,
    retentionAmount: Schema.Types.BigInt,
    netAmount: Schema.Types.BigInt,
    status: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "SubkonTermyn" },
);
export const SubkonTermyn =
  models.SubkonTermyn ||
  model("SubkonTermyn", subkonTermynSchema, "SubkonTermyn");

const bastDocumentSchema = new Schema(
  {
    _id: String,
    projectId: String,
    type: String,
    isApproved: Boolean,
    maintenanceEndsAt: Date,
  },
  { ...looseOptions, collection: "BASTDocument" },
);
export const BASTDocument =
  models.BASTDocument ||
  model("BASTDocument", bastDocumentSchema, "BASTDocument");

const documentTemplateSchema = new Schema(
  {
    _id: String,
    name: String,
    type: String,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "DocumentTemplate" },
);
export const DocumentTemplate =
  models.DocumentTemplate ||
  model("DocumentTemplate", documentTemplateSchema, "DocumentTemplate");

const vehicleTripLogSchema = new Schema(
  {
    _id: String,
    vehicleId: String,
    deliveryOrderId: String,
    projectId: String,
    kilometerStart: Schema.Types.BigInt,
    kilometerEnd: Schema.Types.BigInt,
    distanceKm: Schema.Types.BigInt,
    fuelLiter: Schema.Types.BigInt,
    createdById: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "VehicleTripLog" },
);
export const VehicleTripLog =
  models.VehicleTripLog ||
  model("VehicleTripLog", vehicleTripLogSchema, "VehicleTripLog");

const vehicleSchema = new Schema(
  {
    _id: String,
    plateNumber: String,
    vehicleType: String,
  },
  { ...looseOptions, collection: "Vehicle" },
);
export const Vehicle =
  models.Vehicle || model("Vehicle", vehicleSchema, "Vehicle");

const deliveryOrderSchema = new Schema(
  {
    _id: String,
    doNumber: String,
    ticketId: String,
    vehicleTripLogId: String,
  },
  { ...looseOptions, collection: "DeliveryOrder" },
);
export const DeliveryOrder =
  models.DeliveryOrder ||
  model("DeliveryOrder", deliveryOrderSchema, "DeliveryOrder");

const vehicleFuelRequestSchema = new Schema(
  {
    _id: String,
    vehicleId: String,
    deliveryOrderId: String,
    projectId: String,
    requestedById: String,
    reviewedById: String,
    status: String,
    source: String,
    estimatedDistanceKm: Schema.Types.BigInt,
    exceptionDistanceKm: Schema.Types.BigInt,
    exceptionReason: String,
    estimatedFuelLiter: Schema.Types.BigInt,
    unitPrice: Schema.Types.BigInt,
    requestedAmount: Schema.Types.BigInt,
    disbursementMethod: String,
    transferDestination: String,
    transferProofUrl: String,
    beforeFillingPhotoUrl: String,
    afterFillingPhotoUrl: String,
    receiptPhotoUrl: String,
    financeNote: String,
    createdAt: Date,
    disbursedAt: Date,
    proofSubmittedAt: Date,
  },
  { ...looseOptions, collection: "VehicleFuelRequest" },
);
export const VehicleFuelRequest =
  models.VehicleFuelRequest ||
  model("VehicleFuelRequest", vehicleFuelRequestSchema, "VehicleFuelRequest");

const invoiceSchema = new Schema(
  {
    _id: String,
    invoiceNumber: String,
    signedById: String,
    signedAt: Date,
    acknowledgedById: String,
    acknowledgedAt: Date,
    poId: String,
    subkonTermynId: String,
    status: String,
    grandTotal: Number,
    documentUrl: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "Invoice" },
);
export const Invoice =
  models.Invoice || model("Invoice", invoiceSchema, "Invoice");

const invoiceItemSchema = new Schema(
  {
    _id: String,
    invoiceId: String,
    itemCode: String,
    description: String,
    quantity: Number,
    unit: String,
    unitPrice: Number,
    totalPrice: Number,
  },
  { ...looseOptions, collection: "InvoiceItem" },
);
export const InvoiceItem =
  models.InvoiceItem ||
  model("InvoiceItem", invoiceItemSchema, "InvoiceItem");

const orderConfirmationSchema = new Schema(
  {
    _id: String,
    koNumber: String,
    signedById: String,
    signedAt: Date,
    acknowledgedById: String,
    acknowledgedAt: Date,
    poId: String,
    paymentTransactionId: String,
    createdAt: Date,
  },
  { ...looseOptions, collection: "OrderConfirmation" },
);
export const OrderConfirmation =
  models.OrderConfirmation ||
  model("OrderConfirmation", orderConfirmationSchema, "OrderConfirmation");

const koItemSchema = new Schema(
  {
    _id: String,
    koId: String,
    itemCode: String,
    description: String,
    quantity: Number,
    unit: String,
    unitPrice: Number,
    totalPrice: Number,
  },
  { ...looseOptions, collection: "KOItem" },
);
export const KOItem =
  models.KOItem || model("KOItem", koItemSchema, "KOItem");

const equipmentRentalSchema = new Schema(
  {
    _id: String,
    type: String,
    name: String,
    category: String,
    codeOrPlate: String,
    vendorName: String,
    vendorPhone: String,
    rentalPeriodType: String,
    startDate: Date,
    endDate: Date,
    duration: Number,
    ratePerPeriod: Schema.Types.BigInt,
    additionalCost: Schema.Types.BigInt,
    totalCost: Schema.Types.BigInt,
    status: String,
    withOperator: Boolean,
    operatorName: String,
    withFuel: Boolean,
    projectId: String,
    notes: String,
    createdById: String,
    createdByName: String,
    paymentStatus: String,
    billingSubmittedAt: Date,
    billingSubmittedById: String,
    billingSubmittedByName: String,
    paidAt: Date,
    paidById: String,
    paidByName: String,
    proofOfPaymentUrl: String,
    paymentBankName: String,
    paymentAccountNumber: String,
    paymentAccountName: String,
    financeNotes: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "EquipmentRental" },
);
export const EquipmentRental =
  models.EquipmentRental ||
  model("EquipmentRental", equipmentRentalSchema, "EquipmentRental");

const materialContractSchema = new Schema(
  {
    _id: String,
    contractNumber: String,
    vendorId: String,
    vendorName: String,
    materialType: String,
    unitPrice: Number,
    unit: String,
    estimatedVolume: Number,
    notes: String,
    startDate: Date,
    endDate: Date,
    isActive: Boolean,
    createdById: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "MaterialContract" },
);
export const MaterialContract =
  models.MaterialContract ||
  model("MaterialContract", materialContractSchema, "MaterialContract");

const materialDeliverySchema = new Schema(
  {
    _id: String,
    contractId: String,
    projectId: String,
    ticketId: String,
    deliveryDate: Date,
    doNumber: String,
    vehiclePlate: String,
    driverName: String,
    quantityReceived: Number,
    billingStatus: String,
    vendorInvoiceId: String,
    receivedById: String,
    proofUrl: String,
    notes: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "MaterialDelivery" },
);
export const MaterialDelivery =
  models.MaterialDelivery ||
  model("MaterialDelivery", materialDeliverySchema, "MaterialDelivery");

const vendorInvoiceSchema = new Schema(
  {
    _id: String,
    invoiceNumber: String,
    contractId: String,
    totalQuantity: Number,
    unitPrice: Number,
    grandTotal: Number,
    paidAmount: Number,
    dueDate: Date,
    status: String,
    notes: String,
    processedById: String,
    paidAt: Date,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...looseOptions, collection: "VendorInvoice" },
);
export const VendorInvoice =
  models.VendorInvoice ||
  model("VendorInvoice", vendorInvoiceSchema, "VendorInvoice");

const vendorInvoicePaymentSchema = new Schema(
  {
    _id: String,
    vendorInvoiceId: String,
    paymentType: String,
    paymentMethod: String,
    amount: Number,
    transferDestination: String,
    proofOfTransferUrl: String,
    financeAccountId: String,
    cashflowId: String,
    notes: String,
    processedById: String,
    paidAt: Date,
    createdAt: Date,
  },
  { ...looseOptions, collection: "VendorInvoicePayment" },
);
export const VendorInvoicePayment =
  models.VendorInvoicePayment ||
  model("VendorInvoicePayment", vendorInvoicePaymentSchema, "VendorInvoicePayment");
