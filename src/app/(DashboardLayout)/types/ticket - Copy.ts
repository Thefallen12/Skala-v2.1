import type {
  TicketPriority,
  TicketCategoryHint,
  FulfillmentStatus,
  TicketFulfillmentStatus,
  TicketFieldCategory,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
  POPaymentMethod,
  DOStatus,
  OperationalDocumentKind,
  OperationalDocumentStatus,
  POStatus,
} from "@prisma/client";

export type TicketRow = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  type: TicketType;
  requestCategory: TicketRequestCategory | null;
  fieldCategory: TicketFieldCategory | null;
  requestPaymentMethod: POPaymentMethod | null;
  requestPaymentDescription: string | null;
  transferDestination: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  fulfillmentStatus: TicketFulfillmentStatus;
  canSubmit: boolean;
  canRequesterEdit: boolean;
  totalAmount: string | null;
  paymentTransactions?: {
    id: string;
    paymentType: import("@prisma/client").PaymentType;
    amount: number;
    transferDestination: string;
    proofOfTransferUrl: string | null;
    paidAt: string | null;
    reference: string;
  }[];
  attachmentUrl: string | null;
  receiptUrls: string[];
  paymentProofUrl: string | null;
  purchaseReceiptUrl: string | null;
  transferReceiptUrl: string | null;
  deliveryReceiptUrl: string | null;
  recipientName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  createdAt: string;
  requester: { name: string };
  project: { title: string; kelompokTani: string } | null;
  items: {
    id: string;
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost: string | null;
    categoryHint: TicketCategoryHint;
    expectedDeliveryDate: string | null;
    status: FulfillmentStatus;
    poItemId: string | null;
    doItemId: string | null;
  }[];
  auditLogs: {
    id: string;
    action: string;
    notes: string | null;
    createdAt: string;
    user: { name: string };
  }[];
  operationalDocuments?: {
    id: string;
    documentNumber: string;
    kind: OperationalDocumentKind;
    status: OperationalDocumentStatus;
    title: string;
    signedAt: string;
    issuedAt: string | null;
  }[];
  purchaseOrders?: {
    publicCode: string;
    poNumber: string;
    vendorName: string;
    paymentMethod?: POPaymentMethod | null;
    paymentTerms?: string | null;
    paymentBankName?: string | null;
    paymentAccountNumber?: string | null;
    paymentAccountName?: string | null;
    status: POStatus;
    createdAt: string;
    paidAt?: string | null;
    vendorInvoiceUrl?: string | null;
    vendorPoSentAt?: string | null;
    invoiceId?: string | null;
    includeTax?: boolean;
    items?: {
      itemCode: string | null;
      itemName: string;
      quantity: number;
      unit: string;
      unitPrice: number;
    }[];
  }[];
  directStockPurchases?: {
    id: string;
    purchaseNumber: string;
    vendorName: string;
    totalAmount: string;
    status: "PENDING_RECEIPT" | "RECEIVED";
    isApprovedByDirector: boolean;
    createdAt: string;
  }[];
  deliveryOrders?: {
    publicCode: string;
    doNumber: string;
    status: DOStatus;
    createdAt: string;
  }[];
};

export type TicketProjectOption = {
  id: string;
  title: string;
  kelompokTani: string;
};

export type TicketPageRole = UserRole;
