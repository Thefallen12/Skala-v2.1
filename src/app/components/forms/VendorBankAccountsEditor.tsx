"use client";

import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorBankAccountInput } from "@/lib/vendor-bank-accounts";

export type EditableVendorBankAccount = VendorBankAccountInput & {
  id?: string;
};

export function VendorBankAccountsEditor({
  accounts,
  onChange,
  disabled = false,
  idPrefix,
}: {
  accounts: EditableVendorBankAccount[];
  onChange: (accounts: EditableVendorBankAccount[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const updateAccount = (
    index: number,
    patch: Partial<EditableVendorBankAccount>,
  ) => {
    onChange(
      accounts.map((account, accountIndex) =>
        accountIndex === index ? { ...account, ...patch } : account,
      ),
    );
  };

  return (
    <section className="space-y-3 sm:col-span-2" aria-label="Rekening vendor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Rekening bank</h3>
          <p className="text-xs text-muted-foreground">
            Pilih rekening utama; rekening ini dipakai otomatis sebagai pilihan awal.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || accounts.length >= 20}
          onClick={() =>
            onChange([
              ...accounts,
              {
                bankName: "",
                bankAccount: "",
                bankHolder: "",
                isPrimary: accounts.length === 0,
              },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Tambah rekening
        </Button>
      </div>

      {accounts.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Belum ada rekening. Data rekening bersifat opsional.
        </p>
      )}

      {accounts.map((account, index) => {
        const accountId = `${idPrefix}-account-${index}`;
        return (
          <div key={account.id ?? index} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Rekening {index + 1}</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={account.isPrimary ? "secondary" : "outline"}
                  disabled={disabled || account.isPrimary}
                  onClick={() => onChange(accounts.map((item, itemIndex) => ({
                    ...item,
                    isPrimary: itemIndex === index,
                  })))}
                >
                  <Star aria-hidden="true" />
                  {account.isPrimary ? "Utama" : "Jadikan utama"}
                </Button>
                <ActionIconButton
                  label={`Hapus rekening ${index + 1}`}
                  tooltip={`Hapus rekening ${index + 1}`}
                  icon={Trash2}
                  disabled={disabled}
                  onClick={() => {
                    const remaining = accounts.filter(
                      (_, accountIndex) => accountIndex !== index,
                    );
                    if (account.isPrimary && remaining.length > 0) {
                      remaining[0] = { ...remaining[0], isPrimary: true };
                    }
                    onChange(remaining);
                  }}
                  variant="ghost"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${accountId}-label`}>Label (opsional)</Label>
                <Input
                  id={`${accountId}-label`}
                  value={account.label ?? ""}
                  maxLength={100}
                  placeholder="Contoh: Rekening operasional"
                  disabled={disabled}
                  onChange={(event) => updateAccount(index, { label: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${accountId}-bank`}>Nama bank</Label>
                <Input
                  id={`${accountId}-bank`}
                  value={account.bankName}
                  maxLength={120}
                  disabled={disabled}
                  onChange={(event) => updateAccount(index, { bankName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${accountId}-number`}>Nomor rekening</Label>
                <Input
                  id={`${accountId}-number`}
                  value={account.bankAccount}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) => updateAccount(index, { bankAccount: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${accountId}-holder`}>Nama pemilik rekening</Label>
                <Input
                  id={`${accountId}-holder`}
                  value={account.bankHolder}
                  maxLength={180}
                  disabled={disabled}
                  onChange={(event) => updateAccount(index, { bankHolder: event.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
