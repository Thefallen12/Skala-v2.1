"use client";

import * as React from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dateFromKey,
  getJakartaDateKey,
  isValidDateKey,
} from "@/lib/habit-date";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  /** Tanggal terpilih dalam format yyyy-MM-dd (zona Asia/Jakarta). */
  value?: string;
  onValueChange?: (dateKey: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  clearable?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
}

function toJakartaKeyFromDay(date: Date): string {
  // Gunakan tengah hari UTC (12:00 UTC / 19:00 WIB) agar konversi zona waktu
  // tidak bergeser hari pada perangkat dengan timezone selain Asia/Jakarta.
  return getJakartaDateKey(
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
  );
}

export function DatePicker({
  value,
  onValueChange,
  placeholder = "Pilih tanggal",
  disabled = false,
  minDate,
  maxDate,
  clearable = false,
  id,
  name,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!value || !isValidDateKey(value)) return undefined;
    return dateFromKey(value);
  }, [value]);

  const defaultMonth = React.useMemo(() => {
    if (selectedDate) return selectedDate;
    return dateFromKey(getJakartaDateKey());
  }, [selectedDate]);

  const formattedLabel = React.useMemo(() => {
    if (!selectedDate) return null;
    return format(selectedDate, "d MMM yyyy", { locale: idLocale });
  }, [selectedDate]);

  const isDateDisabled = React.useCallback(
    (date: Date) => {
      const key = toJakartaKeyFromDay(date);
      if (minDate && isValidDateKey(minDate) && key < minDate) return true;
      if (maxDate && isValidDateKey(maxDate) && key > maxDate) return true;
      return false;
    },
    [maxDate, minDate],
  );

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onValueChange?.(toJakartaKeyFromDay(date));
    setOpen(false);
  };

  return (
    <div className="relative flex w-full items-center">
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={open}
            className={cn(
              "h-10 w-full justify-start border-input bg-background px-3 text-left font-normal text-foreground hover:bg-accent/50 hover:text-foreground",
              !formattedLabel && "text-muted-foreground",
              clearable && formattedLabel && "pr-9",
              className,
            )}
          >
            <CalendarDays
              className="mr-2 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="type-p2 truncate">
              {formattedLabel ?? placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto border border-border bg-popover p-0 text-popover-foreground shadow-lg"
        >
          <Calendar
            mode="single"
            locale={idLocale}
            selected={selectedDate}
            defaultMonth={defaultMonth}
            disabled={isDateDisabled}
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>

      {clearable && formattedLabel && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-compact="true"
          aria-label="Hapus tanggal"
          onClick={() => onValueChange?.("")}
          className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
