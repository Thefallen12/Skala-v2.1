"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  id?: string;
  name?: string;
  className?: string;
  contentClassName?: string;
  "aria-label"?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Pilih opsi...",
  searchPlaceholder = "Cari data...",
  emptyText = "Data tidak ditemukan.",
  disabled = false,
  allowClear = false,
  id,
  name,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const handleSelect = (optionValue: string) => {
    if (allowClear && optionValue === value) {
      onValueChange?.("");
    } else {
      onValueChange?.(optionValue);
    }
    setOpen(false);
  };

  return (
    <>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-10 w-full justify-between border-input bg-background px-3 font-normal text-foreground hover:bg-accent/50 hover:text-foreground",
              !selectedOption && "text-muted-foreground",
              className,
            )}
          >
            <span className="type-p2 truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown
              className="ml-2 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn(
            "w-(--radix-popover-trigger-width) min-w-[220px] border border-border bg-popover p-0 text-popover-foreground shadow-lg",
            contentClassName,
          )}
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} className="type-p2" />
            <CommandList>
              <CommandEmpty className="type-p3 py-6 text-center text-muted-foreground">
                {emptyText}
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = option.value === value;
                  const searchValue = [
                    option.label,
                    option.description ?? "",
                    ...(option.keywords ?? []),
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <CommandItem
                      key={option.value}
                      value={searchValue}
                      disabled={option.disabled}
                      onSelect={() => handleSelect(option.value)}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="type-p2 truncate font-medium text-foreground">
                          {option.label}
                        </p>
                        {option.description ? (
                          <p className="type-p3 truncate text-muted-foreground">
                            {option.description}
                          </p>
                        ) : null}
                      </div>
                      <Check
                        className={cn(
                          "size-4 shrink-0 text-primary transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
