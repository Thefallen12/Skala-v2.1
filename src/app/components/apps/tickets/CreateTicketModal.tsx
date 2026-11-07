"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, startOfDay } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarDays, Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  TicketCategoryHint,
  TicketFieldCategory,
  TicketPriority,
  TicketRequestCategory,
  TicketType,
  UserRole,
  POPaymentMethod,
} from "@prisma/client";
import type { TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import {
  createTicket,
  getShippingDocumentOptions,
} from "@/app/actions/tickets";
import type { ShippingDocumentOptions } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Calendar } from "@/components/ui/calendar";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatRupiahNumber, parseRupiahInput } from "@/lib/indonesian-currency";

const requestCategories = Object.values(TicketRequestCategory);
const fieldCategories = Object.values(TicketFieldCategory).filter(
  (category) => category !== TicketFieldCategory.DIRECT_STORE,
);
const itemCategoryHints = Object.values(TicketCategoryHint);
const priorities = ["NON_URGENT", "URGENT", "EMERGENCY"] as const;

const requestCategoryLabels: Record<TicketRequestCategory, string> = {
  OPS: "Operasional (OPS)",
  MATERIAL: "Belanja Material",
  WAREHOUSE: "Permintaan Material dari Gudang",
  OFFICE: "Belanja Kantor",
  FIELD: "Belanja Kebutuhan Tim Lapangan",
  APH: "APH",
  REIMBURSEMENT: "Reimbursement",
  KASBON: "Kasbon / Ambilan",
  OPERATING_EXPENSE: "Biaya Operasional",
  SHIPPING_COST: "Biaya Pengiriman",
};

const internalFundingCategories = [
  TicketRequestCategory.REIMBURSEMENT,
  TicketRequestCategory.KASBON,
  TicketRequestCategory.OPERATING_EXPENSE,
] as const;

const isInternalFundingCategory = (
  category: TicketRequestCategory,
): category is (typeof internalFundingCategories)[number] =>
  internalFundingCategories.some((value) => value === category);

const fieldCategoryLabels: Record<TicketFieldCategory, string> = {
  HAULING: "Biaya Langsir",
  LABOR: "Upah Tukang",
  DIRECT_STORE: "Belanja Langsung Ketoko",
};

