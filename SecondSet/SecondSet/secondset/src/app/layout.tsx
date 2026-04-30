import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SecondSet - Treasury Controls",
  description: "Multi-chain treasury payment controls",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            success: {
              style: {
                background: '#CCF5ED',
                color: '#117362',
                border: '1px solid #1DBFA4',
              },
              iconTheme: {
                primary: '#1DBFA4',
                secondary: '#fff',
              },
            },
            error: {
              style: {
                background: '#FEE2E2',
                color: '#DC2626',
                border: '1px solid #DC2626',
              },
              iconTheme: {
                primary: '#DC2626',
                secondary: '#fff',
              },
            },
            loading: {
              style: {
                background: '#EDF2F7',
                color: '#2D527B',
                border: '1px solid #2D527B',
              },
            },
          }}
        />
      </body>
    </html>
  );
}