import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { AuthProvider } from "@/store/AuthProvider";
import { AppToaster } from "@/components/AppToaster";

// Runs before paint: applies the saved theme (default light) so there's no flash.
const themeInitScript = `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroLens — Aviation safety, in plain language",
  description:
    "Ask natural-language questions across NASA ASRS incident reports and get grounded, source-cited answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla adds
          `cz-shortcut-listen`) mutate <body> before hydration — harmless, but
          it trips React's attribute-mismatch check without this. */}
      <body
        className="min-h-full flex flex-col bg-background text-foreground font-sans"
        suppressHydrationWarning
      >
        {/* Providers wrap only {children}, not <html>, per Next 16 guidance. */}
        <StoreProvider>
          <AuthProvider>{children}</AuthProvider>
        </StoreProvider>
        <AppToaster />
      </body>
    </html>
  );
}
