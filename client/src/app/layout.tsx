import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { AuthProvider } from "@/store/AuthProvider";
import { AppToaster } from "@/components/AppToaster";

// runs before paint, so the saved theme is on before anything renders and you
// never see a flash of the wrong one
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
  title: "Nasight, Aviation safety, in plain language",
  description:
    "Ask natural-language questions across NASA ASRS incident reports and get grounded, source-cited answers.",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  // suppressHydrationWarning on both of these. the script above adds a class to
  // <html> before react hydrates, and browser extensions mutate <body>. both are
  // harmless but they trip react's attribute mismatch check
  <html
    lang="en"
    className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    suppressHydrationWarning
  >
    <head>
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
    </head>
    <body
      className="min-h-full flex flex-col bg-background text-foreground font-sans"
      suppressHydrationWarning
    >
      <StoreProvider>
        <AuthProvider>{children}</AuthProvider>
      </StoreProvider>
      <AppToaster />
    </body>
  </html>
);

export default RootLayout;
