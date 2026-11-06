export const LEGACY_VENDOR_BANK_ACCOUNT_ID = "legacy";

export type VendorBankAccountInput = {
  label?: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  isPrimary: boolean;
};

export type VendorBankAccountOption = Omit<VendorBankAccountInput, "label"> & {
  id: string;
  label: string | null;
};

export function formatVendorBankAccount(details: {
  bankName: string | null | undefined;
  bankAccount: string | null | undefined;
  bankHolder: string | null | undefined;
}): string | null {
  const parts = [
    details.bankName?.trim(),
    details.bankAccount?.trim(),
    details.bankHolder?.trim() ? `a.n. ${details.bankHolder.trim()}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

type VendorWithBankAccounts = {
  bankName: string | null | undefined;
  bankAccount: string | null | undefined;
  bankHolder: string | null | undefined;
  bankAccounts?: VendorBankAccountOption[];
};

export function getVendorBankAccounts(
  vendor: VendorWithBankAccounts,
): VendorBankAccountOption[] {
  if (vendor.bankAccounts?.length) return vendor.bankAccounts;
  if (vendor.bankName || vendor.bankAccount || vendor.bankHolder) {
    return [{
      id: LEGACY_VENDOR_BANK_ACCOUNT_ID,
      label: "Rekening utama",
      bankName: vendor.bankName ?? "",
      bankAccount: vendor.bankAccount ?? "",
      bankHolder: vendor.bankHolder ?? "",
      isPrimary: true,
    }];
  }
  return [];
}

export function parseVendorBankAccounts(
  value: unknown,
  legacy: Partial<
    Pick<VendorWithBankAccounts, "bankName" | "bankAccount" | "bankHolder">
  >,
): VendorBankAccountInput[] | null {
  const rawAccounts =
    value === undefined
      ? legacy.bankName || legacy.bankAccount || legacy.bankHolder
        ? [{
            bankName: legacy.bankName ?? "",
            bankAccount: legacy.bankAccount ?? "",
            bankHolder: legacy.bankHolder ?? "",
            isPrimary: true,
          }]
        : []
      : value;

  if (!Array.isArray(rawAccounts) || rawAccounts.length > 20) return null;

  const parsed: VendorBankAccountInput[] = [];
  for (const account of rawAccounts) {
    if (!account || typeof account !== "object") return null;
    if (typeof account !== "object" || account === null) return null;
    const candidate = account as Record<string, unknown>;
    const bankName = typeof candidate.bankName === "string" ? candidate.bankName.trim() : "";
    const bankAccount = typeof candidate.bankAccount === "string" ? candidate.bankAccount.trim() : "";
    const bankHolder = typeof candidate.bankHolder === "string" ? candidate.bankHolder.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const isPrimary = candidate.isPrimary === true;

    if (!bankName && !bankAccount && !bankHolder && !label) continue;
    if (
      bankName.length > 120 ||
      bankAccount.length > 80 ||
      bankHolder.length > 180 ||
      label.length > 100 ||
      !bankName ||
      !bankAccount ||
      !bankHolder ||
      (candidate.isPrimary !== undefined && typeof candidate.isPrimary !== "boolean")
    ) {
      return null;
    }

    parsed.push({
      ...(label ? { label } : {}),
      bankName,
      bankAccount,
      bankHolder,
      isPrimary,
    });
  }

  if (parsed.filter((account) => account.isPrimary).length > 1) return null;
  if (parsed.length > 0 && !parsed.some((account) => account.isPrimary)) {
    parsed[0].isPrimary = true;
  }
  return parsed;
}

export function resolveVendorBankAccount(
  accounts: Array<{
    id: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    isPrimary: boolean;
  }>,
  legacy: Pick<VendorWithBankAccounts, "bankName" | "bankAccount" | "bankHolder">,
  selectedAccountId?: string,
) {
  if (selectedAccountId === LEGACY_VENDOR_BANK_ACCOUNT_ID) {
    return legacy.bankName && legacy.bankAccount && legacy.bankHolder
      ? {
          bankName: legacy.bankName,
          bankAccount: legacy.bankAccount,
          bankHolder: legacy.bankHolder,
        }
      : null;
  }

  if (selectedAccountId) {
    const selected = accounts.find((account) => account.id === selectedAccountId);
    return selected
      ? {
          bankName: selected.bankName,
          bankAccount: selected.bankAccount,
          bankHolder: selected.bankHolder,
        }
      : null;
  }

  const primary = accounts.find((account) => account.isPrimary) ?? accounts[0];
  if (primary) {
    return {
      bankName: primary.bankName,
      bankAccount: primary.bankAccount,
      bankHolder: primary.bankHolder,
    };
  }
  return legacy.bankName && legacy.bankAccount && legacy.bankHolder
    ? {
        bankName: legacy.bankName,
        bankAccount: legacy.bankAccount,
        bankHolder: legacy.bankHolder,
      }
    : null;
}
