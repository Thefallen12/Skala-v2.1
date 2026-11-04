"use client";

export function printUrlInFrame(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    let printed = false;
    let cleanupTimer: number | undefined;

    const cleanup = () => {
      if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      frame.remove();
    };

    frame.title = "Dokumen untuk dicetak";
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.addEventListener(
      "load",
      () => {
        if (printed) return;
        printed = true;
        const printWindow = frame.contentWindow;
        if (!printWindow) {
          cleanup();
          reject(new Error("Jendela cetak dokumen tidak tersedia."));
          return;
        }

        try {
          printWindow.addEventListener("afterprint", cleanup, { once: true });
          cleanupTimer = window.setTimeout(cleanup, 60_000);
          printWindow.focus();
          printWindow.print();
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      },
      { once: true },
    );
    frame.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("Dokumen gagal dimuat untuk dicetak."));
      },
      { once: true },
    );
    frame.src = url;
    document.body.append(frame);
  });
}
