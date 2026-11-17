export const Footer = () => (
  <footer className="type-p3 border-t border-border py-3 text-center font-medium text-muted-foreground">
    Skala Prioritas · Dashboard Operasional Konstruksi © {new Date().getFullYear()} · Lokasi{" "}
    <a
      href="https://www.amap.com/"
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      AMap
    </a>
  </footer>
);
