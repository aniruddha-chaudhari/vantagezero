"use client";

import {
  Activity,
  Boxes,
  ChevronRight,
  Clock3,
  Component,
  GitBranch,
  Globe2,
  LayoutDashboard,
  RefreshCcw,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const bomRows = [
  { part: "TPS7A4700RGWR", description: "Linear regulator · Texas Instruments", need: "2,000", stock: "1,640", coverage: "0.82×", lead: "18 wks", lifecycle: "Active", status: "Blocking" },
  { part: "W25Q128JVSIQ", description: "128 Mb flash · Winbond", need: "1,000", stock: "3,960", coverage: "3.96×", lead: "7 wks", lifecycle: "NRND", status: "Watch" },
  { part: "STM32H743VIT6", description: "MCU · STMicroelectronics", need: "1,000", stock: "1,420", coverage: "1.42×", lead: "6 wks", lifecycle: "Active", status: "Healthy" },
  { part: "USB4105-GF-A", description: "USB-C receptacle · GCT", need: "1,000", stock: "4,280", coverage: "4.28×", lead: "4 wks", lifecycle: "Active", status: "Healthy" },
  { part: "BMI270", description: "6-axis IMU · Bosch Sensortec", need: "1,000", stock: "2,210", coverage: "2.21×", lead: "9 wks", lifecycle: "Active", status: "Healthy" },
] as const;

const buildabilityHistory = [
  { time: "08:30", units: 1000 },
  { time: "08:50", units: 1000 },
  { time: "09:10", units: 960 },
  { time: "09:25", units: 920 },
  { time: "09:42", units: 820 },
] as const;

const supplierStock = [
  { supplier: "DigiKey", stock: 820 },
  { supplier: "Mouser", stock: 540 },
  { supplier: "TI", stock: 280 },
] as const;

const sources = [
  { name: "DigiKey", state: "Healthy", age: "18 sec", region: "US" },
  { name: "Mouser", state: "Healthy", age: "31 sec", region: "US" },
  { name: "Texas Instruments", state: "Repaired", age: "1 min", region: "Global" },
  { name: "STMicroelectronics", state: "Healthy", age: "2 min", region: "Global" },
] as const;

const events = [
  { time: "09:42:04", title: "Production run recalculated", detail: "Buildable quantity changed from 1,000 to 820 units.", kind: "decision" },
  { time: "09:42:03", title: "Lead time increased", detail: "TPS7A4700RGWR moved from 8 to 18 weeks at the verified US source.", kind: "risk" },
  { time: "09:41:29", title: "Scraper repair verified", detail: "Texas Instruments extraction recovered after a product-page template change.", kind: "system" },
  { time: "09:41:11", title: "Unverified stock isolated", detail: "The uncertain observation was excluded until extraction recovered.", kind: "neutral" },
] as const;

const buildabilityChartConfig = {
  units: { label: "Buildable units", color: "var(--chart-2)" },
} satisfies ChartConfig;

const supplierChartConfig = {
  stock: { label: "Verified stock", color: "var(--chart-3)" },
} satisfies ChartConfig;

function StatusBadge({ status }: { status: string }) {
  if (status === "Blocking") return <Badge variant="destructive">Blocking</Badge>;
  if (status === "Watch") return <Badge variant="secondary" className="text-muted-foreground">Watch</Badge>;
  if (status === "Repaired") return <Badge variant="outline" className="border-chart-2/30 bg-chart-1/20 text-chart-4">Repaired</Badge>;
  return <Badge variant="outline" className="border-chart-2/25 bg-chart-1/10 text-chart-4">Healthy</Badge>;
}

const navItems = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard },
  { label: "BOMs", href: "#bom", icon: Boxes },
  { label: "Components", href: "#blocker", icon: Component },
  { label: "Scrapers", href: "#sources", icon: ServerCog },
  { label: "Events", href: "#events", icon: GitBranch },
  { label: "Sources", href: "#sources", icon: Globe2 },
] as const;

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <a href="/" className="px-2 py-1 text-xl font-semibold tracking-[-0.04em]">Vantage</a>
        <div className="mt-2 rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">AR</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Atlas Robotics</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Production workspace</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon: Icon }, index) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton asChild isActive={index === 0}>
                    <a href={href}><Icon />{label}</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <Card className="shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="size-2 rounded-full bg-chart-2" />
              System operational
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">11 healthy scrapers · 1 repaired</p>
          </CardContent>
        </Card>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild><a href="#settings"><Settings />Settings</a></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function DashboardShell() {
  return (
    <SidebarProvider className="vantage-dashboard">
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div>
              <p className="text-xs text-muted-foreground">Production / Atlas Control Board</p>
              <p className="text-sm font-semibold">Buildability overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex"><Search />Search</Button>
            <Button size="sm"><RefreshCcw />Run analysis</Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1540px] space-y-6 p-4 sm:p-6 lg:p-8">
          <section id="overview" className="scroll-mt-24">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">AT RISK</Badge>
                  <Badge variant="secondary">Demo dataset</Badge>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Atlas Control Board</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Production readiness for a 1,000-unit run. The dashboard puts the build decision first, then the blocker, then the evidence.</p>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Globe2 className="size-3.5" />US inventory</span>
                <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Synced 18 sec ago</span>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardDescription>Decision · buildable now</CardDescription>
                    <CardTitle className="mt-2 text-5xl tracking-[-0.055em] sm:text-6xl">820 <span className="text-lg font-medium text-muted-foreground">/ 1,000 units</span></CardTitle>
                  </div>
                  <Badge className="bg-chart-3 text-white hover:bg-chart-3">82%</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={82} indicatorClassName="bg-chart-3" />
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-medium">82% of requested run is currently buildable</span>
                  <span className="font-mono text-destructive">180 blocked</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Source confidence", "98.7%", "verified evidence"],
                    ["Critical parts", "12", "1 blocking"],
                    ["Scrapers", "11/12", "1 repaired"],
                  ].map(([label, value, detail]) => (
                    <div key={label} className="rounded-lg bg-secondary p-3">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card id="blocker" className="scroll-mt-24 border-destructive/20">
              <CardHeader>
                <div className="flex items-center gap-2 text-destructive"><TriangleAlert className="size-4" /><CardDescription className="font-semibold text-destructive">WHY THIS RUN IS BLOCKED</CardDescription></div>
                <CardTitle className="pt-2 font-mono text-lg">TPS7A4700RGWR</CardTitle>
                <CardDescription>Linear regulator · Texas Instruments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase text-muted-foreground">Shortfall</p><p className="mt-1 text-2xl font-semibold text-destructive">360</p></div>
                  <div className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase text-muted-foreground">Coverage</p><p className="mt-1 text-2xl font-semibold">0.82×</p></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">1,640 verified units observed against 2,000 required. Verified lead time moved from 8 to 18 weeks.</p>
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-chart-4"><ShieldCheck className="size-4" />3 sources verified · US inventory separated</div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buildability trend</CardTitle>
                <CardDescription>How the current production run changed as new verified observations arrived.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={buildabilityChartConfig} className="h-[250px] aspect-auto">
                  <AreaChart data={buildabilityHistory} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis domain={[0, 1100]} tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area dataKey="units" name="Buildable units" type="monotone" fill="var(--color-units)" fillOpacity={0.16} stroke="var(--color-units)" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Blocking-part stock by source</CardTitle>
                <CardDescription>Verified US inventory contributing to TPS7A4700RGWR coverage.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={supplierChartConfig} className="h-[250px] aspect-auto">
                  <BarChart data={supplierStock} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="supplier" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="stock" name="Verified stock" fill="var(--color-stock)" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          <section id="bom" className="scroll-mt-24">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">BOM buildability</CardTitle>
                  <CardDescription className="mt-1">Critical components sorted by production impact.</CardDescription>
                </div>
                <Button variant="outline" size="sm">View full BOM</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead><TableHead>Need</TableHead><TableHead>Observed stock</TableHead><TableHead>Coverage</TableHead><TableHead>Lead time</TableHead><TableHead>Lifecycle</TableHead><TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomRows.map((row) => (
                      <TableRow key={row.part} className={row.status === "Blocking" ? "bg-destructive/[0.025]" : undefined}>
                        <TableCell><p className="font-mono text-xs font-semibold">{row.part}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.description}</p></TableCell>
                        <TableCell className="tabular-nums">{row.need}</TableCell>
                        <TableCell className="font-medium tabular-nums">{row.stock}</TableCell>
                        <TableCell className={row.status === "Blocking" ? "font-semibold text-destructive" : "font-medium"}>{row.coverage}</TableCell>
                        <TableCell>{row.lead}</TableCell><TableCell>{row.lifecycle}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Card id="sources" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-base">Source & scraper health</CardTitle>
                <CardDescription>Extraction health is separate from supply-chain risk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sources.map((source) => (
                  <div key={source.name} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div><p className="text-sm font-medium">{source.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{source.region} · checked {source.age} ago</p></div>
                    <StatusBadge status={source.state} />
                  </div>
                ))}
                <div className="rounded-lg border border-chart-2/20 bg-chart-1/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-chart-4"><RefreshCcw className="size-4" />Self-healing repair completed</div>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Texas Instruments changed its product-page structure. The stock extraction path was repaired and re-verified before the observation returned to buildability.</p>
                </div>
              </CardContent>
            </Card>

            <Card id="events" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-base">Decision & evidence timeline</CardTitle>
                <CardDescription>System events and semantic supply changes in chronological order.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {events.map((event, index) => (
                    <div key={`${event.time}-${event.title}`} className="grid grid-cols-[62px_18px_1fr] gap-3">
                      <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">{event.time}</span>
                      <div className="relative flex justify-center"><span className={event.kind === "risk" ? "mt-1 size-2.5 rounded-full bg-destructive" : event.kind === "system" ? "mt-1 size-2.5 rounded-full bg-chart-2" : "mt-1 size-2.5 rounded-full bg-primary"} />{index < events.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-border" />}</div>
                      <div className="pb-6"><p className="text-sm font-medium">{event.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <Card id="settings" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="text-base">Run assumptions</CardTitle>
              <CardDescription>Mock configuration used by this dashboard demo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Requested run", "1,000 units"], ["Region policy", "US inventory only"], ["Freshness window", "15 minutes"], ["Lifecycle policy", "Flag NRND"]].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-secondary p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1.5 text-sm font-medium">{value}</p></div>
              ))}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
