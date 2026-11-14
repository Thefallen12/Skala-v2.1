import "server-only";

import type { PaymentVendorBankOption } from "@/app/components/apps/finance/PaymentModal";
import {
  formatVendorBankAccount,
  getVendorBankAccounts,
} from "@/lib/vendor-bank-accounts";
import { connectToMongoDB } from "@/lib/mongoose";
import FinanceAccount from "@/models/finance-account";
import Project from "@/models/project";
import User from "@/models/user";
import {
  MaterialContract,
  MaterialDelivery,
  Vendor,
  VendorBankAccount,
  VendorInvoice,
  VendorInvoicePayment,
} from "@/models/finance-records";
import {
  calculateContractDeliverySubtotal,
  roundMaterialNumber,
  type MaterialContractRow,
  type MaterialContractsBundle,
  type MaterialDeliveryRow,
  type VendorInvoiceRow,
} from "@/lib/material-contracts";

type VendorWithBankAccounts = {
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts: {
    id: string;
    label: string | null;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    isPrimary: boolean;
  }[];
};

function mapVendorBankOptions(
  vendor: VendorWithBankAccounts | null | undefined,
): PaymentVendorBankOption[] {
  if (!vendor) return [];
  return getVendorBankAccounts(vendor)
    .map((account) => {
      const destination = formatVendorBankAccount(account);
      if (!destination) return null;
      return {
        id: account.id,
        label: account.label || account.bankName || "Rekening Vendor",
        destination,
        isPrimary: account.isPrimary,
      } satisfies PaymentVendorBankOption;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function loadMaterialContractsBundle(options?: {
  projectId?: string;
  includeInvoices?: boolean;
}): Promise<MaterialContractsBundle> {
  await connectToMongoDB();
  const includeInvoices = options?.includeInvoices ?? true;
  const deliveryFilter = options?.projectId
    ? { projectId: options.projectId }
    : {};

  const [contractRows, deliveryRows, invoiceRows] = await Promise.all([
    MaterialContract.find().sort({ isActive: -1, createdAt: -1 }).lean(),
    MaterialDelivery.find(deliveryFilter)
      .sort({ deliveryDate: -1, createdAt: -1 })
      .lean(),
    includeInvoices
      ? VendorInvoice.find().sort({ status: 1, createdAt: -1 }).lean()
      : Promise.resolve([]),
  ]);

  const contractIds = [...new Set(contractRows.map((row) => String(row._id)))];
  const invoiceIds = [...new Set(invoiceRows.map((row) => String(row._id)))];
  const deliveryRelations = [
    ...(contractIds.length ? [{ contractId: { $in: contractIds } }] : []),
    ...(invoiceIds.length ? [{ vendorInvoiceId: { $in: invoiceIds } }] : []),
  ];
  const allDeliveryRows = deliveryRelations.length
    ? await MaterialDelivery.find({ $or: deliveryRelations }).lean()
    : [];
  const allContractIds = [
    ...new Set([
      ...contractIds,
      ...allDeliveryRows.map((row) => row.contractId),
      ...invoiceRows.map((row) => row.contractId),
    ]),
  ];
  const [relatedContracts, invoicePayments] = await Promise.all([
    allContractIds.length
      ? MaterialContract.find({ _id: { $in: allContractIds } }).lean()
      : Promise.resolve([]),
    invoiceIds.length
      ? VendorInvoicePayment.find({ vendorInvoiceId: { $in: invoiceIds } })
          .sort({ paidAt: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const vendorIds = [
    ...new Set(
      relatedContracts
        .map((row) => row.vendorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const creatorIds = [
    ...new Set(
      contractRows
        .map((row) => row.createdById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const receivedByIds = [
    ...new Set(
      allDeliveryRows
        .map((row) => row.receivedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const processedByIds = [
    ...new Set(
      invoiceRows
        .map((row) => row.processedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const paymentAccountIds = [
    ...new Set(
      invoicePayments
        .map((row) => row.financeAccountId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const paymentProcessorIds = [
    ...new Set(invoicePayments.map((row) => row.processedById)),
  ];
  const projectIds = [
    ...new Set(allDeliveryRows.map((row) => row.projectId)),
  ];
  const [vendorRows, bankAccountRows, users, projectRows, accounts] =
    await Promise.all([
      vendorIds.length
        ? Vendor.find({ _id: { $in: vendorIds } }).lean()
        : Promise.resolve([]),
      vendorIds.length
        ? VendorBankAccount.find({ vendorId: { $in: vendorIds } })
            .sort({ isPrimary: -1, createdAt: 1 })
            .lean()
        : Promise.resolve([]),
      User.find({
        _id: {
          $in: [
            ...new Set([...creatorIds, ...receivedByIds, ...processedByIds, ...paymentProcessorIds]),
          ],
        },
      })
        .select({ _id: 1, name: 1 })
        .lean(),
      projectIds.length
        ? Project.find({ _id: { $in: projectIds } })
            .select({ _id: 1, title: 1, kelompokTani: 1 })
            .lean()
        : Promise.resolve([]),
      paymentAccountIds.length
        ? FinanceAccount.find({ _id: { $in: paymentAccountIds } })
            .select({ _id: 1, accountName: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

  const vendorById = new Map(vendorRows.map((row) => [String(row._id), row]));
  const bankAccountsByVendorId = new Map<
    string,
    (typeof bankAccountRows)[number][]
  >();
  for (const account of bankAccountRows) {
    const accountsForVendor = bankAccountsByVendorId.get(account.vendorId) ?? [];
    accountsForVendor.push(account);
    bankAccountsByVendorId.set(account.vendorId, accountsForVendor);
  }
  const vendorDetailsById = new Map<string, VendorWithBankAccounts>();
  for (const [id, vendor] of vendorById) {
    vendorDetailsById.set(id, {
      bankName: vendor.bankName ?? null,
      bankAccount: vendor.bankAccount ?? null,
      bankHolder: vendor.bankHolder ?? null,
      bankAccounts: (bankAccountsByVendorId.get(id) ?? []).map((account) => ({
        id: String(account._id),
        label: account.label ?? null,
        bankName: account.bankName,
        bankAccount: account.bankAccount,
        bankHolder: account.bankHolder,
        isPrimary: Boolean(account.isPrimary),
      })),
    });
  }
  const contractsById = new Map(
    relatedContracts.map((row) => [String(row._id), row]),
  );
  const usersById = new Map(users.map((row) => [String(row._id), row]));
  const projectsById = new Map(projectRows.map((row) => [String(row._id), row]));
  const accountsById = new Map(accounts.map((row) => [String(row._id), row]));
  const deliveriesByContractId = new Map<
    string,
    (typeof allDeliveryRows)[number][]
  >();
  const deliveriesByInvoiceId = new Map<
    string,
    (typeof allDeliveryRows)[number][]
  >();
  for (const delivery of allDeliveryRows) {
    const contractDeliveries =
      deliveriesByContractId.get(delivery.contractId) ?? [];
    contractDeliveries.push(delivery);
    deliveriesByContractId.set(delivery.contractId, contractDeliveries);
    if (delivery.vendorInvoiceId) {
      const invoiceDeliveries =
        deliveriesByInvoiceId.get(delivery.vendorInvoiceId) ?? [];
      invoiceDeliveries.push(delivery);
      deliveriesByInvoiceId.set(delivery.vendorInvoiceId, invoiceDeliveries);
    }
  }
  const paymentsByInvoiceId = new Map<
    string,
    (typeof invoicePayments)[number][]
  >();
  for (const payment of invoicePayments) {
    const invoicePaymentsForId =
      paymentsByInvoiceId.get(payment.vendorInvoiceId) ?? [];
    invoicePaymentsForId.push(payment);
    paymentsByInvoiceId.set(payment.vendorInvoiceId, invoicePaymentsForId);
  }

  const contracts: MaterialContractRow[] = contractRows.map((contract) => {
    const deliveries = deliveriesByContractId.get(String(contract._id)) ?? [];
    const unbilledDeliveries = deliveries.filter(
      (delivery) => delivery.billingStatus === "UNBILLED",
    );
    const totalDeliveredVolume = roundMaterialNumber(
      deliveries.reduce((sum, delivery) => sum + delivery.quantityReceived, 0),
      2,
    );
    const unbilledVolume = roundMaterialNumber(
      unbilledDeliveries.reduce(
        (sum, delivery) => sum + delivery.quantityReceived,
        0,
      ),
      2,
    );
    const creator = contract.createdById
      ? usersById.get(contract.createdById)
      : null;

    return {
      id: String(contract._id),
      contractNumber: contract.contractNumber,
      vendorId: contract.vendorId ?? null,
      vendorName: contract.vendorName,
      vendorBankAccounts: mapVendorBankOptions(
        contract.vendorId
          ? vendorDetailsById.get(contract.vendorId)
          : null,
      ),
      materialType: contract.materialType,
      unitPrice: contract.unitPrice,
      unit: contract.unit,
      estimatedVolume: contract.estimatedVolume ?? null,
      notes: contract.notes ?? null,
      startDate: contract.startDate.toISOString().slice(0, 10),
      endDate: contract.endDate?.toISOString().slice(0, 10) ?? null,
      isActive: contract.isActive,
      createdByName: creator?.name ?? null,
      createdAt: contract.createdAt.toISOString(),
      totalDeliveriesCount: deliveries.length,
      unbilledDeliveriesCount: unbilledDeliveries.length,
      totalDeliveredVolume,
      unbilledVolume,
      unbilledEstimatedAmount: calculateContractDeliverySubtotal(
        unbilledVolume,
        contract.unitPrice,
      ),
    };
  });

  const deliveries: MaterialDeliveryRow[] = deliveryRows.map((delivery) => {
    const contract = contractsById.get(delivery.contractId);
    const project = projectsById.get(delivery.projectId);
    if (!contract || !project) {
      throw new Error(`Material delivery ${delivery._id} has a missing contract or project`);
    }
    const receiver = delivery.receivedById
      ? usersById.get(delivery.receivedById)
      : null;
    const invoice = delivery.vendorInvoiceId
      ? invoiceRows.find(
          (row) => String(row._id) === delivery.vendorInvoiceId,
        )
      : null;
    return {
      id: String(delivery._id),
      contractId: delivery.contractId,
      contractNumber: contract.contractNumber,
      vendorName: contract.vendorName,
      materialType: contract.materialType,
      unitPrice: contract.unitPrice,
      unit: contract.unit,
      projectId: delivery.projectId,
      projectName: `${project.kelompokTani} · ${project.title}`,
      deliveryDate: delivery.deliveryDate.toISOString().slice(0, 10),
      doNumber: delivery.doNumber,
      vehiclePlate: delivery.vehiclePlate ?? null,
      driverName: delivery.driverName ?? null,
      quantityReceived: roundMaterialNumber(delivery.quantityReceived, 2),
      estimatedAmount: calculateContractDeliverySubtotal(
        delivery.quantityReceived,
        contract.unitPrice,
      ),
      billingStatus: delivery.billingStatus,
      vendorInvoiceId: delivery.vendorInvoiceId ?? null,
      vendorInvoiceNumber: invoice?.invoiceNumber ?? null,
      receivedById: delivery.receivedById ?? null,
      receivedByName: receiver?.name ?? null,
      proofUrl: delivery.proofUrl ?? null,
      notes: delivery.notes ?? null,
      createdAt: delivery.createdAt.toISOString(),
    };
  });

  const vendorInvoices: VendorInvoiceRow[] = invoiceRows.map((invoice) => {
    const contract = contractsById.get(invoice.contractId);
    if (!contract) {
      throw new Error(`Vendor invoice ${invoice._id} has a missing contract`);
    }
    const invoiceDeliveries = (
      deliveriesByInvoiceId.get(String(invoice._id)) ?? []
    ).sort(
      (left, right) =>
        left.deliveryDate.getTime() - right.deliveryDate.getTime() ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const deliverySummaries = invoiceDeliveries.map((delivery) => {
      const project = projectsById.get(delivery.projectId);
      if (!project) {
        throw new Error(`Material delivery ${delivery._id} has a missing project`);
      }
      return {
        id: String(delivery._id),
        doNumber: delivery.doNumber,
        deliveryDate: delivery.deliveryDate.toISOString().slice(0, 10),
        projectId: delivery.projectId,
        projectName: `${project.kelompokTani} · ${project.title}`,
        vehiclePlate: delivery.vehiclePlate ?? null,
        driverName: delivery.driverName ?? null,
        quantityReceived: roundMaterialNumber(delivery.quantityReceived, 2),
        subtotal: calculateContractDeliverySubtotal(
          delivery.quantityReceived,
          invoice.unitPrice,
        ),
        proofUrl: delivery.proofUrl ?? null,
      };
    });
    const remainingAmount = Math.max(
      0,
      roundMaterialNumber(invoice.grandTotal - invoice.paidAmount, 2),
    );
    const processor = invoice.processedById
      ? usersById.get(invoice.processedById)
      : null;
    const payments = (paymentsByInvoiceId.get(String(invoice._id)) ?? []).map(
      (payment) => {
        const paymentProcessor = usersById.get(payment.processedById);
        if (!paymentProcessor) {
          throw new Error(`Vendor invoice payment ${payment._id} has no processor`);
        }
        const account = payment.financeAccountId
          ? accountsById.get(payment.financeAccountId)
          : null;
        return {
          id: String(payment._id),
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
          amount: roundMaterialNumber(payment.amount, 2),
          transferDestination: payment.transferDestination,
          proofOfTransferUrl: payment.proofOfTransferUrl,
          financeAccountId: payment.financeAccountId ?? null,
          financeAccountName: account?.accountName ?? null,
          notes: payment.notes ?? null,
          processedByName: paymentProcessor.name ?? "",
          paidAt: payment.paidAt.toISOString(),
        };
      },
    );

    return {
      id: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      contractId: invoice.contractId,
      contractNumber: contract.contractNumber,
      vendorId: contract.vendorId ?? null,
      vendorName: contract.vendorName,
      vendorBankAccounts: mapVendorBankOptions(
        contract.vendorId
          ? vendorDetailsById.get(contract.vendorId)
          : null,
      ),
      materialType: contract.materialType,
      unit: contract.unit,
      unitPrice: invoice.unitPrice,
      deliveryIds: deliverySummaries.map((delivery) => delivery.id),
      deliveryCount: deliverySummaries.length,
      projectNames: Array.from(
        new Set(deliverySummaries.map((delivery) => delivery.projectName)),
      ),
      deliveries: deliverySummaries,
      totalQuantity: roundMaterialNumber(invoice.totalQuantity, 2),
      grandTotal: roundMaterialNumber(invoice.grandTotal, 2),
      paidAmount: roundMaterialNumber(invoice.paidAmount, 2),
      remainingAmount,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      status: invoice.status,
      notes: invoice.notes ?? null,
      processedByName: processor?.name ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      payments,
    };
  });

  return { contracts, deliveries, vendorInvoices };
}
