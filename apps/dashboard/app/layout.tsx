import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./style.css";
export const metadata: Metadata = {
  title: "ONE — Your AI connections",
  description:
    "Connect once. Use everywhere. A self-hosted connection layer for AI clients.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>{children}</body>
    </html>
  );
}
