export const Footer = () => (
  <footer className="border-t border-slate-200/80 py-3 text-center text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
    Skala Prioritas · Dashboard Operasional Konstruksi © {new Date().getFullYear()} · Lokasi{" "}
    <a
      href="https://maps.google.com/"
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2"
    >
      Google Maps
    </a>
  </footer>
);
