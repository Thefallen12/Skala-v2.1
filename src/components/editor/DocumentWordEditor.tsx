"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { DocType } from "@prisma/client";
import { uploadDocumentTemplateImage } from "@/app/actions/documents";
import WordToolbar from "./WordToolbar";

const DocumentTemplateAttributes = Extension.create({
  name: "documentTemplateAttributes",
  addGlobalAttributes() {
    const cellColorAttribute = (attribute: "data-cell-background" | "data-cell-border") => ({
      default: null,
      parseHTML: (element: HTMLElement) => {
        const styleProperty =
          attribute === "data-cell-background" ? "backgroundColor" : "borderColor";
        const color =
          element.getAttribute(attribute) || element.style[styleProperty as "backgroundColor"];
        return color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
      },
      renderHTML: (attributes: Record<string, string | null>) => {
        const color = attributes[attribute === "data-cell-background" ? "backgroundColor" : "borderColor"];
        if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return {};
        return {
          [attribute]: color,
          style: `${attribute === "data-cell-background" ? "background-color" : "border-color"}:${color}`,
        };
      },
    });
    return [
      {
        types: ["table", "tableCell", "tableHeader", "paragraph", "heading"],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute("class"),
            renderHTML: (attributes) =>
              attributes.class ? { class: attributes.class } : {},
          },
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          rowHeight: {
            default: null,
            parseHTML: (element) => {
              const height = element.getAttribute("data-row-height");
              return height && /^(?:2\d|[3-9]\d|[1-4]\d{2}|500)px$/.test(height)
                ? height
                : null;
            },
            renderHTML: (attributes) =>
              attributes.rowHeight &&
              /^(?:2\d|[3-9]\d|[1-4]\d{2}|500)px$/.test(attributes.rowHeight)
                ? {
                    "data-row-height": attributes.rowHeight,
                    style: `height:${attributes.rowHeight}`,
                  }
                : {},
          },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          backgroundColor: cellColorAttribute("data-cell-background"),
          borderColor: cellColorAttribute("data-cell-border"),
        },
      },
    ];
  },
});

const DocumentVariable = Node.create({
  name: "documentVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-document-variable") ?? "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-document-variable]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const key = String(node.attrs.key ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-document-variable": key,
        class: "document-variable",
      }),
      `{{${key}}}`,
    ];
  },
});

const ResizableImage = ImageExtension.extend({
  draggable: false,
  addNodeView() {
    const parentNodeView = this.parent?.();
    if (!parentNodeView) return null;
    return (props) => {
      const nodeView = parentNodeView(props);
      const image = nodeView.dom.querySelector("img");
      nodeView.dom.draggable = false;
      if (image) image.draggable = false;
      return nodeView;
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = Number(element.getAttribute("width"));
          return Number.isFinite(width) && width >= 1 && width <= 10000
            ? width
            : null;
        },
        renderHTML: (attributes) => {
          const width = Number(attributes.width);
          return Number.isFinite(width) && width >= 1 && width <= 10000
            ? { width: String(width), style: `width:${width}px` }
            : {};
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = Number(element.getAttribute("height"));
          return Number.isFinite(height) && height >= 1 && height <= 10000
            ? height
            : null;
        },
        renderHTML: (attributes) => {
          const height = Number(attributes.height);
          return Number.isFinite(height) && height >= 1 && height <= 10000
            ? { height: String(height), style: `height:${height}px` }
            : {};
        },
      },
      alignment: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-alignment") ?? "center",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment,
        }),
      },
      offsetX: {
        default: 0,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-offset-x") ?? 0);
          return Number.isInteger(value) ? Math.min(500, Math.max(-500, value)) : 0;
        },
        renderHTML: (attributes) => {
          const offsetX = Math.min(500, Math.max(-500, Number(attributes.offsetX) || 0));
          const offsetY = Math.min(500, Math.max(-500, Number(attributes.offsetY) || 0));
          return {
            "data-offset-x": String(offsetX),
            style: `transform:translate(${offsetX}px, ${offsetY}px)`,
          };
        },
      },
      offsetY: {
        default: 0,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-offset-y") ?? 0);
          return Number.isInteger(value) ? Math.min(500, Math.max(-500, value)) : 0;
        },
        renderHTML: (attributes) => {
          const offsetX = Math.min(500, Math.max(-500, Number(attributes.offsetX) || 0));
          const offsetY = Math.min(500, Math.max(-500, Number(attributes.offsetY) || 0));
          return {
            "data-offset-y": String(offsetY),
            style: `transform:translate(${offsetX}px, ${offsetY}px)`,
          };
        },
      },
    };
  },
});

