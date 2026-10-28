import type { Metadata, Viewport } from "next";
import { LearningProvider } from "@/components/learning-provider";
import { TaskLearningProvider } from "@/components/task-learning-provider";
import { PwaProvider } from "@/components/pwa";
import { PreferencesProvider } from "@/components/preferences-provider";
import { LexicalCatalogProvider } from "@/components/lexical-catalog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LEXIS — A language, becoming yours",
    template: "%s · LEXIS",
  },
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LEXIS",
  },
  description:
    "Your personal space for thoughtful English learning. Read, collect meanings and build understanding, one encounter at a time.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#201e1b",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PreferencesProvider>
          <LexicalCatalogProvider>
            <LearningProvider>
              <TaskLearningProvider>
                <PwaProvider>{children}</PwaProvider>
              </TaskLearningProvider>
            </LearningProvider>
          </LexicalCatalogProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
