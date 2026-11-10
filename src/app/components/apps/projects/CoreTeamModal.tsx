"use client";

import React, { useState } from "react";
import { X, HelpCircle, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProjectCoreTeam } from "@/app/actions/project";

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
  currentPicName,
  availableUsers = [
    { id: "cmvxfnz6c_angga", name: "Angga Okta Pratama" },
    { id: "cmvxfnz6c_bambang", name: "Bambang Gunawan" },
    { id: "cmvxfnz6c_athariq", name: "Athariq Virziansyah" },
  ],
  onSuccess,
}: CoreTeamModalProps) {
  const [members, setMembers] = useState<TeamMemberRow[]>(() => {
    return [
      {
        id: "1",
        role: "Manajer proyek",
        userId: currentPicId || availableUsers[0]?.id || "",
        phone: "",
      },
      {
        id: "2",
        role: "Site manager",
        userId: "custom",
        customName: "mis. Pak Joko",
        phone: "",
      },
    ];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

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
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdate = (id: string, field: keyof TeamMemberRow, value: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      // Find the first PM to set as fieldPicId
      const pm = members.find((m) => m.role.toLowerCase().includes("manajer"));
      const picId = pm && pm.userId !== "custom" ? pm.userId : availableUsers[0]?.id || "";
      const res = await updateProjectCoreTeam(projectId, picId);
      if (res.success) {
        onSuccess?.();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-5 pb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Tim inti proyek</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Tulis tugas tiap orang di proyek ini, lalu pilih orang yang punya akun Vasco atau tulis
              nama dan nomornya. Daftar ini tidak memberi akses apa pun. Manajer proyek pertama juga
              tampil sebagai PM proyek.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <HelpCircle className="size-3.5" />
              <span>Panduan</span>
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Member rows */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-xl border border-border/70 p-3 bg-muted/10"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={m.role}
                  onChange={(e) => handleUpdate(m.id, "role", e.target.value)}
                  placeholder="Peran / Tugas"
                  className="h-9 w-36 text-xs"
                />

                <select
                  value={m.userId}
                  onChange={(e) => handleUpdate(m.id, "userId", e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden"
                >
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                  <option value="custom">Tulis nama sendiri</option>
                </select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMember(m.id)}
                  className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {m.userId === "custom" && (
                  <Input
                    type="text"
                    value={m.customName || ""}
                    onChange={(e) => handleUpdate(m.id, "customName", e.target.value)}
                    placeholder="mis. Pak Joko"
                    className="h-9 flex-1 text-xs"
                  />
                )}
                <Input
                  type="text"
                  value={m.phone || ""}
                  onChange={(e) => handleUpdate(m.id, "phone", e.target.value)}
                  placeholder="Telepon / WA"
                  className="h-9 flex-1 text-xs"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddMember}
            className="h-8 gap-1.5 text-xs rounded-lg mt-1"
          >
            <Plus className="size-3.5" />
            <span>Tambah orang</span>
          </Button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/10 p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 px-4 text-xs rounded-lg"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSubmitting}
            className="h-9 px-4 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            {isSubmitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
