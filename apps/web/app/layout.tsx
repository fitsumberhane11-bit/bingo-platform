import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Ethiopia Bingo — Play Live Bingo Online",
    template: "%s · Ethiopia Bingo",
  },
  description: "Real-time multiplayer Bingo with secure Telebirr and CBE payments.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#158757",
};

// Runs before paint so a returning player who chose dark mode never sees a
// flash of the light theme while React hydrates.
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('bingo-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
