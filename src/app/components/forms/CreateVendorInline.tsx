"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  VendorFormDialog,
  type VendorFormRecord,
} from "@/app/components/forms/VendorFormDialog";
import {
  getVendorBankAccounts,
  type VendorBankAccountOption,
} from "@/lib/vendor-bank-accounts";

export type PurchaseVendorOption = {
  id: string;
  name: string;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts?: VendorBankAccountOption[];
};

export default function CreateVendorInline({
  onCreated,
}: {
  onCreated: (vendor: PurchaseVendorOption) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Tambah Vendor
      </Button>
      <VendorFormDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onSaved={(vendor: VendorFormRecord) =>
          onCreated({
            id: vendor.id,
            name: vendor.name,
            bankName: vendor.bankName,
            bankAccount: vendor.bankAccount,
            bankHolder: vendor.bankHolder,
            bankAccounts: getVendorBankAccounts(vendor),
          })
        }
      />
    </>
  );
}
