import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/components/providers/SolanaProvider";
import { PythProvider } from "@/components/providers/PythProvider";
import { SWRConfig } from "swr";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";
import { BankProvider } from "@/components/providers/BankProvider";
import { UserProvider } from "@/components/providers/UserProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lending",
  description: "Borrow-lending protocol for Turbin3 Builders Cohort.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <SWRConfig value={{ suspense: false, revalidateOnFocus: false, errorRetryCount: 3 }}>
          <SolanaProvider>
            <PythProvider>
              <BankProvider>
                <UserProvider>
                  <Header />
                  <main className="flex flex-1 flex-col py-6">
                    {children}
                  </main>
                  <Footer />
                </UserProvider>
              </BankProvider>
            </PythProvider>
          </SolanaProvider>
        </SWRConfig>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
