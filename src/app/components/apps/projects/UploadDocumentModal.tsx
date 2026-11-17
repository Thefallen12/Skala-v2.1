"use client";

import { useState, type FormEvent } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { uploadProjectDocument } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
}

const CATEGORIES = [
  "Kontrak",
  "Gambar kerja",
  "Izin & Legalitas",
  "BAST & Serah Terima",
  "Lainnya",
];

export default function UploadDocumentModal({
  isOpen,
  onClose,
  projectId,
  onSuccess,
}: UploadDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Kontrak");
  const [notes, setNotes] = useState("");
  const [showInClientPortal, setShowInClientPortal] = useState(false);
  const [showInMobileApp, setShowInMobileApp] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileName = files[0]?.name ?? "";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await uploadProjectDocument(projectId, {
        title: title.trim(),
        category,
        fileUrl: fileName
          ? `/uploads/${fileName}`
          : "/documents/dokumen_proyek.pdf",
        notes: notes.trim(),
      });

      if (res.success) {
        toast.success(res.message || "Dokumen berhasil diunggah.");
        setTitle("");
        setNotes("");
        setFiles([]);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || "Dokumen gagal diunggah.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat mengunggah dokumen.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<UploadCloud className="size-4" aria-hidden="true" />}
      title="Unggah Dokumen"
      description="PDF, gambar, DWG, Excel, atau dokumen lain (maksimal 25 MB)."
      className="max-w-md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="upload-project-doc-form"
            size="sm"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Mengunggah...
              </>
            ) : (
              "Unggah"
            )}
          </Button>
        </>
      }
    >
      <form
        id="upload-project-doc-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">Berkas Dokumen</Label>
          <FileDropzone
            accept=".pdf,.dwg,.dxf,.xlsx,.xls,image/*"
            multiple={false}
            maxSizeMb={25}
            files={files}
            disabled={isSubmitting}
            onFilesChange={(nextFiles) => {
              setFiles(nextFiles);
              if (nextFiles[0] && !title.trim()) {
                const base = nextFiles[0].name.replace(/\.[^.]+$/, "");
                setTitle(base);
              }
            }}
            onError={(msg) => toast.error(msg)}
            label="Pilih Berkas Dokumen"
            hint="PDF, gambar, DWG, atau Excel (maks. 25 MB)."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doc-category" className="type-p2 font-medium">
            Jenis Dokumen
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="doc-category" className="w-full">
              <SelectValue placeholder="Pilih jenis dokumen" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doc-title" className="type-p2 font-medium">
            Judul Dokumen <span className="text-destructive">*</span>
          </Label>
          <Input
            id="doc-title"
            type="text"
            placeholder="mis. Denah lantai 1-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2.5 pt-1">
          <Label
            htmlFor="doc-client-portal"
            className="flex cursor-pointer items-center gap-2.5"
          >
            <Checkbox
              id="doc-client-portal"
              checked={showInClientPortal}
              onCheckedChange={(checked) =>
                setShowInClientPortal(checked === true)
              }
            />
            <span className="type-p2 font-normal text-foreground">
              Tampilkan di portal klien
            </span>
          </Label>

          <Label
            htmlFor="doc-mobile-app"
            className="flex cursor-pointer items-center gap-2.5"
          >
            <Checkbox
              id="doc-mobile-app"
              checked={showInMobileApp}
              onCheckedChange={(checked) => setShowInMobileApp(checked === true)}
            />
            <span className="type-p2 font-normal text-foreground">
              Tampilkan ke tim proyek di HP
            </span>
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doc-notes" className="type-p2 font-medium">
            Catatan (opsional)
          </Label>
          <Input
            id="doc-notes"
            type="text"
            placeholder="mis. Rev 0"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </form>
    </GlobalModal>
  );
}
