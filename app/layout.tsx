import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TRPCProvider } from "@/components/providers/trpc-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { ServiceWorker } from "@/components/providers/service-worker";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stock",
  description: "Department inventory, borrows and Rahdari on your phone",
  applicationName: "Stock",
  appleWebApp: {
    capable: true,
    title: "Stock",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <I18nProvider locale={locale}>
            <TRPCProvider>
              {children}
              <Toaster richColors closeButton position="top-center" />
              <ServiceWorker />
            </TRPCProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
