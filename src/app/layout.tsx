import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nuro Photo Editor",
  description: "AI-assisted photo editing MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
