"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { receiveStandalonePurchaseOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";

export default function PurchaseOrderReceiptAction({
  publicCode,
}: {
  publicCode: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function confirmReceipt() {
    startTransition(async () => {
      const result = await receiveStandalonePurchaseOrder(publicCode);
      setMessage(result.message);
      if (result.success) {
        setIsOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outlinesuccess"
        onClick={() => {
          setMessage("");
          setIsOpen(true);
        }}
      >
        <PackageCheck aria-hidden="true" />
        Terima Barang
      </Button>
      {message && !isOpen && (
        <p className="sr-only" role="status">
          {message}
        </p>
      )}
      <GlobalModal
        isOpen={isOpen}
        onClose={() => {
          if (!isPending) setIsOpen(false);
        }}
        title="Konfirmasi Penerimaan PO"
        description="Stok akan bertambah setelah penerimaan ini dicatat."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="success"
              onClick={confirmReceipt}
              disabled={isPending}
            >
              {isPending ? "Mencatat..." : "Konfirmasi Barang Diterima"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Pastikan barang dari vendor benar-benar sudah tiba. Setelah
          dikonfirmasi, jumlah stok akan diperbarui dan penerimaan PO tidak
          dapat dicatat ulang.
        </p>
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
      </GlobalModal>
    </>
  );
}
