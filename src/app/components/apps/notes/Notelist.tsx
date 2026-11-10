"use client";

import React, { useState } from "react";
import { NotesType } from "@/app/(DashboardLayout)/types/apps/notes";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Trash2 } from "lucide-react";

interface NotelistProps {
  notes: NotesType[];
  loading: boolean;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
}

// Map colors to Tailwind classes
const colorClassMap: Record<string, string> = {
  primary: "bg-lightprimary text-primary",
  warning: "bg-lightwarning text-warning",
  error: "bg-lighterror text-error",
  success: "bg-lightsuccess text-success",
  secondary: "bg-lightsecondary text-secondary",
};

const Notelist: React.FC<NotelistProps> = ({ notes, loading, selectedNoteId, onSelectNote, onDeleteNote }) => {
  const [searchTerm, setSearchTerm] = useState<string>("");

  const effectiveActiveNoteId = selectedNoteId ?? notes[0]?.id ?? null;

  const filteredNotes = notes.filter((note) => {
    if (note.deleted) return false;
    if (!note.title) return false;
    if (searchTerm === "") return true;
    return note.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleNoteClick = (noteId: string) => {
    onSelectNote(noteId);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Memuat catatan...</p>;

  return (
    <div>
      <Input
        type="text"
        placeholder="Cari catatan..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full"
      />
      <h6 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4">
        Semua Catatan ({filteredNotes.length})
      </h6>
      <div className="flex flex-col gap-2.5 mt-3">
        {filteredNotes.length ? (
          filteredNotes.map((note) => {
            const colorClasses = colorClassMap[note.color || "primary"];
            return (
              <div key={note.id}>
                <div
                  className={`cursor-pointer relative p-3.5 rounded-lg ${colorClasses} ${
                    effectiveActiveNoteId === note.id ? "ring-2 ring-primary/40" : "opacity-90"
                  } transition-all duration-150`}
                  onClick={() => handleNoteClick(note.id)}
                >
                  <h6 className="text-sm font-medium truncate">{note.title}</h6>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      {note.datef ? new Date(note.datef).toLocaleDateString("id-ID") : "-"}
                    </p>
                    <ActionIconButton
                      label={`Hapus catatan ${note.title}`}
                      tooltip={`Hapus catatan ${note.title}`}
                      icon={Trash2}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      variant="ghost"
                    />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <Alert>
            <AlertTitle className="text-xs">Belum ada catatan yang sesuai.</AlertTitle>
          </Alert>
        )}
      </div>
    </div>
  );
};

export default Notelist;
