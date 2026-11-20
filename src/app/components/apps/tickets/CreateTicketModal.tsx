"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  Home,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormClearErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  POPaymentMethod,
  TicketCategoryHint,
  TicketFieldCategory,
  TicketPriority,
  TicketRequestCategory,
  TicketType,
  UserRole,
} from "@prisma/client";
import type { TicketMaterialContractOption } from "@/lib/material-contracts";
import type { TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import {
  createTicket,
  getShippingDocumentOptions,
  type ShippingDocumentOptions,
} from "@/app/actions/tickets";
import { createEquipmentRequest } from "@/app/actions/equipment-requests";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { cn } from "@/lib/utils";
import { formatRupiahNumber, parseRupiahInput } from "@/lib/indonesian-currency";
import { getJakartaDateKey, isValidDateKey } from "@/lib/habit-date";
import { FIELD_COST_LABELS } from "@/lib/ticket-field-costs";
import {
  DEFAULT_EQUIPMENT_TIME_UNIT,
  EQUIPMENT_REQUEST_TYPE,
  EQUIPMENT_TIME_UNITS,
  EQUIPMENT_TIME_UNIT_LABELS,
  HOUSE_RENTAL_REQUEST_TYPE,
  RENTAL_PERIOD_TYPES,
  RENTAL_PERIOD_TYPE_LABELS,
  RENTAL_USAGE_SCOPES,
  VEHICLE_RENTAL_REQUEST_TYPE,
} from "@/lib/equipment-request";

const requestCategorySchema = z
  .nativeEnum(TicketRequestCategory)
  .or(z.literal(EQUIPMENT_REQUEST_TYPE))
  .or(z.literal(HOUSE_RENTAL_REQUEST_TYPE))
  .or(z.literal(VEHICLE_RENTAL_REQUEST_TYPE));

type RequestCategoryValue = z.infer<typeof requestCategorySchema>;

const fieldCategories = Object.values(TicketFieldCategory).filter(
  (category) => category !== TicketFieldCategory.DIRECT_STORE,
);
const itemCategoryHints = Object.values(TicketCategoryHint);
const priorities = ["NON_URGENT", "URGENT", "EMERGENCY"] as const;

const CREATE_TICKET_STEPS: StepperStep[] = [
  { id: "type", label: "1. Jenis & Proyek", description: "Kategori & proyek" },
  {
    id: "details",
    label: "2. Rincian & Nominal",
    description: "Barang, sewa, atau dana",
  },
  { id: "target", label: "3. Target & Kirim", description: "Prioritas & kirim" },
];

const requestCategoryLabels: Record<RequestCategoryValue, string> = {
  OPS: "Operasional (OPS)",
  MATERIAL: "Belanja Material / Alam",
  WAREHOUSE: "Material dari Gudang",
  OFFICE: "Belanja Kantor",
  FIELD: "Kebutuhan Tim Lapangan",
  APH: "APH",
  REIMBURSEMENT: "Reimbursement",
  KASBON: "Kasbon / Ambilan",
  OPERATING_EXPENSE: "Biaya Operasional",
  SHIPPING_COST: "Pengiriman Barang PO",
  [EQUIPMENT_REQUEST_TYPE]: "Alat Berat & Kendaraan",
  [HOUSE_RENTAL_REQUEST_TYPE]: "Biaya Rumah Sewa / Mess Tukang",
  [VEHICLE_RENTAL_REQUEST_TYPE]: "Biaya Kendaraan Sewa",
};

const internalFundingCategories = [
  TicketRequestCategory.REIMBURSEMENT,
  TicketRequestCategory.KASBON,
  TicketRequestCategory.OPERATING_EXPENSE,
] as const;

const isInternalFundingCategory = (
  category: RequestCategoryValue,
): category is (typeof internalFundingCategories)[number] =>
  internalFundingCategories.some((value) => value === category);

const isRentalCategory = (
  category: RequestCategoryValue,
): category is
  | typeof HOUSE_RENTAL_REQUEST_TYPE
  | typeof VEHICLE_RENTAL_REQUEST_TYPE =>
  category === HOUSE_RENTAL_REQUEST_TYPE ||
  category === VEHICLE_RENTAL_REQUEST_TYPE;

const fieldCategoryLabels: Record<TicketFieldCategory, string> = {
  HAULING: FIELD_COST_LABELS.HAULING,
  LABOR: FIELD_COST_LABELS.LABOR,
  DIRECT_STORE: "Belanja Langsung Ketoko",
};

const ticketFormSchema = z
  .object({
    projectId: z.string(),
    moverAssigneeId: z.string().optional(),
    requestCategory: requestCategorySchema,
    fieldCategory: z.enum(fieldCategories).optional(),
    priority: z.enum(priorities),
    neededDate: z.string().optional(),
    itemSource: z.enum(itemCategoryHints),
    itemsExpectedDeliveryDate: z.string().optional(),
    items: z
      .array(
        z.object({
          stockItemId: z.string().optional(),
          itemName: z.string().optional(),
          unit: z.string().optional(),
          quantity: z.number().optional(),
          estimatedCost: z.number().optional(),
          categoryHint: z.enum(itemCategoryHints),
          materialContractId: z.string().optional(),
          expectedDeliveryDate: z.string().optional(),
        }),
      )
      .max(100, "Maksimal 100 item."),
    recipientName: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    requestPaymentMethod: z.enum(Object.values(POPaymentMethod)).optional(),
    transferDestination: z.string().optional(),
    requestPaymentDescription: z.string().optional(),
    relatedDocumentNumbers: z.string(),
    deliveryReceiptFile: z.instanceof(File).nullable(),
    deliveryProofDocType: z.enum(["BKT", "BON", "KWT", "INV"]).optional(),
    receiptFiles: z.array(z.instanceof(File)).max(5),
    proofDocType: z.enum(["BKT", "BON", "KWT", "INV"]).optional(),
    operationalRequestType: z.enum(["GENERAL", "SURVEY"]),
    operationalAmount: z
      .number()
      .finite()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    surveyConsumptionAmount: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    surveyFuelAmount: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    requestedAmount: z
      .number()
      .finite()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    equipmentDetails: z.object({
      equipmentName: z.string().optional(),
      startDate: z.string().optional(),
      duration: z.number().optional(),
      timeUnit: z.enum(EQUIPMENT_TIME_UNITS),
    }),
    rentalDetails: z.object({
      usageScope: z.enum(RENTAL_USAGE_SCOPES),
      assetName: z.string().optional(),
      propertyAddress: z.string().optional(),
      landlordName: z.string().optional(),
      landlordPhone: z.string().optional(),
      occupantCount: z.number().optional(),
      codeOrPlate: z.string().optional(),
      periodType: z.enum(RENTAL_PERIOD_TYPES),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      duration: z.number().optional(),
    }),
  })
  .superRefine((values, context) => {
    const isHouseRental =
      values.requestCategory === HOUSE_RENTAL_REQUEST_TYPE;
    const isVehicleRental =
      values.requestCategory === VEHICLE_RENTAL_REQUEST_TYPE;
    const isRental = isHouseRental || isVehicleRental;
    const isEquipmentRequest =
      values.requestCategory === EQUIPMENT_REQUEST_TYPE;
    const isAPHRequest = values.requestCategory === TicketRequestCategory.APH;
    const isInternalFunding = isInternalFundingCategory(values.requestCategory);
    const isShippingCostRequest =
      values.requestCategory === TicketRequestCategory.SHIPPING_COST;

    const projectLinkedRequest =
      values.requestCategory === TicketRequestCategory.MATERIAL ||
      values.requestCategory === TicketRequestCategory.WAREHOUSE ||
      values.requestCategory === TicketRequestCategory.FIELD ||
      isEquipmentRequest ||
      isHouseRental ||
      (isVehicleRental && values.rentalDetails.usageScope === "PROJECT");

    if (projectLinkedRequest && !values.projectId.trim()) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: isHouseRental
          ? "Biaya Rumah Sewa / Mess Tukang wajib memilih Proyek aktif."
          : isVehicleRental
            ? "Kendaraan sewa lingkup Proyek wajib memilih Proyek aktif."
            : "Pilih proyek agar biaya dan pengiriman dapat dilacak.",
      });
    }

    const usesItemDeliveryDates =
      values.requestCategory === TicketRequestCategory.MATERIAL ||
      values.requestCategory === TicketRequestCategory.WAREHOUSE;
    const usesStockCatalog =
      usesItemDeliveryDates &&
      values.itemSource === TicketCategoryHint.WAREHOUSE;

    if (
      values.requestCategory === TicketRequestCategory.WAREHOUSE &&
      values.itemSource !== TicketCategoryHint.WAREHOUSE
    ) {
      context.addIssue({
        code: "custom",
        path: ["itemSource"],
        message: "Permintaan material dari gudang hanya menggunakan stok gudang.",
      });
    }

    if (
      !usesItemDeliveryDates &&
      !isAPHRequest &&
      !isInternalFunding &&
      !isEquipmentRequest &&
      !isRental &&
      (!values.neededDate || !isValidDateKey(values.neededDate))
    ) {
      context.addIssue({
        code: "custom",
        path: ["neededDate"],
        message: "Tanggal perlu dibayarkan/disediakan wajib dipilih.",
      });
    }

    if (usesItemDeliveryDates) {
      if (
        values.itemSource === TicketCategoryHint.WAREHOUSE &&
        (!values.itemsExpectedDeliveryDate ||
          !isValidDateKey(values.itemsExpectedDeliveryDate))
      ) {
        context.addIssue({
          code: "custom",
          path: ["itemsExpectedDeliveryDate"],
          message:
            "Tanggal diperlukan wajib diisi untuk permintaan barang gudang.",
        });
      }
      values.items.forEach((item, index) => {
        if (usesStockCatalog && !item.stockItemId) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "stockItemId"],
            message: "Pilih barang dari katalog gudang.",
          });
        }
        if (
          values.itemSource === TicketCategoryHint.CONTRACT &&
          !item.materialContractId
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "materialContractId"],
            message: "Pilih kontrak material alam yang aktif.",
          });
        }
      });
    }

    if (values.requestCategory === "FIELD" && !values.fieldCategory) {
      context.addIssue({
        code: "custom",
        path: ["fieldCategory"],
        message: "Pilih jenis kebutuhan lapangan.",
      });
    }

    if (isEquipmentRequest) {
      const equipName = values.equipmentDetails.equipmentName?.trim() ?? "";
      if (equipName.length < 2 || equipName.length > 120) {
        context.addIssue({
          code: "custom",
          path: ["equipmentDetails", "equipmentName"],
          message: "Nama alat/kendaraan wajib diisi (2–120 karakter).",
        });
      }
      if (
        !values.equipmentDetails.startDate ||
        !isValidDateKey(values.equipmentDetails.startDate)
      ) {
        context.addIssue({
          code: "custom",
          path: ["equipmentDetails", "startDate"],
          message: "Tanggal mulai pemakaian wajib diisi.",
        });
      }
      if (
        values.equipmentDetails.duration === undefined ||
        !Number.isFinite(values.equipmentDetails.duration) ||
        values.equipmentDetails.duration <= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["equipmentDetails", "duration"],
          message: "Lama pemakaian harus lebih besar dari 0.",
        });
      }
    }

    if (isRental) {
      const assetName = values.rentalDetails.assetName?.trim() ?? "";
      if (assetName.length < 2 || assetName.length > 160) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "assetName"],
          message: isHouseRental
            ? "Nama rumah sewa / mess wajib diisi (2–160 karakter)."
            : "Jenis / nama kendaraan sewa wajib diisi (2–160 karakter).",
        });
      }
      if (isHouseRental && !values.rentalDetails.propertyAddress?.trim()) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "propertyAddress"],
          message: "Alamat / lokasi rumah sewa wajib diisi.",
        });
      }
      if (
        isHouseRental &&
        values.rentalDetails.occupantCount !== undefined &&
        (!Number.isInteger(values.rentalDetails.occupantCount) ||
          values.rentalDetails.occupantCount < 1 ||
          values.rentalDetails.occupantCount > 1000)
      ) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "occupantCount"],
          message: "Jumlah penghuni harus berupa bilangan bulat minimal 1.",
        });
      }
      if (
        !values.rentalDetails.startDate ||
        !isValidDateKey(values.rentalDetails.startDate)
      ) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "startDate"],
          message: "Tanggal mulai sewa wajib dipilih.",
        });
      }
      if (
        values.rentalDetails.endDate &&
        !isValidDateKey(values.rentalDetails.endDate)
      ) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "endDate"],
          message: "Tanggal selesai sewa tidak valid.",
        });
      }
      if (
        values.rentalDetails.startDate &&
        values.rentalDetails.endDate &&
        isValidDateKey(values.rentalDetails.startDate) &&
        isValidDateKey(values.rentalDetails.endDate) &&
        values.rentalDetails.endDate < values.rentalDetails.startDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "endDate"],
          message: "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.",
        });
      }
      if (
        values.rentalDetails.duration === undefined ||
        !Number.isFinite(values.rentalDetails.duration) ||
        values.rentalDetails.duration <= 0 ||
        values.rentalDetails.duration > 3650
      ) {
        context.addIssue({
          code: "custom",
          path: ["rentalDetails", "duration"],
          message: "Durasi sewa wajib diisi lebih dari 0.",
        });
      }
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Nominal biaya sewa wajib lebih besar dari 0.",
        });
      }
      const hasAnyBankInput = Boolean(
        values.recipientName?.trim() ||
          values.bankName?.trim() ||
          values.accountNumber?.trim(),
      );
      if (hasAnyBankInput) {
        if (
          !values.recipientName?.trim() ||
          values.recipientName.trim().length < 2 ||
          values.recipientName.trim().length > 120
        ) {
          context.addIssue({
            code: "custom",
            path: ["recipientName"],
            message: "Nama penerima rekening wajib diisi (2–120 karakter).",
          });
        }
        if (
          !values.bankName?.trim() ||
          values.bankName.trim().length < 2 ||
          values.bankName.trim().length > 80
        ) {
          context.addIssue({
            code: "custom",
            path: ["bankName"],
            message: "Nama bank wajib diisi (2–80 karakter).",
          });
        }
        if (
          !values.accountNumber?.trim() ||
          !/^[0-9]{6,30}$/.test(values.accountNumber.trim())
        ) {
          context.addIssue({
            code: "custom",
            path: ["accountNumber"],
            message: "Nomor rekening harus berisi 6–30 angka.",
          });
        }
      }
    }

    if (isAPHRequest) {
      if (!values.requestPaymentMethod) {
        context.addIssue({
          code: "custom",
          path: ["requestPaymentMethod"],
          message: "Pilih metode pembayaran Cash atau Transfer.",
        });
      }
      if (
        values.requestPaymentMethod === POPaymentMethod.TRANSFER &&
        !values.transferDestination?.trim()
      ) {
        context.addIssue({
          code: "custom",
          path: ["transferDestination"],
          message: "Tujuan transfer wajib diisi.",
        });
      }
      if (
        !values.requestPaymentDescription?.trim() ||
        values.requestPaymentDescription.trim().length > 2000
      ) {
        context.addIssue({
          code: "custom",
          path: ["requestPaymentDescription"],
          message: "Keterangan wajib diisi (maksimal 2.000 karakter).",
        });
      }
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Jumlah dana yang diminta harus lebih besar dari 0.",
        });
      }
    }

    if (isInternalFunding) {
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Nominal pengajuan harus lebih besar dari 0.",
        });
      }
      if (
        !values.requestPaymentDescription?.trim() ||
        values.requestPaymentDescription.trim().length > 5000
      ) {
        context.addIssue({
          code: "custom",
          path: ["requestPaymentDescription"],
          message: "Keterangan pengajuan wajib diisi (maksimal 5.000 karakter).",
        });
      }
      if (
        values.requestCategory === TicketRequestCategory.REIMBURSEMENT &&
        values.receiptFiles.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["receiptFiles"],
          message:
            "Unggah minimal satu struk atau nota asli untuk reimbursement.",
        });
      }
    }

    if (isShippingCostRequest) {
      if (!values.relatedDocumentNumbers.trim()) {
        context.addIssue({
          code: "custom",
          path: ["relatedDocumentNumbers"],
          message: "Pilih setidaknya satu PO barang.",
        });
      }
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Biaya pengiriman harus lebih besar dari 0.",
        });
      }
      if (!values.deliveryReceiptFile) {
        context.addIssue({
          code: "custom",
          path: ["deliveryReceiptFile"],
          message: "Unggah resi pengiriman sebelum mengajukan tiket.",
        });
      }
    }

    const requiresRecipientPayment =
      values.requestCategory === TicketRequestCategory.FIELD &&
      values.fieldCategory !== undefined;
    const isOperationalFunding =
      values.requestCategory === TicketRequestCategory.OPS;

    if (requiresRecipientPayment) {
      if (
        !values.recipientName?.trim() ||
        values.recipientName.trim().length > 120
      ) {
        context.addIssue({
          code: "custom",
          path: ["recipientName"],
          message: "Nama penerima wajib diisi (maksimal 120 karakter).",
        });
      }
      if (!values.bankName?.trim() || values.bankName.trim().length > 80) {
        context.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "Nama bank wajib diisi (maksimal 80 karakter).",
        });
      }
      if (
        !values.accountNumber ||
        !/^[0-9]{6,30}$/.test(values.accountNumber.trim())
      ) {
        context.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message: "Nomor rekening harus berisi 6 sampai 30 angka.",
        });
      }
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Biaya harus lebih besar dari 0.",
        });
      }
    } else if (isOperationalFunding) {
      if (values.operationalRequestType === "GENERAL") {
        if (values.operationalAmount === undefined) {
          context.addIssue({
            code: "custom",
            path: ["operationalAmount"],
            message: "Jumlah dana operasional harus lebih besar dari 0.",
          });
        }
      } else {
        const consumptionAmount = values.surveyConsumptionAmount;
        const fuelAmount = values.surveyFuelAmount;
        if (
          consumptionAmount === undefined ||
          fuelAmount === undefined ||
          consumptionAmount + fuelAmount <= 0 ||
          !Number.isSafeInteger(consumptionAmount + fuelAmount)
        ) {
          context.addIssue({
            code: "custom",
            path: ["surveyConsumptionAmount"],
            message:
              "Isi biaya konsumsi dan BBM dengan benar; total harus lebih besar dari 0.",
          });
        }
      }
    } else if (
      !isAPHRequest &&
      !isInternalFunding &&
      !isShippingCostRequest &&
      !isEquipmentRequest &&
      !isRental
    ) {
      if (values.items.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Tambahkan setidaknya satu rincian item.",
        });
      }
      values.items.forEach((item, index) => {
        if (
          !usesStockCatalog &&
          values.itemSource !== TicketCategoryHint.CONTRACT &&
          (!item.itemName?.trim() || item.itemName.trim().length > 160)
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "itemName"],
            message: "Nama item wajib diisi (maksimal 160 karakter).",
          });
        }
        if (
          !usesStockCatalog &&
          values.itemSource !== TicketCategoryHint.CONTRACT &&
          (!item.unit?.trim() || item.unit.trim().length > 32)
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "unit"],
            message: "Pilih satuan yang valid.",
          });
        }
        if (
          item.quantity === undefined ||
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "quantity"],
            message: "Qty harus berupa angka lebih besar dari 0.",
          });
        }
        if (
          item.estimatedCost !== undefined &&
          (!Number.isFinite(item.estimatedCost) || item.estimatedCost < 0)
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "estimatedCost"],
            message: "Harga satuan tidak boleh negatif.",
          });
        }
      });
    }
  });