type RowResizeDrag = {
  rowPosition: number;
  pointerId: number;
  startY: number;
  startHeight: number;
};

type ImagePositionDrag = {
  image: HTMLImageElement;
  imagePosition: number;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};

type PageMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function MarginRuler({
  margins,
  onChange,
}: {
  margins: PageMargins;
  onChange: (margins: PageMargins) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const dragSideRef = useRef<"left" | "right" | null>(null);

  const updateMarginFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const side = dragSideRef.current;
    const ruler = rulerRef.current;
    if (!side || !ruler) return;
    const bounds = ruler.getBoundingClientRect();
    const millimetersFromLeft = Math.round(
      ((event.clientX - bounds.left) / bounds.width) * 210,
    );
    const millimeters =
      side === "left" ? millimetersFromLeft : 210 - millimetersFromLeft;
    const opposite = side === "left" ? margins.right : margins.left;
    const value = Math.min(50, Math.max(5, Math.min(190 - opposite, millimeters)));
    onChange({
      ...margins,
      [side]: value,
    });
  };

  return (
    <div
      ref={rulerRef}
      className="document-page-ruler relative mb-2 h-8 w-[210mm] touch-none select-none border-b border-slate-400 bg-slate-50"
      aria-label="Penggaris halaman. Seret penanda untuk mengatur margin kiri dan kanan."
      onPointerDown={(event) => {
        const marker = (event.target as HTMLElement).closest<HTMLElement>("[data-margin-side]");
        if (!marker) return;
        dragSideRef.current = marker.dataset.marginSide as "left" | "right";
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateMarginFromPointer(event);
      }}
      onPointerMove={updateMarginFromPointer}
      onPointerUp={(event) => {
        dragSideRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragSideRef.current = null;
      }}
    >
      {Array.from({ length: 22 }, (_, index) => index * 10).map((millimeter) => (
        <span
          key={millimeter}
          className="absolute top-0 h-full border-l border-slate-300 pl-1 pt-0.5 text-[9px] text-slate-500"
          style={{ left: `${(millimeter / 210) * 100}%` }}
        >
          {millimeter}
        </span>
      ))}
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          data-margin-side={side}
          aria-label={`Geser margin ${side === "left" ? "kiri" : "kanan"}`}
          title={`Margin ${side === "left" ? "kiri" : "kanan"} ${margins[side]} mm`}
          className="absolute bottom-0 z-10 h-4 w-3 -translate-x-1/2 cursor-ew-resize rounded-t-sm bg-blue-600 shadow-sm"
          style={{
            left: `${
              ((side === "left" ? margins.left : 210 - margins.right) / 210) *
              100
            }%`,
          }}
        />
      ))}
    </div>
  );
}

