"use client";
import { FormLabel } from "@/components/ui/label"

import type { Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import {
  Columns3,
  Rows3,
  Table2,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function handleButtonAction(action: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    action();
  };
}

export default function TableMenuPopover({
  editor,
  selectionVersion,
}: {
  editor: Editor;
  selectionVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const rowHeight = editor.getAttributes("tableRow").rowHeight;
  const rowHeightValue =
    typeof rowHeight === "string" && /^\d{2,3}px$/.test(rowHeight)
      ? Number.parseInt(rowHeight, 10)
      : "";
  const [heightDraft, setHeightDraft] = useState(
    rowHeightValue === "" ? "" : String(rowHeightValue),
  );
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [borderColor, setBorderColor] = useState("#a3a3a3");
  const [colorError, setColorError] = useState("");

  useEffect(() => {
    const syncHeight = () => {
      const value = editor.getAttributes("tableRow").rowHeight;
      setHeightDraft(
        typeof value === "string" && /^\d{2,3}px$/.test(value)
          ? String(Number.parseInt(value, 10))
          : "",
      );
      const cellType = editor.isActive("tableHeader") ? "tableHeader" : "tableCell";
      const cellAttributes = editor.getAttributes(cellType);
      setBackgroundColor(
        typeof cellAttributes.backgroundColor === "string" &&
          /^#[0-9a-f]{6}$/i.test(cellAttributes.backgroundColor)
          ? cellAttributes.backgroundColor
          : "#ffffff",
      );
      setBorderColor(
        typeof cellAttributes.borderColor === "string" &&
          /^#[0-9a-f]{6}$/i.test(cellAttributes.borderColor)
          ? cellAttributes.borderColor
          : "#a3a3a3",
      );
    };
    syncHeight();
    editor.on("selectionUpdate", syncHeight);
    return () => {
      editor.off("selectionUpdate", syncHeight);
    };
  }, [editor, selectionVersion]);

  if (!editor.isActive("table")) return null;

  const runCommand = (command: () => boolean) => {
    command();
    editor.view.focus();
  };

  const selectCurrentColumn = () => {
    const { state, view } = editor;
    const selection = state.selection;
    let cellPosition: number | null = null;
    if (selection instanceof CellSelection) {
      cellPosition = selection.$anchorCell.pos;
    } else {
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        const nodeName = selection.$from.node(depth).type.name;
        if (nodeName === "tableCell" || nodeName === "tableHeader") {
          cellPosition = selection.$from.before(depth);
          break;
        }
      }
    }
    if (cellPosition === null) return false;
    const cell = state.doc.resolve(cellPosition);
    view.dispatch(state.tr.setSelection(CellSelection.colSelection(cell)));
    return true;
  };

  const applyCellStyle = (
    attribute: "backgroundColor" | "borderColor",
    color: string,
    wholeColumn: boolean,
  ) => {
    if (wholeColumn && !selectCurrentColumn()) {
      setColorError("Pilih sel di dalam tabel terlebih dahulu.");
      return;
    }
    setColorError("");
    editor.chain().focus().setCellAttribute(attribute, color).run();
    editor.view.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Table2 className="h-4 w-4" />
          Alat Tabel
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-1 p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
          Warna sel dan kolom
        </p>
        <div className="space-y-2 rounded-md border p-2">
          <FormLabel className="flex items-center justify-between gap-2 text-sm">
            Warna isi
            <input
              type="color"
              aria-label="Warna isi sel atau kolom"
              className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.target.value)}
            />
          </FormLabel>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleButtonAction(() =>
                applyCellStyle("backgroundColor", backgroundColor, false),
              )}
            >
              Warnai sel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleButtonAction(() =>
                applyCellStyle("backgroundColor", backgroundColor, true),
              )}
            >
              Warnai kolom
            </Button>
          </div>
        </div>
        <div className="space-y-2 rounded-md border p-2">
          <FormLabel className="flex items-center justify-between gap-2 text-sm">
            Warna garis
            <input
              type="color"
              aria-label="Warna garis sel atau kolom"
              className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
              value={borderColor}
              onChange={(event) => setBorderColor(event.target.value)}
            />
          </FormLabel>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleButtonAction(() =>
                applyCellStyle("borderColor", borderColor, false),
              )}
            >
              Garis sel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleButtonAction(() =>
                applyCellStyle("borderColor", borderColor, true),
              )}
            >
              Garis kolom
            </Button>
          </div>
        </div>
        <div className="my-1 border-t" />
        {colorError && (
          <p className="px-2 text-xs text-destructive" role="alert">
            {colorError}
          </p>
        )}
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
          Baris dan kolom
        </p>
        <FormLabel className="flex items-center gap-2 px-2 py-1 text-sm">
          Tinggi baris (px)
          <Input
            aria-label="Tinggi baris tabel dalam piksel"
            className="h-8 w-20"
            type="number"
            min={24}
            max={500}
            value={heightDraft}
            placeholder="Otomatis"
            onChange={(event) => setHeightDraft(event.target.value)}
            onBlur={() => {
              const height = Number.parseInt(heightDraft, 10);
              editor
                .chain()
                .focus()
                .updateAttributes("tableRow", {
                  rowHeight: Number.isFinite(height)
                    ? `${Math.min(500, Math.max(24, height))}px`
                    : null,
                })
                .run();
              setHeightDraft(
                Number.isFinite(height)
                  ? String(Math.min(500, Math.max(24, height)))
                  : "",
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </FormLabel>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().addRowBefore().run())
          )}
        >
          <Rows3 className="h-4 w-4" /> Tambah baris sebelum
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().addRowAfter().run())
          )}
        >
          <Rows3 className="h-4 w-4" /> Tambah baris sesudah
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().addColumnBefore().run())
          )}
        >
          <Columns3 className="h-4 w-4" /> Tambah kolom sebelum
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().addColumnAfter().run())
          )}
        >
          <Columns3 className="h-4 w-4" /> Tambah kolom sesudah
        </Button>
        <div className="my-1 border-t" />
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={!editor.can().mergeCells()}
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().mergeCells().run())
          )}
        >
          Gabungkan sel
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={!editor.can().splitCell()}
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().splitCell().run())
          )}
        >
          Pisahkan sel
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().toggleHeaderRow().run())
          )}
        >
          Toggle header row
        </Button>
        <div className="my-1 border-t" />
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().deleteRow().run())
          )}
        >
          <Rows3 className="h-4 w-4" /> Hapus baris
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().deleteColumn().run())
          )}
        >
          <Columns3 className="h-4 w-4" /> Hapus kolom
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-destructive"
          onClick={handleButtonAction(() =>
            runCommand(() => editor.chain().focus().deleteTable().run())
          )}
        >
          <Trash2 className="h-4 w-4" /> Hapus tabel
        </Button>
      </PopoverContent>
    </Popover>
  );
}
