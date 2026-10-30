import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "../components/shell";

export const metadata: Metadata = { title: "ZAVQERA Mission Control", description: "Structure AI-assisted work into explicit Missions, track progress, and review evidence before committing to outcomes." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