function parseTemplatePage(html: string): {
  content: string;
  margins: PageMargins;
} {
  const match = html.match(
    /^<div\b[^>]*\bdata-document-page-margins=["'](\d+),(\d+),(\d+),(\d+)["'][^>]*>([\s\S]*)<\/div>\s*$/i,
  );
  if (!match) {
    return {
      content: html || "<p></p>",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    };
  }
  const values = match.slice(1, 5).map(Number);
  if (values.some((value) => value < 5 || value > 50)) {
    return {
      content: html || "<p></p>",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    };
  }
  return {
    content: match[5] || "<p></p>",
    margins: {
      top: values[0],
      right: values[1],
      bottom: values[2],
      left: values[3],
    },
  };
}

function serializeTemplatePage(content: string, margins: PageMargins): string {
  return `<div data-document-page-margins="${margins.top},${margins.right},${margins.bottom},${margins.left}">${content}</div>`;
}

function sanitizePreviewHtml(content: string, documentType: DocType): string {
  const isDeliveryOrder =
    documentType === DocType.DO || documentType === DocType.SURAT_JALAN;
  const documentPrefix =
    documentType === DocType.SURAT_JALAN ? "SJ" : isDeliveryOrder ? "DO" : "PO";
  const sampleLineItems = [
    {
      description: "Semen Portland",
      quantity: 50,
      unit: "sak",
      unitPrice: "Rp 65.000",
    },
    {
      description: "Pasir beton",
      quantity: 4,
      unit: "m³",
      unitPrice: "Rp 350.000",
    },
  ];
  const sampleItemRows = isDeliveryOrder
    ? `<tr><td>Semen Portland</td><td>50</td><td>sak</td><td>Kondisi baik</td></tr><tr><td>Pasir beton</td><td>4</td><td>m³</td><td>Kondisi baik</td></tr>`
    : `<tr><td>Semen Portland</td><td>50</td><td>Rp 65.000</td><td>Rp 3.250.000</td></tr><tr><td>Pasir beton</td><td>4</td><td>Rp 350.000</td><td>Rp 1.400.000</td></tr>`;
  const sampleItemsTable = isDeliveryOrder
    ? `<table class="items do-items"><thead><tr><th>MATERIAL</th><th>JUMLAH</th><th>SATUAN</th><th>KETERANGAN</th></tr></thead><tbody>${sampleItemRows}</tbody></table>`
    : `<table class="items po-items"><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>${sampleItemRows}</tbody></table>`;
  const previewValues: Record<string, string> = {
    nomor_dokumen: `${documentPrefix}/2026/10/001`,
    nomor_surat_jalan: `${documentPrefix}/2026/10/001`,
    nomor_request: "REQ-MAT-001",
    tanggal: "20 Oktober 2026",
    tanggal_spk: "20 Oktober 2026",
    tanggal_pengiriman: "20 Oktober 2026",
    due_date: "Sesuai kesepakatan",
    nama_proyek: "Pembangunan Gedung Utama",
    nama_klien: "PT Klien Konstruksi",
    nama_requester: "Budi Santoso",
    judul_request: "Pengadaan material konstruksi",
    nama_vendor: "Vendor material",
    nama_pengirim: "Gudang Proyek",
    nama_penerima: "Budi Santoso",
    alamat_vendor: "Alamat vendor",
    kontak_vendor: "Kontak vendor",
    lokasi_pengiriman: "Lokasi Proyek",
    total_biaya: isDeliveryOrder ? "—" : "Rp 4.650.000",
    diskon: "—",
    pajak: "—",
    catatan: "Material dikirim sesuai jadwal proyek.",
    verification_url: "https://contoh.com/verify/ID-DOKUMEN",
    item_description: sampleLineItems.map((item) => item.description).join("<br />"),
    item_qty: sampleLineItems.map((item) => item.quantity).join("<br />"),
    item_unit: sampleLineItems.map((item) => item.unit).join("<br />"),
    item_unit_price: isDeliveryOrder
      ? ""
      : sampleLineItems.map((item) => item.unitPrice).join("<br />"),
  };
  const html = content.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_placeholder, key: string) => {
      if (key === "items_table") return sampleItemsTable;
      if (key === "items_rows" || key === "items") return sampleItemRows;
      if (
        key === "item_description" ||
        key === "item_qty" ||
        key === "item_unit" ||
        key === "item_unit_price"
      ) {
        return previewValues[key];
      }
      if (key === "qr_signature") {
        return '<span class="qr-preview">QR VERIFIKASI<br>ditampilkan setelah cetak</span>';
      }
      return previewValues[key] ?? "";
    },
  );
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const table of Array.from(
    document.body.querySelectorAll("table.items, table.po-items, table.do-items"),
  )) {
    let header = table.querySelector("thead");
    if (!header) {
      header = document.createElement("thead");
      table.insertBefore(header, table.querySelector("tbody"));
    }
    let headerRow = header.querySelector("tr");
    if (!headerRow) {
      headerRow = document.createElement("tr");
      header.append(headerRow);
    }
    headerRow.innerHTML = isDeliveryOrder
      ? "<th>MATERIAL</th><th>JUMLAH</th><th>SATUAN</th><th>KETERANGAN</th>"
      : '<th>DESCRIPTION</th><th class="number">QTY</th><th class="money">UNIT PRICE</th><th class="money">AMOUNT</th>';
    const body = table.querySelector("tbody");
    if (body) body.innerHTML = sampleItemRows;
  }
  const allowedTags = new Set([
    "A", "BLOCKQUOTE", "BR", "CODE", "EM", "H1", "H2", "H3", "HR",
    "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "U", "UL",
    "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD",
  ]);

  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    if (!allowedTags.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG"].includes(element.tagName)) {
        element.remove();
      } else {
        element.replaceWith(...Array.from(element.childNodes));
      }
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name === "style") {
        const safeStyle = value
          .split(";")
          .map((declaration) => declaration.split(":").map((part) => part.trim()))
          .filter(([property, styleValue]) => {
            if (!property || !styleValue) return false;
            if (property === "color") return /^#[0-9a-f]{3,8}$/i.test(styleValue);
            if (property === "font-size") return /^(?:[6-9]|[1-6]\d|7[0-2])(?:px|pt)$/.test(styleValue);
            if (property === "text-align") return /^(?:left|center|right|justify)$/.test(styleValue);
            if (property === "vertical-align") return /^(?:top|middle|bottom)$/.test(styleValue);
            if (element.tagName === "IMG" && property === "transform") {
              return /^translate\(-?\d{1,3}px,\s*-?\d{1,3}px\)$/i.test(styleValue);
            }
            if (property === "width") return /^(?:(?:[1-9]\d?|100)%|(?:[1-9]\d{0,2}|1000)px)$/.test(styleValue);
            if (
              (element.tagName === "TD" || element.tagName === "TH") &&
              ["background-color", "border-color"].includes(property)
            ) {
              return /^#[0-9a-f]{6}$/i.test(styleValue);
            }
            return element.tagName === "TR" &&
              property === "height" &&
              /^(?:2\d|[3-9]\d|[1-4]\d{2}|500)px$/.test(styleValue);
          })
          .map(([property, styleValue]) => `${property}:${styleValue}`)
          .join(";");
        if (safeStyle) element.setAttribute("style", safeStyle);
        else element.removeAttribute("style");
        continue;
      }
      const safeImageSource =
        element.tagName === "IMG" &&
        name === "src" &&
        /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(value);
      const safeAttribute =
        name === "class" ||
        (element.tagName === "SPAN" &&
          name === "data-document-variable" &&
          /^[a-zA-Z0-9_.-]+$/.test(value)) ||
        safeImageSource ||
        ((element.tagName === "TD" || element.tagName === "TH") &&
          name === "colwidth" &&
          /^\d{2,4}(?:,\d{2,4})*$/.test(value)) ||
        ((element.tagName === "TD" || element.tagName === "TH") &&
          ["colspan", "rowspan"].includes(name) &&
          /^\d{1,2}$/.test(value)) ||
        ((element.tagName === "TD" || element.tagName === "TH") &&
          ["data-cell-background", "data-cell-border"].includes(name) &&
          /^#[0-9a-f]{6}$/i.test(value)) ||
        (element.tagName === "TR" &&
          name === "data-row-height" &&
          /^(?:2\d|[3-9]\d|[1-4]\d{2}|500)px$/.test(value)) ||
        (element.tagName === "IMG" &&
          ["alt", "width", "height"].includes(name)) ||
        (element.tagName === "IMG" &&
          name === "data-alignment" &&
          ["left", "center", "right"].includes(value)) ||
        (element.tagName === "IMG" &&
          ["data-offset-x", "data-offset-y"].includes(name) &&
          /^-?\d{1,3}$/.test(value)) ||
        (element.tagName === "A" && ["href", "target", "rel", "name"].includes(name));
      if (!safeAttribute) element.removeAttribute(attribute.name);
    }
    if (element.tagName === "IMG" && !element.hasAttribute("src")) element.remove();
  }
  return document.body.innerHTML;
}

