"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignWizard } from "@/components/design-wizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE_PARTS = "STM32F407VGT6, 1\nSTM32F103C8T6, 2, critical\n24LC256-I/SN, 1\nTPS7A4700RGWR, 4, important";

const CRITICALITY_VALUES = ["critical", "important", "optional"] as const;

interface ParsedPart {
  mpn: string;
  qtyPerUnit: number;
  criticality?: (typeof CRITICALITY_VALUES)[number];
}

interface LineIssue {
  line: string;
  message: string;
}

function parsePartsInput(text: string): { parts: ParsedPart[]; issues: LineIssue[] } {
  const parts: ParsedPart[] = [];
  const issues: LineIssue[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const [mpnRaw, qtyRaw, criticalityRaw] = line.split(",").map((s) => s.trim());
    if (!mpnRaw) {
      issues.push({ line, message: "No MPN found before the first comma" });
      continue;
    }

    let qtyPerUnit = 1;
    if (qtyRaw) {
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty) || qty <= 0) {
        issues.push({ line, message: `"${qtyRaw}" isn't a valid quantity - defaulted to 1` });
      } else {
        qtyPerUnit = qty;
      }
    }

    let criticality: ParsedPart["criticality"];
    if (criticalityRaw) {
      if ((CRITICALITY_VALUES as readonly string[]).includes(criticalityRaw)) {
        criticality = criticalityRaw as ParsedPart["criticality"];
      } else {
        issues.push({ line, message: `"${criticalityRaw}" isn't critical/important/optional - ignored` });
      }
    }

    parts.push({ mpn: mpnRaw, qtyPerUnit, criticality });
  }

  return { parts, issues };
}

function CriticalityBadge({ value }: { value?: ParsedPart["criticality"] }) {
  if (value === "critical") return <Badge variant="destructive">critical</Badge>;
  if (value === "important") return <Badge variant="secondary">important</Badge>;
  if (value === "optional") return <Badge variant="outline">optional</Badge>;
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

export default function NewBuildPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "guided">("manual");
  const [name, setName] = useState("");
  const [plannedBuildQty, setPlannedBuildQty] = useState("1000");
  const [shipDate, setShipDate] = useState("");
  const [partsText, setPartsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { parts, issues } = parsePartsInput(partsText);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give the build a name.");
    if (parts.length === 0) return setError("Add at least one MPN.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plannedBuildQty: Number(plannedBuildQty),
          shipDate: shipDate || null,
          parts,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not create the build");
      }
      const { product } = await res.json();
      router.push(`/dashboard/builds/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">New build</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {mode === "manual"
            ? "Parts resolve against Vantage's tracked catalog. A part not yet tracked still gets added to the build - it just renders — not tracked until a source exists for it."
            : "Describe what you're building and Vantage will draft component categories, matching against the tracked catalog where it can. You approve every part before anything is created."}
        </p>

        <div className="mt-5 inline-flex rounded-lg border bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            I have a BOM
          </button>
          <button
            type="button"
            onClick={() => setMode("guided")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              mode === "guided" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Help me choose parts
          </button>
        </div>
      </div>

      {mode === "guided" ? (
        <DesignWizard />
      ) : (
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base tracking-[-0.015em]">Build details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Build name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Industrial IoT Gateway v4" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="qty">Planned build quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={plannedBuildQty}
                  onChange={(e) => setPlannedBuildQty(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shipDate">Ship date (optional)</Label>
                <Input id="shipDate" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="parts">Parts</Label>
                <button
                  type="button"
                  onClick={() => setPartsText(EXAMPLE_PARTS)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles className="size-3.5" />
                  Fill with an example
                </button>
              </div>
              <Textarea
                id="parts"
                rows={9}
                value={partsText}
                onChange={(e) => setPartsText(e.target.value)}
                placeholder={EXAMPLE_PARTS}
                className="font-mono text-xs"
              />

              {issues.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-chart-4/25 bg-chart-4/[0.06] p-3">
                  {issues.map((issue, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-[11px] leading-4 text-foreground/80">
                      <CircleAlert className="mt-[1px] size-3.5 shrink-0 text-chart-4" />
                      <span>
                        <span className="font-mono">{issue.line}</span> — {issue.message}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating…" : parts.length > 0 ? `Create build · ${parts.length} part${parts.length === 1 ? "" : "s"}` : "Create build"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-[-0.01em]">Format</CardTitle>
              <CardDescription>One part per line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-secondary/60 p-3 font-mono text-[11px] leading-5 text-foreground/80">
                MPN<span className="text-muted-foreground">, qty per unit</span>
                <span className="text-muted-foreground">, criticality</span>
              </div>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-mono font-semibold">MPN</dt>
                  <dd className="text-right text-muted-foreground">required · exact part number</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-mono font-semibold">qty per unit</dt>
                  <dd className="text-right text-muted-foreground">optional · defaults to 1</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-mono font-semibold">criticality</dt>
                  <dd className="text-right text-muted-foreground">optional · critical/important/optional</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm tracking-[-0.01em]">
                Preview {parts.length > 0 && <span className="font-normal text-muted-foreground">· {parts.length} parsed</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parts.length === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Parsed parts appear here as you type, so you can catch a typo before creating the build.
                </p>
              ) : (
                <ul className="space-y-2">
                  {parts.map((p, i) => (
                    <li key={`${p.mpn}-${i}`} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-medium">{p.mpn}</p>
                        <p className="text-[10px] text-muted-foreground">qty {p.qtyPerUnit} / unit</p>
                      </div>
                      <CriticalityBadge value={p.criticality} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
      )}
    </div>
  );
}
