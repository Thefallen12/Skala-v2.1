"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GlobalModal } from "@/components/ui/global-modal";
import { Label } from "@/components/ui/label";

interface WorkCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (selectedDays: string[]) => void;
}

const HOLIDAYS = [
  { date: "24 Des 2026", desc: "Cuti bersama Hari Raya Natal (cuti bersama)" },
  { date: "25 Des 2026", desc: "Hari Raya Natal" },
  { date: "1 Jan 2027", desc: "Tahun Baru 2027 Masehi" },
  { date: "5 Jan 2027", desc: "Isra Mikraj Nabi Muhammad SAW" },
  { date: "5 Feb 2027", desc: "Cuti bersama Tahun Baru Imlek (cuti bersama)" },
  { date: "6 Feb 2027", desc: "Tahun Baru Imlek 2578 Kongzili" },
  { date: "8 Mar 2027", desc: "Hari Suci Nyepi (Tahun Baru Saka 1949)" },
  { date: "9 Mar 2027", desc: "Cuti bersama Idul Fitri (cuti bersama)" },
  { date: "10 Mar 2027", desc: "Idul Fitri 1448 Hijriah" },
  { date: "11 Mar 2027", desc: "Idul Fitri 1448 Hijriah" },
  { date: "12 Mar 2027", desc: "Cuti bersama Idul Fitri (cuti bersama)" },
  { date: "15 Mar 2027", desc: "Cuti bersama Idul Fitri (cuti bersama)" },
];

const DAYS = [
  { id: "sen", label: "Sen" },
  { id: "sel", label: "Sel" },
  { id: "rab", label: "Rab" },
  { id: "kam", label: "Kam" },
  { id: "jum", label: "Jum" },
  { id: "sab", label: "Sab" },
  { id: "min", label: "Min" },
];

export default function WorkCalendarModal({
  isOpen,
  onClose,
  onSave,
}: WorkCalendarModalProps) {
  const [activeDays, setActiveDays] = useState<string[]>([
    "sen",
    "sel",
    "rab",
    "kam",
    "jum",
    "sab",
  ]);

  const toggleDay = (id: string) => {
    setActiveDays((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    onSave?.(activeDays);
    toast.success("Kalender kerja proyek diperbarui.");
    onClose();
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<Calendar className="size-4" aria-hidden="true" />}
      title="Kalender Kerja"
      description="Rencana RAB, perkiraan selesai, dan geser otomatis di Gantt menghitung hari kerja ini."
      className="max-w-md"
      footerNote="Libur nasional mengikuti kalender HR di Pengaturan."
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="type-p2 font-semibold text-foreground">
            Hari Kerja Aktif
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {DAYS.map((day) => {
              const checked = activeDays.includes(day.id);
              return (
                <Label
                  key={day.id}
                  htmlFor={`work-day-${day.id}`}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                >
                  <Checkbox
                    id={`work-day-${day.id}`}
                    checked={checked}
                    onCheckedChange={() => toggleDay(day.id)}
                  />
                  <span className="type-p3 font-medium text-foreground">
                    {day.label}
                  </span>
                </Label>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="type-h3 flex items-center gap-1.5 text-foreground">
            <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>Libur 12 Bulan ke Depan</span>
          </h3>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {HOLIDAYS.map((holiday) => (
              <div
                key={`${holiday.date}-${holiday.desc}`}
                className="type-p3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-muted-foreground"
              >
                <span className="shrink-0 font-semibold text-foreground tabular-nums">
                  {holiday.date}
                </span>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 flex-1">{holiday.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlobalModal>
  );
}