export default function DocumentWordEditor({
  contentHtml,
  documentType = DocType.PURCHASE_ORDER,
  onChange,
  splitPreview = false,
}: {
  contentHtml: string;
  documentType?: DocType;
  onChange: (content: string) => void;
  splitPreview?: boolean;
}) {
  const initialPage = parseTemplatePage(contentHtml);
  const [liveContentHtml, setLiveContentHtml] = useState(initialPage.content);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [imageDropError, setImageDropError] = useState("");
  const [isUploadingDroppedImage, setIsUploadingDroppedImage] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const showPreview = splitPreview || previewExpanded;
  const [zoomValue, setZoomValue] = useState(0.75);
  const [pageMargins, setPageMargins] = useState(initialPage.margins);
  const pageMarginsRef = useRef(pageMargins);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncingRef = useRef(false);
  const rowResizeDragRef = useRef<RowResizeDrag | null>(null);
  const imagePositionDragRef = useRef<ImagePositionDrag | null>(null);
  const editorRef = useRef<Editor | null>(null);
  async function uploadDroppedImages(files: File[]) {
    setIsUploadingDroppedImage(true);
    setImageDropError("");
    try {
      for (const file of files) {
        const result = await uploadDocumentTemplateImage(file);
        if (!result.success || !result.imageUrl) {
          throw new Error(result.message);
        }
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: result.imageUrl, alt: file.name })
          .run();
      }
    } catch (error) {
      setImageDropError(
        error instanceof Error
          ? error.message
          : "Gambar gagal diunggah. Silakan coba kembali.",
      );
    } finally {
      setIsUploadingDroppedImage(false);
    }
  }
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph", "tableCell", "tableHeader"],
      }),
      Placeholder.configure({ placeholder: "Mulai tulis isi dokumen..." }),
      DocumentTemplateAttributes,
      DocumentVariable,
      TableKit.configure({
        table: { resizable: true, handleWidth: 8, cellMinWidth: 40 },
      }),
      ResizableImage.configure({
        allowBase64: true,
        inline: false,
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: 40,
          minHeight: 30,
          alwaysPreserveAspectRatio: true,
        },
        HTMLAttributes: { class: "h-auto" },
      }),
    ],
    content: initialPage.content,
    immediatelyRender: false,
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        const files = Array.from(event.dataTransfer.files).filter((file) =>
          ["image/png", "image/jpeg", "image/webp"].includes(file.type),
        );
        if (!files.length) return false;
        if (files.some((file) => file.size > 2 * 1024 * 1024)) {
          event.preventDefault();
          setImageDropError("Gambar yang dijatuhkan maksimal 2 MB per file.");
          return true;
        }

        const position = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        if (position === undefined) return false;
        event.preventDefault();
        setImageDropError("");
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.near(view.state.doc.resolve(position)),
          ),
        );
        void uploadDroppedImages(files);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          ["image/png", "image/jpeg", "image/webp"].includes(file.type),
        );
        if (!files.length) return false;
        if (files.some((file) => file.size > 2 * 1024 * 1024)) {
          setImageDropError("Gambar yang ditempel maksimal 2 MB per file.");
          return true;
        }
        setImageDropError("");
        event.preventDefault();
        void uploadDroppedImages(files);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      setLiveContentHtml(html);
      onChange(serializeTemplatePage(html, pageMarginsRef.current));
    },
    onSelectionUpdate: () => setSelectionVersion((value) => value + 1),
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    pageMarginsRef.current = pageMargins;
  }, [pageMargins]);

  useEffect(() => {
    const incomingPage = parseTemplatePage(contentHtml);
    if (editor && incomingPage.content !== editor.getHTML()) {
      editor.commands.setContent(incomingPage.content);
    }
  }, [contentHtml, editor]);

  useEffect(() => {
    if (editor) {
      onChange(serializeTemplatePage(editor.getHTML(), pageMargins));
    }
  }, [editor, onChange, pageMargins]);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.innerHTML = sanitizePreviewHtml(
        liveContentHtml,
        documentType,
      );
    }
  }, [liveContentHtml, documentType, showPreview]);

  useEffect(() => {
    if (!showPreview || !editorScrollRef.current || !previewScrollRef.current) {
      return;
    }
    previewScrollRef.current.scrollTop = editorScrollRef.current.scrollTop;
    previewScrollRef.current.scrollLeft = editorScrollRef.current.scrollLeft;
  }, [showPreview]);

  const syncPaneScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ) => {
    if (!showPreview || !source || !target || scrollSyncingRef.current) return;
    scrollSyncingRef.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      scrollSyncingRef.current = false;
    });
  };

  const startRowResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!editor || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("img, [data-resize-handle], [data-resize-wrapper]")) return;
    const cell = target.closest("td, th");
    const row = cell?.closest("tr");
    if (!(cell instanceof HTMLTableCellElement) || !(row instanceof HTMLTableRowElement)) return;
    if (cell.getBoundingClientRect().bottom - event.clientY > 12) return;
    const resolvedPosition = editor.state.doc.resolve(editor.view.posAtDOM(row, 0));
    let rowPosition: number | null = null;
    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name === "tableRow") {
        rowPosition = resolvedPosition.before(depth);
        break;
      }
    }
    if (rowPosition === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    rowResizeDragRef.current = {
      rowPosition,
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: row.getBoundingClientRect().height,
    };
  };

  const resizeSelectedRow = (height: number) => {
    const drag = rowResizeDragRef.current;
    if (!drag || !editor) return;
    const rowNode = editor.state.doc.nodeAt(drag.rowPosition);
    if (!rowNode || rowNode.type.name !== "tableRow") return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(drag.rowPosition, undefined, {
        ...rowNode.attrs,
        rowHeight: `${Math.min(500, Math.max(24, Math.round(height)))}px`,
      }),
    );
  };

  const moveRowResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = rowResizeDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      resizeSelectedRow(drag.startHeight + event.clientY - drag.startY);
    }
  };

  const finishRowResize = (event: PointerEvent<HTMLDivElement>) => {
    if (rowResizeDragRef.current?.pointerId !== event.pointerId) return;
    rowResizeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startImagePositionDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!editor || event.button !== 0 || rowResizeDragRef.current) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("[data-resize-handle]")) return;
    const image = target.closest("img");
    if (!(image instanceof HTMLImageElement)) return;

    let imagePosition: number | null = null;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "image") return;
      const imageNode = editor.view.nodeDOM(position);
      if (imageNode instanceof HTMLElement && imageNode.contains(image)) {
        imagePosition = position;
        return false;
      }
    });
    if (imagePosition === null) return;

    const offsetX = Number(image.dataset.offsetX ?? 0);
    const offsetY = Number(image.dataset.offsetY ?? 0);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    imagePositionDragRef.current = {
      image,
      imagePosition,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: Number.isInteger(offsetX) ? offsetX : 0,
      offsetY: Number.isInteger(offsetY) ? offsetY : 0,
      moved: false,
    };
  };

  const moveImagePosition = (event: PointerEvent<HTMLDivElement>) => {
    const drag = imagePositionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const offsetX = Math.min(500, Math.max(-500, Math.round(
      drag.offsetX + event.clientX - drag.startX,
    )));
    const offsetY = Math.min(500, Math.max(-500, Math.round(
      drag.offsetY + event.clientY - drag.startY,
    )));
    drag.image.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    drag.moved = offsetX !== drag.offsetX || offsetY !== drag.offsetY;
  };

  const finishImagePositionDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = imagePositionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    imagePositionDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const documentNode = editor?.state.doc;
    const imageNode = documentNode?.nodeAt(drag.imagePosition);
    if (!editor || imageNode?.type.name !== "image") return;

    const transaction = editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, drag.imagePosition),
    );
    if (drag.moved) {
      const offsetX = Math.min(500, Math.max(-500, Math.round(
        drag.offsetX + event.clientX - drag.startX,
      )));
      const offsetY = Math.min(500, Math.max(-500, Math.round(
        drag.offsetY + event.clientY - drag.startY,
      )));
      transaction.setNodeMarkup(drag.imagePosition, undefined, {
        ...imageNode.attrs,
        offsetX,
        offsetY,
      });
    }
    editor.view.dispatch(transaction);
  };

  return (
    <div className="space-y-3">
      {editor && (
        <WordToolbar
          editor={editor}
          selectionVersion={selectionVersion}
          documentType={documentType}
          pageMargins={pageMargins}
          onPageMarginsChange={setPageMargins}
          zoomValue={zoomValue}
          onZoomChange={setZoomValue}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {showPreview
            ? `Pratinjau cetak A4 · ${documentType === DocType.DO ? "Delivery Order" : documentType === DocType.SURAT_JALAN ? "Surat Jalan" : documentType === DocType.PURCHASE_ORDER ? "Purchase Order" : "Dokumen"}`
            : "Dokumen A4 · Halaman 1"}
        </p>
        {!splitPreview && (
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            onClick={(event) => {
              event.preventDefault();
              setPreviewExpanded((visible) => !visible);
            }}
          >
            {showPreview ? "Tutup pratinjau" : "Pantau cetak"}
          </button>
        )}
      </div>
      <div
        className={`grid grid-cols-1 gap-6 ${showPreview ? "xl:grid-cols-2" : ""}`}
      >
        <section className="min-w-0">
          <div
            ref={editorScrollRef}
            onScroll={(event) =>
              syncPaneScroll(event.currentTarget, previewScrollRef.current)
            }
            className="flex max-h-[80vh] w-full justify-center overflow-x-auto overflow-y-auto rounded-md bg-slate-100 p-4 md:p-8"
          >
            <div
              className="relative mx-auto shrink-0"
              style={{
                width: `${210 * zoomValue}mm`,
                minHeight: `calc(${297 * zoomValue}mm + ${40 * zoomValue}px)`,
              }}
            >
              <div
                className="document-word-page origin-top-left"
                style={{ transform: `scale(${zoomValue})` }}
              >
                <MarginRuler margins={pageMargins} onChange={setPageMargins} />
                <div
                  className="document-word-canvas document-template-editor relative min-h-[297mm] w-full max-w-[210mm] border-2 border-slate-500 bg-white p-6 text-[11pt] leading-relaxed text-gray-900 shadow-xl md:p-12"
                  style={{
                    paddingTop: `${pageMargins.top}mm`,
                    paddingRight: `${pageMargins.right}mm`,
                    paddingBottom: `${pageMargins.bottom}mm`,
                    paddingLeft: `${pageMargins.left}mm`,
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border border-dashed border-slate-400"
                    style={{
                      top: `${pageMargins.top}mm`,
                      right: `${pageMargins.right}mm`,
                      bottom: `${pageMargins.bottom}mm`,
                      left: `${pageMargins.left}mm`,
                    }}
                  />
                  <div
                    className="relative z-[1]"
                    style={{
                      minHeight: `calc(297mm - ${pageMargins.top + pageMargins.bottom}mm - 2px)`,
                    }}
                    onPointerDown={startRowResize}
                    onPointerMove={moveRowResize}
                    onPointerUp={finishRowResize}
                    onPointerCancel={finishRowResize}
                    onLostPointerCapture={finishRowResize}
                    onPointerDownCapture={startImagePositionDrag}
                    onPointerMoveCapture={moveImagePosition}
                    onPointerUpCapture={finishImagePositionDrag}
                    onPointerCancelCapture={finishImagePositionDrag}
                    onLostPointerCaptureCapture={finishImagePositionDrag}
                  >
                    <EditorContent
                      editor={editor}
                      className="document-word-content [&_.tiptap]:outline-none [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:text-3xl [&_.tiptap_h1]:font-bold [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:text-2xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:text-xl [&_.tiptap_h3]:font-semibold [&_.tiptap_p]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_img]:my-3 [&_.tiptap_img]:h-auto"
                      style={{
                        minHeight: `calc(297mm - ${pageMargins.top + pageMargins.bottom}mm - 2px)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {showPreview && (
          <section className="min-w-0">
            <div
              ref={previewScrollRef}
              onScroll={(event) =>
                syncPaneScroll(event.currentTarget, editorScrollRef.current)
              }
              className="flex max-h-[80vh] w-full justify-center overflow-x-auto overflow-y-auto rounded-md bg-slate-100 p-4 md:p-8"
            >
              <div
                className="relative mx-auto shrink-0"
                style={{
                  width: `${210 * zoomValue}mm`,
                  minHeight: `${297 * zoomValue}mm`,
                }}
              >
                <div
                  className="relative h-[297mm] w-[210mm] origin-top-left border-2 border-slate-500 bg-white shadow-xl"
                  style={{ transform: `scale(${zoomValue})` }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border border-dashed border-slate-400"
                    style={{
                      top: `${pageMargins.top}mm`,
                      right: `${pageMargins.right}mm`,
                      bottom: `${pageMargins.bottom}mm`,
                      left: `${pageMargins.left}mm`,
                    }}
                  />
                  <div
                    ref={previewRef}
                    className="document-a4-preview relative z-[1] min-h-full text-[11pt] leading-relaxed text-gray-900 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:h-auto [&_img]:max-w-full"
                    style={{
                      minHeight: `calc(297mm - ${pageMargins.top + pageMargins.bottom}mm - 2px)`,
                      paddingTop: `${pageMargins.top}mm`,
                      paddingRight: `${pageMargins.right}mm`,
                      paddingBottom: `${pageMargins.bottom}mm`,
                      paddingLeft: `${pageMargins.left}mm`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Pilih variabel melalui toolbar agar tetap menjadi satu badge. Geser
        penanda pada ruler atau atur margin melalui menu Tata Letak. Lebar
        kolom dapat diseret di garis vertikal tabel, tinggi baris di tepi bawah
        sel. Untuk menggeser gambar dengan presisi, pilih gambar lalu buka
        Sisipkan Gambar dan gunakan tombol arah.
      </p>
      <p className="text-xs text-muted-foreground">
        Variabel di toolbar mengikuti jenis dokumen. PO menggunakan baris
        material dengan harga dan jumlah; DO / Surat Jalan menggunakan nama
        barang, jumlah, dan satuan tanpa harga. Variabel {`{{items_rows}}`} hanya
        dipakai di dalam tbody tabel barang.
      </p>
      <p className="text-xs text-muted-foreground">
        Untuk menyusun kolom sendiri, sisipkan satu variabel barang di tiap sel:
        {" "}{`{{item_description}}`}, {`{{item_qty}}`}, {`{{item_unit}}`}, dan
        {" "}{`{{item_unit_price}}`} (khusus PO). Setiap kolom akan menampilkan
        nilai seluruh barang dengan urutan yang sama.
      </p>
      {imageDropError && (
        <p className="text-sm text-destructive" role="alert">
          {imageDropError}
        </p>
      )}
      {isUploadingDroppedImage && (
        <p className="text-sm text-muted-foreground" role="status">
          Mengunggah gambar ke Cloudinary...
        </p>
      )}
    </div>
  );
}
