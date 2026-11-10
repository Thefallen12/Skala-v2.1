"use client";

import React, { useState } from "react";
import { X, HelpCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  if (!isOpen) return null;

  const toggleDay = (id: string) => {
    setActiveDays((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    onSave?.(activeDays);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-5 pb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Kalender kerja proyek</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Rencana RAB, perkiraan selesai dan geser otomatis di Gantt menghitung hari kerja ini.
              Libur nasional, cuti bersama dan libur perusahaan mengikuti kalender HR di Pengaturan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <HelpCircle className="size-3.5" />
              <span>Panduan</span>
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Days selection */}
        <div className="p-5 pb-2">
          <div className="flex items-center flex-wrap gap-4 text-xs">
            {DAYS.map((day) => {
              const checked = activeDays.includes(day.id);
              return (
                <label
                  key={day.id}
                  className="flex items-center gap-1.5 cursor-pointer text-foreground select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDay(day.id)}
                    className="size-4 rounded border-border text-foreground accent-foreground cursor-pointer"
                  />
                  <span>{day.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Holidays list */}
        <div className="p-5 pt-3">
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span>Libur 12 bulan ke depan</span>
          </h4>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs text-muted-foreground">
            {HOLIDAYS.map((h, idx) => (
              <div key={idx} className="flex items-start gap-2 py-0.5">
                <span className="font-medium text-foreground whitespace-nowrap">{h.date}</span>
                <span>·</span>
                <span className="truncate">{h.desc}</span>
              </div>
            ))}
          </div>
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
            className="h-9 px-4 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
