"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CandidateOptionTile, type ClientCatalogEntry } from "@/components/candidate-option-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReconciledCategory, ReconciledExtraction } from "@/domain/design";

const CRITICALITY_VALUES = ["critical", "important", "optional"] as const;
type Criticality = (typeof CRITICALITY_VALUES)[number];

type Selection =
  | { kind: "tracked" | "suggested"; mpn: string }
  | { kind: "manual"; mpn: string }
  | { kind: "skip" };

interface CategoryState {
  selection: Selection;
  qtyPerUnit: number;
  criticality: Criticality;
  manualMpn: string;
}

function initialSelection(category: ReconciledCategory): Selection {
  if (category.trackedMatch) return { kind: "tracked", mpn: category.trackedMatch.mpn };
  if (category.suggestedCandidates[0]) return { kind: "suggested", mpn: category.suggestedCandidates[0].mpn };
  return { kind: "skip" };
}

function CriticalityPicker({ value, onChange }: { value: Criticality; onChange: (v: Criticality) => void }) {
  return (
    <div className="inline-flex gap-1">
      {CRITICALITY_VALUES.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
            v === value
              ? v === "critical"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function DesignWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"describe" | "review" | "confirm">("describe");

  const [description, setDescription] = useState("");
  const [plannedBuildQty, setPlannedBuildQty] = useState("1000");
  const [targetUnitCost, setTargetUnitCost] = useState("");

  const [extraction, setExtraction] = useState<ReconciledExtraction | null>(null);
  const [catalog, setCatalog] = useState<ClientCatalogEntry[]>([]);
  const [categoryStates, setCategoryStates] = useState<CategoryState[]>([]);

  const [buildName, setBuildName] = useState("");
  const [shipDate, setShipDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogByMpn = new Map(catalog.map((c) => [c.mpn, c]));

  async function handleDescribeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError("Describe what you're building.");

    const qty = Number(plannedBuildQty);
    if (!Number.isFinite(qty) || qty <= 0) return setError("Planned build quantity must be a positive number.");

    setLoading(true);
    try {
      const res = await fetch("/api/design/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          plannedBuildQty: qty,
          targetUnitCost: targetUnitCost.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not process that description");

      const result: { extraction: ReconciledExtraction; catalog: ClientCatalogEntry[] } = body;
      setExtraction(result.extraction);
      setCatalog(result.catalog);
      setCategoryStates(
        result.extraction.categories.map((c) => ({
          selection: initialSelection(c),
          qtyPerUnit: c.qtyPerUnit,
          criticality: c.criticality,
          manualMpn: "",
        })),
      );
      setBuildName(result.extraction.suggestedBuildName);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updateCategory(index: number, patch: Partial<CategoryState>) {
    setCategoryStates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  const approvedParts = categoryStates
    .map((state, i) => {
      const category = extraction?.categories[i];
      if (!category || state.selection.kind === "skip") return null;
      const mpn = state.selection.kind === "manual" ? state.manualMpn.trim() : state.selection.mpn;
      if (!mpn) return null;
      return { mpn, qtyPerUnit: state.qtyPerUnit, criticality: state.criticality, label: category.label };
    })
    .filter((p): p is { mpn: string; qtyPerUnit: number; criticality: Criticality; label: string } => p != null);

  async function handleFinalSubmit() {
    setError(null);
    if (!buildName.trim()) return setError("Give the build a name.");
    if (approvedParts.length === 0) return setError("Approve at least one part.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buildName.trim(),
          plannedBuildQty: Number(plannedBuildQty),
          shipDate: shipDate || null,
          parts: approvedParts.map(({ mpn, qtyPerUnit, criticality }) => ({ mpn, qtyPerUnit, criticality })),
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

  if (step === "describe") {
    return (
      <form onSubmit={handleDescribeSubmit} className="mx-auto max-w-2xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base tracking-[-0.015em]">
              <Sparkles className="size-4 text-primary" />
              Describe what you&apos;re building
            </CardTitle>
            <CardDescription>
              Plain language is fine. Vantage will draft component categories and match them against
              already-tracked parts where it can - anything it can&apos;t verify is clearly marked, never
              guessed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="description">What are you building?</Label>
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A battery-powered temperature sensor that reports over Wi-Fi every 10 minutes."
                maxLength={2000}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="qty">Planned build quantity</Label>
                <Input id="qty" type="number" min={1} value={plannedBuildQty} onChange={(e) => setPlannedBuildQty(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="targetCost">Target unit cost (optional)</Label>
                <Input
                  id="targetCost"
                  value={targetUnitCost}
                  onChange={(e) => setTargetUnitCost(e.target.value)}
                  placeholder="under ₹1,500"
                />
              </div>
            </div>

            {error && (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Drafting component categories…
                </span>
              ) : (
                "Draft a parts list"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    );
  }

  if (step === "review" && extraction) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <button
            type="button"
            onClick={() => setStep("describe")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{extraction.buildSummary}</p>
          {extraction.truncated && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Simplified to the {extraction.categories.length} most essential categories.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {extraction.categories.map((category, i) => {
            const state = categoryStates[i];
            if (!state) return null;
            return (
              <Card key={category.label}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm tracking-[-0.01em]">{category.label}</CardTitle>
                    {state.selection.kind !== "skip" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={state.qtyPerUnit}
                          onChange={(e) => updateCategory(i, { qtyPerUnit: Math.max(1, Number(e.target.value) || 1) })}
                          className="h-7 w-16 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">/unit</span>
                        <CriticalityPicker value={state.criticality} onChange={(v) => updateCategory(i, { criticality: v })} />
                      </div>
                    )}
                  </div>
                  <CardDescription>{category.requirement}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {category.trackedMatch && (
                    <CandidateOptionTile
                      selectable
                      selected={state.selection.kind === "tracked" && state.selection.mpn === category.trackedMatch.mpn}
                      onSelect={() => updateCategory(i, { selection: { kind: "tracked", mpn: category.trackedMatch!.mpn } })}
                      mpn={category.trackedMatch.mpn}
                      rationale={category.trackedMatch.rationale}
                      entry={catalogByMpn.get(category.trackedMatch.mpn)}
                    />
                  )}
                  {category.suggestedCandidates.map((candidate) => (
                    <CandidateOptionTile
                      key={candidate.mpn}
                      selectable
                      selected={state.selection.kind === "suggested" && state.selection.mpn === candidate.mpn}
                      onSelect={() => updateCategory(i, { selection: { kind: "suggested", mpn: candidate.mpn } })}
                      mpn={candidate.mpn}
                      rationale={candidate.rationale}
                      entry={candidate.tracked ? catalogByMpn.get(candidate.mpn) : undefined}
                      unverified={!candidate.tracked}
                      footer={
                        !candidate.tracked ? (
                          <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
                            You&apos;ll be able to search for and verify this part right after the build is created.
                          </p>
                        ) : undefined
                      }
                    />
                  ))}

                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      value={state.manualMpn}
                      onChange={(e) => updateCategory(i, { manualMpn: e.target.value, selection: { kind: "manual", mpn: e.target.value } })}
                      placeholder="or type a different part number"
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => updateCategory(i, { selection: { kind: "skip" } })}
                      className={`shrink-0 text-[11px] font-medium ${
                        state.selection.kind === "skip" ? "text-foreground underline" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Skip category
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => setStep("confirm")}
          disabled={approvedParts.length === 0}
        >
          Review build · {approvedParts.length} part{approvedParts.length === 1 ? "" : "s"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        type="button"
        onClick={() => setStep("review")}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base tracking-[-0.015em]">Confirm build</CardTitle>
          <CardDescription>Nothing is created or monitored until you submit this.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="buildName">Build name</Label>
            <Input id="buildName" value={buildName} onChange={(e) => setBuildName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmShipDate">Ship date (optional)</Label>
            <Input id="confirmShipDate" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Parts · {approvedParts.length}</Label>
            <ul className="space-y-2">
              {approvedParts.map((p, i) => (
                <li key={`${p.mpn}-${i}`} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium">{p.mpn}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.label} · qty {p.qtyPerUnit} / unit
                      {!catalogByMpn.has(p.mpn) && " · not yet tracked"}
                    </p>
                  </div>
                  <Badge variant={p.criticality === "critical" ? "destructive" : p.criticality === "important" ? "secondary" : "outline"}>
                    {p.criticality}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <Button type="button" disabled={submitting} onClick={handleFinalSubmit} className="w-full">
            {submitting ? "Creating…" : `Create build · ${approvedParts.length} part${approvedParts.length === 1 ? "" : "s"}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
