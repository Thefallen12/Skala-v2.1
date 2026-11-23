import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, ExternalLink, LogIn, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY_PROFILE } from "@/lib/site-config";
import { WebMcpProvider } from "@/components/public/WebMcpProvider";

export function PublicSiteChrome({
  activePath,
  children,
}: {
  activePath: "/" | "/about" | "/pricing" | "/contact" | "/terms" | "/privacy";
  children: ReactNode;
}) {
  const navLinks = [
    { href: "/", label: "Beranda" },
    { href: "/about", label: "Tentang" },
    { href: "/pricing", label: "Harga" },
    { href: "/contact", label: "Kontak" },
  ] as const;

  const legalLinks = [
    { href: "/about", label: "Tentang Kami" },
    { href: "/pricing", label: "Harga & Paket" },
    { href: "/contact", label: "Kontak Resmi" },
    { href: "/terms", label: "Syarat & Ketentuan" },
    { href: "/privacy", label: "Kebijakan Privasi" },
    { href: "/verify", label: "Verifikasi QR" },
    { href: "/auth/login", label: "Masuk Portal" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <WebMcpProvider />

      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102A4D]"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
              <Image
                src={COMPANY_PROFILE.logoPath}
                alt="Logo PT Skala Prioritas Engineering"
                width={32}
                height={32}
                priority
                className="size-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-[#102A4D] dark:text-white">
                {COMPANY_PROFILE.legalName}
              </span>
              <span className="block truncate text-xs text-slate-600 dark:text-slate-400">
                Konstruksi · Logistik · ERP Operasional
              </span>
            </div>
          </Link>

          <nav aria-label="Navigasi utama publik" className="flex items-center gap-1 sm:gap-2">
            {navLinks.map((item) => {
              const isActive = activePath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`hidden rounded-lg px-3 py-2 text-sm font-medium transition sm:inline-flex ${
                    isActive
                      ? "bg-slate-100 text-[#102A4D] font-semibold dark:bg-slate-800 dark:text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-[#102A4D] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Button
              asChild
              className="h-10 bg-[#102A4D] px-4 text-sm font-semibold text-white hover:bg-[#0B1E38] dark:bg-sky-600 dark:hover:bg-sky-700"
            >
              <Link href="/auth/login">
                <LogIn className="mr-1.5 size-4" aria-hidden="true" />
                Masuk
              </Link>
            </Button>
          </nav>
        </div>

        {/* Mobile quick nav */}
        <nav
          aria-label="Navigasi cepat mobile"
          className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden dark:border-slate-800"
        >
          {legalLinks.slice(0, 5).map((item) => {
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                  isActive
                    ? "bg-[#102A4D] text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#102A4D] dark:text-white">
              <Building2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{COMPANY_PROFILE.legalName}</span>
            </div>
            <p className="type-p2 text-slate-600 dark:text-slate-400">
              {COMPANY_PROFILE.description}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {COMPANY_PROFILE.externalProfiles.map((profile) => (
                <a
                  key={profile.url}
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-[#102A4D] hover:text-[#102A4D] dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
                >
                  {profile.label}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="type-h3 font-semibold text-slate-900 dark:text-white">
              Kontak Resmi
            </div>
            <address className="not-italic">
              <ul className="space-y-1.5 type-p2 text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <a
                    href={`mailto:${COMPANY_PROFILE.email}`}
                    className="underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:hover:text-white"
                  >
                    {COMPANY_PROFILE.email}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <a
                    href={`tel:${COMPANY_PROFILE.telephone}`}
                    className="underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:hover:text-white"
                  >
                    {COMPANY_PROFILE.telephoneDisplay}
                  </a>
                </li>
                <li
                  className="flex items-start gap-2"
                  itemScope
                  itemType="https://schema.org/PostalAddress"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span>
                    <span itemProp="streetAddress">{COMPANY_PROFILE.address.streetAddress}</span>,{" "}
                    <span itemProp="addressLocality">{COMPANY_PROFILE.address.addressLocality}</span>,{" "}
                    <span itemProp="addressRegion">{COMPANY_PROFILE.address.addressRegion}</span>{" "}
                    <span itemProp="postalCode">{COMPANY_PROFILE.address.postalCode}</span>,{" "}
                    <span itemProp="addressCountry">{COMPANY_PROFILE.address.addressCountry}</span>
                  </span>
                </li>
              </ul>
            </address>
          </div>

          <div className="space-y-2">
            <div className="type-h3 font-semibold text-slate-900 dark:text-white">
              Informasi, Harga &amp; Agen AI
            </div>
            <nav aria-label="Tautan informasi dan legal" className="grid grid-cols-2 gap-x-4 gap-y-1.5 type-p2">
              {legalLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:text-slate-300 dark:hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href="/llms.txt"
                className="text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:text-slate-300 dark:hover:text-white"
              >
                llms.txt
              </a>
              <a
                href="/.well-known/mcp/server-card.json"
                className="text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:text-slate-300 dark:hover:text-white"
              >
                MCP Server Card
              </a>
              <a
                href="/.well-known/api-catalog"
                className="text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-[#102A4D] dark:text-slate-300 dark:hover:text-white"
              >
                API Catalog
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-4 text-center type-p3 text-slate-600 dark:border-slate-800 dark:text-slate-400">
          © {new Date().getFullYear()} {COMPANY_PROFILE.legalName} ·{" "}
          <span>{COMPANY_PROFILE.motto}</span>
        </div>
      </footer>
    </div>
  );
}
