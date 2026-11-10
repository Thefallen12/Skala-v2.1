"use client";
import { Textarea } from "@/components/ui/textarea";
import React, { useState } from "react";
import { TbCheck } from "react-icons/tb";
import { NotesType } from "@/app/(DashboardLayout)/types/apps/notes";

interface ColorType {
  lineColor: string;
  disp: string;
  id: number;
}

const colorClassMap: Record<string, string> = {
  primary: "bg-lightprimary",
  warning: "bg-lightwarning",
  error: "bg-lighterror",
  success: "bg-lightsuccess",
  secondary: "bg-lightsecondary",
};

interface NoteContentProps {
  note: NotesType | null;
  updateNote: (id: string, title: string, color: string) => void;
}

const NoteContent: React.FC<NoteContentProps> = ({ note, updateNote }) => {
  const [title, setTitle] = useState(note?.title ?? "");
  const [isEditing, setIsEditing] = useState(false);

  const displayTitle = !note ? "" : isEditing ? title : note.title ?? "";

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
    setIsEditing(true);
  };

  const handleColorChange = (color: string) => {
    if (!note) return;
    const nextTitle = isEditing ? title : note.title ?? "";
    updateNote(note.id, nextTitle, color);
  };

  const handleBlur = () => {
    if (!note) return;
    const nextTitle = isEditing ? title : note.title ?? "";
    setIsEditing(false);
    updateNote(note.id, nextTitle, note.color || "primary");
  };

  const colorOptions: ColorType[] = [
    { id: 1, lineColor: "warning", disp: "warning" },
    { id: 2, lineColor: "primary", disp: "primary" },
    { id: 3, lineColor: "error", disp: "error" },
    { id: 4, lineColor: "success", disp: "success" },
    { id: 5, lineColor: "secondary", disp: "secondary" },
  ];

  if (!note) {
    return (
      <div className="text-center w-full py-12 text-sm text-muted-foreground">
        Pilih catatan di sebelah kiri atau buat catatan baru.
      </div>
    );
  }

  return (
    <div className="flex grow p-4 sm:p-6">
      <div className="w-full space-y-4">
        <Textarea
          placeholder="Tulis isi catatan..."
          rows={6}
          value={displayTitle}
          onChange={handleTitleChange}
          onBlur={handleBlur}
          className="w-full p-4 form-control-textarea"
        />
        <div>
          <h6 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Label Warna Catatan
          </h6>
          <div className="flex gap-2.5 items-center">
            {colorOptions.map((color) => (
              <div
                key={color.id}
                onClick={() => handleColorChange(color.disp)}
                className={`h-7 w-7 flex justify-center items-center rounded-full cursor-pointer 
                  ${note.color === color.disp ? "ring-2 ring-primary ring-offset-2" : ""} 
                  ${colorClassMap[color.disp] ?? colorClassMap.primary}`}
              >
                {note.color === color.disp && <TbCheck size={16} className="text-foreground" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteContent;