type TicketFormValues = z.infer<typeof ticketFormSchema>;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const getDefaultItemSourceForCategory = (
  category: RequestCategoryValue,
  contractsCount: number,
): TicketCategoryHint => {
  if (category === TicketRequestCategory.WAREHOUSE) {
    return TicketCategoryHint.WAREHOUSE;
  }
  if (category === TicketRequestCategory.MATERIAL) {
    return contractsCount > 0
      ? TicketCategoryHint.CONTRACT
      : TicketCategoryHint.PURCHASE;
  }
  return TicketCategoryHint.PURCHASE;
};

const createBlankItem = (hint: TicketCategoryHint) => ({
  stockItemId: "",
  itemName: "",
  unit: "",
  quantity: 1,
  estimatedCost: undefined,
  categoryHint: hint,
  materialContractId: "",
  expectedDeliveryDate: "",
});

const getRequestTypeOptions = (
  role?: UserRole,
  selectedProjectId?: string,
): { label: string; value: RequestCategoryValue }[] => {
  const options: { label: string; value: RequestCategoryValue }[] = [
    {
      label: requestCategoryLabels[TicketRequestCategory.OPS],
      value: TicketRequestCategory.OPS,
    },
  ];

  if (role === UserRole.FIELD_TEAM) {
    options.push(
      {
        label: requestCategoryLabels[TicketRequestCategory.WAREHOUSE],
        value: TicketRequestCategory.WAREHOUSE,
      },
      {
        label: requestCategoryLabels[TicketRequestCategory.MATERIAL],
        value: TicketRequestCategory.MATERIAL,
      },
    );
  } else {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.MATERIAL],
      value: TicketRequestCategory.MATERIAL,
    });
  }

  if (
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.KOORDINATOR ||
    role === UserRole.FIELD_TEAM
  ) {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.FIELD],
      value: TicketRequestCategory.FIELD,
    });
  }

  if (
    (role === UserRole.FIELD_TEAM ||
      role === UserRole.KOORDINATOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    selectedProjectId
  ) {
    options.push({
      label: requestCategoryLabels[EQUIPMENT_REQUEST_TYPE],
      value: EQUIPMENT_REQUEST_TYPE,
    });
  }

  if (role !== UserRole.MOVER) {
    options.push(
      {
        label: requestCategoryLabels[HOUSE_RENTAL_REQUEST_TYPE],
        value: HOUSE_RENTAL_REQUEST_TYPE,
      },
      {
        label: requestCategoryLabels[VEHICLE_RENTAL_REQUEST_TYPE],
        value: VEHICLE_RENTAL_REQUEST_TYPE,
      },
    );
  }

  if (
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DRAFTER ||
    role === UserRole.FINANCE ||
    role === UserRole.DEPUTY_DIRECTOR
  ) {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.OFFICE],
      value: TicketRequestCategory.OFFICE,
    });
  }

  if (
    role === UserRole.LOGISTICS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  ) {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.SHIPPING_COST],
      value: TicketRequestCategory.SHIPPING_COST,
    });
  }

  if (
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.FINANCE
  ) {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.APH],
      value: TicketRequestCategory.APH,
    });
  }

  if (
    role === UserRole.DRAFTER ||
    role === UserRole.FIELD_TEAM ||
    role === UserRole.KOORDINATOR ||
    role === UserRole.MOVER
  ) {
    options.push(
      ...internalFundingCategories
        .filter(
          (category) =>
            role === UserRole.DRAFTER ||
            ((role === UserRole.FIELD_TEAM ||
              role === UserRole.KOORDINATOR) &&
              (category === TicketRequestCategory.REIMBURSEMENT ||
                category === TicketRequestCategory.KASBON)) ||
            (role === UserRole.MOVER &&
              category === TicketRequestCategory.REIMBURSEMENT),
        )
        .map((category) => ({
          label: requestCategoryLabels[category],
          value: category,
        })),
    );
  }

  return options;
};

