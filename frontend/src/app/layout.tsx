import type { Metadata, Viewport } from "next";
import { DM_Mono, Inter, Unbounded } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

const DESCRIPTION = "Design, normalise, query and operate PostgreSQL databases with a copilot that asks before it changes anything.";

export const metadata: Metadata = {
  // Absolute URLs for the share card; set NEXT_PUBLIC_SITE_URL to the public address when deployed.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Normie · your data, but make it normal", template: "%s · Normie" },
  description: DESCRIPTION,
  applicationName: "Normie",
  authors: [{ name: "Aakshant Kumar" }],
  openGraph: { type: "website", url: "/", siteName: "Normie", title: "Normie · your data, but make it normal", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Normie · your data, but make it normal", description: DESCRIPTION },
};

// Phone browsers tint their toolbar to match the page.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
  ],
};

// Font variables live on <html> so :root-level tokens (--font-sans etc.) can resolve them.
// Apply the saved theme before first paint, so dark-mode users never see a light flash.
const THEME_INIT = `try{var t=localStorage.getItem("normie-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
