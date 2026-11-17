import {
  BASTType,
  DocType,
  PaymentStatus,
  POStatus,
  SubkonTermynStatus,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { connectToMongoDBOptional } from "@/lib/mongoose";
import Ticket from "@/models/ticket";
import PaymentTransaction from "@/models/payment-transaction";
import PurchaseOrder from "@/models/purchase-order";
import DirectStockPurchase from "@/models/direct-stock-purchase";
import Project from "@/models/project";
import User from "@/models/user";
import {
  EQUIPMENT_REQUEST_TYPE,
  HOUSE_RENTAL_REQUEST_TYPE,
  VEHICLE_RENTAL_REQUEST_TYPE,
} from "@/lib/equipment-request";
import {
  BASTDocument,
  DeliveryOrder,
  DirectStockPurchaseItem,
  DocumentTemplate,
  EquipmentRental,
  Invoice,
  MaterialDelivery,
  OrderConfirmation,
  POItem,
  SubkonContract,
  SubkonTermyn,
  TicketItem,
  Vehicle,
  VehicleFuelRequest,
  VehicleTripLog,
  Vendor,
  VendorBankAccount,
} from "@/models/finance-records";

const idsOf = <T extends { _id: unknown }>(rows: T[]) =>
  [...new Set(rows.map((row) => String(row._id)))];

const byId = <T extends { _id: unknown }>(rows: T[]) =>
  new Map(rows.map((row) => [String(row._id), row]));

const financeStatuses = [
  TicketStatus.APPROVED_DIR,
  TicketStatus.WAITING_FINANCE_PAYMENT,
  TicketStatus.PROCESSED_FINANCE,
  TicketStatus.PROCESSED_LOGISTIC,
  TicketStatus.ASSIGNED_TO_MOVER,
  TicketStatus.IN_TRANSIT,
  TicketStatus.COMPLETED,
];

function mapPayment(
  payment: Awaited<ReturnType<typeof PaymentTransaction.find>>[number],
) {
  return {
    id: String(payment._id),
    paymentType: payment.paymentType,
    amount: payment.amount,
    transferDestination: payment.transferDestination,
    status: payment.status,
    proofOfTransferUrl: payment.proofOfTransferUrl,
    additionalProofUrls: payment.additionalProofUrls ?? [],
    proofEditDisabledUrls: payment.proofEditDisabledUrls ?? [],
    paidAt: payment.paidAt ?? null,
  };
}

export type FinancePagePayment = ReturnType<typeof mapPayment>;

export type FinanceDirectPurchaseItem = {
  itemName: string;
  quantity: bigint;
  unit: string;
  unitPrice: bigint;
  totalPrice: bigint;
};

function mapVendor(
  vendor: Awaited<ReturnType<typeof Vendor.find>>[number] | null,
  bankAccountsByVendorId: Map<
    string,
    Awaited<ReturnType<typeof VendorBankAccount.find>>[number][]
  >,
) {
  if (!vendor) return null;
  return {
    id: String(vendor._id),
    name: vendor.name ?? "",
    address: vendor.address ?? null,
    phone: vendor.phone ?? null,
    email: vendor.email ?? null,
    bankName: vendor.bankName ?? null,
    bankAccount: vendor.bankAccount ?? null,
    bankHolder: vendor.bankHolder ?? null,
    bankAccounts: (bankAccountsByVendorId.get(String(vendor._id)) ?? []).map(
      (account) => ({
        id: String(account._id),
        label: account.label ?? null,
        bankName: account.bankName,
        bankAccount: account.bankAccount,
        bankHolder: account.bankHolder,
        isPrimary: Boolean(account.isPrimary),
      }),
    ),
  };
}

async function loadFinancePageMongooseDataImpl(
  role: UserRole,
  canViewAPH: boolean,
) {
  const [
    rawApprovedTicketIds,
    rawInvoicedTicketIds,
    rawDirectPurchaseTicketIds,
    rawContractDeliveryTicketIds,
  ] = await Promise.all([
    PurchaseOrder.distinct("ticketId", {
      status: POStatus.APPROVED,
      ticketId: { $ne: null },
    }),
    PurchaseOrder.distinct("ticketId", {
      vendorInvoiceUrl: { $ne: null },
      status: { $nin: [POStatus.CANCELLED, POStatus.REJECTED] },
      ticketId: { $ne: null },
    }),
    DirectStockPurchase.distinct("ticketId", {
      ticketId: { $ne: null },
    }),
    MaterialDelivery.distinct("ticketId", {
      ticketId: { $ne: null },
    }),
  ]);
  const approvedTicketIds = [
    ...new Set(
      [
        ...rawApprovedTicketIds,
        ...rawInvoicedTicketIds,
        ...rawDirectPurchaseTicketIds,
        ...rawContractDeliveryTicketIds,
      ].filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  ];
  const [orderRows, standaloneRows, directPurchaseRows, ticketRows, termynRows, retentionRows, vendorRows, documentTemplates, tripRows, fuelRows, signoffInvoiceRows, signoffConfirmationRows, rentalRows] =
    await Promise.all([
      PurchaseOrder.find({
        status: { $in: [POStatus.DRAFT, POStatus.PENDING_FINANCE_REVIEW] },
      })
        .sort({ createdAt: 1 })
        .lean(),
      PurchaseOrder.find({
        status: POStatus.APPROVED,
        $or: [{ ticketId: null }, { ticketId: { $exists: false } }],
      })
        .sort({ approvedAt: 1 })
        .lean(),
      DirectStockPurchase.find({ isApprovedByDirector: true })
        .sort({ approvedAt: 1 })
        .lean(),
      Ticket.find({
        status: { $in: financeStatuses },
        $and: [
          {
            $or: [
              { isApprovedByDirector: true },
              { requestCategory: TicketRequestCategory.APH },
              {
                ticketType: {
                  $in: [
                    EQUIPMENT_REQUEST_TYPE,
                    HOUSE_RENTAL_REQUEST_TYPE,
                    VEHICLE_RENTAL_REQUEST_TYPE,
                  ],
                },
                status: {
                  $in: [
                    TicketStatus.APPROVED_DIR,
                    TicketStatus.WAITING_FINANCE_PAYMENT,
                    TicketStatus.PROCESSED_FINANCE,
                    TicketStatus.COMPLETED,
                  ],
                },
              },
              {
                type: TicketType.MATERIAL,
                $or: [
                  { purchaseReceiptUrl: { $ne: null } },
                  { _id: { $in: approvedTicketIds } },
                  {
                    status: {
                      $in: [
                        TicketStatus.WAITING_FINANCE_PAYMENT,
                        TicketStatus.PROCESSED_FINANCE,
                      ],
                    },
                  },
                ],
              },
            ],
          },
          {
            $or: [
              { type: { $ne: TicketType.MATERIAL } },
              { purchaseReceiptUrl: { $ne: null } },
              { _id: { $in: approvedTicketIds } },
              {
                status: {
                  $in: [
                    TicketStatus.WAITING_FINANCE_PAYMENT,
                    TicketStatus.PROCESSED_FINANCE,
                  ],
                },
              },
            ],
          },
          ...(!canViewAPH
            ? [
                {
                  $or: [
                    { requestCategory: { $ne: TicketRequestCategory.APH } },
                    { requestCategory: null },
                    { requestCategory: { $exists: false } },
                  ],
                },
              ]
            : []),
        ],
      })
        .sort({ createdAt: 1 })
        .lean(),
      SubkonTermyn.find({
        status: {
          $in: [SubkonTermynStatus.FIELD_VERIFIED, SubkonTermynStatus.APPROVED],
        },
      })
        .sort({ createdAt: 1 })
        .lean(),
      SubkonContract.find({
        retentionReleasedAt: null,
      })
        .sort({ createdAt: 1 })
        .lean(),
      Vendor.find({ isApproved: true }).lean(),
      DocumentTemplate.find({
        type: {
          $in: [
            DocType.INVOICE,
            DocType.PURCHASE_ORDER,
            DocType.DO,
            DocType.SPK,
            DocType.SURAT_JALAN,
            DocType.BAST,
          ],
        },
      })
        .sort({ updatedAt: -1, name: 1 })
        .select({ _id: 1, name: 1, type: 1 })
        .lean()
        .then((rows) =>
          rows.map((row) => ({
            id: String(row._id),
            name: row.name,
            type: row.type,
          })),
        ),
      VehicleTripLog.find()
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      VehicleFuelRequest.find()
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      role === UserRole.FINANCE
        ? Invoice.find({ signedAt: null }).sort({ createdAt: 1 }).lean()
        : role === UserRole.DIRECTOR
          ? Invoice.find({
              signedAt: { $ne: null },
              acknowledgedAt: null,
            })
              .sort({ createdAt: 1 })
              .lean()
          : role === UserRole.DEPUTY_DIRECTOR
            ? Invoice.find({
                $or: [
                  { signedAt: null },
                  { signedAt: { $ne: null }, acknowledgedAt: null },
                ],
              })
                .sort({ createdAt: 1 })
                .lean()
            : Promise.resolve([]),
      role === UserRole.FINANCE || role === UserRole.DEPUTY_DIRECTOR
        ? OrderConfirmation.find({
            signedAt: { $ne: null },
            acknowledgedAt: null,
          })
            .sort({ createdAt: 1 })
            .lean()
        : Promise.resolve([]),
      EquipmentRental.find()
        .sort({ billingSubmittedAt: -1, createdAt: -1 })
        .lean(),
    ]);

  const ticketIds = idsOf(ticketRows);
  const approvedTicketOrders = ticketIds.length
    ? await PurchaseOrder.find({
        ticketId: { $in: ticketIds },
        status: POStatus.APPROVED,
      })
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const ticketOrderIds = idsOf(approvedTicketOrders);
  const allOrderRows = [...orderRows, ...standaloneRows, ...approvedTicketOrders];
  const allOrderIds = idsOf(allOrderRows);
  const directPurchaseIds = idsOf(directPurchaseRows);
  const termynContractIds = [
    ...new Set(termynRows.map((termyn) => termyn.subkonContractId)),
  ];
  const retentionContractIds = idsOf(retentionRows);
  const projectIds = [
    ...new Set(
      [
        ...ticketRows.map((ticket) => ticket.projectId),
        ...allOrderRows.map((order) => order.projectId),
        ...tripRows.map((trip) => trip.projectId),
        ...fuelRows.map((request) => request.projectId),
        ...rentalRows.map((rental) => rental.projectId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const [ticketOrderItems, orderPayments, standaloneInvoices, directItems, directPayments, ticketPayments, vendorsForOrders, subkonContractsForTermyns, retentionTermynRows, projects, tripVehicles, tripDeliveryOrders, tripCreators, fuelVehicles, fuelDeliveryOrders, fuelRequesters, fuelReviewers, rentalProjects] =
    await Promise.all([
      allOrderIds.length
        ? POItem.find({ poId: { $in: allOrderIds } }).lean()
        : Promise.resolve([]),
      allOrderIds.length
        ? PaymentTransaction.find({
            poId: { $in: allOrderIds },
            status: PaymentStatus.PAID,
          })
              .sort({ createdAt: -1 })
              .lean()
        : Promise.resolve([]),
      standaloneRows.length
        ? Invoice.find({
            poId: { $in: idsOf(standaloneRows) },
            status: { $in: ["UNPAID", "PARTIAL"] },
          })
              .sort({ createdAt: -1 })
              .lean()
        : Promise.resolve([]),
      directPurchaseIds.length
        ? DirectStockPurchaseItem.find({
            purchaseId: { $in: directPurchaseIds },
          }).lean()
        : Promise.resolve([]),
      directPurchaseIds.length
        ? PaymentTransaction.find({
            directStockPurchaseId: { $in: directPurchaseIds },
            status: PaymentStatus.PAID,
          })
              .sort({ createdAt: -1 })
              .lean()
        : Promise.resolve([]),
      ticketIds.length
        ? PaymentTransaction.find({
            ticketId: { $in: ticketIds },
            status: PaymentStatus.PAID,
          })
              .sort({ createdAt: -1 })
              .lean()
        : Promise.resolve([]),
      allOrderRows.length || directPurchaseRows.length
        ? Vendor.find({
            _id: {
              $in: [
                ...new Set(
                  [
                    ...allOrderRows.map((order) => order.vendorId),
                    ...directPurchaseRows.map((purchase) => purchase.vendorId),
                  ].filter((id): id is string => Boolean(id)),
                ),
              ],
            },
          }).lean()
        : Promise.resolve([]),
      termynContractIds.length
        ? SubkonContract.find({ _id: { $in: termynContractIds } }).lean()
        : Promise.resolve([]),
      retentionContractIds.length
        ? SubkonTermyn.find({
            subkonContractId: { $in: retentionContractIds },
          }).lean()
        : Promise.resolve([]),
      projectIds.length
        ? Project.find({ _id: { $in: projectIds } }).lean()
        : Promise.resolve([]),
      tripRows.length
        ? Vehicle.find({
            _id: { $in: tripRows.map((trip) => trip.vehicleId) },
          }).lean()
        : Promise.resolve([]),
      tripRows.length
        ? DeliveryOrder.find({
            _id: {
              $in: tripRows
                .map((trip) => trip.deliveryOrderId)
                .filter((id): id is string => Boolean(id)),
            },
          }).lean()
        : Promise.resolve([]),
      tripRows.length
        ? User.find({
            _id: { $in: tripRows.map((trip) => trip.createdById) },
          })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
      fuelRows.length
        ? Vehicle.find({
            _id: { $in: fuelRows.map((request) => request.vehicleId) },
          }).lean()
        : Promise.resolve([]),
      fuelRows.length
        ? DeliveryOrder.find({
            _id: { $in: fuelRows.map((request) => request.deliveryOrderId) },
          }).lean()
        : Promise.resolve([]),
      fuelRows.length
        ? User.find({
            _id: { $in: fuelRows.map((request) => request.requestedById) },
          })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
      fuelRows.length
        ? User.find({
            _id: {
              $in: fuelRows
                .map((request) => request.reviewedById)
                .filter((id): id is string => Boolean(id)),
            },
          })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
      rentalRows.length
        ? Project.find({
            _id: {
              $in: rentalRows
                .map((rental) => rental.projectId)
                .filter((id): id is string => Boolean(id)),
            },
          }).lean()
        : Promise.resolve([]),
    ]);

  const itemRows = [...ticketOrderItems];
  const paymentsByPoId = new Map<string, ReturnType<typeof mapPayment>[]>();
  for (const payment of orderPayments) {
    const key = payment.poId ?? "";
    paymentsByPoId.set(key, [...(paymentsByPoId.get(key) ?? []), mapPayment(payment)]);
  }
  const paymentsByDirectPurchaseId = new Map<
    string,
    ReturnType<typeof mapPayment>[]
  >();
  for (const payment of directPayments) {
    const key = payment.directStockPurchaseId ?? "";
    paymentsByDirectPurchaseId.set(key, [
      ...(paymentsByDirectPurchaseId.get(key) ?? []),
      mapPayment(payment),
    ]);
  }
  const paymentsByTicketId = new Map<string, ReturnType<typeof mapPayment>[]>();
  for (const payment of ticketPayments) {
    const key = payment.ticketId ?? "";
    paymentsByTicketId.set(key, [
      ...(paymentsByTicketId.get(key) ?? []),
      mapPayment(payment),
    ]);
  }
  const projectById = byId(projects);
  const vendorDocs = [...vendorRows, ...vendorsForOrders];
  const vendorById = byId(vendorDocs);
  const vendorIds = idsOf(vendorDocs);
  const bankAccountRows = vendorIds.length
    ? await VendorBankAccount.find({ vendorId: { $in: vendorIds } })
        .sort({ isPrimary: -1, createdAt: 1 })
        .lean()
    : [];
  const bankAccountsByVendorId = new Map<
    string,
    (typeof bankAccountRows)[number][]
  >();
  for (const account of bankAccountRows) {
    const accounts = bankAccountsByVendorId.get(account.vendorId) ?? [];
    accounts.push(account);
    bankAccountsByVendorId.set(account.vendorId, accounts);
  }
  const vendorFor = (vendorId?: string | null) =>
    vendorId ? mapVendor(vendorById.get(vendorId) ?? null, bankAccountsByVendorId) : null;
  const itemByOrderId = (orderId: string) =>
    itemRows
      .filter((item) => item.poId === orderId)
      .map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));
  const hydrateOrder = (order: (typeof allOrderRows)[number]) => ({
    id: String(order._id),
    publicCode: order.publicCode ?? "",
    poNumber: order.poNumber ?? "",
    vendorName: order.vendorName ?? "",
    vendor: vendorFor(order.vendorId),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus ?? null,
    paymentBankName: order.paymentBankName ?? null,
    paymentAccountNumber: order.paymentAccountNumber ?? null,
    paymentAccountName: order.paymentAccountName ?? null,
    paymentTerms: order.paymentTerms ?? null,
    includeTax: Boolean(order.includeTax),
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? null,
    paymentReceiptUrl: order.paymentReceiptUrl ?? null,
    vendorInvoiceUrl: order.vendorInvoiceUrl ?? null,
    items: itemByOrderId(String(order._id)),
    paymentTransactions: (paymentsByPoId.get(String(order._id)) ?? []).map(
      (payment) => ({
        ...payment,
        paidAt: payment.paidAt,
      }),
    ),
  });
  const hydratedOrders = orderRows.map(hydrateOrder);
  const hydratedStandalonePayments = standaloneRows.map((order) => {
    const invoice = standaloneInvoices.find(
      (row) => row.poId === String(order._id),
    );
    return {
      ...hydrateOrder(order),
      invoices: invoice ? [{ documentUrl: invoice.documentUrl, grandTotal: invoice.grandTotal }] : [],
    };
  });
  const directPurchaseData = directPurchaseRows.map((purchase) => ({
    ...purchase,
    id: String(purchase._id),
    vendor: vendorFor(purchase.vendorId),
    items: directItems
      .filter((item) => item.purchaseId === String(purchase._id))
      .map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
    paymentTransactions:
      paymentsByDirectPurchaseId.get(String(purchase._id)) ?? [],
  }));
  const ticketProjects = projectById;
  const requesterIds = [...new Set(ticketRows.map((ticket) => ticket.requesterId))];
  const [requesters, ticketItemRows, ticketDeliveryOrderRows, ticketMaterialDeliveryRows] =
    await Promise.all([
      requesterIds.length
        ? User.find({ _id: { $in: requesterIds } }).lean()
        : Promise.resolve([]),
      ticketIds.length
        ? TicketItem.find({ ticketId: { $in: ticketIds } })
            .select({ ticketId: 1, itemName: 1, quantity: 1, unit: 1 })
            .sort({ _id: 1 })
            .lean()
        : Promise.resolve([]),
      ticketIds.length
        ? DeliveryOrder.find({ ticketId: { $in: ticketIds } })
            .select({ ticketId: 1 })
            .lean()
        : Promise.resolve([]),
      ticketIds.length
        ? MaterialDelivery.find({ ticketId: { $in: ticketIds } })
            .select({ ticketId: 1 })
            .lean()
        : Promise.resolve([]),
    ]);
  const itemsByTicketId = new Map<
    string,
    Array<{ itemName: string; quantity: number; unit: string }>
  >();
  for (const item of ticketItemRows) {
    const key = String(item.ticketId ?? "");
    if (!key) continue;
    const list = itemsByTicketId.get(key) ?? [];
    list.push({
      itemName: String(item.itemName ?? ""),
      quantity: Number(item.quantity ?? 0),
      unit: String(item.unit ?? ""),
    });
    itemsByTicketId.set(key, list);
  }
  const deliveryOrderCountByTicketId = new Map<string, number>();
  for (const deliveryOrder of [
    ...ticketDeliveryOrderRows,
    ...ticketMaterialDeliveryRows,
  ]) {
    const key = String(deliveryOrder.ticketId ?? "");
    if (!key) continue;
    deliveryOrderCountByTicketId.set(
      key,
      (deliveryOrderCountByTicketId.get(key) ?? 0) + 1,
    );
  }
  const requesterById = byId(requesters);
  const approvedOrderByTicketId = new Map<
    string,
    ReturnType<typeof hydrateOrder>[]
  >();
  for (const order of approvedTicketOrders) {
    const ticketId = order.ticketId ?? "";
    approvedOrderByTicketId.set(ticketId, [
      ...(approvedOrderByTicketId.get(ticketId) ?? []),
      hydrateOrder(order),
    ]);
  }
  for (const [ticketId, orders] of approvedOrderByTicketId.entries()) {
    approvedOrderByTicketId.set(
      ticketId,
      [...orders].sort((a, b) => {
        const aPaid = a.paidAt ? 1 : 0;
        const bPaid = b.paidAt ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    );
  }
  const toSafeBigInt = (value: unknown): bigint => {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return BigInt(Math.round(value));
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return BigInt(value.trim());
    }
    return BigInt(0);
  };
  const computeOrderScaledTotal = (
    order: ReturnType<typeof hydrateOrder>,
  ): bigint => {
    const itemsSum = order.items.reduce(
      (sum, item) => sum + toSafeBigInt(item.totalPrice),
      BigInt(0),
    );
    if (!order.includeTax) return itemsSum;
    return (itemsSum * BigInt(111) + BigInt(50)) / BigInt(100);
  };
  const hydratedTickets = ticketRows.map((ticket) => {
    const requester = requesterById.get(ticket.requesterId);
    const safeRequester = requester
      ? {
          id: String(requester._id),
          name: requester.name ?? "",
          role: requester.role,
          bankName: requester.bankName ?? null,
          bankAccountName: requester.bankAccountName ?? null,
          bankAccountNumber: requester.bankAccountNumber ?? null,
        }
      : {
          id: String(ticket.requesterId ?? ""),
          name: "Pemohon tidak ditemukan",
          role: UserRole.FIELD_TEAM,
          bankName: null,
          bankAccountName: null,
          bankAccountNumber: null,
        };
    const ticketIdStr = String(ticket._id);
    const ticketPurchaseOrders = approvedOrderByTicketId.get(String(ticket._id)) ?? [];
    const aggregatedPoTotalScaled =
      ticketPurchaseOrders.length > 0
        ? ticketPurchaseOrders.reduce(
            (sum, order) => sum + computeOrderScaledTotal(order),
            BigInt(0),
          )
        : null;
    const invoicedUnpaidPo = ticketPurchaseOrders.find(
      (order) => !order.paidAt && Boolean(order.vendorInvoiceUrl),
    );
    const invoicedAnyPo = ticketPurchaseOrders.find((order) =>
      Boolean(order.vendorInvoiceUrl),
    );
    const effectivePurchaseReceiptUrl =
      ticket.purchaseReceiptUrl ??
      invoicedUnpaidPo?.vendorInvoiceUrl ??
      invoicedAnyPo?.vendorInvoiceUrl ??
      null;
    const poSummaries = ticketPurchaseOrders.map((order) => {
      const scaledTotal = computeOrderScaledTotal(order);
      const paidScaled = order.paymentTransactions.reduce(
        (sum, payment) => sum + toSafeBigInt(payment.amount),
        BigInt(0),
      );
      const remainingScaled =
        scaledTotal > paidScaled ? scaledTotal - paidScaled : BigInt(0);
      return {
        id: order.id,
        publicCode: order.publicCode,
        poNumber: order.poNumber,
        scaledTotal,
        paidScaled,
        remainingScaled,
        isPaid: Boolean(order.paidAt) || remainingScaled === BigInt(0),
        hasInvoice: Boolean(order.vendorInvoiceUrl),
      };
    });
    return {
      id: ticketIdStr,
      ticketType: ticket.ticketType ?? null,
      rentalDetails: (ticket as { rentalDetails?: unknown }).rentalDetails ?? null,
      status: ticket.status,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      type: ticket.type,
      itemsSummary: itemsByTicketId.get(ticketIdStr) ?? [],
      deliveryOrderCount: deliveryOrderCountByTicketId.get(ticketIdStr) ?? 0,
      totalAmount:
        aggregatedPoTotalScaled !== null
          ? aggregatedPoTotalScaled
          : (ticket.totalAmount ?? null),
      aggregatedPoTotalAmount: aggregatedPoTotalScaled,
      poSummaries,
      requestedAmount: ticket.requestedAmount ?? null,
      purchaseReceiptUrl: effectivePurchaseReceiptUrl,
      receiptUrls: ticket.receiptUrls ?? [],
      requestCategory: ticket.requestCategory ?? null,
      fieldCategory: ticket.fieldCategory ?? null,
      relatedPoIds: ticket.relatedPoIds ?? [],
      requestPaymentMethod: ticket.requestPaymentMethod ?? null,
      requestPaymentDescription: ticket.requestPaymentDescription ?? null,
      transferDestination: ticket.transferDestination ?? null,
      recipientName: ticket.recipientName ?? null,
      bankName: ticket.bankName ?? null,
      accountNumber: ticket.accountNumber ?? null,
      requester: safeRequester,
      purchaseOrders: ticketPurchaseOrders,
      project: ticket.projectId
        ? ticketProjects.get(ticket.projectId) ?? null
        : null,
      paymentTransactions: paymentsByTicketId.get(ticketIdStr) ?? [],
    };
  });
  const subkonContractsForRetention = retentionRows;
  const contractById = byId([
    ...subkonContractsForTermyns,
    ...subkonContractsForRetention,
  ]);
  const contractProjectIds = [
    ...new Set(
      [
        ...subkonContractsForTermyns,
        ...subkonContractsForRetention,
      ]
        .map((contract) => contract.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const contractProjects = contractProjectIds.length
    ? await Project.find({ _id: { $in: contractProjectIds } }).lean()
    : [];
  const contractProjectById = byId(contractProjects);
  const hydratedTermyns = termynRows.flatMap((termyn) => {
    const contract = contractById.get(termyn.subkonContractId);
    const project = contract?.projectId
      ? contractProjectById.get(contract.projectId)
      : null;
    if (!contract || !project) return [];
    return [{
      id: String(termyn._id),
      termynNumber: termyn.termynNumber,
      claimedPercent: termyn.claimedPercent,
      grossAmount: termyn.grossAmount,
      retentionAmount: termyn.retentionAmount,
      netAmount: termyn.netAmount,
      status: termyn.status,
      subkonContract: {
        contractNumber: contract.contractNumber,
        subkonName: contract.subkonName,
        project,
      },
    }];
  });
  const retentionTermynsByContractId = new Map<
    string,
    (typeof retentionTermynRows)[number][]
  >();
  for (const termyn of retentionTermynRows) {
    const rows = retentionTermynsByContractId.get(termyn.subkonContractId) ?? [];
    rows.push(termyn);
    retentionTermynsByContractId.set(termyn.subkonContractId, rows);
  }
  const eligibleContracts = subkonContractsForRetention.flatMap((contract) => {
    const project = contract.projectId
      ? contractProjectById.get(contract.projectId)
      : null;
    const contractTermyns =
      retentionTermynsByContractId.get(String(contract._id)) ?? [];
    if (!project || contractTermyns.length === 0) return [];
    return [{
      id: String(contract._id),
      contractNumber: contract.contractNumber,
      subkonName: contract.subkonName,
      retentionReleasedAt: contract.retentionReleasedAt ?? null,
      termyns: contractTermyns,
      project: {
        ...project,
        bastDocuments: [],
      },
    }];
  });
  const bastProjectIds = [...new Set(eligibleContracts.map((contract) => contract.project._id))];
  const bastDocuments = bastProjectIds.length
    ? await BASTDocument.find({
        projectId: { $in: bastProjectIds },
        type: BASTType.PHO,
        isApproved: true,
      }).lean()
    : [];
  const bastByProjectId = new Map<string, typeof bastDocuments>();
  for (const bast of bastDocuments) {
    const rows = bastByProjectId.get(bast.projectId) ?? [];
    rows.push(bast);
    bastByProjectId.set(bast.projectId, rows);
  }
  const retentionContracts = eligibleContracts.map((contract) => ({
    ...contract,
    project: {
      ...contract.project,
      bastDocuments: bastByProjectId.get(String(contract.project._id)) ?? [],
    },
  }));
  const termynsByContractId = new Map<
    string,
    (typeof retentionTermynRows)[number][]
  >();
  for (const termyn of [...termynRows, ...retentionTermynRows]) {
    const rows = termynsByContractId.get(termyn.subkonContractId) ?? [];
    if (!rows.some((row) => String(row._id) === String(termyn._id))) {
      rows.push(termyn);
    }
    termynsByContractId.set(termyn.subkonContractId, rows);
  }
  const hydratedRetentionContracts = retentionContracts.map((contract) => ({
    ...contract,
    termyns: termynsByContractId.get(contract.id) ?? [],
  }));

  const tripVehicleById = byId(tripVehicles);
  const tripDeliveryOrderById = byId(tripDeliveryOrders);
  const tripCreatorById = byId(tripCreators);
  const hydratedTripLogs = tripRows.flatMap((trip) => {
    const vehicle = tripVehicleById.get(trip.vehicleId);
    const creator = tripCreatorById.get(trip.createdById);
    if (!vehicle || !creator) return [];
    const project = trip.projectId ? projectById.get(trip.projectId) : null;
    return [{
      id: String(trip._id),
      createdAt: trip.createdAt,
      kilometerStart: trip.kilometerStart,
      kilometerEnd: trip.kilometerEnd,
      distanceKm: trip.distanceKm,
      fuelLiter: trip.fuelLiter,
      vehicle,
      deliveryOrder: trip.deliveryOrderId
        ? tripDeliveryOrderById.get(trip.deliveryOrderId) ?? null
        : null,
      project,
      createdBy: creator,
    }];
  });
  const fuelVehicleById = byId(fuelVehicles);
  const fuelDeliveryOrderById = byId(fuelDeliveryOrders);
  const fuelRequesterById = byId(fuelRequesters);
  const fuelReviewerById = byId(fuelReviewers);
  const fuelTicketIds = [
    ...new Set(
      fuelDeliveryOrders
        .map((deliveryOrder) => deliveryOrder.ticketId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const fuelTickets = fuelTicketIds.length
    ? await Ticket.find({ _id: { $in: fuelTicketIds } }).lean()
    : [];
  const fuelTicketProjectIds = [
    ...new Set(fuelTickets.map((ticket) => ticket.projectId).filter(Boolean)),
  ];
  const fuelTicketProjects = fuelTicketProjectIds.length
    ? await Project.find({ _id: { $in: fuelTicketProjectIds } }).lean()
    : [];
  const fuelTicketById = byId(fuelTickets);
  const fuelTicketProjectById = byId(fuelTicketProjects);
  const fuelTripLogs = fuelDeliveryOrders.length
    ? await VehicleTripLog.find({
        deliveryOrderId: {
          $in: fuelDeliveryOrders.map((deliveryOrder) =>
            String(deliveryOrder._id),
          ),
        },
      }).lean()
    : [];
  const fuelTripByDeliveryOrderId = new Map(
    fuelTripLogs.map((trip) => [trip.deliveryOrderId, trip]),
  );
  const hydratedFuelRequests = fuelRows.flatMap((request) => {
    const vehicle = fuelVehicleById.get(request.vehicleId);
    const deliveryOrder = fuelDeliveryOrderById.get(request.deliveryOrderId);
    const requester = fuelRequesterById.get(request.requestedById);
    if (!vehicle || !deliveryOrder || !requester) return [];
    const ticket = deliveryOrder.ticketId
      ? fuelTicketById.get(deliveryOrder.ticketId)
      : null;
    const ticketProject = ticket?.projectId
      ? fuelTicketProjectById.get(ticket.projectId)
      : null;
    return [{
      id: String(request._id),
      status: request.status,
      source: request.source,
      estimatedDistanceKm: request.estimatedDistanceKm,
      exceptionDistanceKm: request.exceptionDistanceKm,
      exceptionReason: request.exceptionReason ?? null,
      estimatedFuelLiter: request.estimatedFuelLiter,
      unitPrice: request.unitPrice,
      requestedAmount: request.requestedAmount,
      disbursementMethod: request.disbursementMethod ?? null,
      transferDestination: request.transferDestination ?? null,
      transferProofUrl: request.transferProofUrl ?? null,
      beforeFillingPhotoUrl: request.beforeFillingPhotoUrl,
      afterFillingPhotoUrl: request.afterFillingPhotoUrl ?? null,
      receiptPhotoUrl: request.receiptPhotoUrl ?? null,
      financeNote: request.financeNote ?? null,
      createdAt: request.createdAt,
      disbursedAt: request.disbursedAt ?? null,
      proofSubmittedAt: request.proofSubmittedAt ?? null,
      requestedBy: requester,
      reviewedBy: request.reviewedById
        ? fuelReviewerById.get(request.reviewedById) ?? null
        : null,
      vehicle,
      project: request.projectId
        ? projectById.get(request.projectId) ?? null
        : null,
      deliveryOrder: {
        ...deliveryOrder,
        vehicleTripLog: fuelTripByDeliveryOrderId.get(
          String(deliveryOrder._id),
        ) ?? null,
        ticket: ticket
          ? { project: ticketProject }
          : null,
      },
    }];
  });
  const invoiceSignerById = byId(
    await User.find({
      _id: {
        $in: signoffInvoiceRows
          .flatMap((invoice) => [invoice.signedById, invoice.acknowledgedById])
          .filter((id): id is string => Boolean(id)),
      },
    })
      .select({ _id: 1, name: 1 })
      .lean(),
  );
  const confirmationSignerById = byId(
    await User.find({
      _id: {
        $in: signoffConfirmationRows
          .flatMap((confirmation) => [
            confirmation.signedById,
            confirmation.acknowledgedById,
          ])
          .filter((id): id is string => Boolean(id)),
      },
    })
      .select({ _id: 1, name: 1 })
      .lean(),
  );
  const hydratedInvoices = signoffInvoiceRows.map((invoice) => ({
    id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    signedBy: invoice.signedById
      ? invoiceSignerById.get(invoice.signedById) ?? null
      : null,
    signedAt: invoice.signedAt ?? null,
    acknowledgedBy: invoice.acknowledgedById
      ? invoiceSignerById.get(invoice.acknowledgedById) ?? null
      : null,
    acknowledgedAt: invoice.acknowledgedAt ?? null,
  }));
  const hydratedConfirmations = signoffConfirmationRows.map((confirmation) => ({
    id: String(confirmation._id),
    koNumber: confirmation.koNumber,
    signedBy: confirmation.signedById
      ? confirmationSignerById.get(confirmation.signedById) ?? null
      : null,
    signedAt: confirmation.signedAt ?? null,
    acknowledgedBy: confirmation.acknowledgedById
      ? confirmationSignerById.get(confirmation.acknowledgedById) ?? null
      : null,
    acknowledgedAt: confirmation.acknowledgedAt ?? null,
  }));
  const rentalProjectById = byId(rentalProjects);
  const hydratedRentals = rentalRows.map((rental) => ({
    ...rental,
    id: String(rental._id),
    project: rental.projectId
      ? rentalProjectById.get(rental.projectId) ?? null
      : null,
  }));

  return {
    orders: hydratedOrders,
    standalonePayments: hydratedStandalonePayments,
    directPurchases: directPurchaseData,
    tickets: hydratedTickets,
    termyns: hydratedTermyns,
    retentionContracts: hydratedRetentionContracts,
    vendors: vendorRows.flatMap((vendor) => {
      const mapped = mapVendor(vendor, bankAccountsByVendorId);
      return mapped ? [mapped] : [];
    }),
    documentTemplates,
    vehicleTripLogs: hydratedTripLogs,
    vehicleFuelRequests: hydratedFuelRequests,
    documentSignoffInvoices: hydratedInvoices,
    documentSignoffConfirmations: hydratedConfirmations,
    equipmentRentals: hydratedRentals,
    standaloneOrderIds: idsOf(standaloneRows),
    ticketOrderIds,
  };
}

export type FinancePageMongooseData = Awaited<
  ReturnType<typeof loadFinancePageMongooseDataImpl>
>;

export async function loadFinancePageMongooseData(
  role: UserRole,
  canViewAPH: boolean,
): Promise<FinancePageMongooseData> {
  if (!(await connectToMongoDBOptional())) {
    return {
      orders: [],
      standalonePayments: [],
      directPurchases: [],
      tickets: [],
      termyns: [],
      retentionContracts: [],
      vendors: [],
      documentTemplates: [],
      vehicleTripLogs: [],
      vehicleFuelRequests: [],
      documentSignoffInvoices: [],
      documentSignoffConfirmations: [],
      equipmentRentals: [],
      standaloneOrderIds: [],
      ticketOrderIds: [],
    } satisfies FinancePageMongooseData;
  }
  return loadFinancePageMongooseDataImpl(role, canViewAPH);
}

export async function loadRelatedFinancePurchaseOrders(ids: string[]) {
  if (ids.length === 0 || !(await connectToMongoDBOptional())) return [];
  const orderRows = await PurchaseOrder.find({ _id: { $in: ids } }).lean();
  const vendorIds = [
    ...new Set(
      orderRows
        .map((order) => order.vendorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [vendors, bankAccounts] = await Promise.all([
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds } }).lean()
      : Promise.resolve([]),
    vendorIds.length
      ? VendorBankAccount.find({ vendorId: { $in: vendorIds } })
          .sort({ isPrimary: -1, createdAt: 1 })
          .lean()
      : Promise.resolve([]),
  ]);
  const vendorById = byId(vendors);
  const bankAccountsByVendorId = new Map<
    string,
    (typeof bankAccounts)[number][]
  >();
  for (const account of bankAccounts) {
    const rows = bankAccountsByVendorId.get(account.vendorId) ?? [];
    rows.push(account);
    bankAccountsByVendorId.set(account.vendorId, rows);
  }
  return orderRows.map((order) => ({
    id: String(order._id),
    poNumber: order.poNumber,
    vendorName: order.vendorName,
    vendor: order.vendorId
      ? mapVendor(vendorById.get(order.vendorId) ?? null, bankAccountsByVendorId)
      : null,
    paymentBankName: order.paymentBankName ?? null,
    paymentAccountNumber: order.paymentAccountNumber ?? null,
    paymentAccountName: order.paymentAccountName ?? null,
  }));
}