function MaterialItemRow({
  index,
  canRemove,
  itemSource,
  usesStockCatalog,
  materialContracts,
  stockComboboxOptions,
  contractComboboxOptions,
  control,
  register,
  errors,
  setValue,
  clearErrors,
  onRemove,
  watchedQuantity,
  watchedMaterialContractId,
}: {
  index: number;
  canRemove: boolean;
  itemSource: TicketCategoryHint;
  usesStockCatalog: boolean;
  materialContracts: TicketMaterialContractOption[];
  stockComboboxOptions: ComboboxOption[];
  contractComboboxOptions: ComboboxOption[];
  control: Control<TicketFormValues>;
  register: UseFormRegister<TicketFormValues>;
  errors: FieldErrors<TicketFormValues>;
  setValue: UseFormSetValue<TicketFormValues>;
  clearErrors: UseFormClearErrors<TicketFormValues>;
  onRemove: (index: number) => void;
  watchedQuantity?: number;
  watchedMaterialContractId?: string;
}) {
  const itemErrors = errors.items?.[index];
  const matchedContract =
    itemSource === TicketCategoryHint.CONTRACT && watchedMaterialContractId
      ? materialContracts.find((c) => c.id === watchedMaterialContractId)
      : undefined;
  const qty = Number(watchedQuantity ?? 0);
  const lineEstimate =
    matchedContract && Number.isFinite(qty) && qty > 0
      ? Math.round(qty * matchedContract.unitPrice)
      : 0;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_6.5rem_6.5rem_auto] sm:items-end">
        {itemSource === TicketCategoryHint.CONTRACT ? (
          <div className="space-y-1.5">
            <Label
              className="type-p2 font-medium"
              htmlFor={`ticket-material-contract-${index}`}
            >
              Material Alam (Kontrak) <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name={`items.${index}.materialContractId`}
              render={({ field }) => (
                <Combobox
                  id={`ticket-material-contract-${index}`}
                  options={contractComboboxOptions}
                  value={field.value ?? ""}
                  placeholder="Pilih kontrak material alam..."
                  searchPlaceholder="Cari pasir, batu, atau vendor..."
                  emptyText="Kontrak material tidak ditemukan."
                  onValueChange={(contractId) => {
                    field.onChange(contractId);
                    const contract = materialContracts.find(
                      (option) => option.id === contractId,
                    );
                    if (!contract) return;
                    setValue(`items.${index}.itemName`, contract.materialType, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(`items.${index}.unit`, contract.unit, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(
                      `items.${index}.estimatedCost`,
                      contract.unitPrice,
                      { shouldDirty: true, shouldValidate: true },
                    );
                    clearErrors([
                      `items.${index}.materialContractId`,
                      `items.${index}.itemName`,
                      `items.${index}.unit`,
                    ]);
                  }}
                />
              )}
            />
            {itemErrors?.materialContractId && (
              <p className="type-p3 text-destructive" role="alert">
                {itemErrors.materialContractId.message}
              </p>
            )}
          </div>
        ) : usesStockCatalog ? (
          <div className="space-y-1.5">
            <Label
              className="type-p2 font-medium"
              htmlFor={`ticket-stock-item-${index}`}
            >
              Barang Gudang <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name={`items.${index}.stockItemId`}
              render={({ field }) => (
                <Combobox
                  id={`ticket-stock-item-${index}`}
                  options={stockComboboxOptions}
                  value={field.value ?? ""}
                  placeholder="Pilih barang dari stok gudang..."
                  searchPlaceholder="Cari nama atau satuan barang..."
                  emptyText="Barang tidak ditemukan."
                  onValueChange={(stockId) => {
                    field.onChange(stockId);
                    const stock = stockComboboxOptions.find(
                      (option) => option.value === stockId,
                    );
                    if (!stock) return;
                    const [namePart, unitPart] = stock.label.split(" · ");
                    setValue(`items.${index}.itemName`, namePart ?? stock.label, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(`items.${index}.unit`, unitPart ?? "pcs", {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(`items.${index}.estimatedCost`, undefined);
                    clearErrors([
                      `items.${index}.stockItemId`,
                      `items.${index}.itemName`,
                      `items.${index}.unit`,
                    ]);
                  }}
                />
              )}
            />
            {itemErrors?.stockItemId && (
              <p className="type-p3 text-destructive" role="alert">
                {itemErrors.stockItemId.message}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label
              className="type-p2 font-medium"
              htmlFor={`ticket-item-${index}`}
            >
              Nama Barang <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`ticket-item-${index}`}
              placeholder="Contoh: Pasir Pasang / Semen"
              aria-invalid={!!itemErrors?.itemName}
              {...register(`items.${index}.itemName`)}
            />
            {itemErrors?.itemName && (
              <p className="type-p3 text-destructive" role="alert">
                {itemErrors.itemName.message}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label
            className="type-p2 font-medium"
            htmlFor={`ticket-quantity-${index}`}
          >
            Qty <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`ticket-quantity-${index}`}
            type="number"
            min="0.001"
            step="any"
            aria-invalid={!!itemErrors?.quantity}
            {...register(`items.${index}.quantity`, {
              valueAsNumber: true,
            })}
          />
          {itemErrors?.quantity && (
            <p className="type-p3 text-destructive" role="alert">
              {itemErrors.quantity.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            className="type-p2 font-medium"
            htmlFor={`ticket-unit-${index}`}
          >
            Satuan <span className="text-destructive">*</span>
          </Label>
          {usesStockCatalog || itemSource === TicketCategoryHint.CONTRACT ? (
            <Controller
              control={control}
              name={`items.${index}.unit`}
              render={({ field }) => (
                <Input
                  id={`ticket-unit-${index}`}
                  value={field.value ?? ""}
                  readOnly
                  className="bg-muted/50"
                />
              )}
            />
          ) : (
            <Input
              id={`ticket-unit-${index}`}
              placeholder="m3 / sak / pcs"
              maxLength={32}
              aria-invalid={!!itemErrors?.unit}
              {...register(`items.${index}.unit`)}
            />
          )}
          {itemErrors?.unit && (
            <p className="type-p3 text-destructive" role="alert">
              {itemErrors.unit.message}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Hapus item ${index + 1}`}
              onClick={() => onRemove(index)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {matchedContract ? (
        <p className="type-p3 text-muted-foreground">
          Kontrak{" "}
          <span className="font-semibold text-foreground">
            {matchedContract.contractNumber}
          </span>{" "}
          · {formatCurrency(matchedContract.unitPrice)}/{matchedContract.unit}
          {lineEstimate > 0 ? ` · Estimasi: ${formatCurrency(lineEstimate)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export default function CreateTicketModal({
  projects,
  stockItems = [],
  requesterRole,
  triggerLabel = "Tambah Tiket",
  defaultOpen = false,
  defaultRequestCategory,
  fixedProjectId,
  initialWageRequest,
  materialContracts = [],
}: {
  projects: TicketProjectOption[];
  stockItems?: Array<{
    id: string;
    name: string;
    unit: string;
    stockQuantity: string;
  }>;
  requesterRole?: UserRole;
  movers?: Array<{ id: string; name: string }>;
  triggerLabel?: string;
  defaultOpen?: boolean;
  defaultRequestCategory?: RequestCategoryValue;
  fixedProjectId?: string;
  materialContracts?: TicketMaterialContractOption[];
  initialWageRequest?: {
    projectId: string;
    projectTitle: string;
    workPointTitle: string;
  };
}) {
  const router = useRouter();
  const initialCategory: RequestCategoryValue = initialWageRequest
    ? TicketRequestCategory.FIELD
    : defaultRequestCategory ?? TicketRequestCategory.OPS;
  const initialSource = getDefaultItemSourceForCategory(
    initialCategory,
    materialContracts.length,
  );
  const needsInitialItems =
    initialCategory === TicketRequestCategory.MATERIAL ||
    initialCategory === TicketRequestCategory.WAREHOUSE;

  const [open, setOpen] = useState(defaultOpen);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptUploadError, setReceiptUploadError] = useState("");
  const [shippingDocumentOptions, setShippingDocumentOptions] =
    useState<ShippingDocumentOptions | null>(null);
  const [shippingDocumentsLoaded, setShippingDocumentsLoaded] =
    useState(false);
  const [shippingDocumentsAttempt, setShippingDocumentsAttempt] = useState(0);
  const [shippingDocumentsError, setShippingDocumentsError] = useState("");
  const [selectedShippingDocumentKeys, setSelectedShippingDocumentKeys] =
    useState<string[]>([]);

  const todayDateKey = useMemo(() => getJakartaDateKey(), []);

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      projectId: initialWageRequest?.projectId ?? fixedProjectId ?? "",
      moverAssigneeId: "",
      requestCategory: initialCategory,
      fieldCategory: initialWageRequest
        ? TicketFieldCategory.LABOR
        : undefined,
      priority: "NON_URGENT",
      neededDate: "",
      itemSource: initialSource,
      itemsExpectedDeliveryDate: "",
      items: needsInitialItems ? [createBlankItem(initialSource)] : [],
      recipientName: "",
      bankName: "",
      accountNumber: "",
      requestPaymentMethod: POPaymentMethod.CASH,
      transferDestination: "",
      requestPaymentDescription: "",
      relatedDocumentNumbers: "",
      deliveryReceiptFile: null,
      deliveryProofDocType: "BON",
      receiptFiles: [],
      proofDocType: "BON",
      operationalRequestType: "GENERAL",
      operationalAmount: undefined,
      surveyConsumptionAmount: 0,
      surveyFuelAmount: 0,
      requestedAmount: undefined,
      equipmentDetails: {
        equipmentName: "",
        startDate: "",
        duration: undefined,
        timeUnit: DEFAULT_EQUIPMENT_TIME_UNIT,
      },
      rentalDetails: {
        usageScope: "PROJECT",
        assetName: "",
        propertyAddress: "",
        landlordName: "",
        landlordPhone: "",
        occupantCount: undefined,
        codeOrPlate: "",
        periodType: "MONTHLY",
        startDate: "",
        endDate: "",
        duration: 1,
      },
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const selectedProjectId = useWatch({
    control: form.control,
    name: "projectId",
  });
  const requestCategory = useWatch({
    control: form.control,
    name: "requestCategory",
  });
  const fieldCategory = useWatch({
    control: form.control,
    name: "fieldCategory",
  });
  const watchedRequestPaymentMethod = useWatch({
    control: form.control,
    name: "requestPaymentMethod",
  });
  const watchedRequestedAmount = useWatch({
    control: form.control,
    name: "requestedAmount",
  });
  const watchedDeliveryReceiptFile = useWatch({
    control: form.control,
    name: "deliveryReceiptFile",
  });
  const operationalRequestType = useWatch({
    control: form.control,
    name: "operationalRequestType",
  });
  const watchedOperationalAmount = useWatch({
    control: form.control,
    name: "operationalAmount",
  });
  const watchedSurveyConsumptionAmount = useWatch({
    control: form.control,
    name: "surveyConsumptionAmount",
  });
  const watchedSurveyFuelAmount = useWatch({
    control: form.control,
    name: "surveyFuelAmount",
  });
  const itemSource = useWatch({ control: form.control, name: "itemSource" });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const itemsExpectedDeliveryDate = useWatch({
    control: form.control,
    name: "itemsExpectedDeliveryDate",
  });
  const rentalUsageScope = useWatch({
    control: form.control,
    name: "rentalDetails.usageScope",
  });
  const rentalStartDate = useWatch({
    control: form.control,
    name: "rentalDetails.startDate",
  });
  const watchedPriority = useWatch({
    control: form.control,
    name: "priority",
  });
  const watchedNeededDate = useWatch({
    control: form.control,
    name: "neededDate",
  });

  const requestTypeOptions = useMemo(
    () => getRequestTypeOptions(requesterRole, selectedProjectId),
    [requesterRole, selectedProjectId],
  );

  const isHouseRental = requestCategory === HOUSE_RENTAL_REQUEST_TYPE;
  const isVehicleRental = requestCategory === VEHICLE_RENTAL_REQUEST_TYPE;
  const isRentalRequest = isHouseRental || isVehicleRental;
  const isEquipmentRequest = requestCategory === EQUIPMENT_REQUEST_TYPE;
  const isAPHRequest = requestCategory === TicketRequestCategory.APH;
  const isInternalFunding = isInternalFundingCategory(requestCategory);
  const isShippingCostRequest =
    requestCategory === TicketRequestCategory.SHIPPING_COST;
  const isOperationalFunding =
    requestCategory === TicketRequestCategory.OPS;
  const requiresRecipientPayment =
    requestCategory === TicketRequestCategory.FIELD &&
    fieldCategory !== undefined;
  const usesItemDeliveryDates =
    requestCategory === TicketRequestCategory.MATERIAL ||
    requestCategory === TicketRequestCategory.WAREHOUSE;
  const usesStockCatalog =
    usesItemDeliveryDates && itemSource === TicketCategoryHint.WAREHOUSE;

  const isProjectRequired =
    requestCategory === TicketRequestCategory.MATERIAL ||
    requestCategory === TicketRequestCategory.WAREHOUSE ||
    requestCategory === TicketRequestCategory.FIELD ||
    isEquipmentRequest ||
    isHouseRental ||
    (isVehicleRental && rentalUsageScope === "PROJECT");

  useEffect(() => {
    if (requestTypeOptions.some((option) => option.value === requestCategory)) {
      return;
    }
    const nextRequestCategory =
      requestTypeOptions[0]?.value ?? TicketRequestCategory.OPS;
    form.setValue("requestCategory", nextRequestCategory, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("fieldCategory", undefined);
    if (
      nextRequestCategory === TicketRequestCategory.MATERIAL ||
      nextRequestCategory === TicketRequestCategory.WAREHOUSE
    ) {
      const nextHint = getDefaultItemSourceForCategory(
        nextRequestCategory,
        materialContracts.length,
      );
      form.setValue("itemSource", nextHint);
      form.setValue("itemsExpectedDeliveryDate", "");
      form.setValue("items", [createBlankItem(nextHint)], {
        shouldValidate: true,
      });
    } else {
      form.setValue("items", [], { shouldValidate: true });
    }
    form.clearErrors(["fieldCategory", "items"]);
  }, [form, materialContracts.length, requestCategory, requestTypeOptions]);

  const shippingDocumentsLoading =
    open &&
    isShippingCostRequest &&
    !shippingDocumentsLoaded &&
    !shippingDocumentsError;

  useEffect(() => {
    if (!open || !isShippingCostRequest) return;
    let active = true;
    void getShippingDocumentOptions()
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setShippingDocumentsError(result.message);
          setShippingDocumentsLoaded(true);
          return;
        }
        setShippingDocumentOptions(result.options);
        setShippingDocumentsError("");
        setShippingDocumentsLoaded(true);
      })
      .catch((loadError: unknown) => {
        console.error("Shipping document options failed to load:", loadError);
        if (active) {
          setShippingDocumentsError(
            "Daftar PO tidak dapat dimuat. Muat ulang untuk mencoba lagi.",
          );
          setShippingDocumentsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [open, isShippingCostRequest, shippingDocumentsAttempt]);

  const projectComboboxOptions = useMemo<ComboboxOption[]>(() => {
    const projectItems = projects.map((project) => ({
      value: project.id,
      label: `${project.kelompokTani} - ${project.title}`,
      keywords: [project.kelompokTani, project.title],
    }));
    if (isProjectRequired) {
      return projectItems;
    }
    return [
      {
        value: "__NONE__",
        label: "Kantor Pusat / Overhead Umum",
        description: "Tanpa ikatan proyek tertentu",
        keywords: ["kantor", "pusat", "operasional", "umum"],
      },
      ...projectItems,
    ];
  }, [isProjectRequired, projects]);

  const stockComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      stockItems.map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.unit}`,
        description:
          itemSource === TicketCategoryHint.WAREHOUSE
            ? `Tersedia ${item.stockQuantity} ${item.unit}`
            : undefined,
        keywords: [item.name, item.unit],
      })),
    [itemSource, stockItems],
  );

  const contractComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      materialContracts.map((contract) => ({
        value: contract.id,
        label: `${contract.materialType} · ${contract.vendorName}`,
        description: `${contract.contractNumber} · ${formatCurrency(contract.unitPrice)}/${contract.unit}`,
        keywords: [
          contract.materialType,
          contract.vendorName,
          contract.contractNumber,
        ],
      })),
    [materialContracts],
  );

  const handleCategoryChange = (value: string) => {
    const nextCategory = value as RequestCategoryValue;
    form.setValue("requestCategory", nextCategory, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setError("");

    if (nextCategory !== TicketRequestCategory.REIMBURSEMENT) {
      setReceiptUploadError("");
      setReceiptFiles([]);
      form.setValue("receiptFiles", [], { shouldValidate: true });
    }
    if (nextCategory !== TicketRequestCategory.SHIPPING_COST) {
      setSelectedShippingDocumentKeys([]);
      form.setValue("relatedDocumentNumbers", "");
      form.setValue("deliveryReceiptFile", null, { shouldValidate: false });
      form.clearErrors("deliveryReceiptFile");
    }
    if (nextCategory !== TicketRequestCategory.FIELD) {
      form.setValue("fieldCategory", undefined);
      form.clearErrors("fieldCategory");
    }

    if (
      nextCategory === TicketRequestCategory.MATERIAL ||
      nextCategory === TicketRequestCategory.WAREHOUSE
    ) {
      const nextHint = getDefaultItemSourceForCategory(
        nextCategory,
        materialContracts.length,
      );
      form.setValue("itemSource", nextHint, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("itemsExpectedDeliveryDate", "");
      form.setValue("items", [createBlankItem(nextHint)], {
        shouldValidate: true,
      });
    } else {
      form.setValue("items", [], { shouldValidate: true });
      form.setValue("itemSource", TicketCategoryHint.PURCHASE);
      form.setValue("itemsExpectedDeliveryDate", "");
    }

    if (nextCategory === HOUSE_RENTAL_REQUEST_TYPE) {
      form.setValue("rentalDetails.usageScope", "PROJECT");
    }
    if (nextCategory !== EQUIPMENT_REQUEST_TYPE) {
      form.setValue("equipmentDetails.equipmentName", "");
      form.setValue("equipmentDetails.startDate", "");
      form.setValue("equipmentDetails.duration", undefined);
      form.setValue("equipmentDetails.timeUnit", DEFAULT_EQUIPMENT_TIME_UNIT);
    }
    form.clearErrors([
      "fieldCategory",
      "items",
      "itemsExpectedDeliveryDate",
      "rentalDetails",
      "requestedAmount",
      "neededDate",
    ]);
  };

  const switchMaterialSourceToPurchase = () => {
    form.setValue("itemSource", TicketCategoryHint.PURCHASE, {
      shouldDirty: true,
      shouldValidate: true,
    });
    replace(
      (form.getValues("items") ?? [createBlankItem(TicketCategoryHint.PURCHASE)]).map(
        (item) => ({
          ...item,
          stockItemId: "",
          itemName: "",
          unit: "",
          estimatedCost: undefined,
          categoryHint: TicketCategoryHint.PURCHASE,
          materialContractId: "",
          expectedDeliveryDate: "",
        }),
      ),
    );
    form.setValue("itemsExpectedDeliveryDate", "");
    form.clearErrors(["items", "itemsExpectedDeliveryDate"]);
  };

  const updateSelectedShippingDocuments = (nextKeys: string[]) => {
    setSelectedShippingDocumentKeys(nextKeys);
    const selectedNumbers = nextKeys.flatMap((key) => {
      const [, id] = key.split(":", 2);
      const order = shippingDocumentOptions?.purchaseOrders.find(
        (option) => option.id === id,
      );
      return order ? [order.poNumber] : [];
    });
    form.setValue("relatedDocumentNumbers", selectedNumbers.join(", "), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const toggleShippingDocument = (key: string, checked: boolean) => {
    const nextKeys = checked
      ? [...selectedShippingDocumentKeys, key]
      : selectedShippingDocumentKeys.filter((selected) => selected !== key);
    updateSelectedShippingDocuments(nextKeys);
  };

  const shippingDocumentGroups = [
    {
      key: "PO",
      title: "PO Barang",
      options: (shippingDocumentOptions?.purchaseOrders ?? []).map(
        (option) => ({
          id: option.id,
          number: option.poNumber,
          detail: option.vendorName,
          deliveryOrders: option.deliveryOrders,
        }),
      ),
    },
  ] as const;

  const requiresFundingRequest =
    requiresRecipientPayment ||
    isOperationalFunding ||
    isAPHRequest ||
    isInternalFunding ||
    isShippingCostRequest ||
    isEquipmentRequest ||
    isRentalRequest;

  const operationalRequestedAmount =
    operationalRequestType === "SURVEY"
      ? (watchedSurveyConsumptionAmount ?? 0) + (watchedSurveyFuelAmount ?? 0)
      : watchedOperationalAmount ?? 0;

  const contractEstimatedTotal = useMemo(() => {
    if (itemSource !== TicketCategoryHint.CONTRACT) return 0;
    return (watchedItems ?? []).reduce((sum, item) => {
      const qty = Number(item?.quantity ?? 0);
      const unitPrice = Number(item?.estimatedCost ?? 0);
      if (
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice <= 0
      ) {
        return sum;
      }
      return sum + Math.round(qty * unitPrice);
    }, 0);
  }, [itemSource, watchedItems]);

  const handleNextStep = async () => {
    setError("");
    if (activeStep === 0) {
      const fieldsToValidate: (keyof TicketFormValues)[] = [
        "requestCategory",
        "projectId",
      ];
      if (requestCategory === TicketRequestCategory.FIELD) {
        fieldsToValidate.push("fieldCategory");
      }
      const valid = await form.trigger(fieldsToValidate);
      if (isProjectRequired && !form.getValues("projectId").trim()) {
        form.setError("projectId", {
          type: "manual",
          message: isHouseRental
            ? "Biaya Rumah Sewa / Mess Tukang wajib memilih Proyek aktif."
            : "Pilih proyek tujuan terlebih dahulu.",
        });
        return;
      }
      if (!valid) return;
      setActiveStep(1);
      return;
    }

    if (activeStep === 1) {
      const step2Paths: string[] = [];
      if (usesItemDeliveryDates) {
        step2Paths.push("itemSource", "itemsExpectedDeliveryDate", "items");
      } else if (isEquipmentRequest) {
        step2Paths.push("equipmentDetails");
      } else if (isRentalRequest) {
        step2Paths.push(
          "rentalDetails",
          "requestedAmount",
          "recipientName",
          "bankName",
          "accountNumber",
        );
      } else if (isAPHRequest) {
        step2Paths.push(
          "requestPaymentMethod",
          "transferDestination",
          "requestPaymentDescription",
          "requestedAmount",
        );
      } else if (isInternalFunding) {
        step2Paths.push(
          "requestedAmount",
          "requestPaymentDescription",
          "receiptFiles",
        );
      } else if (isShippingCostRequest) {
        step2Paths.push(
          "relatedDocumentNumbers",
          "requestedAmount",
          "deliveryReceiptFile",
        );
      } else if (requiresRecipientPayment) {
        step2Paths.push(
          "recipientName",
          "bankName",
          "accountNumber",
          "requestedAmount",
        );
      } else if (isOperationalFunding) {
        step2Paths.push(
          "operationalRequestType",
          "operationalAmount",
          "surveyConsumptionAmount",
          "surveyFuelAmount",
        );
      }
      const valid = await form.trigger(
        step2Paths as (keyof TicketFormValues)[],
      );
      if (!valid) return;
      setActiveStep(2);
    }
  };

  const handleValidSubmit = async (
    values: TicketFormValues,
    submitImmediately: boolean,
  ) => {
    setError("");

      const categoryLabel = requestCategoryLabels[values.requestCategory];
      const subCategoryLabel = values.fieldCategory
        ? fieldCategoryLabels[values.fieldCategory]
        : undefined;
      const firstItemName = values.items[0]?.itemName?.trim() ?? "";
      const operationalRequestLabel =
        values.operationalRequestType === "SURVEY"
          ? "Biaya Survei Lapangan"
          : "Dana Operasional";
      const operationalAmount =
        values.operationalRequestType === "SURVEY"
          ? (values.surveyConsumptionAmount ?? 0) +
            (values.surveyFuelAmount ?? 0)
          : values.operationalAmount;
      const shortDetail = (values.requestPaymentDescription?.trim() ?? "").replace(
        /\s+/g,
        " ",
      );
      const conciseTitle = `${categoryLabel}: ${
        shortDetail.length > 50
          ? `${shortDetail.slice(0, 47).trimEnd()}...`
          : shortDetail
      }`;

      const title = isEquipmentRequest
        ? `${categoryLabel}: ${values.equipmentDetails.equipmentName?.trim() ?? ""}`.slice(
            0,
            160,
          )
        : isHouseRental
          ? `Rumah Sewa: ${values.rentalDetails.assetName?.trim() ?? ""}`.slice(
              0,
              160,
            )
          : isVehicleRental
            ? `Kendaraan Sewa: ${values.rentalDetails.assetName?.trim() ?? ""}`.slice(
                0,
                160,
              )
            : isOperationalFunding
              ? `Operasional: ${operationalRequestLabel}`
              : isAPHRequest
                ? "Permintaan APH"
                : isInternalFunding
                  ? conciseTitle
                  : isShippingCostRequest
                    ? `${categoryLabel}: ${values.relatedDocumentNumbers.trim()}`.slice(
                        0,
                        80,
                      )
                    : requiresRecipientPayment
                      ? `${subCategoryLabel}: ${values.recipientName?.trim()}`.slice(
                          0,
                          80,
                        )
                      : `${categoryLabel}: ${firstItemName}`.slice(0, 80);

      const description = [
        `Jenis permintaan: ${categoryLabel}`,
        isAPHRequest
          ? `Metode pembayaran: ${values.requestPaymentMethod === POPaymentMethod.CASH ? "Cash" : "Transfer"}`
          : null,
        isAPHRequest &&
        values.requestPaymentMethod === POPaymentMethod.TRANSFER &&
        values.transferDestination?.trim()
          ? `Tujuan transfer: ${values.transferDestination.trim()}`
          : null,
        isAPHRequest
          ? `Keterangan: ${values.requestPaymentDescription?.trim()}`
          : null,
        isAPHRequest
          ? `Jumlah dana diminta: ${formatCurrency(values.requestedAmount ?? 0)}`
          : null,
        isInternalFunding
          ? `Nominal pengajuan: ${formatCurrency(values.requestedAmount ?? 0)}`
          : null,
        isInternalFunding
          ? `Keterangan: ${values.requestPaymentDescription?.trim()}`
          : null,
        isShippingCostRequest && values.relatedDocumentNumbers.trim()
          ? `PO barang: ${values.relatedDocumentNumbers
              .split(",")
              .map((number) => number.trim())
              .filter(Boolean)
              .join(", ")}`
          : null,
        isShippingCostRequest
          ? `Biaya pengiriman: ${formatCurrency(values.requestedAmount ?? 0)}`
          : null,
        isOperationalFunding
          ? `Keperluan: ${operationalRequestLabel}`
          : null,
        isOperationalFunding && values.operationalRequestType === "SURVEY"
          ? `Biaya konsumsi: ${formatCurrency(values.surveyConsumptionAmount ?? 0)}\nBiaya BBM: ${formatCurrency(values.surveyFuelAmount ?? 0)}`
          : isOperationalFunding
            ? `Jumlah dana: ${formatCurrency(values.operationalAmount ?? 0)}`
            : null,
        subCategoryLabel ? `Sub-menu lapangan: ${subCategoryLabel}` : null,
        initialWageRequest
          ? `Proyek: ${initialWageRequest.projectTitle}\nTitik kerja: ${initialWageRequest.workPointTitle}`
          : null,
        values.neededDate
          ? `Tanggal perlu dibayarkan/disediakan: ${values.neededDate}`
          : null,
        isEquipmentRequest
          ? `Nama alat/kendaraan: ${values.equipmentDetails.equipmentName?.trim()}\nTanggal mulai pemakaian: ${values.equipmentDetails.startDate}\nDurasi pemakaian: ${values.equipmentDetails.duration} ${values.equipmentDetails.timeUnit.toLowerCase()}`
          : null,
        isRentalRequest
          ? [
              `Aset / Properti: ${values.rentalDetails.assetName?.trim()}`,
              isVehicleRental
                ? `Lingkup Sewa: ${values.rentalDetails.usageScope === "PROJECT" ? "Proyek" : "Operasional Umum"}`
                : null,
              isVehicleRental && values.rentalDetails.codeOrPlate?.trim()
                ? `Nopol / Kode: ${values.rentalDetails.codeOrPlate.trim()}`
                : null,
              isHouseRental && values.rentalDetails.propertyAddress?.trim()
                ? `Alamat / Lokasi: ${values.rentalDetails.propertyAddress.trim()}`
                : null,
              values.rentalDetails.landlordName?.trim()
                ? `Pemilik / Vendor: ${values.rentalDetails.landlordName.trim()}`
                : null,
              values.rentalDetails.landlordPhone?.trim()
                ? `No. HP Pemilik: ${values.rentalDetails.landlordPhone.trim()}`
                : null,
              isHouseRental && values.rentalDetails.occupantCount
                ? `Jumlah Penghuni: ${values.rentalDetails.occupantCount} orang`
                : null,
              `Periode Sewa: ${RENTAL_PERIOD_TYPE_LABELS[values.rentalDetails.periodType]} (${values.rentalDetails.duration ?? 1}x)`,
              values.rentalDetails.startDate
                ? `Tanggal Mulai: ${values.rentalDetails.startDate}`
                : null,
              values.rentalDetails.endDate
                ? `Tanggal Selesai: ${values.rentalDetails.endDate}`
                : null,
            ]
              .filter(Boolean)
              .join("\n")
          : null,
        values.itemSource === TicketCategoryHint.WAREHOUSE &&
        values.itemsExpectedDeliveryDate
          ? `Tanggal diperlukan untuk seluruh barang gudang: ${values.itemsExpectedDeliveryDate}`
          : values.itemSource === TicketCategoryHint.CONTRACT &&
              values.itemsExpectedDeliveryDate
            ? `Target tanggal pengiriman material alam: ${values.itemsExpectedDeliveryDate}`
            : null,
      ]
        .filter(Boolean)
        .join("\n");

      const ticketType =
        values.requestCategory === TicketRequestCategory.OPS
          ? TicketType.OPERATIONAL
          : values.requestCategory === TicketRequestCategory.MATERIAL ||
              values.requestCategory === TicketRequestCategory.WAREHOUSE
            ? TicketType.MATERIAL
            : TicketType.COST;

      const priority =
        values.priority === "EMERGENCY"
          ? TicketPriority.URGENT
          : values.priority === "URGENT"
            ? TicketPriority.HIGH
            : TicketPriority.LOW;

      try {
        const result =
          values.requestCategory === EQUIPMENT_REQUEST_TYPE
            ? await createEquipmentRequest({
                projectId: values.projectId,
                equipmentName: values.equipmentDetails.equipmentName ?? "",
                startDate: values.equipmentDetails.startDate ?? "",
                duration: values.equipmentDetails.duration ?? 0,
                timeUnit: values.equipmentDetails.timeUnit,
                priority,
              })
            : await createTicket({
                title,
                description,
                type: ticketType,
                requestCategory: isRentalRequest
                  ? TicketRequestCategory.OPS
                  : (values.requestCategory as TicketRequestCategory),
                fieldCategory: values.fieldCategory,
                requestPaymentMethod: isAPHRequest
                  ? values.requestPaymentMethod
                  : undefined,
                transferDestination:
                  isAPHRequest &&
                  values.requestPaymentMethod === POPaymentMethod.TRANSFER
                    ? values.transferDestination
                    : undefined,
                requestPaymentDescription: isAPHRequest
                  ? values.requestPaymentDescription
                  : undefined,
                relatedDocumentNumbers: isShippingCostRequest
                  ? values.relatedDocumentNumbers
                  : undefined,
                deliveryReceiptFile: isShippingCostRequest
                  ? (values.deliveryReceiptFile ?? undefined)
                  : undefined,
                deliveryProofDocType: isShippingCostRequest
                  ? values.deliveryProofDocType ?? "BON"
                  : undefined,
                priority,
                projectId: values.projectId || undefined,
                moverAssigneeId: undefined,
                recipientName:
                  requiresRecipientPayment || isRentalRequest
                    ? values.recipientName?.trim() || undefined
                    : undefined,
                bankName:
                  requiresRecipientPayment || isRentalRequest
                    ? values.bankName?.trim() || undefined
                    : undefined,
                accountNumber:
                  requiresRecipientPayment || isRentalRequest
                    ? values.accountNumber?.trim() || undefined
                    : undefined,
                requestedAmount: requiresRecipientPayment
                  ? values.requestedAmount
                  : isOperationalFunding
                    ? operationalAmount
                    : isAPHRequest ||
                        isInternalFunding ||
                        isShippingCostRequest ||
                        isRentalRequest
                      ? values.requestedAmount
                      : undefined,
                receiptFiles: isInternalFunding ? values.receiptFiles : [],
                proofDocType: isInternalFunding
                  ? values.proofDocType ?? "BON"
                  : undefined,
                items: requiresFundingRequest
                  ? []
                  : values.items.map((item) => ({
                      ...(item.stockItemId
                        ? { stockItemId: item.stockItemId }
                        : {}),
                      itemName: item.itemName ?? "",
                      quantity: item.quantity ?? 0,
                      unit: item.unit ?? "",
                      estimatedCost:
                        values.itemSource === TicketCategoryHint.CONTRACT
                          ? item.estimatedCost
                          : undefined,
                      categoryHint: values.itemSource,
                      materialContractId:
                        values.itemSource === TicketCategoryHint.CONTRACT
                          ? item.materialContractId
                          : undefined,
                      expectedDeliveryDate:
                        (values.itemSource === TicketCategoryHint.WAREHOUSE ||
                          values.itemSource === TicketCategoryHint.CONTRACT) &&
                        values.itemsExpectedDeliveryDate
                          ? values.itemsExpectedDeliveryDate
                          : undefined,
                    })),
                submitImmediately,
                ...(isRentalRequest
                  ? {
                      rentalDetails: {
                        rentalType: isHouseRental ? "HOUSE" : "VEHICLE",
                        usageScope: isHouseRental
                          ? "PROJECT"
                          : values.rentalDetails.usageScope,
                        assetName:
                          values.rentalDetails.assetName?.trim() ?? "",
                        propertyAddress: isHouseRental
                          ? values.rentalDetails.propertyAddress?.trim() || null
                          : null,
                        landlordName:
                          values.rentalDetails.landlordName?.trim() || null,
                        landlordPhone:
                          values.rentalDetails.landlordPhone?.trim() || null,
                        occupantCount: isHouseRental
                          ? (values.rentalDetails.occupantCount ?? null)
                          : null,
                        codeOrPlate: isVehicleRental
                          ? values.rentalDetails.codeOrPlate?.trim() || null
                          : null,
                        periodType: values.rentalDetails.periodType,
                        startDate: values.rentalDetails.startDate || null,
                        endDate: values.rentalDetails.endDate || null,
                        duration: values.rentalDetails.duration ?? 1,
                      },
                    }
                  : {}),
              });

        if (!result.success) {
          setError(result.message);
          return;
        }
        toast.success(result.message || "Tiket berhasil diproses.");
        setOpen(false);
        setActiveStep(0);
        form.reset();
        setReceiptFiles([]);
        setSelectedShippingDocumentKeys([]);
        setReceiptUploadError("");
        router.refresh();
      } catch (submitError) {
        console.error("Ticket form submission failed:", submitError);
        setError("Tiket gagal disimpan. Periksa koneksi lalu coba kembali.");
      }
  };

  const handleInvalidSubmit = (
    invalidFields: FieldErrors<TicketFormValues>,
  ) => {
      const step1Error = Boolean(
        invalidFields.projectId ||
          invalidFields.requestCategory ||
          invalidFields.fieldCategory,
      );
      const step2Error = Boolean(
        invalidFields.itemsExpectedDeliveryDate ||
          invalidFields.items ||
          invalidFields.requestedAmount ||
          invalidFields.operationalAmount ||
          invalidFields.surveyConsumptionAmount ||
          invalidFields.surveyFuelAmount ||
          invalidFields.recipientName ||
          invalidFields.bankName ||
          invalidFields.accountNumber ||
          invalidFields.requestPaymentMethod ||
          invalidFields.transferDestination ||
          invalidFields.requestPaymentDescription ||
          invalidFields.relatedDocumentNumbers ||
          invalidFields.deliveryReceiptFile ||
          invalidFields.receiptFiles ||
          invalidFields.equipmentDetails ||
          invalidFields.rentalDetails,
      );

      if (step1Error) {
        setActiveStep(0);
      } else if (step2Error) {
        setActiveStep(1);
      }

      const messages = [
        invalidFields.projectId?.message,
        invalidFields.requestCategory?.message,
        invalidFields.fieldCategory?.message,
        invalidFields.neededDate?.message,
        invalidFields.recipientName?.message,
        invalidFields.bankName?.message,
        invalidFields.accountNumber?.message,
        invalidFields.requestedAmount?.message,
        invalidFields.operationalAmount?.message,
        invalidFields.surveyConsumptionAmount?.message,
        invalidFields.requestPaymentMethod?.message,
        invalidFields.transferDestination?.message,
        invalidFields.requestPaymentDescription?.message,
        invalidFields.relatedDocumentNumbers?.message,
        invalidFields.deliveryReceiptFile?.message,
        invalidFields.receiptFiles?.message,
        invalidFields.equipmentDetails?.equipmentName?.message,
        invalidFields.equipmentDetails?.startDate?.message,
        invalidFields.equipmentDetails?.duration?.message,
        invalidFields.rentalDetails?.assetName?.message,
        invalidFields.rentalDetails?.propertyAddress?.message,
        invalidFields.rentalDetails?.occupantCount?.message,
        invalidFields.rentalDetails?.startDate?.message,
        invalidFields.rentalDetails?.endDate?.message,
        invalidFields.rentalDetails?.duration?.message,
        invalidFields.itemsExpectedDeliveryDate?.message,
        invalidFields.items?.root?.message,
        invalidFields.items?.message,
        ...(Array.isArray(invalidFields.items)
          ? invalidFields.items.flatMap((item) => [
              item?.stockItemId?.message,
              item?.materialContractId?.message,
              item?.itemName?.message,
              item?.unit?.message,
              item?.quantity?.message,
              item?.estimatedCost?.message,
              item?.expectedDeliveryDate?.message,
            ])
          : []),
      ].filter((message): message is string => Boolean(message));

      setError(
        messages.length > 0
          ? `Periksa isian: ${messages.join(" ")}`
          : "Tiket belum dikirim. Periksa data wajib yang ditandai.",
      );
  };

  const submit = form.handleSubmit(
    (values) => handleValidSubmit(values, true),
    handleInvalidSubmit,
  );
  const saveDraft = form.handleSubmit(
    (values) => handleValidSubmit(values, false),
    handleInvalidSubmit,
  );

  const selectedProjectLabel =
    projects.find((p) => p.id === selectedProjectId)
      ? `${projects.find((p) => p.id === selectedProjectId)!.kelompokTani} - ${projects.find((p) => p.id === selectedProjectId)!.title}`
      : "Kantor Pusat / Overhead Umum";

  const isMaterialOrWarehouse =
    requestCategory === TicketRequestCategory.MATERIAL ||
    requestCategory === TicketRequestCategory.WAREHOUSE;
  const isAutoSubmitOnly =
    isEquipmentRequest || isInternalFunding || isShippingCostRequest;
  const primarySubmitLabel =
    isMaterialOrWarehouse || isEquipmentRequest
      ? "Kirim ke Logistik"
      : "Ajukan Sekarang";

  const handleClose = () => {
    setOpen(false);
    setError("");
    setActiveStep(0);
  };

  return (
    <>
      <Button
        type="button"
        size="default"
        onClick={() => {
          setError("");
          setActiveStep(0);
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" />
        {triggerLabel}
      </Button>

      <GlobalModal
        isOpen={open}
        onClose={handleClose}
        title="Buat Tiket Baru"
        description="Ikuti 3 langkah ringkas untuk membuat dan mengirim permintaan."
        className="max-w-4xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {activeStep > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setActiveStep((step) => Math.max(0, step - 1));
                  }}
                  disabled={form.formState.isSubmitting}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Kembali
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={form.formState.isSubmitting}
                >
                  Batal
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeStep < 2 ? (
                <Button
                  type="button"
                  onClick={() => void handleNextStep()}
                  disabled={form.formState.isSubmitting}
                >
                  Lanjut
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <>
                  {!isAutoSubmitOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={form.formState.isSubmitting}
                      onClick={() => void saveDraft()}
                    >
                      Simpan Draft
                    </Button>
                  )}
                  <Button
                    type="submit"
                    form="ticket-form"
                    disabled={form.formState.isSubmitting}
                    aria-busy={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Send className="size-4" aria-hidden="true" />
                        {primarySubmitLabel}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        <Stepper
          steps={CREATE_TICKET_STEPS}
          currentStep={activeStep}
          onStepClick={(stepIndex) => {
            if (stepIndex <= activeStep) {
              setError("");
              setActiveStep(stepIndex);
            }
          }}
        />

        {error && (
          <div
            className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="type-p2">{error}</p>
          </div>
        )}

        <form id="ticket-form" onSubmit={submit} className="space-y-4">
          <fieldset
            disabled={form.formState.isSubmitting}
            className="contents"
          >
            {activeStep === 0 && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="type-h3 text-foreground">
                    Pilih Jenis &amp; Proyek
                  </h3>
                  <p className="type-p3 text-muted-foreground">
                    Tentukan kategori permintaan dan proyek tujuan agar alur
                    persetujuan tepat sasaran.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ticket-request-category"
                      className="type-p2 font-medium"
                    >
                      Jenis Permintaan <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={form.control}
                      name="requestCategory"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={handleCategoryChange}
                        >
                          <SelectTrigger
                            id="ticket-request-category"
                            className="h-10 w-full"
                            aria-invalid={!!form.formState.errors.requestCategory}
                          >
                            <SelectValue placeholder="Pilih jenis permintaan" />
                          </SelectTrigger>
                          <SelectContent>
                            {requestTypeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {form.formState.errors.requestCategory && (
                      <p className="type-p3 text-destructive" role="alert">
                        {form.formState.errors.requestCategory.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ticket-project" className="type-p2 font-medium">
                      Proyek Tujuan{" "}
                      {isProjectRequired ? (
                        <span className="text-destructive">* Wajib</span>
                      ) : (
                        <span className="type-p3 text-muted-foreground">
                          (Opsional)
                        </span>
                      )}
                    </Label>
                    <Controller
                      control={form.control}
                      name="projectId"
                      render={({ field }) => (
                        <Combobox
                          id="ticket-project"
                          options={projectComboboxOptions}
                          value={
                            field.value
                              ? field.value
                              : isProjectRequired
                                ? ""
                                : "__NONE__"
                          }
                          disabled={Boolean(fixedProjectId)}
                          placeholder={
                            isProjectRequired
                              ? "Cari & pilih proyek wajib..."
                              : "Kantor Pusat / Overhead Umum"
                          }
                          searchPlaceholder="Ketik nama proyek atau kelompok tani..."
                          emptyText="Proyek tidak ditemukan."
                          onValueChange={(value) => {
                            const nextVal = value === "__NONE__" ? "" : value;
                            field.onChange(nextVal);
                            if (nextVal) {
                              form.clearErrors("projectId");
                            }
                          }}
                        />
                      )}
                    />
                    {form.formState.errors.projectId && (
                      <p className="type-p3 text-destructive" role="alert">
                        {form.formState.errors.projectId.message}
                      </p>
                    )}
                  </div>
                </div>

                {requestCategory === TicketRequestCategory.FIELD && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="ticket-field-category"
                      className="type-p2 font-medium"
                    >
                      Kebutuhan Lapangan{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={form.control}
                      name="fieldCategory"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? undefined : value)
                          }
                        >
                          <SelectTrigger
                            id="ticket-field-category"
                            className="h-10 w-full md:max-w-[calc(50%-0.5rem)]"
                            aria-invalid={!!form.formState.errors.fieldCategory}
                          >
                            <SelectValue placeholder="Pilih kebutuhan lapangan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Pilih kebutuhan lapangan
                            </SelectItem>
                            {fieldCategories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {fieldCategoryLabels[category]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {form.formState.errors.fieldCategory && (
                      <p className="type-p3 text-destructive" role="alert">
                        {form.formState.errors.fieldCategory.message}
                      </p>
                    )}
                  </div>
                )}

                {isVehicleRental && (
                  <div className="space-y-2 rounded-xl border border-border bg-card p-3.5">
                    <Label className="type-p2 font-semibold">
                      Cakupan Penggunaan Kendaraan Sewa
                    </Label>
                    <Controller
                      control={form.control}
                      name="rentalDetails.usageScope"
                      render={({ field }) => (
                        <RadioGroup
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.clearErrors("projectId");
                          }}
                          className="grid gap-2.5 sm:grid-cols-2"
                        >
                          <Label
                            htmlFor="vehicle-scope-project"
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                              field.value === "PROJECT"
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/40",
                            )}
                          >
                            <RadioGroupItem
                              id="vehicle-scope-project"
                              value="PROJECT"
                              className="mt-0.5"
                            />
                            <div>
                              <span className="type-p2 block font-semibold text-foreground">
                                Proyek (Wajib Pilih Proyek)
                              </span>
                              <span className="type-p3 block text-muted-foreground">
                                Biaya sewa kendaraan dibebankan ke proyek
                              </span>
                            </div>
                          </Label>
                          <Label
                            htmlFor="vehicle-scope-ops"
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                              field.value === "OPERATIONAL"
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/40",
                            )}
                          >
                            <RadioGroupItem
                              id="vehicle-scope-ops"
                              value="OPERATIONAL"
                              className="mt-0.5"
                            />
                            <div>
                              <span className="type-p2 block font-semibold text-foreground">
                                Operasional Umum
                              </span>
                              <span className="type-p3 block text-muted-foreground">
                                Digunakan untuk operasional kantor / lintas tim
                              </span>
                            </div>
                          </Label>
                        </RadioGroup>
                      )}
                    />
                  </div>
                )}

                {isHouseRental && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <Home
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="type-p3 text-foreground">
                      Pengajuan <strong>Biaya Rumah Sewa / Mess Tukang</strong>{" "}
                      wajib dihubungkan ke proyek aktif agar biaya sewa tercatat
                      di laporan proyek.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeStep === 1 && (
              <div className="space-y-4">
                {isEquipmentRequest && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        Detail Alat Berat &amp; Kendaraan
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Permintaan langsung diteruskan ke antrean Logistik.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-3">
                        <Label
                          htmlFor="equipment-name"
                          className="type-p2 font-medium"
                        >
                          Alat / Kendaraan <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="equipment-name"
                          placeholder="Contoh: Excavator Komatsu PC200, Dump Truck"
                          aria-invalid={
                            !!form.formState.errors.equipmentDetails
                              ?.equipmentName
                          }
                          {...form.register("equipmentDetails.equipmentName")}
                        />
                        {form.formState.errors.equipmentDetails
                          ?.equipmentName && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.equipmentDetails
                                .equipmentName.message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="equipment-start-date"
                          className="type-p2 font-medium"
                        >
                          Tgl Mulai Pakai{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Controller
                          control={form.control}
                          name="equipmentDetails.startDate"
                          render={({ field }) => (
                            <DatePicker
                              id="equipment-start-date"
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                              placeholder="Pilih tanggal mulai"
                            />
                          )}
                        />
                        {form.formState.errors.equipmentDetails?.startDate && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.equipmentDetails.startDate
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="equipment-duration"
                          className="type-p2 font-medium"
                        >
                          Lama Pakai <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="equipment-duration"
                          type="number"
                          min="0.01"
                          step="any"
                          placeholder="Contoh: 3"
                          aria-invalid={
                            !!form.formState.errors.equipmentDetails?.duration
                          }
                          {...form.register("equipmentDetails.duration", {
                            setValueAs: (value: string) =>
                              value === "" ? undefined : Number(value),
                          })}
                        />
                        {form.formState.errors.equipmentDetails?.duration && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.equipmentDetails.duration
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="equipment-time-unit"
                          className="type-p2 font-medium"
                        >
                          Satuan Waktu
                        </Label>
                        <Controller
                          control={form.control}
                          name="equipmentDetails.timeUnit"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="equipment-time-unit"
                                className="h-10 w-full"
                              >
                                <SelectValue placeholder="Pilih satuan" />
                              </SelectTrigger>
                              <SelectContent>
                                {EQUIPMENT_TIME_UNITS.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {EQUIPMENT_TIME_UNIT_LABELS[unit]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {isRentalRequest && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-start gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {isHouseRental ? (
                          <Building2 className="size-4" aria-hidden="true" />
                        ) : (
                          <Car className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <div>
                        <h3 className="type-h3 text-foreground">
                          {isHouseRental
                            ? "Rincian Rumah Sewa / Mess Tukang"
                            : "Rincian Kendaraan Sewa"}
                        </h3>
                        <p className="type-p3 text-muted-foreground">
                          Lengkapi identitas sewa, periode pemakaian, nominal,
                          serta rekening pencairan.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-asset-name"
                          className="type-p2 font-medium"
                        >
                          {isHouseRental
                            ? "Nama Rumah / Mess"
                            : "Jenis & Nama Kendaraan"}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="rental-asset-name"
                          placeholder={
                            isHouseRental
                              ? "Contoh: Mess Tukang Blok C2"
                              : "Contoh: Pick Up L300 / Kijang Innova"
                          }
                          aria-invalid={
                            !!form.formState.errors.rentalDetails?.assetName
                          }
                          {...form.register("rentalDetails.assetName")}
                        />
                        {form.formState.errors.rentalDetails?.assetName && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.rentalDetails.assetName
                                .message
                            }
                          </p>
                        )}
                      </div>

                      {isVehicleRental ? (
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="rental-plate"
                            className="type-p2 font-medium"
                          >
                            Nopol / Kode Kendaraan
                          </Label>
                          <Input
                            id="rental-plate"
                            placeholder="Contoh: BL 1234 AB"
                            {...form.register("rentalDetails.codeOrPlate")}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="rental-occupants"
                            className="type-p2 font-medium"
                          >
                            Jumlah Tukang / Penghuni
                          </Label>
                          <Input
                            id="rental-occupants"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Contoh: 8"
                            {...form.register("rentalDetails.occupantCount", {
                              setValueAs: (val: string) =>
                                val === "" ? undefined : Number(val),
                            })}
                          />
                          {form.formState.errors.rentalDetails
                            ?.occupantCount && (
                            <p className="type-p3 text-destructive" role="alert">
                              {
                                form.formState.errors.rentalDetails
                                  .occupantCount.message
                              }
                            </p>
                          )}
                        </div>
                      )}

                      {isHouseRental && (
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label
                            htmlFor="rental-address"
                            className="type-p2 font-medium"
                          >
                            Alamat / Lokasi{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id="rental-address"
                            rows={2}
                            maxLength={300}
                            placeholder="Alamat lengkap rumah atau mess tukang"
                            {...form.register("rentalDetails.propertyAddress")}
                          />
                          {form.formState.errors.rentalDetails
                            ?.propertyAddress && (
                            <p className="type-p3 text-destructive" role="alert">
                              {
                                form.formState.errors.rentalDetails
                                  .propertyAddress.message
                              }
                            </p>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-landlord-name"
                          className="type-p2 font-medium"
                        >
                          {isHouseRental
                            ? "Nama Pemilik / Ibu Kos"
                            : "Nama Pemilik / Rental"}
                        </Label>
                        <Input
                          id="rental-landlord-name"
                          maxLength={120}
                          placeholder="Nama pemilik"
                          {...form.register("rentalDetails.landlordName")}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-landlord-phone"
                          className="type-p2 font-medium"
                        >
                          No. HP Pemilik
                        </Label>
                        <Input
                          id="rental-landlord-phone"
                          type="tel"
                          maxLength={40}
                          placeholder="Contoh: 0812xxxxxxxx"
                          {...form.register("rentalDetails.landlordPhone")}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-period-type"
                          className="type-p2 font-medium"
                        >
                          Tipe Periode
                        </Label>
                        <Controller
                          control={form.control}
                          name="rentalDetails.periodType"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="rental-period-type"
                                className="h-10 w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RENTAL_PERIOD_TYPES.map((period) => (
                                  <SelectItem key={period} value={period}>
                                    {RENTAL_PERIOD_TYPE_LABELS[period]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-duration"
                          className="type-p2 font-medium"
                        >
                          Durasi (Jumlah Periode){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="rental-duration"
                          type="number"
                          min="1"
                          step="any"
                          placeholder="1"
                          {...form.register("rentalDetails.duration", {
                            setValueAs: (val: string) =>
                              val === "" ? undefined : Number(val),
                          })}
                        />
                        {form.formState.errors.rentalDetails?.duration && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.rentalDetails.duration
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-start-date"
                          className="type-p2 font-medium"
                        >
                          Tanggal Mulai{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Controller
                          control={form.control}
                          name="rentalDetails.startDate"
                          render={({ field }) => (
                            <DatePicker
                              id="rental-start-date"
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                              placeholder="Pilih tanggal mulai"
                            />
                          )}
                        />
                        {form.formState.errors.rentalDetails?.startDate && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.rentalDetails.startDate
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="rental-end-date"
                          className="type-p2 font-medium"
                        >
                          Tanggal Selesai
                        </Label>
                        <Controller
                          control={form.control}
                          name="rentalDetails.endDate"
                          render={({ field }) => (
                            <DatePicker
                              id="rental-end-date"
                              value={field.value ?? ""}
                              minDate={rentalStartDate || undefined}
                              clearable
                              onValueChange={field.onChange}
                              placeholder="Pilih tanggal selesai"
                            />
                          )}
                        />
                        {form.formState.errors.rentalDetails?.endDate && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.rentalDetails.endDate
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <Label
                          htmlFor="rental-amount"
                          className="type-p2 font-medium"
                        >
                          Nominal Biaya Sewa (Rp){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <RupiahAmountInput
                          id="rental-amount"
                          value={
                            watchedRequestedAmount === undefined
                              ? ""
                              : formatRupiahNumber(watchedRequestedAmount)
                          }
                          onChange={(val) => {
                            const amount = parseRupiahInput(val);
                            form.setValue(
                              "requestedAmount",
                              amount > 0 ? amount : undefined,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                          required
                        />
                        {form.formState.errors.requestedAmount && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.requestedAmount.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
                      <div>
                        <h4 className="type-p2 font-semibold text-foreground">
                          Rekening Pencairan Keuangan (Opsional)
                        </h4>
                        <p className="type-p3 text-muted-foreground">
                          Isi rekening pemilik sewa atau kosongkan untuk memakai
                          rekening profil Anda.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="rental-recipient"
                            className="type-p2 font-medium"
                          >
                            Nama Penerima
                          </Label>
                          <Input
                            id="rental-recipient"
                            placeholder="Nama pemilik rekening"
                            {...form.register("recipientName")}
                          />
                          {form.formState.errors.recipientName && (
                            <p className="type-p3 text-destructive" role="alert">
                              {form.formState.errors.recipientName.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="rental-bank"
                            className="type-p2 font-medium"
                          >
                            Nama Bank
                          </Label>
                          <Input
                            id="rental-bank"
                            placeholder="Contoh: BRI / BCA"
                            {...form.register("bankName")}
                          />
                          {form.formState.errors.bankName && (
                            <p className="type-p3 text-destructive" role="alert">
                              {form.formState.errors.bankName.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="rental-account"
                            className="type-p2 font-medium"
                          >
                            Nomor Rekening
                          </Label>
                          <Input
                            id="rental-account"
                            inputMode="numeric"
                            placeholder="6–30 digit angka"
                            {...form.register("accountNumber")}
                          />
                          {form.formState.errors.accountNumber && (
                            <p className="type-p3 text-destructive" role="alert">
                              {form.formState.errors.accountNumber.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {isShippingCostRequest && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        Barang yang Akan Dikirim
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Pilih PO barang terkait, isi ongkos kirim, dan unggah
                        resi pengiriman.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {shippingDocumentGroups.map((group) => (
                        <fieldset
                          key={group.key}
                          className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-3"
                          disabled={shippingDocumentsLoading}
                        >
                          <legend className="type-p2 px-1 font-medium">
                            Pilih PO Barang{" "}
                            <span className="text-destructive">*</span>
                          </legend>
                          <div className="max-h-44 space-y-1.5 overflow-y-auto">
                            {group.options.length === 0 ? (
                              <p className="type-p3 py-2 text-muted-foreground">
                                Belum ada PO.
                              </p>
                            ) : (
                              group.options.map((option) => {
                                const key = `${group.key}:${option.id}`;
                                return (
                                  <Label
                                    key={key}
                                    htmlFor={`shipping-document-${key}`}
                                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                                  >
                                    <Checkbox
                                      id={`shipping-document-${key}`}
                                      checked={selectedShippingDocumentKeys.includes(
                                        key,
                                      )}
                                      onCheckedChange={(checked) =>
                                        toggleShippingDocument(
                                          key,
                                          checked === true,
                                        )
                                      }
                                    />
                                    <span className="min-w-0">
                                      <span className="type-p2 block font-medium text-foreground">
                                        {option.number}
                                      </span>
                                      <span className="type-p3 block truncate text-muted-foreground">
                                        {option.detail}
                                      </span>
                                    </span>
                                  </Label>
                                );
                              })
                            )}
                          </div>
                        </fieldset>
                      ))}

                      <div className="space-y-2">
                        <Label
                          htmlFor="ticket-shipping-cost"
                          className="type-p2 font-medium"
                        >
                          Biaya Pengiriman (Rp){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <RupiahAmountInput
                          id="ticket-shipping-cost"
                          value={
                            watchedRequestedAmount === undefined
                              ? ""
                              : formatRupiahNumber(watchedRequestedAmount)
                          }
                          onChange={(value) => {
                            const amount = parseRupiahInput(value);
                            form.setValue(
                              "requestedAmount",
                              amount > 0 ? amount : undefined,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                          required
                        />
                        {form.formState.errors.requestedAmount && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.requestedAmount.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {shippingDocumentsLoading && (
                      <p className="type-p3 text-muted-foreground" role="status">
                        Memuat daftar PO...
                      </p>
                    )}
                    {shippingDocumentsError && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="type-p3 text-destructive" role="alert">
                          {shippingDocumentsError}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShippingDocumentsError("");
                            setShippingDocumentsLoaded(false);
                            setShippingDocumentsAttempt(
                              (attempt) => attempt + 1,
                            );
                          }}
                        >
                          Muat Ulang
                        </Button>
                      </div>
                    )}
                    {form.formState.errors.relatedDocumentNumbers && (
                      <p className="type-p3 text-destructive" role="alert">
                        {form.formState.errors.relatedDocumentNumbers.message}
                      </p>
                    )}

                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ticket-shipping-doc-kind" className="type-p2 font-medium">
                          Jenis Dokumen Resi / Biaya Pengiriman
                        </Label>
                        <Controller
                          control={form.control}
                          name="deliveryProofDocType"
                          render={({ field }) => (
                            <Select
                              value={field.value ?? "BON"}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="ticket-shipping-doc-kind">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BON">Bon / Resi / Nota (BON)</SelectItem>
                                <SelectItem value="INV">Invoice / Faktur Kurir (INV)</SelectItem>
                                <SelectItem value="KWT">Kwitansi Tunai (KWT)</SelectItem>
                                <SelectItem value="BKT">Bukti Transfer (BKT)</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <Label className="type-p2 font-medium">
                        Resi Pengiriman <span className="text-destructive">*</span>
                      </Label>
                      <FileDropzone
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        multiple={false}
                        maxSizeMb={10}
                        capture="environment"
                        files={
                          watchedDeliveryReceiptFile
                            ? [watchedDeliveryReceiptFile]
                            : []
                        }
                        onFilesChange={(nextFiles) => {
                          const next = nextFiles[0] ?? null;
                          form.setValue("deliveryReceiptFile", next, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          form.clearErrors("deliveryReceiptFile");
                        }}
                        onError={(msg) =>
                          form.setError("deliveryReceiptFile", {
                            type: "validate",
                            message: msg,
                          })
                        }
                        label="Unggah Resi Pengiriman"
                        hint="PDF, JPG, PNG, atau WEBP maksimal 10 MB."
                      />
                      {watchedDeliveryReceiptFile && (
                        <div className="flex items-center gap-2">
                          <InvoiceFilePreview
                            file={watchedDeliveryReceiptFile}
                            title="Pratinjau Resi Pengiriman"
                            label="Pratinjau resi"
                            tooltip="Pratinjau resi pengiriman"
                          />
                        </div>
                      )}
                      {form.formState.errors.deliveryReceiptFile && (
                        <p className="type-p3 text-destructive" role="alert">
                          {form.formState.errors.deliveryReceiptFile.message}
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {isInternalFunding && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        {requestCategoryLabels[requestCategory]}
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Pengajuan diteruskan ke Direktur dan Keuangan setelah
                        dikirim.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-internal-amount"
                          className="type-p2 font-medium"
                        >
                          Nominal Pengajuan (Rp){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <RupiahAmountInput
                          id="ticket-internal-amount"
                          value={
                            watchedRequestedAmount === undefined
                              ? ""
                              : formatRupiahNumber(watchedRequestedAmount)
                          }
                          onChange={(value) => {
                            const amount = parseRupiahInput(value);
                            form.setValue(
                              "requestedAmount",
                              amount > 0 ? amount : undefined,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                          required
                        />
                        {form.formState.errors.requestedAmount && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.requestedAmount.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-internal-description"
                          className="type-p2 font-medium"
                        >
                          Keterangan / Rincian{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="ticket-internal-description"
                          maxLength={5000}
                          rows={3}
                          placeholder="Jelaskan rincian pengeluaran atau keperluan dana"
                          {...form.register("requestPaymentDescription")}
                        />
                        {form.formState.errors.requestPaymentDescription && (
                          <p className="type-p3 text-destructive" role="alert">
                            {
                              form.formState.errors.requestPaymentDescription
                                .message
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {requestCategory === TicketRequestCategory.REIMBURSEMENT && (
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="ticket-reimbursement-doc-kind" className="type-p2 font-medium">
                            Jenis Dokumen Struk / Bukti
                          </Label>
                          <Controller
                            control={form.control}
                            name="proofDocType"
                            render={({ field }) => (
                              <Select
                                value={field.value ?? "BON"}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger id="ticket-reimbursement-doc-kind">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="BON">Bon / Nota / Struk (BON)</SelectItem>
                                  <SelectItem value="KWT">Kwitansi Tunai (KWT)</SelectItem>
                                  <SelectItem value="INV">Invoice / Faktur (INV)</SelectItem>
                                  <SelectItem value="BKT">Bukti Transfer (BKT)</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <Label className="type-p2 font-medium">
                          Struk / Nota Asli{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <FileDropzone
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          multiple
                          maxFiles={5}
                          maxSizeMb={10}
                          capture="environment"
                          files={receiptFiles}
                          onFilesChange={(next) => {
                            setReceiptFiles(next);
                            setReceiptUploadError("");
                            form.setValue("receiptFiles", next, {
                              shouldValidate: true,
                            });
                          }}
                          onError={setReceiptUploadError}
                          label="Unggah Foto Struk / Nota"
                          hint="Maksimal 5 berkas (PDF/JPG/PNG/WEBP, maks. 10 MB)."
                        />
                        {receiptUploadError && (
                          <p className="type-p3 text-destructive" role="alert">
                            {receiptUploadError}
                          </p>
                        )}
                        {form.formState.errors.receiptFiles && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.receiptFiles.message}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {isAPHRequest && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        Detail Permintaan APH
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Diteruskan ke Keuangan untuk pencairan dana.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="type-p2 font-medium">
                        Metode Pembayaran
                      </Label>
                      <Controller
                        control={form.control}
                        name="requestPaymentMethod"
                        render={({ field }) => (
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="flex flex-wrap gap-3"
                            aria-label="Metode pembayaran APH"
                          >
                            <Label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                              <RadioGroupItem value={POPaymentMethod.CASH} />
                              <span className="type-p2">Cash</span>
                            </Label>
                            <Label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                              <RadioGroupItem value={POPaymentMethod.TRANSFER} />
                              <span className="type-p2">Transfer</span>
                            </Label>
                          </RadioGroup>
                        )}
                      />
                    </div>

                    {watchedRequestPaymentMethod ===
                      POPaymentMethod.TRANSFER && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-aph-transfer-destination"
                          className="type-p2 font-medium"
                        >
                          Tujuan Transfer{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="ticket-aph-transfer-destination"
                          maxLength={300}
                          placeholder="Nama penerima, bank, dan nomor rekening"
                          aria-invalid={
                            !!form.formState.errors.transferDestination
                          }
                          {...form.register("transferDestination")}
                        />
                        {form.formState.errors.transferDestination && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.transferDestination.message}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-aph-description"
                        className="type-p2 font-medium"
                      >
                        Keterangan <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="ticket-aph-description"
                        maxLength={2000}
                        rows={3}
                        placeholder="Jelaskan keperluan permintaan APH"
                        {...form.register("requestPaymentDescription")}
                      />
                      {form.formState.errors.requestPaymentDescription && (
                        <p className="type-p3 text-destructive" role="alert">
                          {
                            form.formState.errors.requestPaymentDescription
                              .message
                          }
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-aph-amount"
                        className="type-p2 font-medium"
                      >
                        Nominal Dana (Rp){" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <RupiahAmountInput
                        id="ticket-aph-amount"
                        value={
                          watchedRequestedAmount === undefined
                            ? ""
                            : formatRupiahNumber(watchedRequestedAmount)
                        }
                        onChange={(value) => {
                          const amount = parseRupiahInput(value);
                          form.setValue(
                            "requestedAmount",
                            amount > 0 ? amount : undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                        required
                      />
                      {form.formState.errors.requestedAmount && (
                        <p className="type-p3 text-destructive" role="alert">
                          {form.formState.errors.requestedAmount.message}
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {requiresRecipientPayment && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        Data Penerima Pembayaran
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Keuangan menggunakan rekening ini sebagai tujuan
                        transfer.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-recipient"
                          className="type-p2 font-medium"
                        >
                          Nama Penerima{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="ticket-recipient"
                          autoComplete="name"
                          placeholder="Nama pemilik rekening"
                          aria-invalid={!!form.formState.errors.recipientName}
                          {...form.register("recipientName")}
                        />
                        {form.formState.errors.recipientName && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.recipientName.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-bank"
                          className="type-p2 font-medium"
                        >
                          Nama Bank <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="ticket-bank"
                          placeholder="Contoh: BRI / BSI"
                          aria-invalid={!!form.formState.errors.bankName}
                          {...form.register("bankName")}
                        />
                        {form.formState.errors.bankName && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.bankName.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-account-number"
                          className="type-p2 font-medium"
                        >
                          Nomor Rekening{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="ticket-account-number"
                          inputMode="numeric"
                          placeholder="6–30 digit angka"
                          aria-invalid={!!form.formState.errors.accountNumber}
                          {...form.register("accountNumber")}
                        />
                        {form.formState.errors.accountNumber && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.accountNumber.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-requested-amount"
                          className="type-p2 font-medium"
                        >
                          {fieldCategory === TicketFieldCategory.HAULING ||
                          fieldCategory === TicketFieldCategory.LABOR
                            ? "Total Biaya Borongan (Rp)"
                            : "Nominal Biaya (Rp)"}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        {(fieldCategory === TicketFieldCategory.HAULING ||
                          fieldCategory === TicketFieldCategory.LABOR) && (
                          <p className="type-p3 text-muted-foreground">
                            Isi satu total biaya borongan untuk pengajuan ini.
                          </p>
                        )}
                        <RupiahAmountInput
                          id="ticket-requested-amount"
                          value={
                            watchedRequestedAmount === undefined
                              ? ""
                              : formatRupiahNumber(watchedRequestedAmount)
                          }
                          onChange={(value) => {
                            const amount = parseRupiahInput(value);
                            form.setValue(
                              "requestedAmount",
                              amount > 0 ? amount : undefined,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                          required
                        />
                        {form.formState.errors.requestedAmount && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.requestedAmount.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {isOperationalFunding && (
                  <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                    <div>
                      <h3 className="type-h3 text-foreground">
                        Permintaan Dana Operasional
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        Pencairan otomatis menuju rekening yang terdaftar pada
                        Profil Anda.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-operational-request-type"
                        className="type-p2 font-medium"
                      >
                        Keperluan Dana
                      </Label>
                      <Controller
                        control={form.control}
                        name="operationalRequestType"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="ticket-operational-request-type"
                              className="h-10 w-full md:max-w-[calc(50%-0.5rem)]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GENERAL">
                                Dana Operasional
                              </SelectItem>
                              <SelectItem value="SURVEY">
                                Biaya Survei Lapangan
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    {operationalRequestType === "SURVEY" ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="ticket-survey-consumption"
                              className="type-p2 font-medium"
                            >
                              Biaya Konsumsi (Rp)
                            </Label>
                            <RupiahAmountInput
                              id="ticket-survey-consumption"
                              value={
                                watchedSurveyConsumptionAmount === undefined
                                  ? ""
                                  : formatRupiahNumber(
                                      watchedSurveyConsumptionAmount,
                                    )
                              }
                              onChange={(value) =>
                                form.setValue(
                                  "surveyConsumptionAmount",
                                  parseRupiahInput(value),
                                  { shouldDirty: true, shouldValidate: true },
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="ticket-survey-fuel"
                              className="type-p2 font-medium"
                            >
                              Biaya BBM (Rp)
                            </Label>
                            <RupiahAmountInput
                              id="ticket-survey-fuel"
                              value={
                                watchedSurveyFuelAmount === undefined
                                  ? ""
                                  : formatRupiahNumber(watchedSurveyFuelAmount)
                              }
                              onChange={(value) =>
                                form.setValue(
                                  "surveyFuelAmount",
                                  parseRupiahInput(value),
                                  { shouldDirty: true, shouldValidate: true },
                                )
                              }
                            />
                          </div>
                        </div>
                        {(form.formState.errors.surveyConsumptionAmount ||
                          form.formState.errors.surveyFuelAmount) && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.surveyConsumptionAmount
                              ?.message ??
                              form.formState.errors.surveyFuelAmount?.message}
                          </p>
                        )}
                        <p className="type-p2 text-right font-semibold text-foreground">
                          Total dana survei:{" "}
                          {formatCurrency(operationalRequestedAmount)}
                        </p>
                      </>
                    ) : (
                      <div className="space-y-1.5 md:max-w-[calc(50%-0.5rem)]">
                        <Label
                          htmlFor="ticket-operational-amount"
                          className="type-p2 font-medium"
                        >
                          Jumlah Dana Operasional (Rp){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <RupiahAmountInput
                          id="ticket-operational-amount"
                          value={
                            watchedOperationalAmount === undefined
                              ? ""
                              : formatRupiahNumber(watchedOperationalAmount)
                          }
                          onChange={(value) => {
                            const amount = parseRupiahInput(value);
                            form.setValue(
                              "operationalAmount",
                              amount > 0 ? amount : undefined,
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                          required
                        />
                        {form.formState.errors.operationalAmount && (
                          <p className="type-p3 text-destructive" role="alert">
                            {form.formState.errors.operationalAmount.message}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {!isAPHRequest &&
                  !isInternalFunding &&
                  !isShippingCostRequest &&
                  !isEquipmentRequest &&
                  !isRentalRequest &&
                  !requiresRecipientPayment &&
                  !isOperationalFunding && (
                    <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                      {usesItemDeliveryDates && (
                        <div
                          className={cn(
                            "grid items-end gap-3",
                            requestCategory === TicketRequestCategory.WAREHOUSE
                              ? "grid-cols-1"
                              : "grid-cols-1 sm:grid-cols-2",
                          )}
                        >
                          {requestCategory !==
                            TicketRequestCategory.WAREHOUSE && (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor="ticket-item-source"
                                className="type-p2 font-medium"
                              >
                                Sumber Barang
                              </Label>
                              <Controller
                                control={form.control}
                                name="itemSource"
                                render={({ field }) => (
                                  <Select
                                    value={field.value}
                                    onValueChange={(
                                      value: TicketCategoryHint,
                                    ) => {
                                      field.onChange(value);
                                      replace(
                                        (form.getValues("items") ?? []).map(
                                          (item) => ({
                                            ...item,
                                            stockItemId: "",
                                            itemName: "",
                                            unit: "",
                                            estimatedCost: undefined,
                                            categoryHint: value,
                                            materialContractId: "",
                                            expectedDeliveryDate: "",
                                          }),
                                        ),
                                      );
                                      if (
                                        value !== TicketCategoryHint.WAREHOUSE
                                      ) {
                                        form.setValue(
                                          "itemsExpectedDeliveryDate",
                                          "",
                                        );
                                      }
                                      form.clearErrors([
                                        "items",
                                        "itemsExpectedDeliveryDate",
                                      ]);
                                    }}
                                  >
                                    <SelectTrigger
                                      id="ticket-item-source"
                                      className="h-10 w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem
                                        value={TicketCategoryHint.CONTRACT}
                                      >
                                        Kontrak Material Alam
                                      </SelectItem>
                                      <SelectItem
                                        value={TicketCategoryHint.PURCHASE}
                                      >
                                        Pembelian Baru (Vendor)
                                      </SelectItem>
                                      <SelectItem
                                        value={TicketCategoryHint.WAREHOUSE}
                                      >
                                        Gudang (Stok)
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          )}

                          {(itemSource === TicketCategoryHint.WAREHOUSE ||
                            itemSource === TicketCategoryHint.CONTRACT) && (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor="ticket-items-delivery-date"
                                className="type-p2 font-medium"
                              >
                                {itemSource === TicketCategoryHint.CONTRACT
                                  ? "Target Tanggal Kirim (Opsional)"
                                  : "Tanggal Diperlukan *"}
                              </Label>
                              <Controller
                                control={form.control}
                                name="itemsExpectedDeliveryDate"
                                render={({ field }) => (
                                  <DatePicker
                                    id="ticket-items-delivery-date"
                                    value={field.value ?? ""}
                                    minDate={todayDateKey}
                                    clearable={
                                      itemSource === TicketCategoryHint.CONTRACT
                                    }
                                    onValueChange={(val) =>
                                      field.onChange(val)
                                    }
                                    placeholder="Pilih tanggal diperlukan"
                                  />
                                )}
                              />
                              {form.formState.errors
                                .itemsExpectedDeliveryDate && (
                                <p
                                  className="type-p3 text-destructive"
                                  role="alert"
                                >
                                  {
                                    form.formState.errors
                                      .itemsExpectedDeliveryDate.message
                                  }
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {itemSource === TicketCategoryHint.CONTRACT &&
                        materialContracts.length === 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                            <p className="type-p3 text-amber-900 dark:text-amber-200">
                              Belum ada kontrak payung material alam yang aktif.
                              Gunakan mode <strong>Pembelian Baru</strong> agar
                              permintaan tetap langsung diproses Logistik.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={switchMaterialSourceToPurchase}
                            >
                              Pakai Pembelian Baru
                            </Button>
                          </div>
                        )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="type-h3 text-foreground">
                          Rincian Item ({fields.length})
                        </h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            append(
                              createBlankItem(
                                itemSource ?? TicketCategoryHint.PURCHASE,
                              ),
                            )
                          }
                          disabled={fields.length >= 100}
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          Tambah Item
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {fields.map((fieldItem, index) => (
                          <MaterialItemRow
                            key={fieldItem.id}
                            index={index}
                            canRemove={index > 0}
                            itemSource={itemSource}
                            usesStockCatalog={usesStockCatalog}
                            materialContracts={materialContracts}
                            stockComboboxOptions={stockComboboxOptions}
                            contractComboboxOptions={contractComboboxOptions}
                            control={form.control}
                            register={form.register}
                            errors={form.formState.errors}
                            setValue={form.setValue}
                            clearErrors={form.clearErrors}
                            onRemove={remove}
                            watchedQuantity={watchedItems?.[index]?.quantity}
                            watchedMaterialContractId={
                              watchedItems?.[index]?.materialContractId
                            }
                          />
                        ))}
                      </div>

                      {itemSource === TicketCategoryHint.CONTRACT &&
                        materialContracts.length > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5">
                            <span className="type-p3 text-sky-900 dark:text-sky-200">
                              Menggunakan Kontrak Payung vendor tanpa PO baru.
                            </span>
                            {contractEstimatedTotal > 0 && (
                              <span className="type-p2 font-bold text-foreground tabular-nums">
                                Estimasi: {formatCurrency(contractEstimatedTotal)}
                              </span>
                            )}
                          </div>
                        )}

                      {(form.formState.errors.items?.root?.message ||
                        form.formState.errors.items?.message) && (
                        <p className="type-p3 text-destructive" role="alert">
                          {form.formState.errors.items.root?.message ||
                            form.formState.errors.items.message}
                        </p>
                      )}
                    </section>
                  )}
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="type-h3 text-foreground">
                    Prioritas &amp; Target Waktu
                  </h3>
                  <p className="type-p3 text-muted-foreground">
                    Tentukan urgensi dan konfirmasi ringkasan sebelum
                    dikirimkan.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="type-p2 font-medium">
                    Tingkat Prioritas
                  </Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
                        aria-label="Tingkat Prioritas"
                      >
                        <Label
                          htmlFor="priority-non-urgent"
                          className={cn(
                            "flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 transition-all",
                            field.value === "NON_URGENT"
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30"
                              : "border-border hover:border-primary/40",
                          )}
                        >
                          <RadioGroupItem
                            id="priority-non-urgent"
                            value="NON_URGENT"
                            className="mt-0.5"
                          />
                          <div>
                            <span className="type-p2 block font-semibold">
                              Standar
                            </span>
                            <span className="type-p3 block text-muted-foreground">
                              Kebutuhan terjadwal normal
                            </span>
                          </div>
                        </Label>

                        <Label
                          htmlFor="priority-urgent"
                          className={cn(
                            "flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 transition-all",
                            field.value === "URGENT"
                              ? "border-amber-500 bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30"
                              : "border-border hover:border-primary/40",
                          )}
                        >
                          <RadioGroupItem
                            id="priority-urgent"
                            value="URGENT"
                            className="mt-0.5"
                          />
                          <div>
                            <span className="type-p2 block font-semibold">
                              Urgent
                            </span>
                            <span className="type-p3 block text-muted-foreground">
                              Perlu diproses hari ini
                            </span>
                          </div>
                        </Label>

                        <Label
                          htmlFor="priority-emergency"
                          className={cn(
                            "flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 transition-all",
                            field.value === "EMERGENCY"
                              ? "border-rose-500 bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/30"
                              : "border-border hover:border-primary/40",
                          )}
                        >
                          <RadioGroupItem
                            id="priority-emergency"
                            value="EMERGENCY"
                            className="mt-0.5"
                          />
                          <div>
                            <span className="type-p2 block font-semibold">
                              Emergency
                            </span>
                            <span className="type-p3 block text-muted-foreground">
                              Kondisi kritis lapangan
                            </span>
                          </div>
                        </Label>
                      </RadioGroup>
                    )}
                  />
                </div>

                {!usesItemDeliveryDates &&
                  !isAPHRequest &&
                  !isInternalFunding &&
                  !isEquipmentRequest &&
                  !isRentalRequest && (
                    <div className="space-y-1.5 md:max-w-[calc(50%-0.5rem)]">
                      <Label
                        htmlFor="ticket-needed-date"
                        className="type-p2 font-medium"
                      >
                        Tanggal Dibutuhkan{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Controller
                        control={form.control}
                        name="neededDate"
                        render={({ field }) => (
                          <DatePicker
                            id="ticket-needed-date"
                            value={field.value ?? ""}
                            minDate={todayDateKey}
                            onValueChange={field.onChange}
                            placeholder="Pilih tanggal target kebutuhan"
                          />
                        )}
                      />
                      {form.formState.errors.neededDate && (
                        <p className="type-p3 text-destructive" role="alert">
                          {form.formState.errors.neededDate.message}
                        </p>
                      )}
                    </div>
                  )}

                <div className="rounded-xl border border-border bg-card p-3.5">
                  <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
                    Ringkasan Pengajuan
                  </p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="type-p3 text-muted-foreground">
                        Jenis Permintaan
                      </dt>
                      <dd className="type-p2 font-semibold text-foreground">
                        {requestCategoryLabels[requestCategory]}
                      </dd>
                    </div>
                    <div>
                      <dt className="type-p3 text-muted-foreground">Proyek</dt>
                      <dd className="type-p2 font-semibold text-foreground">
                        {selectedProjectLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="type-p3 text-muted-foreground">
                        Prioritas
                      </dt>
                      <dd className="type-p2 font-semibold text-foreground">
                        {watchedPriority === "EMERGENCY"
                          ? "Emergency"
                          : watchedPriority === "URGENT"
                            ? "Urgent"
                            : "Standar"}
                      </dd>
                    </div>
                    <div>
                      <dt className="type-p3 text-muted-foreground">
                        Target / Rincian
                      </dt>
                      <dd className="type-p2 font-semibold text-foreground">
                        {isMaterialOrWarehouse
                          ? `${fields.length} item (${itemSource === TicketCategoryHint.CONTRACT ? "Kontrak Alam" : itemSource === TicketCategoryHint.WAREHOUSE ? "Gudang" : "Pembelian Baru"})`
                          : isRentalRequest
                            ? formatCurrency(watchedRequestedAmount ?? 0)
                            : watchedNeededDate || "Sesuai jadwal"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </fieldset>
        </form>
      </GlobalModal>
    </>
  );
}
