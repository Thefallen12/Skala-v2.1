import React from "react";
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./css/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import ServiceWorkerRegister from "@/app/components/service-worker/ServiceWorkerRegister";
import PageTransition from "@/app/components/layout/PageTransition";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Skala Prioritas Engineering",
  description: "Sistem operasional konstruksi dan logistik Skala Prioritas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link
          rel="icon"
          href="/images/logos/icont%20logo%201.svg"
          type="image/svg+xml"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#102A4D" />
      </head>
      <body className={`${dmSans.className}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ServiceWorkerRegister />
          <PageTransition>{children}</PageTransition>
        </ThemeProvider>
      </body>
    </html>
  );
}