const ticketFormSchema = z
  .object({
    projectId: z.string(),
    moverAssigneeId: z.string().optional(),
    requestCategory: z.enum(requestCategories),
    fieldCategory: z.enum(fieldCategories).optional(),
    priority: z.enum(priorities),
    neededDate: z.date().optional(),
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
    originCity: z.string(),
    destinationCity: z.string(),
    relatedDocumentNumbers: z.string(),
    receiptFiles: z.array(z.instanceof(File)).max(5),
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
  })
  .superRefine((values, context) => {
    const projectLinkedRequest =
      values.requestCategory === TicketRequestCategory.MATERIAL ||
      values.requestCategory === TicketRequestCategory.WAREHOUSE ||
      values.requestCategory === TicketRequestCategory.FIELD;
    const isAPHRequest = values.requestCategory === TicketRequestCategory.APH;
    const isInternalFunding = isInternalFundingCategory(values.requestCategory);
    const isShippingCostRequest =
      values.requestCategory === TicketRequestCategory.SHIPPING_COST;
    if (projectLinkedRequest && !values.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Pilih proyek agar biaya dan pengiriman material dapat dilacak.",
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
      (!values.neededDate || Number.isNaN(values.neededDate.getTime()))
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
          !/^\d{4}-\d{2}-\d{2}$/.test(values.itemsExpectedDeliveryDate) ||
          (() => {
            const parsedDate = new Date(
              `${values.itemsExpectedDeliveryDate}T00:00:00.000Z`,
            );
            return (
              Number.isNaN(parsedDate.getTime()) ||
              parsedDate.toISOString().slice(0, 10) !==
                values.itemsExpectedDeliveryDate
            );
          })())
      ) {
        context.addIssue({
          code: "custom",
          path: ["itemsExpectedDeliveryDate"],
          message: "Tanggal diperlukan wajib diisi untuk permintaan barang gudang.",
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
      });
    }
    if (values.requestCategory === "FIELD" && !values.fieldCategory) {
      context.addIssue({
        code: "custom",
        path: ["fieldCategory"],
        message: "Pilih jenis kebutuhan lapangan.",
      });
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
          message: "Unggah minimal satu struk atau nota asli untuk reimbursement.",
        });
      }
      if (values.items.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Pengajuan internal tidak menggunakan rincian barang.",
        });
      }
    }
    if (isShippingCostRequest) {
      if (!values.originCity.trim() || values.originCity.trim().length > 120) {
        context.addIssue({
          code: "custom",
          path: ["originCity"],
          message: "Kota asal wajib diisi (maksimal 120 karakter).",
        });
      }
      if (
        !values.destinationCity.trim() ||
        values.destinationCity.trim().length > 120
      ) {
        context.addIssue({
          code: "custom",
          path: ["destinationCity"],
          message: "Kota tujuan wajib diisi (maksimal 120 karakter).",
        });
      }
      if (values.requestedAmount === undefined) {
        context.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: "Nominal biaya pengiriman harus lebih besar dari 0.",
        });
      }
      if (values.relatedDocumentNumbers.trim().length > 2000) {
        context.addIssue({
          code: "custom",
          path: ["relatedDocumentNumbers"],
          message: "Daftar dokumen terkait terlalu panjang.",
        });
      }
      if (values.items.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Permintaan biaya pengiriman tidak menggunakan rincian barang.",
        });
      }
    }
    const requiresRecipientPayment =
      values.requestCategory === TicketRequestCategory.FIELD &&
      values.fieldCategory !== undefined;
    const isOperationalFunding =
      values.requestCategory === TicketRequestCategory.OPS;
    if (requiresRecipientPayment) {
      if (!values.recipientName?.trim() || values.recipientName.trim().length > 120) {
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
      if (!values.accountNumber || !/^[0-9]{6,30}$/.test(values.accountNumber.trim())) {
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
    } else if (isAPHRequest || isInternalFunding || isShippingCostRequest) {
      if (values.items.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Permintaan dana APH tidak menggunakan rincian item.",
        });
      }
    } else {
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

const getRequestTypeOptions = (
  role?: UserRole,
  selectedProjectId?: string,
): { label: string; value: TicketRequestCategory }[] => {
  const options: { label: string; value: TicketRequestCategory }[] = [
    {
      label: "Operasional (OPS)",
      value: TicketRequestCategory.OPS,
    },
  ];

  if (selectedProjectId) {
    options.push(
      role === UserRole.FIELD_TEAM
        ? {
            label: requestCategoryLabels[TicketRequestCategory.WAREHOUSE],
            value: TicketRequestCategory.WAREHOUSE,
          }
        : {
            label: "Permintaan Material",
            value: TicketRequestCategory.MATERIAL,
          },
    );
  }

  if (
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DRAFTER ||
    role === UserRole.FINANCE
  ) {
    options.push({
      label: "Belanja Kantor",
      value: TicketRequestCategory.OFFICE,
    });
  }

  if (role === UserRole.LOGISTICS || role === UserRole.DIRECTOR) {
    options.push({
      label: "Biaya Pengiriman (Ekspedisi/Mover)",
      value: TicketRequestCategory.SHIPPING_COST,
    });
  }

  if (role === UserRole.DIRECTOR || role === UserRole.FINANCE) {
    options.push({
      label: requestCategoryLabels[TicketRequestCategory.APH],
      value: TicketRequestCategory.APH,
    });
  }

  if (
    role === UserRole.DRAFTER ||
    role === UserRole.FIELD_TEAM ||
    role === UserRole.MOVER
  ) {
    options.push(
      ...internalFundingCategories
        .filter(
          (category) =>
            role === UserRole.DRAFTER ||
            (role === UserRole.FIELD_TEAM &&
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

export default function CreateTicketModal({
  projects,
  stockItems = [],
  requesterRole,
  movers = [],
  triggerLabel = "Tambah Tiket Baru",
  initialWageRequest,
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
  initialWageRequest?: {
    projectId: string;
    projectTitle: string;
    workPointTitle: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [requestedAmountEdit, setRequestedAmountEdit] = useState<string | null>(
    null,
  );
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptUploadError, setReceiptUploadError] = useState("");
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [shippingDocumentOptions, setShippingDocumentOptions] = useState<
    ShippingDocumentOptions | null
  >(null);
  const [shippingDocumentsLoaded, setShippingDocumentsLoaded] =
    useState(false);
  const [shippingDocumentsAttempt, setShippingDocumentsAttempt] = useState(0);
  const [shippingDocumentsError, setShippingDocumentsError] = useState("");
  const [selectedShippingDocumentKeys, setSelectedShippingDocumentKeys] =
    useState<string[]>([]);
  const router = useRouter();
  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      projectId: initialWageRequest?.projectId ?? "",
      moverAssigneeId: "",
      requestCategory: initialWageRequest
        ? TicketRequestCategory.FIELD
        : TicketRequestCategory.OPS,
      fieldCategory: initialWageRequest
        ? TicketFieldCategory.LABOR
        : undefined,
      priority: "NON_URGENT",
      neededDate: undefined,
      itemSource: TicketCategoryHint.WAREHOUSE,
      itemsExpectedDeliveryDate: "",
      items: [{
        stockItemId: "",
        itemName: "",
        unit: "",
        quantity: 1,
        estimatedCost: undefined,
        categoryHint: TicketCategoryHint.WAREHOUSE,
        expectedDeliveryDate: "",
      }],
      recipientName: "",
      bankName: "",
      accountNumber: "",
      requestPaymentMethod: POPaymentMethod.CASH,
      transferDestination: "",
      requestPaymentDescription: "",
      originCity: "",
      destinationCity: "",
      relatedDocumentNumbers: "",
      receiptFiles: [],
      operationalRequestType: "GENERAL",
      operationalAmount: undefined,
      surveyConsumptionAmount: 0,
      surveyFuelAmount: 0,
      requestedAmount: undefined,
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
  const selectedRequestType = useWatch({
    control: form.control,
    name: "requestCategory",
  });
  const requestCategory = selectedRequestType;
  const requestTypeOptions = useMemo(
    () => getRequestTypeOptions(requesterRole, selectedProjectId),
    [requesterRole, selectedProjectId],
  );
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
  useEffect(() => {
    if (
      requestTypeOptions.some((option) => option.value === requestCategory)
    ) {
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
      form.setValue(
        "items",
        [
          {
            stockItemId: "",
            itemName: "",
            unit: "",
            quantity: 1,
            estimatedCost: undefined,
            categoryHint:
              nextRequestCategory === TicketRequestCategory.WAREHOUSE
                ? TicketCategoryHint.WAREHOUSE
                : TicketCategoryHint.PURCHASE,
            expectedDeliveryDate: "",
          },
        ],
        { shouldValidate: true },
      );
      form.setValue(
        "itemSource",
        nextRequestCategory === TicketRequestCategory.WAREHOUSE
          ? TicketCategoryHint.WAREHOUSE
          : TicketCategoryHint.PURCHASE,
      );
      form.setValue("itemsExpectedDeliveryDate", "");
    } else {
      form.setValue("items", [], { shouldValidate: true });
    }
    form.clearErrors(["fieldCategory", "items"]);
  }, [form, requestCategory, requestTypeOptions]);
  const requiresRecipientPayment =
    requestCategory === TicketRequestCategory.FIELD &&
    fieldCategory !== undefined;
  const isOperationalFunding =
    requestCategory === TicketRequestCategory.OPS;
  const isAPHRequest = requestCategory === TicketRequestCategory.APH;
  const isInternalFunding = isInternalFundingCategory(requestCategory);
  const isShippingCostRequest =
    requestCategory === TicketRequestCategory.SHIPPING_COST;
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
            "PO dan tiket tidak dapat dimuat. Muat ulang daftar dokumen untuk mencoba lagi.",
          );
          setShippingDocumentsLoaded(true);
        }
      })

    return () => {
      active = false;
    };
  }, [open, isShippingCostRequest, shippingDocumentsAttempt]);

  const updateSelectedShippingDocuments = (nextKeys: string[]) => {
    setSelectedShippingDocumentKeys(nextKeys);
    const selectedNumbers = nextKeys.flatMap((key) => {
      const [kind, id] = key.split(":", 2);
      if (kind === "PO") {
        const order = shippingDocumentOptions?.purchaseOrders.find(
          (option) => option.id === id,
        );
        return order ? [order.poNumber] : [];
      }
      const ticket = shippingDocumentOptions?.tickets.find(
        (option) => option.id === id,
      );
      return ticket ? [ticket.ticketNumber] : [];
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
      title: "Purchase Order (PO)",
      options: (shippingDocumentOptions?.purchaseOrders ?? []).map(
        (option) => ({
          id: option.id,
          number: option.poNumber,
          detail: option.vendorName,
        }),
      ),
    },
    {
      key: "TICKET",
      title: "Tiket Permintaan Material",
      options: (shippingDocumentOptions?.tickets ?? []).map((option) => ({
        id: option.id,
        number: option.ticketNumber,
        detail: option.title,
      })),
    },
  ] as const;
  const requiresFundingRequest =
    requiresRecipientPayment ||
    isOperationalFunding ||
    isAPHRequest ||
    isInternalFunding ||
    isShippingCostRequest;
  const operationalRequestedAmount =
    operationalRequestType === "SURVEY"
      ? (watchedSurveyConsumptionAmount ?? 0) + (watchedSurveyFuelAmount ?? 0)
      : watchedOperationalAmount ?? 0;
  const itemSource = useWatch({ control: form.control, name: "itemSource" });
  const itemsExpectedDeliveryDate = useWatch({
    control: form.control,
    name: "itemsExpectedDeliveryDate",
  });
  const usesItemDeliveryDates =
    requestCategory === TicketRequestCategory.MATERIAL ||
    requestCategory === TicketRequestCategory.WAREHOUSE;
  const usesStockCatalog =
    usesItemDeliveryDates && itemSource === TicketCategoryHint.WAREHOUSE;
  const submit = form.handleSubmit(async (values) => {
    setError("");
    if (
      !usesItemDeliveryDates &&
      !isAPHRequest &&
      !isInternalFunding &&
      !values.neededDate
    ) {
      setError("Pilih tanggal perlu dibayarkan/disediakan terlebih dahulu.");
      return;
    }
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
    const title = isOperationalFunding
      ? `Operasional: ${operationalRequestLabel}`
      : isAPHRequest
        ? "Permintaan APH"
      : isInternalFunding
        ? `${categoryLabel}: ${values.requestPaymentDescription?.trim()}`.slice(0, 160)
      : isShippingCostRequest
        ? `${categoryLabel}: ${values.originCity.trim()} ke ${values.destinationCity.trim()}`.slice(0, 160)
      : requiresRecipientPayment
      ? `${subCategoryLabel}: ${values.recipientName?.trim()}`.slice(0, 160)
      : `${categoryLabel}: ${firstItemName}`.slice(0, 160);
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
      isShippingCostRequest
        ? `Rute pengiriman: ${values.originCity.trim()} ke ${values.destinationCity.trim()}`
        : null,
      isShippingCostRequest
        ? `Nominal biaya pengiriman: ${formatCurrency(values.requestedAmount ?? 0)}`
        : null,
      isShippingCostRequest && values.relatedDocumentNumbers.trim()
        ? `Dokumen terkait: ${values.relatedDocumentNumbers
            .split(",")
            .map((number) => number.trim())
            .filter(Boolean)
            .join(", ")}`
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
        ? `Tanggal perlu dibayarkan/disediakan: ${format(values.neededDate, "yyyy-MM-dd")}`
        : null,
      values.itemSource === TicketCategoryHint.WAREHOUSE &&
      values.itemsExpectedDeliveryDate
        ? `Tanggal diperlukan untuk seluruh barang gudang: ${values.itemsExpectedDeliveryDate}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const ticketType =
      values.requestCategory === "OPS"
        ? TicketType.OPERATIONAL
        : values.requestCategory === "MATERIAL" ||
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
      const result = await createTicket({
        title,
        description,
        type: ticketType,
        requestCategory: values.requestCategory,
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
        originCity: isShippingCostRequest ? values.originCity : undefined,
        destinationCity: isShippingCostRequest
          ? values.destinationCity
          : undefined,
        relatedDocumentNumbers: isShippingCostRequest
          ? values.relatedDocumentNumbers
          : undefined,
        priority,
        projectId: values.projectId || undefined,
        moverAssigneeId: undefined,
        recipientName: requiresRecipientPayment
          ? values.recipientName
          : undefined,
        bankName: requiresRecipientPayment ? values.bankName : undefined,
        accountNumber: requiresRecipientPayment
          ? values.accountNumber
          : undefined,
        requestedAmount: requiresRecipientPayment
          ? values.requestedAmount
          : isOperationalFunding
            ? operationalAmount
            : isAPHRequest || isInternalFunding || isShippingCostRequest
              ? values.requestedAmount
              : undefined,
        receiptFiles: isInternalFunding ? values.receiptFiles : [],
        items: requiresFundingRequest
          ? []
          : values.items.map((item) => ({
              ...(item.stockItemId
                ? { stockItemId: item.stockItemId }
                : {}),
              itemName: item.itemName ?? "",
              quantity: item.quantity ?? 0,
              unit: item.unit ?? "",
              estimatedCost: undefined,
              categoryHint: values.itemSource,
              expectedDeliveryDate:
                values.itemSource === TicketCategoryHint.WAREHOUSE
                  ? values.itemsExpectedDeliveryDate
                  : undefined,
          })),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setOpen(false);
      form.reset();
      setReceiptFiles([]);
      setSelectedShippingDocumentKeys([]);
      setReceiptUploadError("");
      setRequestedAmountEdit(null);
      router.refresh();
    } catch (submitError) {
      console.error("Ticket form submission failed:", submitError);
      setError("Tiket gagal disimpan. Periksa koneksi lalu coba kembali.");
    }
  }, (invalidFields) => {
    const messages = [
      invalidFields.neededDate?.message,
      invalidFields.projectId?.message,
      invalidFields.requestCategory?.message,
      invalidFields.fieldCategory?.message,
      invalidFields.recipientName?.message,
      invalidFields.bankName?.message,
      invalidFields.accountNumber?.message,
      invalidFields.requestedAmount?.message,
      invalidFields.itemsExpectedDeliveryDate?.message,
      invalidFields.items?.root?.message,
      invalidFields.items?.message,
      ...(Array.isArray(invalidFields.items)
        ? invalidFields.items.flatMap((item) => [
            item?.stockItemId?.message,
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
        ? `Tiket belum dikirim: ${messages.join(" ")}`
        : "Tiket belum dikirim. Periksa data wajib yang ditandai, lalu coba lagi.",
    );
  });

  return (
    <>
        <Button
          type="button"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
          {triggerLabel}
        </Button>
      <GlobalModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Tambah tiket ERP"
        description="Isi proyek, jenis permintaan, data penerima atau rincian item, prioritas, dan tanggal kebutuhan."
        className="ticket-create-modal max-w-4xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={form.formState.isSubmitting}
            >
              Batal
            </Button>
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
                "Simpan draft"
              )}
            </Button>
          </>
        }
      >
        {error && (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        <form id="ticket-form" onSubmit={submit} className="ticket-create-form space-y-5">
          <fieldset
            disabled={form.formState.isSubmitting}
            className="contents"
          >
          <div className="ticket-create-top-fields grid gap-4 md:grid-cols-2">
            <div className="ticket-project-field space-y-2">
              <Label htmlFor="ticket-project">Pilih Proyek</Label>
              <Controller
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <Select
                    value={field.value || "none"}
                    onValueChange={(value) =>
                      field.onChange(value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      id="ticket-project"
                      className="w-full"
                      aria-invalid={!!form.formState.errors.projectId}
                    >
                      <SelectValue placeholder="Pilih proyek" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {requestCategory === TicketRequestCategory.MATERIAL ||
                        requestCategory === TicketRequestCategory.WAREHOUSE ||
                        requestCategory === TicketRequestCategory.FIELD
                          ? "Pilih proyek"
                          : "Tidak terkait proyek"}
                      </SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.kelompokTani} - {project.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.projectId && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.projectId.message}
                </p>
              )}
            </div>
            <div className="ticket-request-field space-y-2">
              <Label htmlFor="ticket-request-category">Jenis Permintaan</Label>
              <Controller
                control={form.control}
                name="requestCategory"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== TicketRequestCategory.REIMBURSEMENT) {
                        setReceiptUploadError("");
                        setReceiptFiles([]);
                        form.setValue("receiptFiles", [], {
                          shouldValidate: true,
                        });
                      }
                      if (value !== TicketRequestCategory.SHIPPING_COST) {
                        setSelectedShippingDocumentKeys([]);
                        form.setValue("relatedDocumentNumbers", "");
                      }
                      if (value !== "FIELD") {
                        form.setValue("fieldCategory", undefined);
                        form.clearErrors("fieldCategory");
                      }
                      if (value === TicketRequestCategory.WAREHOUSE) {
                        form.setValue(
                          "itemSource",
                          TicketCategoryHint.WAREHOUSE,
                        );
                        form.setValue("itemsExpectedDeliveryDate", "");
                        form.setValue(
                          "items",
                          [{
                            stockItemId: "",
                            itemName: "",
                            unit: "",
                            quantity: 1,
                            estimatedCost: undefined,
                            categoryHint: TicketCategoryHint.WAREHOUSE,
                            expectedDeliveryDate: "",
                          }],
                          { shouldValidate: true },
                        );
                      }
                      if (
                        value === TicketRequestCategory.APH ||
                        value === TicketRequestCategory.SHIPPING_COST
                      ) {
                        form.setValue(
                          "items",
                          [],
                          { shouldValidate: true },
                        );
                      } else if (
                        internalFundingCategories.some(
                          (category) => category === value,
                        )
                      ) {
                        form.setValue("items", [], { shouldValidate: true });
                      } else if (
                        requestCategory === TicketRequestCategory.APH ||
                        isInternalFundingCategory(requestCategory) ||
                        requestCategory === TicketRequestCategory.SHIPPING_COST
                      ) {
                        form.setValue(
                          "itemSource",
                          TicketCategoryHint.PURCHASE,
                        );
                        form.setValue("itemsExpectedDeliveryDate", "");
                        form.setValue(
                          "items",
                          [{
                            stockItemId: "",
                            itemName: "",
                            unit: "",
                            quantity: 1,
                            estimatedCost: undefined,
                            categoryHint: TicketCategoryHint.PURCHASE,
                            expectedDeliveryDate: "",
                          }],
                          { shouldValidate: true },
                        );
                      }
                    }}
                  >
                    <SelectTrigger
                      id="ticket-request-category"
                      className="w-full"
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
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.requestCategory.message}
                </p>
              )}
            </div>

            {isShippingCostRequest && (
              <section className="space-y-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 md:col-span-2">
                <div>
                  <h3 className="font-semibold">Detail Biaya Pengiriman</h3>
                  <p className="text-sm text-muted-foreground">
                    Isi rute dan nominal biaya ekspedisi atau mover. Dokumen
                    terkait dapat dikosongkan.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ticket-shipping-origin">Dari Kota (Asal)</Label>
                    <Input
                      id="ticket-shipping-origin"
                      maxLength={120}
                      placeholder="Contoh: Medan"
                      aria-invalid={!!form.formState.errors.originCity}
                      {...form.register("originCity")}
                    />
                    {form.formState.errors.originCity && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.originCity.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-shipping-destination">
                      Ke Kota (Tujuan)
                    </Label>
                    <Input
                      id="ticket-shipping-destination"
                      maxLength={120}
                      placeholder="Contoh: Takengon"
                      aria-invalid={!!form.formState.errors.destinationCity}
                      {...form.register("destinationCity")}
                    />
                    {form.formState.errors.destinationCity && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.destinationCity.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-shipping-amount">
                      Nominal Biaya (Rp)
                    </Label>
                    <RupiahAmountInput
                      id="ticket-shipping-amount"
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
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.requestedAmount.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Pilih PO / Tiket Belanja Terkait (Opsional)
                    </Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {shippingDocumentGroups.map((group) => (
                        <fieldset
                          key={group.key}
                          className="min-w-0 space-y-2 rounded-md border p-3"
                          disabled={shippingDocumentsLoading}
                        >
                          <legend className="px-1 text-sm font-medium">
                            {group.title}
                          </legend>
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {group.options.length === 0 ? (
                              <p className="py-2 text-xs text-muted-foreground">
                                Belum ada {group.key === "PO" ? "PO" : "tiket"}.
                              </p>
                            ) : (
                              group.options.map((option) => {
                                const key = `${group.key}:${option.id}`;
                                return (
                                  <label
                                    key={key}
                                    htmlFor={`shipping-document-${key}`}
                                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/60"
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
                                    <span className="min-w-0 text-xs">
                                      <span className="block font-medium">
                                        {option.number}
                                      </span>
                                      <span className="block truncate text-muted-foreground">
                                        {option.detail}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pilih satu atau beberapa PO maupun tiket belanja
                      material.
                    </p>
                    {shippingDocumentsLoading && (
                      <p className="text-xs text-muted-foreground" role="status">
                        Memuat daftar PO dan tiket...
                      </p>
                    )}
                    {shippingDocumentsError && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-destructive" role="alert">
                          {shippingDocumentsError}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShippingDocumentsError("");
                            setShippingDocumentsLoaded(false);
                            setShippingDocumentsAttempt((attempt) => attempt + 1);
                          }}
                        >
                          Muat ulang
                        </Button>
                      </div>
                    )}
                    {form.formState.errors.relatedDocumentNumbers && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.relatedDocumentNumbers.message}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {isInternalFunding && (
              <section className="space-y-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 md:col-span-2">
                <div>
                  <h3 className="font-semibold">
                    Pengajuan {requestCategoryLabels[requestCategory]}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Pengajuan akan masuk ke Direktur untuk persetujuan, lalu
                    diteruskan ke Keuangan untuk pembayaran.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ticket-internal-amount">
                      Nominal Pengajuan (Rp)
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
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.requestedAmount.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-internal-description">
                      Keterangan / Rincian
                    </Label>
                    <Textarea
                      id="ticket-internal-description"
                      maxLength={5000}
                      rows={3}
                      placeholder="Jelaskan rincian pengeluaran, tanggal, atau keperluan dana"
                      {...form.register("requestPaymentDescription")}
                    />
                    {form.formState.errors.requestPaymentDescription && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.requestPaymentDescription.message}
                      </p>
                    )}
                  </div>
                </div>
                {requestCategory === TicketRequestCategory.REIMBURSEMENT && (
                  <div className="space-y-2">
                    <Label>Unggah Struk / Nota Asli (wajib)</Label>
                    <Input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      multiple
                      disabled={receiptFiles.length >= 5}
                      onChange={(event) => {
                        const selected = Array.from(event.currentTarget.files ?? []);
                        const invalid = selected.find(
                          (file) =>
                            file.size < 1 ||
                            file.size > 10 * 1024 * 1024 ||
                            ![
                              "application/pdf",
                              "image/jpeg",
                              "image/png",
                              "image/webp",
                            ].includes(file.type),
                        );
                        if (invalid) {
                          setReceiptUploadError(
                            "Pilih file PDF, JPG, PNG, atau WEBP maksimal 10 MB.",
                          );
                        } else {
                          const next = [...receiptFiles, ...selected].slice(0, 5);
                          setReceiptFiles(next);
                          form.setValue("receiptFiles", next, {
                            shouldValidate: true,
                          });
                          setReceiptUploadError("");
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      File tetap lokal sampai Kirim Pengajuan ditekan; maksimal 5 file.
                    </p>
                    {receiptUploadError && (
                      <p className="text-sm text-destructive" role="alert">
                        {receiptUploadError}
                      </p>
                    )}
                    {form.formState.errors.receiptFiles && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.receiptFiles.message}
                      </p>
                    )}
                    {receiptFiles.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {receiptFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${file.lastModified}-${file.size}`}
                            className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"
                          >
                            <span className="min-w-0 truncate">{file.name}</span>
                            <button
                              type="button"
                              className="shrink-0 py-1 text-destructive"
                              onClick={() => {
                                const next = receiptFiles.filter(
                                  (_, fileIndex) => fileIndex !== index,
                                );
                                setReceiptFiles(next);
                                form.setValue("receiptFiles", next, {
                                  shouldValidate: true,
                                });
                              }}
                            >
                              Hapus bukti
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {receiptFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Reimbursement wajib memiliki minimal satu struk atau nota.
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {requestCategory === "FIELD" && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ticket-field-category">Kebutuhan Lapangan</Label>
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
                        className="w-full md:max-w-[calc(50%-0.5rem)]"
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
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.fieldCategory.message}
                  </p>
                )}
              </div>
            )}

          </div>

          {isAPHRequest && (
            <section className="space-y-4 rounded-md border p-4">
              <div>
                <h3 className="font-semibold">Detail Permintaan APH</h3>
                <p className="text-sm text-muted-foreground">
                  Permintaan akan diteruskan ke Keuangan setelah diajukan.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Type pembayaran</Label>
                <Controller
                  control={form.control}
                  name="requestPaymentMethod"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex flex-wrap gap-4"
                      aria-label="Type pembayaran APH"
                    >
                      <Label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                        <RadioGroupItem value={POPaymentMethod.CASH} />
                        Cash
                      </Label>
                      <Label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                        <RadioGroupItem value={POPaymentMethod.TRANSFER} />
                        Transfer
                      </Label>
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.requestPaymentMethod && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.requestPaymentMethod.message}
                  </p>
                )}
              </div>
              {watchedRequestPaymentMethod === POPaymentMethod.TRANSFER && (
                <div className="space-y-2">
                  <Label htmlFor="ticket-aph-transfer-destination">
                    Tujuan transfer
                  </Label>
                  <Input
                    id="ticket-aph-transfer-destination"
                    maxLength={300}
                    placeholder="Nama penerima, bank, atau nomor rekening"
                    aria-invalid={!!form.formState.errors.transferDestination}
                    {...form.register("transferDestination")}
                  />
                  {form.formState.errors.transferDestination && (
                    <p className="text-sm text-destructive" role="alert">
                      {form.formState.errors.transferDestination.message}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ticket-aph-description">Keterangan</Label>
                <Textarea
                  id="ticket-aph-description"
                  maxLength={2000}
                  rows={3}
                  placeholder="Jelaskan keperluan permintaan APH"
                  aria-invalid={
                    !!form.formState.errors.requestPaymentDescription
                  }
                  {...form.register("requestPaymentDescription")}
                />
                {form.formState.errors.requestPaymentDescription && (
                  <p className="text-sm text-destructive" role="alert">
                    {
                      form.formState.errors.requestPaymentDescription.message
                    }
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-aph-amount">Jumlah dana yang diminta</Label>
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
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.requestedAmount.message}
                  </p>
                )}
              </div>
            </section>
          )}

          {!isAPHRequest && !isInternalFunding && !isShippingCostRequest && <section className="space-y-3">
            {requiresRecipientPayment ? (
              <div className="mb-3 space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">Data Penerima Pembayaran</h3>
                  <p className="text-sm text-muted-foreground">
                    Permintaan biaya lapangan tidak memerlukan rincian material.
                    Keuangan akan menggunakan data ini sebagai tujuan transfer.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ticket-recipient">Nama Penerima</Label>
                    <Input
                      id="ticket-recipient"
                      autoComplete="name"
                      placeholder="Nama pemilik rekening"
                      aria-invalid={!!form.formState.errors.recipientName}
                      {...form.register("recipientName")}
                    />
                    {form.formState.errors.recipientName && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.recipientName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-bank">Nama Bank</Label>
                    <Input
                      id="ticket-bank"
                      placeholder="Contoh: BRI"
                      aria-invalid={!!form.formState.errors.bankName}
                      {...form.register("bankName")}
                    />
                    {form.formState.errors.bankName && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.bankName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-account-number">Nomor Rekening</Label>
                    <Input
                      id="ticket-account-number"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Nomor rekening penerima"
                      aria-invalid={!!form.formState.errors.accountNumber}
                      {...form.register("accountNumber")}
                    />
                    {form.formState.errors.accountNumber && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.accountNumber.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-requested-amount">Biaya</Label>
                    <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/50">
                      <span className="pl-3 text-sm text-muted-foreground">
                        Rp
                      </span>
                      <Input
                        id="ticket-requested-amount"
                        type="text"
                        inputMode="numeric"
                        className="h-full border-0 shadow-none focus-visible:ring-0"
                        placeholder="0"
                        aria-invalid={!!form.formState.errors.requestedAmount}
                        value={
                          requestedAmountEdit ??
                          (watchedRequestedAmount === undefined
                            ? ""
                            : new Intl.NumberFormat("id-ID", {
                                maximumFractionDigits: 0,
                              }).format(watchedRequestedAmount))
                        }
                        onFocus={() =>
                          setRequestedAmountEdit(
                            form.getValues("requestedAmount")?.toString() ?? "",
                          )
                        }
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          setRequestedAmountEdit(digits);
                          form.setValue(
                            "requestedAmount",
                            digits ? Number(digits) : undefined,
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                        onBlur={() => {
                          setRequestedAmountEdit(null);
                          void form.trigger("requestedAmount");
                        }}
                      />
                    </div>
                    {form.formState.errors.requestedAmount && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.requestedAmount.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : isOperationalFunding ? (
              <div className="space-y-3 rounded-md border p-2 sm:space-y-4 sm:p-4">
                <div>
                  <h3 className="font-semibold">Permintaan Dana Operasional</h3>
                  <p className="text-sm text-muted-foreground">
                    Permintaan operasional berupa dana dan tidak menggunakan
                    daftar material atau stok gudang. Tujuan transfer otomatis
                    menggunakan data rekening pemohon di Profil Saya.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticket-operational-request-type">
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
                          className="w-full md:max-w-[calc(50%-0.5rem)]"
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
                      <div className="space-y-2">
                        <Label htmlFor="ticket-survey-consumption">
                          Biaya Konsumsi (Rp)
                        </Label>
                        <Input
                          id="ticket-survey-consumption"
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="0"
                          aria-invalid={
                            !!form.formState.errors.surveyConsumptionAmount
                          }
                          {...form.register("surveyConsumptionAmount", {
                            setValueAs: (value) =>
                              value === "" ? undefined : Number(value),
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ticket-survey-fuel">
                          Biaya BBM (Rp)
                        </Label>
                        <Input
                          id="ticket-survey-fuel"
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="0"
                          aria-invalid={
                            !!form.formState.errors.surveyFuelAmount
                          }
                          {...form.register("surveyFuelAmount", {
                            setValueAs: (value) =>
                              value === "" ? undefined : Number(value),
                          })}
                        />
                      </div>
                    </div>
                    {(form.formState.errors.surveyConsumptionAmount ||
                      form.formState.errors.surveyFuelAmount) && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.surveyConsumptionAmount?.message ??
                          form.formState.errors.surveyFuelAmount?.message}
                      </p>
                    )}
                    <p className="text-right font-semibold">
                      Total dana survei: {formatCurrency(operationalRequestedAmount)}
                    </p>
                  </>
                ) : (
                  <div className="space-y-2 md:max-w-[calc(50%-0.5rem)]">
                    <Label htmlFor="ticket-operational-amount">
                      Jumlah Dana Operasional (Rp)
                    </Label>
                    <Input
                      id="ticket-operational-amount"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder="Masukkan jumlah dana"
                      aria-invalid={
                        !!form.formState.errors.operationalAmount
                      }
                      {...form.register("operationalAmount", {
                        setValueAs: (value) =>
                          value === "" ? undefined : Number(value),
                      })}
                    />
                    {form.formState.errors.operationalAmount && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.operationalAmount.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
            {usesItemDeliveryDates && (
              <div
                className={cn(
                  "ticket-item-source-row grid items-end gap-2 rounded-md border p-2 text-xs sm:gap-3 sm:p-3 sm:text-sm",
                  requestCategory === TicketRequestCategory.WAREHOUSE
                    ? "grid-cols-1"
                    : "grid-cols-2",
                )}
              >
                {requestCategory !== TicketRequestCategory.WAREHOUSE && (
                  <div className="space-y-2">
                    <Label className="hidden sm:flex" htmlFor="ticket-item-source">
                      Sumber Barang
                    </Label>
                    <Controller
                      control={form.control}
                      name="itemSource"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value: TicketCategoryHint) => {
                            field.onChange(value);
                            replace(
                              (form.getValues("items") ?? []).map((item) => ({
                                ...item,
                                stockItemId: "",
                                itemName: "",
                                unit: "",
                                estimatedCost: undefined,
                                categoryHint: value,
                                expectedDeliveryDate: "",
                              })),
                            );
                            if (value !== TicketCategoryHint.WAREHOUSE) {
                              form.setValue("itemsExpectedDeliveryDate", "");
                            }
                            form.clearErrors([
                              "items",
                              "itemsExpectedDeliveryDate",
                            ]);
                          }}
                        >
                          <SelectTrigger id="ticket-item-source" className="h-9 w-full text-xs sm:h-10 sm:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={TicketCategoryHint.WAREHOUSE}>
                              Gudang (Stok)
                            </SelectItem>
                            <SelectItem value={TicketCategoryHint.PURCHASE}>
                              Pembelian Baru
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
                {itemSource === TicketCategoryHint.WAREHOUSE && (
                  <div className="space-y-2">
                    <Label className="hidden sm:flex" htmlFor="ticket-items-delivery-date">
                      Tanggal Diperlukan
                    </Label>
                    <Input
                      id="ticket-items-delivery-date"
                      type="date"
                      className="h-9 text-xs sm:h-10 sm:text-sm"
                      required
                      value={itemsExpectedDeliveryDate ?? ""}
                      min={format(new Date(), "yyyy-MM-dd")}
                      onChange={(event) =>
                        form.setValue(
                          "itemsExpectedDeliveryDate",
                          event.target.value,
                          { shouldDirty: true, shouldValidate: true },
                        )
                      }
                      aria-invalid={
                        !!form.formState.errors.itemsExpectedDeliveryDate
                      }
                    />
                    {form.formState.errors.itemsExpectedDeliveryDate && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.itemsExpectedDeliveryDate.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="ticket-items-heading flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Rincian Item</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    itemName: "",
                    unit: "",
                    quantity: 1,
                    estimatedCost: undefined,
                    categoryHint: itemSource ?? TicketCategoryHint.WAREHOUSE,
                    expectedDeliveryDate: "",
                  })
                }
                disabled={fields.length >= 100}
              >
                <Plus aria-hidden="true" />
                Tambah Item
              </Button>
            </div>

            <div className="ticket-items-box space-y-4 rounded-md border p-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className={cn(
                    "ticket-item-row grid items-end gap-2 sm:gap-4",
                    usesItemDeliveryDates
                      ? "grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_2.5rem] sm:grid-cols-[minmax(0,2fr)_minmax(7rem,0.85fr)_minmax(9rem,1fr)_3rem]"
                      : "grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(7rem,0.85fr)_minmax(9rem,1fr)_3rem]",
                  )}
                >
                  {usesStockCatalog ? (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm" htmlFor={`ticket-stock-item-${index}`}>Barang</Label>
                      <Controller
                        control={form.control}
                        name={`items.${index}.stockItemId`}
                        render={({ field: stockField }) => (
                          <Popover
                            open={stockPickerIndex === index}
                            onOpenChange={(open) =>
                              setStockPickerIndex(open ? index : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                role="combobox"
                                aria-expanded={stockPickerIndex === index}
                                id={`ticket-stock-item-${index}`}
                                className="flex h-9 min-w-0 w-full items-center justify-between gap-1 overflow-hidden rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-xs shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20 sm:h-10 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
                                aria-invalid={
                                  !!form.formState.errors.items?.[index]?.stockItemId
                                }
                              >
                                <span className="min-w-0 truncate">
                                  {(() => {
                                    const selected = stockItems.find(
                                      (item) => item.id === stockField.value,
                                    );
                                    return selected
                                      ? `${selected.name} · ${selected.unit}${
                                          itemSource === TicketCategoryHint.WAREHOUSE
                                            ? ` · tersedia ${selected.stockQuantity}`
                                            : ""
                                        }`
                                      : "Pilih barang";
                                  })()}
                                </span>
                                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-[--radix-popover-trigger-width] min-w-72 p-0"
                            >
                              <Command>
                                <CommandInput placeholder="Cari nama barang..." />
                                <CommandList>
                                  <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
                                  <CommandItem
                                    value="none"
                                    onSelect={() => {
                                      stockField.onChange("");
                                      setStockPickerIndex(null);
                                    }}
                                  >
                                    Pilih barang
                                  </CommandItem>
                                  {stockItems.map((item) => (
                                    <CommandItem
                                      key={item.id}
                                      value={`${item.name} ${item.unit}`}
                                      onSelect={() => {
                                        stockField.onChange(item.id);
                                        form.setValue(
                                          `items.${index}.itemName`,
                                          item.name,
                                          { shouldDirty: true, shouldValidate: true },
                                        );
                                        form.setValue(
                                          `items.${index}.unit`,
                                          item.unit,
                                          { shouldDirty: true, shouldValidate: true },
                                        );
                                        form.setValue(
                                          `items.${index}.estimatedCost`,
                                          undefined,
                                        );
                                        form.clearErrors([
                                          `items.${index}.stockItemId`,
                                          `items.${index}.itemName`,
                                          `items.${index}.unit`,
                                        ]);
                                        setStockPickerIndex(null);
                                      }}
                                    >
                                      <Check
                                        className={`size-4 ${
                                          stockField.value === item.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                        }`}
                                      />
                                      <span className="truncate">
                                        {item.name} · {item.unit}
                                        {itemSource === TicketCategoryHint.WAREHOUSE
                                          ? ` · tersedia ${item.stockQuantity}`
                                          : ""}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                      {form.formState.errors.items?.[index]?.stockItemId && (
                        <p
                          className="text-sm text-destructive"
                          role="alert"
                        >
                          {form.formState.errors.items[index]?.stockItemId?.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor={`ticket-item-${index}`}>Barang</Label>
                      <Input
                        id={`ticket-item-${index}`}
                        placeholder="Nama item"
                        aria-invalid={!!form.formState.errors.items?.[index]?.itemName}
                        {...form.register(`items.${index}.itemName`)}
                      />
                      {form.formState.errors.items?.[index]?.itemName && (
                        <p className="text-sm text-destructive" role="alert">
                          {form.formState.errors.items[index]?.itemName?.message}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm" htmlFor={`ticket-quantity-${index}`}>Qty</Label>
                    <Input
                      id={`ticket-quantity-${index}`}
                      type="number"
                      min="0.001"
                      step="any"
                      aria-invalid={
                        !!form.formState.errors.items?.[index]?.quantity
                      }
                      {...form.register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                    {form.formState.errors.items?.[index]?.quantity && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.items[index]?.quantity?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm" htmlFor={`ticket-unit-${index}`}>Satuan</Label>
                    {usesStockCatalog ? (
                      <Controller
                        control={form.control}
                        name={`items.${index}.unit`}
                        render={({ field: unitField }) => (
                          <Input
                            id={`ticket-unit-${index}`}
                            value={unitField.value ?? ""}
                            readOnly
                          />
                        )}
                      />
                    ) : (
                      <Input
                        id={`ticket-unit-${index}`}
                        placeholder="Masukkan satuan"
                        maxLength={32}
                        aria-invalid={!!form.formState.errors.items?.[index]?.unit}
                        {...form.register(`items.${index}.unit`)}
                      />
                    )}
                    {form.formState.errors.items?.[index]?.unit && (
                      <p className="text-sm text-destructive" role="alert">
                        {form.formState.errors.items[index]?.unit?.message}
                      </p>
                    )}
                  </div>

                  {index > 0 && (
                    <ActionIconButton
                      label={`Hapus item ${index + 1}`}
                      tooltip={`Hapus item ${index + 1}`}
                      icon={Trash2}
                      className="justify-self-end self-end text-red-500 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => remove(index)}
                      variant="ghost"
                    />
                  )}
                </div>
              ))}
            </div>
            {(form.formState.errors.items?.root?.message ||
              form.formState.errors.items?.message) && (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.items.root?.message ||
                  form.formState.errors.items.message}
              </p>
            )}

              </>
            )}
          </section>}

          <div className="ticket-priority-section space-y-3 px-1 py-2">
            <Label>Tingkat Prioritas</Label>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid grid-cols-3 gap-2 sm:gap-3"
                  aria-label="Tingkat Prioritas"
                >
                  <Label
                    htmlFor="priority-non-urgent"
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border p-2 text-xs sm:gap-3 sm:p-3 sm:text-sm",
                      field.value === "NON_URGENT" &&
                        "border-green-600 text-green-700 dark:text-green-400",
                    )}
                  >
                    <RadioGroupItem
                      id="priority-non-urgent"
                      value="NON_URGENT"
                      className="!min-h-0"
                    />
                    Non-Urgent
                  </Label>
                  <Label
                    htmlFor="priority-urgent"
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border p-2 text-xs sm:gap-3 sm:p-3 sm:text-sm",
                      field.value === "URGENT" &&
                        "border-amber-500 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    <RadioGroupItem
                      id="priority-urgent"
                      value="URGENT"
                      className="!min-h-0"
                    />
                    Urgent
                  </Label>
                  <Label
                    htmlFor="priority-emergency"
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border p-2 text-xs sm:gap-3 sm:p-3 sm:text-sm",
                      field.value === "EMERGENCY" &&
                        "border-destructive text-destructive",
                    )}
                  >
                    <RadioGroupItem
                      id="priority-emergency"
                      value="EMERGENCY"
                      className="!min-h-0"
                    />
                    Emergency
                  </Label>
                </RadioGroup>
              )}
            />
          </div>

          {!usesItemDeliveryDates && !isAPHRequest && !isInternalFunding && (
            <div className="ticket-needed-date-section space-y-3 px-1 py-2">
              <Label>Tanggal Perlu Dibayarkan/Disediakan</Label>
              <Controller
                control={form.control}
                name="neededDate"
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal md:max-w-[calc(50%-0.5rem)]",
                          !field.value && "text-muted-foreground",
                        )}
                        aria-invalid={!!form.formState.errors.neededDate}
                      >
                        <CalendarDays aria-hidden="true" />
                        {field.value
                          ? format(field.value, "d MMMM yyyy", { locale: id })
                          : "Pilih tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={{ before: startOfDay(new Date()) }}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.neededDate && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.neededDate.message}
                </p>
              )}
            </div>
          )}

          </fieldset>
        </form>
      </GlobalModal>
    </>
  );
}
