import Topbar from "./Topbar";
import Sidebar from "./Sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <Sidebar />
      {/* Main content area: offset by topbar (h-14) and sidebar (w-60, or w-16 when collapsed) */}
      <main className="pt-14 pl-60 min-h-screen transition-all duration-300">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
