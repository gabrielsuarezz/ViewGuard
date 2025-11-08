import type { Metadata } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "VigilanteAI - Real-Time Security Surveillance",
  description: "Intelligent surveillance system with real-time computer vision analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-900 text-white antialiased">
        <Header />
        <main className="p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
