import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FinanceHub from "@/app/components/apps/finance/FinanceHub";
import type {
  FinanceDashboardMonth,
  FinanceDashboardTransaction,
  FinanceExpenseCategory,
} from "@/app/components/apps/finance/FinanceDashboard";
import {
  PaymentStatus,
  PaymentType,
  TicketRequestCategory,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { createBrandedQrDataUrl } from "@/lib/documents/qr-code";
import {
  loadFinancePageMongooseData,
  loadRelatedFinancePurchaseOrders,
} from "@/lib/finance-page-data";
import type {
  FinanceDirectPurchaseItem,
  FinancePagePayment,
} from "@/lib/finance-page-data";
import {
  decimalFromScaledInteger,
  decimalNumberFromScaledInteger,
  decimalStringFromScaledInteger,
} from "@/lib/scaled-decimal";
import {
  getVendorBankAccounts,
  resolveVendorBankAccount,
  type VendorBankAccountOption,
} from "@/lib/vendor-bank-accounts";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import type {
  RentalItemRow,
  RentalPaymentStatus,
  RentalPeriodType,
  RentalStatus,
  RentalType,
} from "@/app/actions/rentals";
import { loadMaterialContractsBundle } from "@/lib/material-contracts-server";
import { connectToMongoDB } from "@/lib/mongoose";
import FinanceAccount from "@/models/finance-account";
import Cashflow from "@/models/cashflow";
import OfficeExpense from "@/models/office-expense";
import PaymentTransaction from "@/models/payment-transaction";
import EquipmentTicket from "@/models/ticket";
import Project from "@/models/project";
import User from "@/models/user";
import PurchaseOrder from "@/models/purchase-order";
import DirectStockPurchase from "@/models/direct-stock-purchase";
import { EQUIPMENT_REQUEST_TYPE } from "@/lib/equipment-request";

export const metadata: Metadata = {
  title: "Finance Hub",
};

const financeRoles: UserRole[] = [
  UserRole.FINANCE,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
];

async function loadOfficeExpenseRows(
  filter: {
    createdAt?: { $gte: Date };
    expenseType?: { $in: string[] };
  },
  limit?: number,
) {
  let query = OfficeExpense.find(filter).sort({ createdAt: -1 });
  if (limit !== undefined) query = query.limit(limit);
  const expenses = await query.lean();
  const [recipients, accounts] = await Promise.all([
    User.find({
      _id: { $in: expenses.map((expense) => expense.recipientId) },
    })
      .select({ _id: 1, name: 1, role: 1 })
      .lean(),
    FinanceAccount.find({
      _id: { $in: expenses.map((expense) => expense.accountId) },
    })
      .select({ _id: 1, accountName: 1 })
      .lean(),
  ]);
  const recipientById = new Map(
    recipients.map((recipient) => [String(recipient._id), recipient]),
  );
  const accountById = new Map(
    accounts.map((account) => [String(account._id), account]),
  );

  return expenses.map((expense) => {
    const recipient = recipientById.get(expense.recipientId);
    const account = accountById.get(expense.accountId);
    if (!recipient || !account) {
      throw new Error(
        `Finance expense ${expense._id} has a missing recipient or account`,
      );
    }
    return {
      id: String(expense._id),
      recipientId: expense.recipientId,
      expenseType: expense.expenseType,
      description: expense.description,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      proofUrls: expense.proofUrls,
      createdAt: expense.createdAt,
      recipient: {
        name: recipient.name ?? "",
        role: recipient.role as UserRole,
      },
      account: { accountName: account.accountName },
    };
  });
}

async function loadCashflowRows(
  canViewAPH: boolean,
  incomingFundsOnly = false,
) {
  const hiddenAphPaymentIds = canViewAPH
    ? []
    : (
        await PaymentTransaction.find({
          ticketId: {
            $in: await EquipmentTicket.find({
              requestCategory: TicketRequestCategory.APH,
            }).distinct("_id"),
          },
        }).distinct("_id")
      );
  const visibilityFilter = canViewAPH
    ? {}
    : {
        $or: [
          { paymentTransactionId: null },
          { paymentTransactionId: { $exists: false } },
          { paymentTransactionId: { $nin: hiddenAphPaymentIds } },
        ],
      };
  const cashflowFilter = incomingFundsOnly
    ? {
        type: "IN",
        $or: [{ transferGroupId: null }, { transferGroupId: { $exists: false } }],
      }
    : visibilityFilter;
  const cashflows = await Cashflow.find(cashflowFilter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const paymentIds = cashflows
    .map((cashflow) => cashflow.paymentTransactionId)
    .filter((id): id is string => Boolean(id));
  const [payments, accounts, projects, recorders] = await Promise.all([
    PaymentTransaction.find({ _id: { $in: paymentIds } }).lean(),
    FinanceAccount.find({
      _id: { $in: cashflows.map((cashflow) => cashflow.accountId) },
    })
      .select({ _id: 1, accountName: 1 })
      .lean(),
    Project.find({
      _id: { $in: cashflows.map((cashflow) => cashflow.projectId).filter(Boolean) },
    })
      .select({ _id: 1, kelompokTani: 1 })
      .lean(),
    User.find({
      _id: { $in: cashflows.map((cashflow) => cashflow.recordedBy) },
    })
      .select({ _id: 1, name: 1 })
      .lean(),
  ]);
  const paymentById = new Map(
    payments.map((payment) => [String(payment._id), payment]),
  );
  const accountById = new Map(
    accounts.map((account) => [String(account._id), account]),
  );
  const projectById = new Map(
    projects.map((project) => [String(project._id), project]),
  );
  const recorderById = new Map(
    recorders.map((recorder) => [String(recorder._id), recorder]),
  );
  const [tickets, purchaseOrders, directPurchases] = await Promise.all([
    EquipmentTicket.find({
      _id: {
        $in: payments.map((payment) => payment.ticketId).filter(Boolean),
      },
    })
      .select({ _id: 1, ticketNumber: 1, title: 1 })
      .lean(),
    PurchaseOrder.find({
      _id: { $in: payments.map((payment) => payment.poId).filter(Boolean) },
    })
      .select({ _id: 1, poNumber: 1, vendorName: 1, ticketId: 1 })
      .lean(),
    DirectStockPurchase.find({
      _id: {
        $in: payments.map((payment) => payment.directStockPurchaseId).filter(Boolean),
      },
    })
      .select({ _id: 1, purchaseNumber: 1, vendorName: 1, ticketId: 1 })
      .lean(),
  ]);
  const linkedTicketIds = canViewAPH
    ? [
        ...purchaseOrders.map((order) => order.ticketId),
        ...directPurchases.map((purchase) => purchase.ticketId),
      ].filter((id): id is string => Boolean(id))
    : [];
  const linkedTickets = linkedTicketIds.length
    ? await EquipmentTicket.find({ _id: { $in: linkedTicketIds } })
        .select({ _id: 1, ticketNumber: 1, title: 1 })
        .lean()
    : [];
  const ticketById = new Map(
    [...tickets, ...linkedTickets].map((ticket) => [
      String(ticket._id),
      { ticketNumber: ticket.ticketNumber, title: ticket.title },
    ]),
  );
  const purchaseOrderById = new Map(
    purchaseOrders.map((order) => [String(order._id), order]),
  );
  const directPurchaseById = new Map(
    directPurchases.map((purchase) => [String(purchase._id), purchase]),
  );

  return cashflows.map((cashflow) => {
    const account = accountById.get(cashflow.accountId);
    const recorder = recorderById.get(cashflow.recordedBy);
    if (!account || !recorder) {
      throw new Error(`Cashflow ${cashflow._id} has a missing account or recorder`);
    }
    const payment = cashflow.paymentTransactionId
      ? paymentById.get(cashflow.paymentTransactionId)
      : null;
    const purchaseOrder = payment?.poId
      ? purchaseOrderById.get(payment.poId)
      : null;
    const directPurchase = payment?.directStockPurchaseId
      ? directPurchaseById.get(payment.directStockPurchaseId)
      : null;
    return {
      id: String(cashflow._id),
      type: cashflow.type,
      amount: cashflow.amount,
      sourceDesc: cashflow.sourceDesc,
      paymentMethod: cashflow.paymentMethod,
      senderName: cashflow.senderName,
      transferGroupId: cashflow.transferGroupId ?? null,
      proofUrl: cashflow.proofUrl,
      createdAt: cashflow.createdAt,
      paymentTransactionId: cashflow.paymentTransactionId,
      paymentTransaction: payment
        ? {
            proofOfTransferUrl: payment.proofOfTransferUrl,
            ticket: payment.ticketId
              ? ticketById.get(payment.ticketId) ?? null
              : null,
            po: purchaseOrder
              ? {
                  poNumber: purchaseOrder.poNumber ?? "",
                  vendorName: purchaseOrder.vendorName ?? "",
                  ticket:
                    canViewAPH && purchaseOrder.ticketId
                      ? ticketById.get(purchaseOrder.ticketId) ?? null
                      : null,
                }
              : null,
            directStockPurchase: directPurchase
              ? {
                  purchaseNumber: directPurchase.purchaseNumber ?? "",
                  vendorName: directPurchase.vendorName ?? "",
                  ticket:
                    canViewAPH && directPurchase.ticketId
                      ? ticketById.get(directPurchase.ticketId) ?? null
                      : null,
                }
              : null,
          }
        : null,
      account: { id: String(account._id), accountName: account.accountName },
      project: cashflow.projectId
        ? {
            kelompokTani:
              projectById.get(cashflow.projectId)?.kelompokTani ?? "",
          }
        : null,
      recorder: { name: recorder.name ?? "" },
    };
  });
}

async function loadPaidPaymentRows(
  canViewAPH: boolean,
  withoutCashflow: boolean,
) {
  const aphTicketIds = canViewAPH
    ? []
    : await EquipmentTicket.find({
        requestCategory: TicketRequestCategory.APH,
      }).distinct("_id");
  const existingCashflowPaymentIds = withoutCashflow
    ? await Cashflow.distinct("paymentTransactionId", {
        paymentTransactionId: { $ne: null },
      })
    : [];
  const paymentFilter = {
    status: PaymentStatus.PAID,
    paidAt: { $ne: null },
    $or: [
      { ticketId: { $ne: null } },
      { poId: { $ne: null } },
      { directStockPurchaseId: { $ne: null } },
    ],
    ...(aphTicketIds.length
      ? {
          $and: [
            {
              $or: [
                { ticketId: null },
                { ticketId: { $exists: false } },
                { ticketId: { $nin: aphTicketIds } },
              ],
            },
          ],
        }
      : {}),
    ...(withoutCashflow
      ? { _id: { $nin: existingCashflowPaymentIds } }
      : {}),
  };
  const payments = await PaymentTransaction.find(paymentFilter)
    .sort({ paidAt: -1 })
    .limit(200)
    .lean();
  const [tickets, purchaseOrders, directPurchases, cashflows] =
    await Promise.all([
      EquipmentTicket.find({
        _id: { $in: payments.map((payment) => payment.ticketId).filter(Boolean) },
      })
        .select({
          _id: 1,
          ticketNumber: 1,
          title: 1,
          requesterId: 1,
          projectId: 1,
        })
        .lean(),
      PurchaseOrder.find({
        _id: { $in: payments.map((payment) => payment.poId).filter(Boolean) },
      })
        .select({
          _id: 1,
          poNumber: 1,
          vendorName: 1,
          projectId: 1,
        })
        .lean(),
      DirectStockPurchase.find({
        _id: {
          $in: payments
            .map((payment) => payment.directStockPurchaseId)
            .filter(Boolean),
        },
      })
        .select({ _id: 1, purchaseNumber: 1, vendorName: 1, ticketId: 1 })
        .lean(),
      Cashflow.find({
        paymentTransactionId: { $in: payments.map((payment) => String(payment._id)) },
      })
        .select({ paymentTransactionId: 1, accountId: 1 })
        .lean(),
    ]);
  const additionalTicketIds = directPurchases
    .map((purchase) => purchase.ticketId)
    .filter((id): id is string => Boolean(id));
  const additionalTickets = additionalTicketIds.length
    ? await EquipmentTicket.find({ _id: { $in: additionalTicketIds } })
        .select({
          _id: 1,
          ticketNumber: 1,
          title: 1,
          requesterId: 1,
          projectId: 1,
        })
        .lean()
    : [];
  const allTickets = [...tickets, ...additionalTickets];
  const [requesters, projects, accounts] = await Promise.all([
    User.find({
      _id: { $in: allTickets.map((ticket) => ticket.requesterId).filter(Boolean) },
    })
      .select({ _id: 1, name: 1 })
      .lean(),
    Project.find({
      _id: {
        $in: [
          ...allTickets.map((ticket) => ticket.projectId),
          ...purchaseOrders.map((order) => order.projectId),
        ].filter(Boolean),
      },
    })
      .select({ _id: 1, title: 1, kelompokTani: 1 })
      .lean(),
    FinanceAccount.find({
      _id: { $in: cashflows.map((cashflow) => cashflow.accountId) },
    })
      .select({ _id: 1, accountName: 1 })
      .lean(),
  ]);
  const requesterById = new Map(
    requesters.map((requester) => [String(requester._id), requester]),
  );
  const projectById = new Map(
    projects.map((project) => [String(project._id), project]),
  );
  const ticketById = new Map(
    allTickets.map((ticket) => [String(ticket._id), ticket]),
  );
  const orderById = new Map(
    purchaseOrders.map((order) => [String(order._id), order]),
  );
  const directPurchaseById = new Map(
    directPurchases.map((purchase) => [String(purchase._id), purchase]),
  );
  const cashflowByPaymentId = new Map(
    cashflows.map((cashflow) => [
      String(cashflow.paymentTransactionId),
      cashflow,
    ]),
  );
  const accountById = new Map(
    accounts.map((account) => [String(account._id), account]),
  );

  return payments.map((payment) => {
    const ticket = payment.ticketId
      ? ticketById.get(payment.ticketId)
      : null;
    const order = payment.poId ? orderById.get(payment.poId) : null;
    const directPurchase = payment.directStockPurchaseId
      ? directPurchaseById.get(payment.directStockPurchaseId)
      : null;
    const directTicket = directPurchase?.ticketId
      ? ticketById.get(directPurchase.ticketId)
      : null;
    const cashflow = cashflowByPaymentId.get(String(payment._id));
    const account = cashflow
      ? accountById.get(cashflow.accountId)
      : null;
    const requester = ticket?.requesterId
      ? requesterById.get(ticket.requesterId)
      : null;
    const ticketProject = ticket?.projectId
      ? projectById.get(ticket.projectId)
      : null;
    const orderProject = order?.projectId
      ? projectById.get(order.projectId)
      : null;
    const directProject = directTicket?.projectId
      ? projectById.get(directTicket.projectId)
      : null;
    return {
      id: String(payment._id),
      amount: payment.amount,
      transferDestination: payment.transferDestination,
      paymentType: payment.paymentType as PaymentType,
      proofOfTransferUrl: payment.proofOfTransferUrl,
      additionalProofUrls: payment.additionalProofUrls,
      paidAt: payment.paidAt,
      cashflow: account ? { account: { accountName: account.accountName } } : null,
      ticket: ticket
        ? {
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            requester: { name: requester?.name ?? "" },
            project: ticketProject
              ? {
                  title: ticketProject.title,
                  kelompokTani: ticketProject.kelompokTani,
                }
              : null,
          }
        : null,
      po: order
        ? {
            poNumber: order.poNumber ?? "",
            vendorName: order.vendorName ?? "",
            project: orderProject
              ? {
                  title: orderProject.title,
                  kelompokTani: orderProject.kelompokTani,
                }
              : null,
          }
        : null,
      directStockPurchase: directPurchase
        ? {
            purchaseNumber: directPurchase.purchaseNumber ?? "",
            vendorName: directPurchase.vendorName ?? "",
            ticket: directTicket
              ? {
                  project: directProject
                    ? {
                        title: directProject.title,
                        kelompokTani: directProject.kelompokTani,
                      }
                    : null,
                }
              : null,
          }
        : null,
    };
  });
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; openSheet?: string }>;
}) {
  const { tab, openSheet } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!financeRoles.includes(session.user.role)) redirect("/");
  const currentDate = new Date();
  const cashflowDashboardStart = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 5, 1),
  );
  const canViewAPH =
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.DIRECTOR;
  const financeData = await loadFinancePageMongooseData(
    session.user.role,
    canViewAPH,
  );
  const {
    orders,
    standalonePayments,
    directPurchases,
    tickets,
    termyns,
    retentionContracts,
    vendors,
    documentTemplates,
    vehicleTripLogs,
    vehicleFuelRequests,
    documentSignoffInvoices,
    documentSignoffConfirmations,
    equipmentRentals,
  } = financeData;

  const [
    financeAccounts,
    officeExpenses,
    officeExpenseRecipients,
    cashflows,
    unmatchedHistoricalPayments,
    dashboardIncomingFunds,
    dashboardPaidExpenses,
    financeProjects,
    dashboardIncomingFlows,
    dashboardPaidFlows,
    dashboardOfficeExpenses,
    officeExpenseUsage,
  ] = await Promise.all([
    FinanceAccount.find()
      .sort({ accountName: 1 })
      .select({
        _id: 1,
        accountName: 1,
        accountNumber: 1,
        holderName: 1,
        balance: 1,
      })
      .lean()
      .then((accounts) =>
        accounts.map((account) => ({
          id: String(account._id),
          accountName: account.accountName,
          accountNumber: account.accountNumber,
          holderName: account.holderName,
          balance: account.balance,
        })),
      ),
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.ADMINISTRATIONS
      ? loadOfficeExpenseRows({}, 200)
      : Promise.resolve([]),
    User.find({ isActive: true })
      .sort({ name: 1 })
      .select({ _id: 1, name: 1, role: 1 })
      .lean()
      .then((users) =>
        users.map((user) => ({
          id: String(user._id),
          name: user.name ?? "",
          role: user.role as UserRole,
        })),
      ),
    loadCashflowRows(canViewAPH),
    loadPaidPaymentRows(canViewAPH, true),
    loadCashflowRows(true, true),
    loadPaidPaymentRows(canViewAPH, false),
    Project.find()
      .sort({ title: 1 })
      .select({ _id: 1, title: 1, kelompokTani: 1 })
      .lean()
      .then((projects) =>
        projects.map((project) => ({
          id: String(project._id),
          title: project.title,
          kelompokTani: project.kelompokTani,
        })),
      ),
    Cashflow.find({
      type: "IN",
      $or: [{ transferGroupId: null }, { transferGroupId: { $exists: false } }],
      createdAt: { $gte: cashflowDashboardStart },
    })
      .select({ createdAt: 1, amount: 1 })
      .lean(),
    PaymentTransaction.find({
      status: "PAID",
      paidAt: { $gte: cashflowDashboardStart },
      $or: [
        { ticketId: { $ne: null } },
        { poId: { $ne: null } },
        { directStockPurchaseId: { $ne: null } },
      ],
    })
      .select({ paidAt: 1, amount: 1, ticketId: 1, poId: 1 })
      .lean(),
    loadOfficeExpenseRows({ createdAt: { $gte: cashflowDashboardStart } }),
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.ADMINISTRATIONS
      ? loadOfficeExpenseRows({ expenseType: { $in: ["SALARY", "ADVANCE"] } })
      : Promise.resolve([]),
  ]);
  const fundUsageByUser = new Map<
    string,
    {
      userId: string;
      name: string;
      role: UserRole;
      totalAmount: number;
      categories: Map<string, { amount: number; count: number }>;
    }
  >();
  const addFundUsage = (
    userId: string,
    name: string,
    role: UserRole,
    category: string,
    amount: number,
  ) => {
    const userUsage = fundUsageByUser.get(userId) ?? {
      userId,
      name,
      role,
      totalAmount: 0,
      categories: new Map<string, { amount: number; count: number }>(),
    };
    const categoryUsage = userUsage.categories.get(category) ?? {
      amount: 0,
      count: 0,
    };
    categoryUsage.amount += amount;
    categoryUsage.count += 1;
    userUsage.categories.set(category, categoryUsage);
    userUsage.totalAmount += amount;
    fundUsageByUser.set(userId, userUsage);
  };

  for (const ticket of tickets) {
    if (
      ticket.requestCategory !== TicketRequestCategory.OPS &&
      ticket.requestCategory !== TicketRequestCategory.REIMBURSEMENT
    ) {
      continue;
    }
    const paidPayments = new Map(
      [
        ...ticket.paymentTransactions,
        ...ticket.purchaseOrders.flatMap((order) => order.paymentTransactions),
      ].map((payment) => [payment.id, payment]),
    );
    for (const payment of paidPayments.values()) {
      addFundUsage(
        ticket.requester.id,
        ticket.requester.name,
        ticket.requester.role,
        ticket.requestCategory,
        payment.amount,
      );
    }
  }
  for (const expense of officeExpenseUsage) {
    addFundUsage(
      expense.recipientId,
      expense.recipient.name,
      expense.recipient.role,
      expense.expenseType,
      expense.amount,
    );
  }
  const fundUsageSummary = Array.from(fundUsageByUser.values())
    .map((user) => ({
      ...user,
      categories: Array.from(user.categories, ([type, values]) => ({
        type,
        ...values,
      })),
    }))
    .sort(
      (a, b) =>
        b.totalAmount - a.totalAmount ||
        a.name.localeCompare(b.name, "id"),
    );

  const monthlyFlowMap = new Map<
    string,
    {
      monthKey: string;
      flowType: string;
      sourceCategory: string;
      totalAmount: number;
    }
  >();
  const addMonthlyFlow = (
    date: Date,
    flowType: "IN" | "OUT",
    sourceCategory: string,
    amount: number,
  ) => {
    const monthKey = date.toISOString().slice(0, 7);
    const key = `${monthKey}:${flowType}:${sourceCategory}`;
    const aggregate = monthlyFlowMap.get(key);
    if (aggregate) {
      aggregate.totalAmount += amount;
    } else {
      monthlyFlowMap.set(key, { monthKey, flowType, sourceCategory, totalAmount: amount });
    }
  };
  for (const flow of dashboardIncomingFlows) {
    addMonthlyFlow(flow.createdAt, "IN", "incoming", flow.amount);
  }
  for (const flow of dashboardPaidFlows) {
    if (!flow.paidAt) continue;
    const sourceCategory = flow.ticketId
      ? "ticket"
      : flow.poId
        ? "purchase-order"
        : "direct-material";
    addMonthlyFlow(flow.paidAt, "OUT", sourceCategory, flow.amount);
  }
  for (const expense of dashboardOfficeExpenses) {
    addMonthlyFlow(expense.createdAt, "OUT", "office-expense", expense.amount);
  }
  const cashflowMonthlyAggregates = [...monthlyFlowMap.values()].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey),
  );

  const dashboardMonths: FinanceDashboardMonth[] = Array.from(
    { length: 6 },
    (_, index) => {
      const monthDate = new Date(
        Date.UTC(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth() - 5 + index,
          1,
        ),
      );
      const key = `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      const monthAggregates = cashflowMonthlyAggregates.filter(
        (aggregate) => aggregate.monthKey === key,
      );
      return {
        key,
        label: new Intl.DateTimeFormat("id-ID", {
          month: "short",
          timeZone: "UTC",
        }).format(monthDate),
        inflow: monthAggregates
          .filter((aggregate) => aggregate.flowType === "IN")
          .reduce((total, aggregate) => total + aggregate.totalAmount, 0),
        outflow: monthAggregates
          .filter((aggregate) => aggregate.flowType === "OUT")
          .reduce((total, aggregate) => total + aggregate.totalAmount, 0),
      };
    },
  );
  const currentMonthCashflow = dashboardMonths[dashboardMonths.length - 1];
  const expenseCategoryLabels: Record<
    FinanceExpenseCategory["kind"],
    string
  > = {
    ticket: "Tiket",
    "purchase-order": "Purchase Order",
    "direct-material": "Belanja Material Langsung",
    "office-expense": "Pengeluaran Kantor & Operasional",
  };
  const expenseCategoryKinds: FinanceExpenseCategory["kind"][] = [
    "ticket",
    "purchase-order",
    "direct-material",
    "office-expense",
  ];
  const expenseCategories: FinanceExpenseCategory[] = expenseCategoryKinds.map((kind) => ({
    kind,
    label: expenseCategoryLabels[kind],
    amount: cashflowMonthlyAggregates
      .filter(
        (aggregate) =>
          aggregate.flowType === "OUT" &&
          aggregate.sourceCategory === kind,
      )
      .reduce((total, aggregate) => total + aggregate.totalAmount, 0),
  }));
  const dashboardTransactions: FinanceDashboardTransaction[] = [
    ...dashboardIncomingFunds.map((fund) => ({
      id: fund.id,
      createdAt: fund.createdAt.toISOString(),
      type: "IN" as const,
      category: "Dana Masuk",
      sourceDesc: fund.sourceDesc,
      paymentMethod:
        fund.paymentMethod === "DEPOSIT"
          ? "Setor tunai"
          : fund.paymentMethod === "CASH"
            ? "Tunai"
            : "Transfer",
      counterparty: fund.senderName || fund.recorder.name || "—",
      accountOrDestination: fund.account.accountName,
      projectName: fund.project?.kelompokTani ?? null,
      amount: fund.amount,
      proofUrl: fund.proofUrl,
    })),
    ...dashboardPaidExpenses.flatMap((payment) => {
      if (!payment.paidAt) return [];
      const accountName =
        payment.cashflow?.account.accountName ||
        payment.transferDestination ||
        "Tujuan tidak dicatat";
      if (payment.ticket) {
        return [{
          id: payment.id,
          createdAt: payment.paidAt.toISOString(),
          type: "OUT" as const,
          category: "Tiket",
          sourceDesc: `${payment.ticket.ticketNumber} · ${payment.ticket.title}`,
          paymentMethod:
            payment.paymentType === "DOWN_PAYMENT"
              ? "Down Payment"
              : payment.paymentType === "PROGRESS_PAYMENT"
                ? "Termin"
                : "Pelunasan",
          counterparty: payment.ticket.requester.name,
          accountOrDestination: accountName,
          projectName:
            payment.ticket.project?.kelompokTani ||
            payment.ticket.project?.title ||
            null,
          amount: payment.amount,
          proofUrl: payment.proofOfTransferUrl,
        }];
      }
      if (payment.po) {
        return [{
          id: payment.id,
          createdAt: payment.paidAt.toISOString(),
          type: "OUT" as const,
          category: "Purchase Order",
          sourceDesc: `${payment.po.poNumber} · ${payment.po.vendorName}`,
          paymentMethod:
            payment.paymentType === "DOWN_PAYMENT"
              ? "Down Payment"
              : payment.paymentType === "PROGRESS_PAYMENT"
                ? "Termin"
                : "Pelunasan",
          counterparty: payment.po.vendorName,
          accountOrDestination: accountName,
          projectName:
            payment.po.project?.kelompokTani ||
            payment.po.project?.title ||
            null,
          amount: payment.amount,
          proofUrl: payment.proofOfTransferUrl,
        }];
      }
      if (payment.directStockPurchase) {
        const project = payment.directStockPurchase.ticket?.project;
        return [{
          id: payment.id,
          createdAt: payment.paidAt.toISOString(),
          type: "OUT" as const,
          category: "Belanja Material Langsung",
          sourceDesc: `${payment.directStockPurchase.purchaseNumber} · ${payment.directStockPurchase.vendorName}`,
          paymentMethod:
            payment.paymentType === "DOWN_PAYMENT"
              ? "Down Payment"
              : payment.paymentType === "PROGRESS_PAYMENT"
                ? "Termin"
                : "Pelunasan",
          counterparty: payment.directStockPurchase.vendorName,
          accountOrDestination: accountName,
          projectName: project?.kelompokTani || project?.title || null,
          amount: payment.amount,
          proofUrl: payment.proofOfTransferUrl,
        }];
      }
      return [];
    }),
    ...dashboardOfficeExpenses.map((expense) => ({
      id: expense.id,
      createdAt: expense.createdAt.toISOString(),
      type: "OUT" as const,
      category: "Pengeluaran Kantor & Operasional",
      sourceDesc: `${
        expense.expenseType === "SALARY"
          ? "Gaji"
          : expense.expenseType === "ADVANCE"
            ? "Kasbon / Ambilan"
            : "Reimbursement"
      } · ${expense.description}`,
      paymentMethod: expense.paymentMethod === "CASH" ? "Tunai" : "Transfer",
      counterparty: expense.recipient.name,
      accountOrDestination: expense.account.accountName,
      projectName: null,
      amount: expense.amount,
      proofUrl: expense.proofUrls[0] ?? null,
    })),
  ].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );

  const findVendor = (name: string) =>
    vendors.find(
      (vendor) =>
        vendor.name.trim().toLocaleLowerCase("id-ID") ===
        name.trim().toLocaleLowerCase("id-ID"),
    );

  const resolveVendorBankDetails = (
    directFields: {
      paymentBankName: string | null;
      paymentAccountNumber: string | null;
      paymentAccountName: string | null;
    },
    linkedVendor:
      | {
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          bankName: string | null;
          bankAccount: string | null;
          bankHolder: string | null;
          bankAccounts?: VendorBankAccountOption[];
        }
      | null
      | undefined,
    vendorName: string,
  ) => {
    const matchedVendor = linkedVendor ?? findVendor(vendorName);
    const vendorAccounts = matchedVendor
      ? getVendorBankAccounts(matchedVendor)
      : [];
    const primaryVendorBank = matchedVendor
      ? resolveVendorBankAccount(matchedVendor.bankAccounts ?? [], matchedVendor)
      : null;
    const paymentBankName =
      directFields.paymentBankName ?? primaryVendorBank?.bankName ?? null;
    const paymentAccountNumber =
      directFields.paymentAccountNumber ?? primaryVendorBank?.bankAccount ?? null;
    const paymentAccountName =
      directFields.paymentAccountName ?? primaryVendorBank?.bankHolder ?? null;
    const hasExplicitOrderAccount =
      Boolean(paymentBankName?.trim()) &&
      Boolean(paymentAccountNumber?.trim()) &&
      !vendorAccounts.some(
        (account) =>
          account.bankName.trim().toLocaleLowerCase("id-ID") ===
            paymentBankName?.trim().toLocaleLowerCase("id-ID") &&
          account.bankAccount.trim() === paymentAccountNumber?.trim(),
      );
    const mergedVendorBankAccounts: VendorBankAccountOption[] = [
      ...(hasExplicitOrderAccount && paymentBankName && paymentAccountNumber
        ? [
            {
              id: "document-selected",
              label: "Rekening di dokumen",
              bankName: paymentBankName,
              bankAccount: paymentAccountNumber,
              bankHolder: paymentAccountName ?? vendorName,
              isPrimary: true,
            },
          ]
        : []),
      ...vendorAccounts,
    ];
    return {
      vendorAddress:
        linkedVendor?.address ?? findVendor(vendorName)?.address ?? null,
      vendorContact:
        linkedVendor?.email ?? findVendor(vendorName)?.email ?? null,
      vendorPhone:
        linkedVendor?.phone ?? findVendor(vendorName)?.phone ?? null,
      paymentBankName,
      paymentAccountNumber,
      paymentAccountName,
      vendorBankAccounts: mergedVendorBankAccounts,
    };
  };

  const historicalPayments = unmatchedHistoricalPayments.flatMap((payment) => {
    if (!payment.paidAt) return [];
    const source = payment.ticket
     ? {
         category: "Tiket",
         description: `${payment.ticket.ticketNumber} · ${payment.ticket.title}`,
       }
     : payment.po
       ? {
           category: "Purchase Order",
           description: `${payment.po.poNumber} · ${payment.po.vendorName}`,
         }
       : payment.directStockPurchase
         ? {
             category: "Belanja Material Langsung",
             description: `${payment.directStockPurchase.purchaseNumber} · ${payment.directStockPurchase.vendorName}`,
           }
         : null;
    if (!source) return [];
    return [{
     id: payment.id,
     amount: payment.amount,
     paidAt: payment.paidAt.toISOString(),
     paymentType: payment.paymentType,
     proofUrl: payment.proofOfTransferUrl,
     category: source.category,
     sourceDesc: source.description,
    }];
  });

  const activeUsers = officeExpenseRecipients;
  const financeRoleUsers = activeUsers.filter(
    (user) => user.role === UserRole.FINANCE,
  );
  const financeSignerName =
    (session.user.role === UserRole.FINANCE && session.user.name) ||
    financeRoleUsers[0]?.name ||
    cashflows[0]?.recorder?.name ||
    "Bagian Keuangan (Finance)";
  const coordinatorSignerName =
    activeUsers.find((user) => user.role === UserRole.KOORDINATOR)?.name ||
    activeUsers.find((user) => user.role === UserRole.ADMINISTRATIONS)?.name ||
    "Koordinator / Administrasi";
  const directorSignerName =
    activeUsers.find((user) => user.role === UserRole.DIRECTOR)?.name ||
    "Direktur Utama";

  let financeQrDataUrl: string | null = null;
  try {
    financeQrDataUrl = await createBrandedQrDataUrl(
      `SPE-FIN | ${financeSignerName}`,
      240,
    );
  } catch (error) {
    console.error("Failed to generate Finance report QR code:", error);
  }

  const allRelatedPoIdsForTickets = [
    ...new Set(
      tickets.flatMap((ticket) =>
        ticket.requestCategory === TicketRequestCategory.SHIPPING_COST
          ? ticket.relatedPoIds || []
          : [],
      ),
    ),
  ];
  const relatedPosForTickets =
    await loadRelatedFinancePurchaseOrders(allRelatedPoIdsForTickets);
  const financePoMap = new Map(
    relatedPosForTickets.map((po) => [po.id, po]),
  );

  const equipmentTicketIds = new Set(
    tickets
      .filter((ticket) => ticket.ticketType === EQUIPMENT_REQUEST_TYPE)
      .map((ticket) => ticket.id),
  );

  const materialContractsBundle = await loadMaterialContractsBundle();

  return (
    <>
      <FinanceHub
        key={`${tab ?? ""}:${openSheet ?? ""}`}
        role={session.user.role}
        financeSignerName={financeSignerName}
        financeQrDataUrl={financeQrDataUrl}
        coordinatorSignerName={coordinatorSignerName}
        directorSignerName={directorSignerName}
        dashboardMonths={dashboardMonths}
        financeAccounts={financeAccounts}
        officeExpenses={officeExpenses.map((expense) => ({
          ...expense,
          createdAt: expense.createdAt.toISOString(),
          expenseType: expense.expenseType,
          recipientName: expense.recipient.name,
          recipientRole: expense.recipient.role,
        }))}
        officeExpenseRecipients={
          session.user.role === UserRole.FINANCE ||
          session.user.role === UserRole.ADMINISTRATIONS ||
          session.user.role === UserRole.DIRECTOR ||
          session.user.role === UserRole.DEPUTY_DIRECTOR
            ? officeExpenseRecipients
            : []
        }
        fundUsageSummary={fundUsageSummary}
        dashboardTransactions={dashboardTransactions}
        expenseCategories={expenseCategories}
        cashflows={cashflows.map((cashflow) => ({
          ...cashflow,
          type: (cashflow.type === "IN" ? "IN" : "OUT") as "IN" | "OUT",
          paymentMethod: (cashflow.paymentMethod === "TRANSFER" || cashflow.paymentMethod === "CASH" || cashflow.paymentMethod === "DEPOSIT" ? cashflow.paymentMethod : null),
          proofUrl: cashflow.proofUrl ?? "",
          createdAt: cashflow.createdAt.toISOString(),
        }))}
        historicalPayments={historicalPayments}
        financeProjects={financeProjects.map((project) => ({
          id: project.id,
          name: project.kelompokTani || project.title,
        }))}
        monthInflow={currentMonthCashflow.inflow}
        monthOutflow={currentMonthCashflow.outflow}
        documentSignoffTasks={[
          ...documentSignoffInvoices.map((document) => ({
            id: document.id,
            kind: "INVOICE" as const,
            number: document.invoiceNumber ?? "Tanpa Nomor",
            action:
              session.user.role === UserRole.FINANCE
                ? ("sign" as const)
                : ("acknowledge" as const),
            signedByName: document.signedBy?.name ?? null,
            signedAt: document.signedAt?.toISOString() ?? null,
            acknowledgedByName: document.acknowledgedBy?.name ?? null,
            acknowledgedAt: document.acknowledgedAt?.toISOString() ?? null,
            previewUrl: `/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(document.id)}`,
          })),
          ...documentSignoffConfirmations.map((document) => ({
            id: document.id,
            kind: "KO" as const,
            number: document.koNumber,
            action: "acknowledge" as const,
            signedByName: document.signedBy?.name ?? null,
            signedAt: document.signedAt?.toISOString() ?? null,
            acknowledgedByName: document.acknowledgedBy?.name ?? null,
            acknowledgedAt: document.acknowledgedAt?.toISOString() ?? null,
            previewUrl: `/api/documents/transactions?kind=KO&id=${encodeURIComponent(document.id)}`,
          })),
        ]}
        purchaseOrders={orders.map((order) => {
          const bankDetails = resolveVendorBankDetails(
            order,
            order.vendor,
            order.vendorName,
          );
          return {
            id: order.id,
            publicCode: order.publicCode,
            poNumber: order.poNumber,
            vendorName: order.vendorName,
            vendorAddress: bankDetails.vendorAddress,
            vendorContact: bankDetails.vendorContact,
            vendorPhone: bankDetails.vendorPhone,
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() ?? null,
            paymentReceiptUrl: order.paymentReceiptUrl,
            vendorInvoiceUrl: order.vendorInvoiceUrl,
            paymentMethod: order.paymentMethod,
            paymentBankName: bankDetails.paymentBankName,
            paymentAccountNumber: bankDetails.paymentAccountNumber,
            paymentAccountName: bankDetails.paymentAccountName,
            vendorBankAccounts: bankDetails.vendorBankAccounts,
            paymentTerms: order.paymentTerms,
            includeTax: order.includeTax,
            items: order.items,
            paymentTransactions: order.paymentTransactions.map((payment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
            })),
          };
        })}
        standalonePayments={standalonePayments.map((order) => {
          const bankDetails = resolveVendorBankDetails(
            order,
            order.vendor,
            order.vendorName,
          );
          return {
            id: order.id,
            publicCode: order.publicCode,
            poNumber: order.poNumber,
            vendorName: order.vendorName,
            vendorAddress: bankDetails.vendorAddress,
            vendorContact: bankDetails.vendorContact,
            vendorPhone: bankDetails.vendorPhone,
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() ?? null,
            paymentReceiptUrl: order.paymentReceiptUrl,
            vendorInvoiceUrl:
              order.vendorInvoiceUrl ?? order.invoices[0]?.documentUrl ?? null,
            invoiceGrandTotal: order.invoices[0]?.grandTotal ?? null,
            paymentMethod: order.paymentMethod,
            paymentBankName: bankDetails.paymentBankName,
            paymentAccountNumber: bankDetails.paymentAccountNumber,
            paymentAccountName: bankDetails.paymentAccountName,
            vendorBankAccounts: bankDetails.vendorBankAccounts,
            paymentTerms: order.paymentTerms,
            includeTax: order.includeTax,
            items: order.items,
            paymentTransactions: order.paymentTransactions.map((payment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
            })),
          };
        })}
        directPurchases={directPurchases.map((purchase) => {
          const bankDetails = resolveVendorBankDetails(
            purchase,
            purchase.vendor,
            purchase.vendorName,
          );
          return {
            id: purchase.id,
            purchaseNumber: purchase.purchaseNumber,
            vendorName: purchase.vendorName,
            paymentMethod: purchase.paymentMethod,
            totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
            paymentBankName: bankDetails.paymentBankName,
            paymentAccountNumber: bankDetails.paymentAccountNumber,
            paymentAccountName: bankDetails.paymentAccountName,
            vendorBankAccounts: bankDetails.vendorBankAccounts,
            vendorInvoiceUrl: purchase.vendorInvoiceUrl,
            createdAt: purchase.createdAt.toISOString(),
            items: purchase.items.map((item: FinanceDirectPurchaseItem) => ({
              itemName: item.itemName,
              quantity: decimalNumberFromScaledInteger(item.quantity),
              unit: item.unit,
              unitPrice: decimalNumberFromScaledInteger(item.unitPrice),
              totalPrice: decimalNumberFromScaledInteger(item.totalPrice),
            })),
            paymentTransactions: purchase.paymentTransactions.map((payment: FinancePagePayment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
            })),
          };
        })}
        tickets={tickets.map((ticket) => {
          const firstRelatedPo =
            ticket.requestCategory === TicketRequestCategory.SHIPPING_COST &&
            ticket.relatedPoIds?.length
              ? financePoMap.get(ticket.relatedPoIds[0])
              : undefined;
          const activeTicketPo = ticket.purchaseOrders[0];
          const ticketPoBankDetails = activeTicketPo
            ? resolveVendorBankDetails(
                activeTicketPo,
                activeTicketPo.vendor,
                activeTicketPo.vendorName,
              )
            : firstRelatedPo
              ? resolveVendorBankDetails(
                  firstRelatedPo,
                  firstRelatedPo.vendor,
                  firstRelatedPo.vendorName,
                )
              : null;
          const resolvedPoBankName =
            ticketPoBankDetails?.paymentBankName ?? null;
          const resolvedPoAccountNumber =
            ticketPoBankDetails?.paymentAccountNumber ?? null;
          const resolvedPoAccountName =
            ticketPoBankDetails?.paymentAccountName ?? null;
          return {
            id: ticket.id,
            ticketType: equipmentTicketIds.has(ticket.id)
              ? EQUIPMENT_REQUEST_TYPE
              : null,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            type: ticket.type,
            hasApprovedPo: ticket.purchaseOrders.length > 0,
            poNumber: activeTicketPo?.poNumber ?? null,
            totalAmount:
              (activeTicketPo
                ? Math.round(
                    activeTicketPo.items.reduce(
                      (sum, item) => sum + item.totalPrice,
                      0,
                    ) *
                      (activeTicketPo.includeTax ? 1.11 : 1) *
                      100,
                  ) / 100
                : null)?.toString() ??
              ticket.requestedAmount?.toString() ??
              (ticket.totalAmount !== null
                ? decimalStringFromScaledInteger(ticket.totalAmount)
                : null) ??
              null,
            purchaseReceiptUrl: ticket.purchaseReceiptUrl,
            requestCategory: ticket.requestCategory,
            receiptUrls: ticket.receiptUrls,
            requesterName: ticket.requester.name,
            requestPaymentMethod: ticket.requestPaymentMethod,
            requestPaymentDescription: ticket.requestPaymentDescription,
            recipientName:
              ticket.recipientName ??
              resolvedPoAccountName ??
              ticket.requester.bankAccountName ??
              ticket.requester.name,
            bankName:
              ticket.bankName ??
              resolvedPoBankName ??
              ticket.requester.bankName,
            accountNumber:
              ticket.accountNumber ??
              resolvedPoAccountNumber ??
              ticket.requester.bankAccountNumber,
            transferDestination:
              ticket.requestCategory === TicketRequestCategory.APH
                ? ticket.transferDestination
                : resolvedPoBankName && resolvedPoAccountNumber
                  ? `Ditransfer ke: ${resolvedPoBankName}, ${resolvedPoAccountNumber}, a.n. ${resolvedPoAccountName ?? activeTicketPo?.vendorName ?? firstRelatedPo?.vendorName ?? ""}`
                  : ticket.transferDestination ?? null,
            vendorBankName:
              resolvedPoBankName ??
              ticket.bankName ??
              ticket.requester.bankName,
            vendorAccountNumber:
              resolvedPoAccountNumber ??
              ticket.accountNumber ??
              ticket.requester.bankAccountNumber,
            vendorAccountName:
              resolvedPoAccountName ??
              ticket.recipientName ??
              ticket.requester.bankAccountName ??
              ticket.requester.name,
            vendorBankAccounts: ticketPoBankDetails?.vendorBankAccounts ?? [],
            projectName: ticket.project
              ? `${ticket.project.kelompokTani} · ${ticket.project.title}`
              : null,
            paymentTransactions: Array.from(
              new Map(
                [
                  ...ticket.paymentTransactions,
                  ...ticket.purchaseOrders.flatMap(
                    (order) => order.paymentTransactions,
                  ),
                ].map((payment) => [payment.id, payment]),
              ).values(),
            ).map((payment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
            })),
          };
        })}
        termyns={termyns.map((termyn) => ({
          id: termyn.id,
          contractNumber: termyn.subkonContract.contractNumber,
          subkonName: termyn.subkonContract.subkonName,
          projectName: `${termyn.subkonContract.project.kelompokTani} · ${termyn.subkonContract.project.title}`,
          termynNumber: termyn.termynNumber,
          claimedPercent: decimalStringFromScaledInteger(termyn.claimedPercent),
          grossAmount: decimalStringFromScaledInteger(termyn.grossAmount),
          retentionAmount: decimalStringFromScaledInteger(termyn.retentionAmount),
          netAmount: decimalStringFromScaledInteger(termyn.netAmount),
          status: termyn.status,
        }))}
        retentionContracts={retentionContracts.map((contract) => ({
          id: contract.id,
          contractNumber: contract.contractNumber,
          subkonName: contract.subkonName,
          projectName: `${contract.project.kelompokTani} · ${contract.project.title}`,
          retainedAmount: decimalFromScaledInteger(
            contract.termyns.reduce(
              (total, termyn) => total + termyn.retentionAmount,
              BigInt(0),
            ),
          ).toString(),
          eligible:
            contract.termyns.every((termyn) => termyn.status === "PAID") &&
            contract.project.bastDocuments.some(
              (pho: { maintenanceEndsAt?: Date | null }) =>
                pho.maintenanceEndsAt != null &&
                pho.maintenanceEndsAt.getTime() <= Date.now(),
            ),
        }))}
        vehicleTripLogs={vehicleTripLogs.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          doNumber: log.deliveryOrder?.doNumber ?? null,
          projectName: log.project
            ? `${log.project.kelompokTani} · ${log.project.title}`
            : "Proyek tidak terhubung",
          plateNumber: log.vehicle.plateNumber,
          vehicleType: log.vehicle.vehicleType,
          kilometerStart: decimalStringFromScaledInteger(log.kilometerStart),
          kilometerEnd: decimalStringFromScaledInteger(log.kilometerEnd),
          distanceKm: decimalStringFromScaledInteger(log.distanceKm),
          fuelLiter: decimalStringFromScaledInteger(log.fuelLiter),
          createdByName: log.createdBy.name,
        }))}
        vehicleFuelRequests={vehicleFuelRequests.map((request) => ({
          id: request.id,
          status: request.status,
          source: request.source,
          estimatedDistanceKm: decimalStringFromScaledInteger(
            request.estimatedDistanceKm,
          ),
          tripDistanceKm:
            request.deliveryOrder.vehicleTripLog
              ? decimalStringFromScaledInteger(
                  request.deliveryOrder.vehicleTripLog.distanceKm,
                )
              : null,
          exceptionDistanceKm: decimalStringFromScaledInteger(
            request.exceptionDistanceKm,
          ),
          exceptionReason: request.exceptionReason,
          estimatedFuelLiter: decimalStringFromScaledInteger(
            request.estimatedFuelLiter,
          ),
          unitPrice: decimalStringFromScaledInteger(request.unitPrice),
          requestedAmount: decimalStringFromScaledInteger(
            request.requestedAmount,
          ),
          disbursementMethod: request.disbursementMethod,
          transferDestination: request.transferDestination,
          transferProofUrl: request.transferProofUrl,
          beforeFillingPhotoUrl: request.beforeFillingPhotoUrl,
          afterFillingPhotoUrl: request.afterFillingPhotoUrl,
          receiptPhotoUrl: request.receiptPhotoUrl,
          financeNote: request.financeNote,
          createdAt: request.createdAt.toISOString(),
          disbursedAt: request.disbursedAt?.toISOString() ?? null,
          proofSubmittedAt: request.proofSubmittedAt?.toISOString() ?? null,
          doNumber: request.deliveryOrder.doNumber,
          plateNumber: request.vehicle.plateNumber,
          vehicleType: request.vehicle.vehicleType,
          projectName: request.project
            ? `${request.project.kelompokTani} · ${request.project.title}`
            : request.deliveryOrder.ticket?.project
              ? `${request.deliveryOrder.ticket.project.kelompokTani} · ${request.deliveryOrder.ticket.project.title}`
              : "Proyek tidak terhubung",
          requestedByName: request.requestedBy.name,
          reviewerName: request.reviewedBy?.name ?? null,
        } satisfies VehicleFuelRequestView))}
        documentTemplates={documentTemplates}
        initialTab={tab}
        initialOpenSheet={openSheet}
        rentals={equipmentRentals.map((r) => ({
          id: r.id,
          type: r.type as RentalType,
          name: r.name,
          category: r.category,
          codeOrPlate: r.codeOrPlate,
          vendorName: r.vendorName,
          vendorPhone: r.vendorPhone,
          rentalPeriodType: r.rentalPeriodType as RentalPeriodType,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          duration: r.duration,
          ratePerPeriod: decimalStringFromScaledInteger(r.ratePerPeriod),
          additionalCost: decimalStringFromScaledInteger(r.additionalCost),
          totalCost: decimalStringFromScaledInteger(r.totalCost),
          status: r.status as RentalStatus,
          withOperator: r.withOperator,
          operatorName: r.operatorName,
          withFuel: r.withFuel,
          projectId: r.projectId,
          projectName: r.project ? `${r.project.kelompokTani} · ${r.project.title}` : null,
          notes: r.notes,
          createdByName: r.createdByName,
          createdAt: r.createdAt.toISOString(),
          paymentStatus: (r.paymentStatus as RentalPaymentStatus) || "UNPAID",
          billingSubmittedAt: r.billingSubmittedAt?.toISOString() ?? null,
          billingSubmittedByName: r.billingSubmittedByName,
          paidAt: r.paidAt?.toISOString() ?? null,
          paidByName: r.paidByName,
          proofOfPaymentUrl: r.proofOfPaymentUrl,
          paymentBankName: r.paymentBankName,
          paymentAccountNumber: r.paymentAccountNumber,
          paymentAccountName: r.paymentAccountName,
          financeNotes: r.financeNotes,
        }))}
        materialContracts={materialContractsBundle.contracts}
        vendorInvoices={materialContractsBundle.vendorInvoices}
      />
    </>
  );
}
