"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, type ChangeEvent } from "react";
import type { Editor } from "@tiptap/react";
import { DocType } from "@prisma/client";
import { uploadDocumentTemplateImage } from "@/app/actions/documents";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Ruler,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TableMenuPopover from "./TableMenuPopover";

const commonVariables = [
  { key: "nomor_dokumen", label: "Nomor dokumen" },
  { key: "tanggal", label: "Tanggal dokumen" },
  { key: "nama_proyek", label: "Nama proyek" },
  { key: "nama_klien", label: "Nama klien" },
  { key: "nama_requester", label: "Nama pemohon" },
  { key: "lokasi_pengiriman", label: "Lokasi pengiriman" },
  { key: "catatan", label: "Catatan" },
  { key: "verification_url", label: "URL verifikasi dokumen" },
  { key: "qr_signature", label: "QR signature" },
];

const purchaseOrderVariables = [
  { key: "nomor_request", label: "Nomor permintaan" },
  { key: "judul_request", label: "Judul permintaan" },
  { key: "tanggal_spk", label: "Tanggal SPK" },
  { key: "due_date", label: "Tanggal jatuh tempo" },
  { key: "nama_vendor", label: "Nama vendor" },
  { key: "alamat_vendor", label: "Alamat vendor" },
  { key: "kontak_vendor", label: "Kontak vendor" },
  { key: "total_biaya", label: "Total biaya PO" },
  { key: "diskon", label: "Diskon PO" },
  { key: "pajak", label: "Pajak PO" },
  { key: "item_description", label: "Deskripsi barang" },
  { key: "item_qty", label: "Qty barang" },
  { key: "item_unit", label: "Unit barang" },
  { key: "item_unit_price", label: "Unit price barang" },
  { key: "items_table", label: "Tabel material" },
  { key: "items_rows", label: "Baris material (untuk di dalam tabel)" },
  { key: "items", label: "Baris material (alias)" },
];

const deliveryOrderVariables = [
  { key: "nomor_surat_jalan", label: "Nomor surat jalan / DO" },
  { key: "tanggal_pengiriman", label: "Tanggal pengiriman" },
  { key: "nama_pengirim", label: "Nama pengirim / gudang" },
  { key: "nama_penerima", label: "Nama penerima" },
  { key: "nama_vendor", label: "Nama pemasok" },
  { key: "item_description", label: "Deskripsi barang" },
  { key: "item_qty", label: "Qty barang" },
  { key: "item_unit", label: "Unit barang" },
  { key: "items_table", label: "Tabel barang dikirim" },
  { key: "items_rows", label: "Baris barang (untuk di dalam tabel)" },
  { key: "items", label: "Baris barang (alias)" },
];

type PageMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "default" : "outline"}
      className="h-8 w-8"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

