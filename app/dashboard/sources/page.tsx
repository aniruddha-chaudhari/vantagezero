import { ServerCog } from "lucide-react";

import { PassRateHistoryChart } from "@/components/charts/pass-rate-history";
import { ImpactStrip } from "@/components/impact-strip";
import { IncidentApproval } from "@/components/incident-approval";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPassRateHistory, getPlatformStats } from "@/db/analytics";
import { listIncidentsForHealthScreen, listSourceHealth } from "@/db/queries";
import { formatAge } from "@/domain/freshness";

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge variant="secondary">open</Badge>;
  if (status === "healing") return <Badge variant="secondary">healing</Badge>;
  if (status === "awaiting_approval") return <Badge variant="destructive">awaiting approval</Badge>;
  if (status === "rejected") return <Badge variant="destructive">rejected</Badge>;
  return (
    <Badge variant="outline" className="border-chart-3/25 bg-chart-3/10 text-chart-3">
      resolved
    </Badge>
  );
}

/** Live monitoring surface: never prerendered, never cached. Observations land from the
 * cron between requests, so a build-time snapshot would show a stale buildable number. */
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [collectors, incidents, passRate, stats] = await Promise.all([
    listSourceHealth(),
    listIncidentsForHealthScreen(),
    getPassRateHistory(),
    getPlatformStats(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Source health</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Extraction health is separate from supply-chain risk - this screen is read-only except
          for approving or rejecting an already-escalated incident.
        </p>
      </div>

      <ImpactStrip stats={stats} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {collectors.map((c) => (
          <Card key={c.collectorId}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{c.sourceName}</CardTitle>
                {c.openIncidentCount > 0 ? (
                  <Badge variant="destructive">{c.openIncidentCount} open</Badge>
                ) : (
                  <Badge variant="outline" className="border-chart-3/25 bg-chart-3/10 text-chart-3">
                    healthy
                  </Badge>
                )}
              </div>
              <CardDescription>
                {c.domain} · {c.sourceTargetCount} tracked part{c.sourceTargetCount === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-secondary p-2.5">
                <p className="uppercase text-muted-foreground">Last run</p>
                <p className="mt-1 font-medium">{c.lastRunAt ? formatAge(c.lastRunAt) : "never"}</p>
              </div>
              <div className="rounded-lg bg-secondary p-2.5">
                <p className="uppercase text-muted-foreground">Last success</p>
                <p className="mt-1 font-medium">{c.lastSuccessAt ? formatAge(c.lastSuccessAt) : "never"}</p>
              </div>
              <div className="rounded-lg bg-secondary p-2.5">
                <p className="uppercase text-muted-foreground">Pass rate</p>
                <p className="mt-1 font-medium tabular-nums">
                  {c.validationPassRate != null ? `${Math.round(c.validationPassRate * 100)}%` : "—"} ({c.successfulRuns}/{c.totalRuns})
                </p>
              </div>
              <div className="rounded-lg bg-secondary p-2.5">
                <p className="uppercase text-muted-foreground">Heals</p>
                <p className="mt-1 font-medium tabular-nums">
                  {c.healCount} {c.lastHealAt ? `· last ${formatAge(c.lastHealAt)}` : ""}
                </p>
              </div>
              <div className="col-span-2 rounded-lg bg-secondary p-2.5">
                <p className="uppercase text-muted-foreground">Collector ID</p>
                <p className="mt-1 truncate font-mono text-[11px]">{c.collectorId}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation pass rate over time</CardTitle>
          <CardDescription>
            A heal shows up here as a dip and a recovery - extraction reliability, not supply risk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PassRateHistoryChart points={passRate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ServerCog className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Incident timeline</CardTitle>
          </div>
          <CardDescription>Every detection, heal, and decision - including the ones that were rejected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incidents recorded.</p>}
          {incidents.map(({ incident, target }) => (
            <div key={incident.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs font-semibold">{target.mpn}</p>
                  <span className="text-xs text-muted-foreground">{target.sourceName}</span>
                  <StatusBadge status={incident.status} />
                </div>
                <span className="text-[11px] text-muted-foreground">{formatAge(incident.openedAt)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{incident.incidentType}</span>
                {incident.notes ? ` — ${incident.notes}` : ""}
              </p>
              {incident.healPrompt && (
                <p className="mt-1 text-[11px] text-muted-foreground">Heal prompt: {incident.healPrompt}</p>
              )}
              {incident.gateResultsJson != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-primary">Gate results</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-secondary p-2 text-[10px]">
                    {JSON.stringify(incident.gateResultsJson, null, 2)}
                  </pre>
                </details>
              )}
              {incident.status === "awaiting_approval" && (
                <div className="mt-3">
                  <IncidentApproval incidentId={incident.id} />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
