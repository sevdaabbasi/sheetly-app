import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./auth.css";
import "./site-readability.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Sheetly — Verilerinle konuş, işini hızlandır";
  const description = "Excel, CSV ve PDF dosyalarını yapay zekâ ile düzenle, birleştir ve raporla.";
  return {
    metadataBase, title, description, icons: { icon: "/favicon.svg" },
    openGraph: { title, description, type: "website", locale: "tr_TR", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sheetly — Verilerinle konuş. İşini hızlandır." }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
