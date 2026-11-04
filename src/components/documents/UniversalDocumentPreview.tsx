"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Menu,
  Minus,
  Plus,
  Printer,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const A4_WIDTH_PX = (210 * 96) / 25.4;
const A4_HEIGHT_PX = (297 * 96) / 25.4;

type UniversalDocumentPreviewProps = {
  title: string;
  src: string;
  documentNumber: string;
  onCreateTemplate?: () => void;
  toolbarLabel?: string;
  minimalToolbar?: boolean;
  onClose?: () => void;
};

export default function UniversalDocumentPreview({
  title,
  src,
  documentNumber,
  onCreateTemplate,
  toolbarLabel,
  minimalToolbar = false,
  onClose,
}: UniversalDocumentPreviewProps) {
  const [zoom, setZoom] = useState(90);
  const [fitScale, setFitScale] = useState(1);
  const [loadedPreviewSrc, setLoadedPreviewSrc] = useState<string | null>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [printError, setPrintError] = useState("");
  const previewSrc = `${src}${src.includes("?") ? "&" : "?"}format=html`;
  const previewScale = minimalToolbar ? fitScale : zoom / 100;
  const previewSize = {
    width: A4_WIDTH_PX * previewScale,
    height: A4_HEIGHT_PX * previewScale,
  };

  useEffect(() => {
    if (!minimalToolbar) return;
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const updateFitScale = (availableWidth: number, availableHeight: number) => {
      setFitScale(
        Math.min(
          1,
          availableWidth / A4_WIDTH_PX,
          availableHeight / A4_HEIGHT_PX,
        ),
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        updateFitScale(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(viewport);
    const viewportStyles = window.getComputedStyle(viewport);
    updateFitScale(
      viewport.clientWidth -
        Number.parseFloat(viewportStyles.paddingLeft) -
        Number.parseFloat(viewportStyles.paddingRight),
      viewport.clientHeight -
        Number.parseFloat(viewportStyles.paddingTop) -
        Number.parseFloat(viewportStyles.paddingBottom),
    );

    return () => observer.disconnect();
  }, [minimalToolbar]);

  const resetPreviewScroll = () => {
    previewViewportRef.current?.scrollTo({ top: 0, left: 0 });
  };

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTo({ top: 0, left: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [previewSrc]);

  const previewReady = loadedPreviewSrc === previewSrc;

  const printDocument = () => {
    setPrintError("");
    if (!previewReady) {
      setPrintError("Tunggu sampai pratinjau dokumen selesai dimuat.");
      return;
    }

    const printWindow = previewFrameRef.current?.contentWindow;
    if (!printWindow) {
      setPrintError("Pratinjau belum siap dicetak. Coba muat ulang.");
      return;
    }

    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error("Document preview print failed:", error);
      setPrintError("Dokumen gagal dibuka untuk dicetak.");
    }
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${minimalToolbar ? "h-[min(75dvh,760px)] min-h-[240px] flex-none bg-[#3f4145]" : "rounded-lg border border-slate-700 bg-[#3f4145] shadow-inner"}`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-slate-600 bg-[#25272b] py-2 text-slate-100 ${
          minimalToolbar
            ? "flex-nowrap gap-1 px-2 sm:gap-2 sm:px-3"
            : "flex-wrap gap-2 px-3"
        }`}
      >
        {minimalToolbar ? (
          <div className="mr-auto flex min-w-0 flex-1 basis-0 items-baseline gap-1.5 overflow-hidden">
            <span className="shrink-0 truncate text-[10px] font-semibold sm:text-sm">
              {documentNumber}
            </span>
            <span className="truncate text-[8px] text-slate-300 sm:text-xs">
              {toolbarLabel}
            </span>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-slate-700 hover:text-white"
              aria-label="Buka menu viewer"
            >
              <Menu className="size-4" />
            </Button>
            <span className="mr-auto max-w-48 truncate text-sm font-medium">
              {documentNumber}
            </span>
            <span className="hidden items-center gap-1 text-xs text-slate-300 sm:flex">
              1 / 1
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-slate-700 hover:text-white"
              aria-label="Perkecil pratinjau"
              onClick={() => setZoom((value) => Math.max(50, value - 10))}
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-10 text-center text-xs text-slate-200">
              {zoom}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-slate-700 hover:text-white"
              aria-label="Perbesar pratinjau"
              onClick={() => setZoom((value) => Math.min(150, value + 10))}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-slate-700 hover:text-white"
              aria-label="Muat ulang pratinjau"
              onClick={() => setZoom(90)}
            >
              <Redo2 className="size-4" />
            </Button>
          </>
        )}
        {onCreateTemplate && !minimalToolbar && (
          <Button
            type="button"
            size="sm"
            className="bg-orange-500 text-white hover:bg-orange-600"
            onClick={onCreateTemplate}
          >
            <Plus className="mr-1.5 size-4" />
            Buat Template
          </Button>
        )}
        {!minimalToolbar && (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const link = document.createElement("a");
                link.href = src;
                link.download = `${documentNumber}.pdf`;
                link.click();
              }}
            >
              <Download className="mr-1.5 size-4" />
              <span className="hidden sm:inline">Unduh / Download</span>
              <span className="sm:hidden">Unduh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!previewReady}
              onClick={printDocument}
            >
              <Printer className="mr-1.5 size-4" />
              <span className="hidden sm:inline">Cetak / Print</span>
              <span className="sm:hidden">Cetak</span>
            </Button>
          </>
        )}
      </div>
      <div
        ref={previewViewportRef}
        className={`flex min-h-0 flex-1 justify-center overflow-auto ${minimalToolbar ? "bg-[#3f4145] p-2 sm:p-4" : "p-4 sm:p-6"}`}
      >
        <div
          className="relative mx-auto shrink-0"
          style={minimalToolbar ? previewSize : {
            width: `calc(210mm * ${zoom / 100})`,
            height: `calc(297mm * ${zoom / 100})`,
          }}
        >
          <div
            className={`absolute left-0 top-0 h-[297mm] w-[210mm] origin-top-left bg-white ${
              minimalToolbar
                ? "box-border border border-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.28)]"
                : "shadow-2xl"
            }`}
            style={{ transform: `scale(${previewScale})` }}
          >
            <iframe
              ref={previewFrameRef}
              title={title}
              src={previewSrc}
              scrolling="no"
              onLoad={() => {
                setLoadedPreviewSrc(previewSrc);
                setPrintError("");
                resetPreviewScroll();
              }}
              onError={() => {
                setLoadedPreviewSrc(null);
                setPrintError("Pratinjau dokumen gagal dimuat. Muat ulang halaman.");
              }}
              className="block h-full w-full overflow-hidden border-0 bg-white"
            />
          </div>
        </div>
      </div>
      {printError && (
        <p className="shrink-0 bg-[#25272b] px-3 py-1 text-xs text-red-300" role="alert">
          {printError}
        </p>
      )}
      {minimalToolbar && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-600 bg-[#1b2a41] px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 bg-orange-500 px-2.5 text-xs text-white hover:bg-orange-600 sm:h-9 sm:px-3 sm:text-sm"
            onClick={() => {
              const link = document.createElement("a");
              link.href = src;
              link.download = `${documentNumber}.pdf`;
              link.click();
            }}
          >
            <Download className="size-4" />
            Unduh / Download
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-orange-500 px-2.5 text-xs text-orange-500 hover:bg-orange-500 hover:text-white sm:h-9 sm:px-3 sm:text-sm"
            disabled={!previewReady}
            onClick={printDocument}
          >
            <Printer className="size-4" />
            Cetak / Print
          </Button>
          {onClose && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-orange-500 px-2.5 text-xs text-orange-500 hover:bg-orange-500 hover:text-white sm:h-9 sm:px-3 sm:text-sm"
              onClick={onClose}
            >
              Tutup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
