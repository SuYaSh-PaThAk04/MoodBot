import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoodBot – Your Wellness Companion",
  description: "A Gemini-powered mood-based activity recommender",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}