export default function WordToolbar({
  editor,
  selectionVersion,
  documentType,
  pageMargins,
  onPageMarginsChange,
  zoomValue,
  onZoomChange,
}: {
  editor: Editor;
  selectionVersion: number;
  documentType: DocType;
  pageMargins: PageMargins;
  onPageMarginsChange: (margins: PageMargins) => void;
  zoomValue: number;
  onZoomChange: (zoom: number) => void;
}) {
  const [tableGridOpen, setTableGridOpen] = useState(false);
  const [gridSize, setGridSize] = useState({ rows: 0, columns: 0 });
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageSource, setImageSource] = useState("");
  const [imageWidth, setImageWidth] = useState("480");
  const [imageAlignment, setImageAlignment] = useState("center");
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [imageError, setImageError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const variables = [
    ...commonVariables,
    ...(documentType === DocType.PURCHASE_ORDER
      ? purchaseOrderVariables
      : documentType === DocType.DO || documentType === DocType.SURAT_JALAN
        ? deliveryOrderVariables
        : []),
  ];
  void selectionVersion;

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageError("Pilih gambar PNG, JPEG, atau WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImageError("Ukuran gambar maksimal 2 MB.");
      return;
    }
    setIsUploadingImage(true);
    try {
      const result = await uploadDocumentTemplateImage(file);
      if (!result.success || !result.imageUrl) {
        setImageError(result.message);
        return;
      }
      setImageSource(result.imageUrl);
      setImageError("");
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Gambar gagal diunggah. Silakan coba kembali.",
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveImage = async () => {
    let source = imageSource.trim();
    if (/^https?:\/\//i.test(source)) {
      try {
        const imageUrl = new URL(source);
        if (imageUrl.protocol !== "https:") {
          setImageError("URL gambar harus menggunakan HTTPS.");
          return;
        }
        if (imageUrl.hostname !== "res.cloudinary.com") {
          const response = await fetch(imageUrl, {
            mode: "cors",
            credentials: "omit",
            redirect: "error",
          });
          if (!response.ok) throw new Error("Image request failed.");
          const image = await response.blob();
          if (
            !["image/png", "image/jpeg", "image/webp"].includes(image.type) ||
            image.size > 2 * 1024 * 1024
          ) {
            setImageError("URL harus menghasilkan gambar PNG, JPEG, atau WebP maksimal 2 MB.");
            return;
          }
          source = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("Image conversion failed."));
            reader.onerror = () => reject(new Error("Image conversion failed."));
            reader.readAsDataURL(image);
          });
        }
      } catch {
        setImageError(
          "Gambar dari URL tidak dapat diambil. Pastikan HTTPS dan CORS diizinkan, atau unggah file secara langsung.",
        );
        return;
      }
    }
    if (
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(source) &&
      !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.+/i.test(source)
    ) {
      setImageError("Masukkan URL HTTPS yang valid atau unggah file gambar.");
      return;
    }
    const width = Math.min(1000, Math.max(40, Number.parseInt(imageWidth, 10) || 480));
    if (editor.isActive("image")) {
      editor.chain().focus().updateAttributes("image", {
        src: source,
        width,
        alignment: imageAlignment,
        offsetX: imageOffsetX,
        offsetY: imageOffsetY,
      }).run();
    } else {
      editor
        .chain()
        .focus()
        .setImage({ src: source, width, alt: "Gambar dokumen" })
        .updateAttributes("image", {
          alignment: imageAlignment,
          offsetX: imageOffsetX,
          offsetY: imageOffsetY,
        })
        .run();
    }
    setImageDialogOpen(false);
    setImageError("");
  };

  const isHeading = (level: number) => editor.isActive("heading", { level });
  const paragraphStyle = editor.getAttributes("paragraph").textAlign;
  const headingLevel = isHeading(1) ? "h1" : isHeading(2) ? "h2" : isHeading(3) ? "h3" : "paragraph";
  const color = editor.getAttributes("textStyle").color ?? "#111827";
  const isImageSelected = editor.isActive("image");

  return (
    <div className="sticky top-0 z-20 space-y-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={String(zoomValue)}
          onValueChange={(value) => onZoomChange(Number(value))}
        >
          <SelectTrigger aria-label="Zoom halaman" className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.75">75%</SelectItem>
            <SelectItem value="0.9">90%</SelectItem>
            <SelectItem value="1">100%</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={headingLevel}
          onValueChange={(value) => {
            const chain = editor.chain().focus();
            if (value === "paragraph") chain.setParagraph().run();
            else chain.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <SelectTrigger aria-label="Gaya paragraf" className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">Normal Text</SelectItem>
            <SelectItem value="h1">Heading 1</SelectItem>
            <SelectItem value="h2">Heading 2</SelectItem>
            <SelectItem value="h3">Heading 3</SelectItem>
          </SelectContent>
        </Select>
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough />
        </ToolbarButton>
        <FormLabel className="flex h-8 items-center gap-1 rounded-md border px-2 text-xs" title="Warna teks">
          <span>Warna</span>
          <input
            type="color"
            aria-label="Warna teks"
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
            value={color}
            onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
          />
        </FormLabel>
        <Select
          defaultValue="11pt"
          onValueChange={(value) => editor.chain().focus().setFontSize(value).run()}
        >
          <SelectTrigger aria-label="Ukuran font" className="h-8 w-24">
            <SelectValue placeholder="Ukuran" />
          </SelectTrigger>
          <SelectContent>
            {["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "32pt", "36pt"].map((size) => (
              <SelectItem key={size} value={size}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="mx-1 h-6 border-l" />
        <ToolbarButton label="Rata kiri" active={paragraphStyle === "left"} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft />
        </ToolbarButton>
        <ToolbarButton label="Rata tengah" active={paragraphStyle === "center"} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter />
        </ToolbarButton>
        <ToolbarButton label="Rata kanan" active={paragraphStyle === "right"} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight />
        </ToolbarButton>
        <ToolbarButton label="Rata kiri-kanan" active={paragraphStyle === "justify"} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify />
        </ToolbarButton>
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 />
        </ToolbarButton>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        <Popover open={tableGridOpen} onOpenChange={setTableGridOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">Sisipkan Tabel</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <p className="mb-2 text-sm font-medium">
              {gridSize.rows && gridSize.columns
                ? `${gridSize.rows} x ${gridSize.columns}`
                : "Pilih ukuran tabel"}
            </p>
            <div className="grid grid-cols-8 gap-1" role="grid" aria-label="Pilih ukuran tabel">
              {Array.from({ length: 64 }, (_, index) => {
                const row = Math.floor(index / 8) + 1;
                const column = (index % 8) + 1;
                const active = row <= gridSize.rows && column <= gridSize.columns;
                return (
                  <button
                    key={`${row}-${column}`}
                    type="button"
                    className={`h-5 w-5 rounded-sm border ${active ? "border-primary bg-primary/30" : "bg-background"}`}
                    aria-label={`${row} baris ${column} kolom`}
                    onMouseEnter={() => setGridSize({ rows: row, columns: column })}
                    onFocus={() => setGridSize({ rows: row, columns: column })}
                    onClick={(event) => {
                      event.preventDefault();
                      editor.chain().focus().insertTable({
                        rows: row,
                        cols: column,
                        withHeaderRow: true,
                      }).run();
                      setTableGridOpen(false);
                    }}
                  />
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <TableMenuPopover editor={editor} selectionVersion={selectionVersion} />
        <Button
          type="button"
          size="sm"
          variant={isImageSelected ? "default" : "outline"}
          onClick={(event) => {
            event.preventDefault();
            const attributes = editor.getAttributes("image");
            setImageSource(attributes.src ?? "");
            setImageWidth(String(attributes.width ?? 480));
            setImageAlignment(attributes.alignment ?? "center");
            setImageOffsetX(Number(attributes.offsetX) || 0);
            setImageOffsetY(Number(attributes.offsetY) || 0);
            setImageError("");
            setImageDialogOpen(true);
          }}
        >
          <ImagePlus className="h-4 w-4" /> Sisipkan Gambar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline">Sisipkan Variabel</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto">
            <DropdownMenuLabel>Variabel dokumen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {variables.map(({ key, label }) => (
              <DropdownMenuItem
                key={key}
                onSelect={() =>
                  editor.chain().focus().insertContent({
                    type: "documentVariable",
                    attrs: { key },
                  }).run()
                }
              >
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  {`{{${key}}}`}
                </span>
                <span>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Ruler className="h-4 w-4" /> Tata Letak
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3">
            <div>
              <p className="text-sm font-semibold">Margin halaman A4</p>
              <p className="text-xs text-muted-foreground">
                Garis putus-putus menunjukkan batas area cetak.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <FormLabel key={side} className="space-y-1 text-sm">
                  {side === "top" ? "Atas" : side === "right" ? "Kanan" : side === "bottom" ? "Bawah" : "Kiri"}
                  <Input
                    type="number"
                    min={5}
                    max={50}
                    step={1}
                    value={pageMargins[side]}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(parsed)) return;
                      onPageMarginsChange({
                        ...pageMargins,
                        [side]: Math.min(50, Math.max(5, parsed)),
                      });
                    }}
                    aria-label={`Margin ${side}`}
                  />
                </FormLabel>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Nilai dalam milimeter (5–50 mm).</p>
          </PopoverContent>
        </Popover>
      </div>

      <GlobalModal
        isOpen={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        title={isImageSelected ? "Atur Gambar" : "Sisipkan Gambar"}
        description="Unggah file PNG/JPEG/WebP hingga 2 MB atau URL HTTPS dengan akses CORS. URL akan disimpan sebagai gambar tersemat di template."
        className="sm:max-w-xl"
        footerNote=""
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isUploadingImage}
              onClick={() => setImageDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={isUploadingImage}
              onClick={(event) => {
                event.preventDefault();
                void saveImage();
              }}
            >
              {isImageSelected ? "Simpan Gambar" : "Sisipkan"}
            </Button>
          </>
        }
      >
          <div className="space-y-3">
            <Input
              type="url"
              placeholder="https://contoh.com/logo.png"
              value={imageSource.startsWith("data:") ? "" : imageSource}
              onChange={(event) => setImageSource(event.target.value)}
              aria-label="URL gambar"
            />
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              disabled={isUploadingImage}
              aria-label="Unggah gambar"
            />
            {isUploadingImage && (
              <p className="text-sm text-muted-foreground" role="status">
                Mengunggah gambar ke Cloudinary...
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormLabel className="space-y-1 text-sm">
                Lebar gambar (px)
                <Input
                  type="number"
                  min={40}
                  max={1000}
                  value={imageWidth}
                  onChange={(event) => setImageWidth(event.target.value)}
                />
              </FormLabel>
              <FormLabel className="space-y-1 text-sm">
                Posisi gambar
                <Select value={imageAlignment} onValueChange={setImageAlignment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Kiri</SelectItem>
                    <SelectItem value="center">Tengah</SelectItem>
                    <SelectItem value="right">Kanan</SelectItem>
                  </SelectContent>
                </Select>
              </FormLabel>
            </div>
            {isImageSelected && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Seret gambar dengan mouse</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Geser gambar ke kiri"
                    title="Geser kiri"
                    onClick={(event) => {
                      event.preventDefault();
                      setImageOffsetX((value) => Math.max(-500, value - 10));
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Geser gambar ke atas"
                      title="Geser atas"
                      onClick={(event) => {
                        event.preventDefault();
                        setImageOffsetY((value) => Math.max(-500, value - 10));
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Geser gambar ke bawah"
                      title="Geser bawah"
                      onClick={(event) => {
                        event.preventDefault();
                        setImageOffsetY((value) => Math.min(500, value + 10));
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Geser gambar ke kanan"
                    title="Geser kanan"
                    onClick={(event) => {
                      event.preventDefault();
                      setImageOffsetX((value) => Math.min(500, value + 10));
                    }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Atau gunakan tombol · Horizontal: {imageOffsetX} px · Vertikal: {imageOffsetY} px
                </p>
              </div>
            )}
            {imageError && <p className="text-sm text-destructive" role="alert">{imageError}</p>}
          </div>
      </GlobalModal>
    </div>
  );
}
