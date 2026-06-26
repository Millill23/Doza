import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOZA CRM",
  description: "Система управления DOZA",
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="bg-ink-900 text-ivory">{children}</body>
    </html>
  );
}
