import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover lets content extend into the iPhone notch/home-indicator area;
  // we then use env(safe-area-inset-*) in CSS to keep UI clear of those zones.
  viewportFit: "cover",
  themeColor: "#111111",
};

export const metadata: Metadata = {
  title: "DigCam",
  description: "Web-based digital camera simulation with authentic Sony CCD color science. Capture photos and videos with the look and feel of a real digicam.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DigCam",
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📷</text></svg>",
    apple: "/icons/apple-touch-icon.svg",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          background: '#111',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          fontFamily: 'var(--font-geist-mono), monospace',
        }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
