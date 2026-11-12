import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";

import "./proto.css";

const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
});
const ocr = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"],
  variable: "--font-ocr",
});

export const metadata: Metadata = {
  title: "Prototype",
  robots: { index: false },
};

export default function PrototypeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`proto ${body.variable} ${ocr.variable}`}>{children}</div>;
}
