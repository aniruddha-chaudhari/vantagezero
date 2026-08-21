import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { DashboardNav, DashboardSettingsLink } from "@/components/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="px-2 py-1 font-display text-2xl tracking-[-0.03em]">
          Vantage
        </Link>
        <div className="mt-3 rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md bg-primary font-mono text-[11px] font-semibold text-primary-foreground">
              V
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Your session</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Anonymous workspace</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <DashboardNav />
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-3 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-chart-3" />
              </span>
              Live data, not a demo
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Every number traces to a real, timestamped observation.
            </p>
          </CardContent>
        </Card>
        <DashboardSettingsLink />
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="vantage-dashboard">
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Vantage / Buildability
              </p>
              <p className="text-sm font-semibold tracking-[-0.01em]">Your builds</p>
            </div>
          </div>
          <ThemeToggle />
        </header>
        <div className="mx-auto w-full max-w-[1540px] space-y-6 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
