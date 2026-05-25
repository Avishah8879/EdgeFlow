import Topbar from "./Topbar";
import { NotificationBanner } from "@/components/NotificationBanner";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  // Banner + Topbar are both in normal flow at the top. Topbar is `sticky top-0`
  // so it remains pinned to the viewport edge once the banner scrolls off, while
  // initially sitting directly below the banner without needing a measured offset.
  return (
    <div className="min-h-screen bg-background">
      <NotificationBanner />
      <Topbar />
      <main className="min-h-screen">
        <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
