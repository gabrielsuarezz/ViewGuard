import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VigilanteAI - Real-Time Security Surveillance",
  description: "Intelligent surveillance system with real-time computer vision analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.Node;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
