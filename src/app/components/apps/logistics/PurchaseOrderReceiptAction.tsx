"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { receiveStandalonePurchaseOrder } from "@/app/actions/orders";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";

export default function PurchaseOrderReceiptAction({
  publicCode,
  poNumber,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  publicCode: string;
  poNumber?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  const setResolvedOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  function confirmReceipt() {
    startTransition(async () => {
      try {
        const result = await receiveStandalonePurchaseOrder(publicCode);
        if (result.success) {
          toast.success(result.message);
          setResolvedOpen(false);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Receive standalone PO failed:", error);
        toast.error("Penerimaan barang PO gagal dicatat.");
      }
    });
  }

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          size="sm"
          variant="outlinesuccess"
          onClick={() => setResolvedOpen(true)}
        >
          <PackageCheck className="size-4" aria-hidden="true" />
          Terima Barang
        </Button>
      )}
      <GlobalModal
        isOpen={resolvedOpen}
        onClose={() => {
          if (!isPending) setResolvedOpen(false);
        }}
        onOpenChange={setResolvedOpen}
        title={poNumber ? `Terima Barang · ${poNumber}` : "Konfirmasi Penerimaan PO"}
        description="Stok akan bertambah setelah penerimaan ini dicatat."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolvedOpen(false)}
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
              {isPending ? "Mencatat..." : "Konfirmasi Diterima"}
            </Button>
          </>
        }
      >
        <p className="type-p2 text-muted-foreground">
          Pastikan barang dari vendor benar-benar sudah tiba. Setelah
          dikonfirmasi, jumlah stok akan diperbarui dan penerimaan PO tidak
          dapat dicatat ulang.
        </p>
      </GlobalModal>
    </>
  );
}
