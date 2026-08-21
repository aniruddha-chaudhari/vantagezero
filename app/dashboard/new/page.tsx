"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignWizard } from "@/components/design-wizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const CRITICALITY_VALUES = ["critical", "important", "optional"] as const;
type Criticality = (typeof CRITICALITY_VALUES)[number];

interface PartRow {
  id: string;
  mpn: string;
  qtyPerUnit: string;
  criticality: Criticality | "";
}

const EXAMPLE_ROWS: Omit<PartRow, "id">[] = [
  { mpn: "STM32F407VGT6", qtyPerUnit: "1", criticality: "" },
  { mpn: "STM32F103C8T6", qtyPerUnit: "2", criticality: "critical" },
  { mpn: "24LC256-I/SN", qtyPerUnit: "1", criticality: "" },
  { mpn: "TPS7A4700RGWR", qtyPerUnit: "4", criticality: "important" },
];

function emptyRow(id: string): PartRow {
  return { id, mpn: "", qtyPerUnit: "1", criticality: "" };
}

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

interface ParsedPart {
  mpn: string;
  qtyPerUnit: number;
  criticality?: Criticality;
}

export default function NewBuildPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "guided">("manual");
  const [name, setName] = useState("");
  const [plannedBuildQty, setPlannedBuildQty] = useState("1000");
  const [shipDate, setShipDate] = useState("");
  const [rows, setRows] = useState<PartRow[]>([emptyRow("row-initial")]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(id: string, patch: Partial<PartRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(nextRowId())]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  }

  function fillWithExample() {
    setRows(EXAMPLE_ROWS.map((row) => ({ ...row, id: nextRowId() })));
  }

  const filledRows = rows.filter((row) => row.mpn.trim());
  const parts: ParsedPart[] = filledRows.map((row) => {
    const qty = Number(row.qtyPerUnit);
    return {
      mpn: row.mpn.trim(),
      qtyPerUnit: Number.isFinite(qty) && qty > 0 ? qty : 1,
      criticality: row.criticality || undefined,
    };
  });

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
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
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
                <Label>Parts</Label>
                <button
                  type="button"
                  onClick={fillWithExample}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles className="size-3.5" />
                  Fill with an example
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="hidden grid-cols-[1fr_100px_140px_36px] gap-2 border-b bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:grid">
                  <span>MPN</span>
                  <span>Qty / unit</span>
                  <span>Criticality</span>
                  <span />
                </div>

                <div className="divide-y">
                  {rows.map((row) => {
                    const qtyNum = Number(row.qtyPerUnit);
                    const qtyInvalid = row.qtyPerUnit !== "" && (!Number.isFinite(qtyNum) || qtyNum <= 0);

                    return (
                      <div key={row.id} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_100px_140px_36px] sm:items-center">
                        <div className="col-span-2 sm:col-span-1">
                          <Input
                            value={row.mpn}
                            onChange={(e) => updateRow(row.id, { mpn: e.target.value })}
                            placeholder="MPN, e.g. STM32F407VGT6"
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            min={1}
                            value={row.qtyPerUnit}
                            onChange={(e) => updateRow(row.id, { qtyPerUnit: e.target.value })}
                            className={cn("text-xs", qtyInvalid && "border-destructive text-destructive")}
                          />
                          {qtyInvalid && <p className="mt-1 text-[10px] text-destructive">Defaults to 1</p>}
                        </div>
                        <select
                          value={row.criticality}
                          onChange={(e) => updateRow(row.id, { criticality: e.target.value as PartRow["criticality"] })}
                          className="h-9 rounded-md border bg-transparent px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <option value="">—</option>
                          {CRITICALITY_VALUES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          aria-label="Remove part"
                          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addRow}
                  className="flex w-full items-center justify-center gap-1.5 border-t bg-secondary/20 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Add part
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating…" : parts.length > 0 ? `Create build · ${parts.length} part${parts.length === 1 ? "" : "s"}` : "Create build"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm tracking-[-0.01em]">
                Summary {parts.length > 0 && <span className="font-normal text-muted-foreground">· {parts.length} part{parts.length === 1 ? "" : "s"}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs leading-5 text-muted-foreground">
              <p>Each part needs an MPN. Quantity per unit defaults to 1 if left blank.</p>
              <p>Criticality flags which shortfalls to surface first - leave it unset for parts that don&apos;t need special attention.</p>
              <p>A part not yet in Vantage&apos;s tracked catalog still gets added, it just won&apos;t show live stock until a source exists for it.</p>
            </CardContent>
          </Card>
        </div>
      </form>
      )}
    </div>
  );
}
