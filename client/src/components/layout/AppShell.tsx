import Topbar from "./Topbar";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      {/* Main content: offset by 64px sticky topbar; design-spec 1440px container with 32px gutters */}
      <main className="pt-16 min-h-screen">
        <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
