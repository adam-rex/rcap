import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { RegisterServiceWorker } from "./register-sw";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REX",
  description: "REX progressive web app",
  applicationName: "REX",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "REX",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{
          backgroundColor: "#f5f5f0",
          color: "#111111",
          minHeight: "100vh",
        }}
      >
        <RegisterServiceWorker />
        <noscript>
          <div
            style={{
              padding: "1.5rem",
              fontFamily: "system-ui, sans-serif",
              background: "#f5f5f0",
              color: "#111",
            }}
          >
            Rex needs JavaScript enabled. Open{" "}
            <strong>http://localhost:3000</strong> in your browser.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
