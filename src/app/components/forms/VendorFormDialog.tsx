"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { createVendor, updateVendor } from "@/app/actions/vendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  VendorBankAccountsEditor,
  type EditableVendorBankAccount,
} from "@/app/components/forms/VendorBankAccountsEditor";
import {
  getVendorBankAccounts,
  type VendorBankAccountOption,
} from "@/lib/vendor-bank-accounts";

export type VendorFormRecord = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts: VendorBankAccountOption[];
};

export function VendorFormDialog({
  isOpen,
  onClose,
  vendor,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendor?: VendorFormRecord | null;
  onSaved?: (vendor: VendorFormRecord) => void;
}) {
  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      title={vendor ? "Edit Vendor" : "Tambah Vendor Baru"}
      description="Lengkapi informasi vendor dan rekening bank. Vendor dapat langsung digunakan untuk pembelian."
      className="sm:max-w-2xl"
    >
      {isOpen ? (
        <VendorFormContent
          key={vendor?.id ?? "new-vendor"}
          vendor={vendor}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </GlobalModal>
  );
}

function VendorFormContent({
  vendor,
  onClose,
  onSaved,
}: {
  vendor?: VendorFormRecord | null;
  onClose: () => void;
  onSaved?: (vendor: VendorFormRecord) => void;
}) {
  const formId = useId();
  const [accounts, setAccounts] = useState<EditableVendorBankAccount[]>(() =>
    vendor
      ? getVendorBankAccounts(vendor).map((account) => ({
          ...account,
          label: account.label ?? "",
        }))
      : [],
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      bankAccounts: accounts.map(
        ({ label, bankName, bankAccount, bankHolder, isPrimary }) => ({
          label,
          bankName,
          bankAccount,
          bankHolder,
          isPrimary,
        }),
      ),
    };

    setMessage("");
    startTransition(async () => {
      try {
        const result = vendor
          ? await updateVendor(vendor.id, input)
          : await createVendor(input);
        setMessage(result.message);
        if (!result.success || !result.vendor) return;

        onSaved?.({
          ...result.vendor,
          category: input.category,
          address: input.address || null,
          phone: input.phone || null,
          email: input.email || null,
          bankAccounts: getVendorBankAccounts(result.vendor),
        });
        onClose();
      } catch (error) {
        console.error("Vendor save failed:", error);
        setMessage("Vendor gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Nama Vendor</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            maxLength={180}
            minLength={2}
            required
            defaultValue={vendor?.name ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-category`}>Kategori</Label>
          <Input
            id={`${formId}-category`}
            name="category"
            maxLength={100}
            minLength={2}
            required
            defaultValue={vendor?.category ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-phone`}>Kontak / Telepon</Label>
          <Input
            id={`${formId}-phone`}
            name="phone"
            maxLength={60}
            defaultValue={vendor?.phone ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-email`}>Email</Label>
          <Input
            id={`${formId}-email`}
            name="email"
            type="email"
            maxLength={180}
            defaultValue={vendor?.email ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${formId}-address`}>Alamat</Label>
          <Input
            id={`${formId}-address`}
            name="address"
            maxLength={500}
            defaultValue={vendor?.address ?? ""}
            disabled={isPending}
          />
        </div>
        <VendorBankAccountsEditor
          accounts={accounts}
          onChange={setAccounts}
          disabled={isPending}
          idPrefix={formId}
        />
      </div>
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      <DialogFooter className="sticky -bottom-4 -mx-4 border-t border-border bg-card px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onClose}
          disabled={isPending}
        >
          Batal
        </Button>
        <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
          {isPending
            ? "Menyimpan..."
            : vendor
              ? "Simpan Perubahan"
              : "Simpan Vendor"}
        </Button>
      </DialogFooter>
    </form>
  );
}
