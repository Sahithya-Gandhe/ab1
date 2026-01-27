import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Price Auction System",
  description: "Production-ready second price auction platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
