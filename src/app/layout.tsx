import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Class Homework",
  description: "Homework, quizzes and progress for the AI class.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request headers keeps every page dynamically rendered, which the per-request
  // CSP nonce from src/proxy.ts needs (Next.js applies it to its scripts automatically).
  await headers();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
