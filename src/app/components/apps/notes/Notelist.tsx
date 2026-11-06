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

  if (loading) return <p>Loading notes...</p>;

  return (
    <div>
      <Input
        type="text"
        placeholder="Search Notes"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full"
      />
      <h6 className="text-base mt-6">All Notes</h6>
      <div className="flex flex-col gap-3 mt-4">
        {filteredNotes.length ? (
          filteredNotes.map((note) => {
            const colorClasses = colorClassMap[note.color || "primary"];
            return (
              <div key={note.id}>
                <div
                  className={`cursor-pointer relative p-4 rounded-md ${colorClasses} ${
                    effectiveActiveNoteId === note.id ? "scale-100" : "scale-95"
                  } transition-transform duration-200`}
                  onClick={() => handleNoteClick(note.id)}
                >
                  <h6 className="text-base truncate">{note.title}</h6>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {note.datef ? new Date(note.datef).toLocaleDateString() : "-"}
                    </p>
                    <ActionIconButton
                      label={`Hapus catatan ${note.title}`}
                      tooltip={`Hapus catatan ${note.title}`}
                      icon={Trash2}
                      onClick={() => onDeleteNote(note.id)}
                      variant="ghost"
                    />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <Alert variant="destructive">
            <AlertTitle>No Notes Found!</AlertTitle>
          </Alert>
        )}
      </div>
    </div>
  );
};

export default Notelist;
