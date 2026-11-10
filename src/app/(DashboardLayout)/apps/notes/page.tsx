
import NotesApp from "@/app/components/apps/notes";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Catatan Operasional · Skala ERP",
};

const BCrumb = [
  {
    to: "/",
    title: "Beranda",
  },
  {
    title: "Catatan Operasional",
  },
];
const Notes = () => {
  return (
    <>
      <BreadcrumbComp title="Catatan Operasional" items={BCrumb} />
      <NotesApp />
    </>
  );
};

export default Notes;
