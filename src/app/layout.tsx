import type { Metadata } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";

import { brand } from "@/config/brand";
import "./globals.css";

const geist = Geist({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-sans",
});

const sourceSerif = Source_Serif_4({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s | ${brand.name}`,
  },
  description: brand.shortDescription,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${sourceSerif.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
