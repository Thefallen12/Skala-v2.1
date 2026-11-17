"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { updateProjectCoreTeam } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TeamMemberRow {
  id: string;
  role: string;
  userId: string;
  customName?: string;
  phone?: string;
}

interface CoreTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentPicId?: string | null;
  currentPicName?: string | null;
  availableUsers?: { id: string; name: string }[];
  onSuccess?: () => void;
}

export default function CoreTeamModal({
  isOpen,
  onClose,
  projectId,
  currentPicId,
  availableUsers = [
    { id: "cmvxfnz6c_angga", name: "Angga Okta Pratama" },
    { id: "cmvxfnz6c_bambang", name: "Bambang Gunawan" },
    { id: "cmvxfnz6c_athariq", name: "Athariq Virziansyah" },
  ],
  onSuccess,
}: CoreTeamModalProps) {
  const [members, setMembers] = useState<TeamMemberRow[]>(() => [
    {
      id: "1",
      role: "Manajer proyek",
      userId: currentPicId || availableUsers[0]?.id || "custom",
      phone: "",
    },
    {
      id: "2",
      role: "Site manager",
      userId: "custom",
      customName: "",
      phone: "",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMember = () => {
    setMembers((prev) => [
      ...prev,
      {
        id: `tm_${Date.now()}`,
        role: "Pengawas Lapangan",
        userId: availableUsers[0]?.id || "custom",
        phone: "",
      },
    ]);
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== id));
  };

  const handleUpdate = (
    id: string,
    field: keyof TeamMemberRow,
    value: string,
  ) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.id === id ? { ...member, [field]: value } : member,
      ),
    );
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const pm = members.find((member) =>
        member.role.toLowerCase().includes("manajer"),
      );
      const picId =
        pm && pm.userId !== "custom" ? pm.userId : availableUsers[0]?.id || "";
      const res = await updateProjectCoreTeam(projectId, picId);
      if (res.success) {
        toast.success(res.message || "Tim inti proyek diperbarui.");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || "Tim inti gagal diperbarui.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menyimpan tim inti.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<Users className="size-4" aria-hidden="true" />}
      title="Tim Inti Proyek"
      description="Tentukan peran tiap anggota di proyek ini. Manajer proyek pertama tampil sebagai PIC proyek."
      className="max-w-lg"
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
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Menyimpan...
              </>
            ) : (
              "Simpan"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Input
                type="text"
                value={member.role}
                onChange={(event) =>
                  handleUpdate(member.id, "role", event.target.value)
                }
                placeholder="Peran / Tugas"
                className="sm:w-40"
              />

              <Select
                value={member.userId || "custom"}
                onValueChange={(value) =>
                  handleUpdate(member.id, "userId", value)
                }
              >
                <SelectTrigger className="min-w-[160px] flex-1">
                  <SelectValue placeholder="Pilih anggota" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Tulis nama sendiri</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Hapus anggota"
                onClick={() => handleRemoveMember(member.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {member.userId === "custom" && (
                <Input
                  type="text"
                  value={member.customName || ""}
                  onChange={(event) =>
                    handleUpdate(member.id, "customName", event.target.value)
                  }
                  placeholder="mis. Pak Joko"
                  className="flex-1"
                />
              )}
              <Input
                type="text"
                value={member.phone || ""}
                onChange={(event) =>
                  handleUpdate(member.id, "phone", event.target.value)
                }
                placeholder="Telepon / WhatsApp"
                className="flex-1"
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddMember}
          className="gap-1.5"
        >
          <Plus className="size-4" aria-hidden="true" />
          Tambah Anggota
        </Button>
      </div>
    </GlobalModal>
  );
}
