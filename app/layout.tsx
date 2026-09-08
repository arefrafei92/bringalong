import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bringalong · Make a plan, share the load",
  description: "Plan camping trips, parties, and potlucks together. Share a list, assign what to bring, and see what is ready.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
