import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tidy Tapes — cozy cassette sorting",
  description: "A cozy top-down cassette shop: sort 512 tapes by shell color and symbol, repair the broken ones, and turn a messy table into a tidy shop. A relaxed Phaser game — no timer, no fail state.",
  keywords: ["cozy game", "sorting game", "Phaser", "cassette", "relaxed"],
  authors: [{ name: "Tidy Tapes" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Tidy Tapes — cozy cassette sorting",
    description: "Sort 512 tapes by color and symbol in one big scrollable shop.",
    url: "https://chat.z.ai",
    siteName: "Tidy Tapes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tidy Tapes — cozy cassette sorting",
    description: "Sort 512 tapes by color and symbol in one big scrollable shop.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
