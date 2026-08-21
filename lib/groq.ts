const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export interface CatalogHint {
  mpn: string;
  manufacturer: string | null;
  package: string | null;
  marketingStatus: string | null;
}

function formatCatalogList(catalog: CatalogHint[]): string {
  return catalog
    .map((c) => {
      const details = [c.manufacturer, c.package, c.marketingStatus].filter(Boolean).join(", ");
      return details ? `- ${c.mpn} (${details})` : `- ${c.mpn}`;
    })
    .join("\n");
}

/**
 * Shared tool-call plumbing: fetch, check the response, pull out and JSON-parse the tool-call
 * arguments. Returns them raw and unvalidated - every caller is expected to run the result
 * through its own Zod schema before trusting any of it. Throws rather than swallowing errors,
 * since the response here is the actual payload, not a side-effect notification.
 */
async function callGroqTool(toolName: string, toolSchema: unknown, systemPrompt: string, userPrompt: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: toolName } },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error("Groq response did not include the expected tool call");
  }

  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw new Error("Groq tool call arguments were not valid JSON");
  }
}

// ---------------------------------------------------------------------------
// Guided BOM extraction (description -> component categories)
// ---------------------------------------------------------------------------

const EXTRACT_TOOL_NAME = "extract_build_requirements";

export interface ExtractBuildRequirementsInput {
  description: string;
  plannedBuildQty: number;
  targetUnitCost: string | null;
  trackedCatalog: CatalogHint[];
}

const EXTRACT_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: EXTRACT_TOOL_NAME,
    description:
      "Break a natural-language hardware product description into the component categories a BOM needs, matching against an already-tracked parts catalog where possible.",
    parameters: {
      type: "object",
      properties: {
        buildSummary: { type: "string", description: "One sentence restating what's being built." },
        suggestedBuildName: { type: "string", description: "Short build name, e.g. 'Wi-Fi Temp Sensor v1'." },
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Category name, e.g. 'Microcontroller'." },
              requirement: {
                type: "string",
                description: "One-line requirement stating what's needed and why, for this build specifically.",
              },
              qtyPerUnit: { type: "integer", minimum: 1 },
              criticality: { type: "string", enum: ["critical", "important", "optional"] },
              trackedMatch: {
                type: "object",
                description:
                  "Only set this if one of the provided tracked-catalog MPNs genuinely fits this category - never invent or guess one.",
                properties: {
                  mpn: { type: "string" },
                  rationale: { type: "string" },
                },
                required: ["mpn", "rationale"],
              },
              suggestedCandidates: {
                type: "array",
                description:
                  "Up to 2 real, specific part numbers (not necessarily tracked) that would fit this category, for the user to verify.",
                items: {
                  type: "object",
                  properties: {
                    mpn: { type: "string" },
                    rationale: { type: "string" },
                  },
                  required: ["mpn", "rationale"],
                },
              },
            },
            required: ["label", "requirement", "qtyPerUnit", "criticality", "suggestedCandidates"],
          },
        },
      },
      required: ["buildSummary", "suggestedBuildName", "categories"],
    },
  },
} as const;

export async function extractBuildRequirements(input: ExtractBuildRequirementsInput): Promise<unknown> {
  const userPrompt = [
    `Product description: ${input.description}`,
    `Planned build quantity: ${input.plannedBuildQty}`,
    input.targetUnitCost ? `Target unit cost: ${input.targetUnitCost}` : null,
    "",
    "Parts already tracked and verified in our catalog (prefer these when they genuinely fit; never claim one fits if it doesn't):",
    formatCatalogList(input.trackedCatalog) || "(none tracked yet)",
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  return callGroqTool(
    EXTRACT_TOOL_NAME,
    EXTRACT_TOOL_SCHEMA,
    "You are a hardware BOM planning assistant. You identify the component categories a build needs and, where a genuinely suitable part exists in the provided tracked catalog, name it as a tracked match. The tracked list may spell a part slightly differently than you would from memory (a package suffix, a different hyphen, different case) - treat those as the same part, not a miss. You never claim a part is tracked when it isn't in the provided list. For categories nothing tracked covers, name real, specific manufacturer part numbers from general knowledge as unverified suggestions - a real part number even for a generic-sounding component (e.g. 'Panasonic NCR18650B' for a battery, not just '18650 cell'), never a category description standing in for a part number.",
    userPrompt,
  );
}

// ---------------------------------------------------------------------------
// Alternative part suggestions (one part -> possible substitutes)
// ---------------------------------------------------------------------------

const ALTERNATIVES_TOOL_NAME = "suggest_alternative_parts";

export interface SuggestAlternativePartsInput {
  mpn: string;
  manufacturer: string | null;
  package: string | null;
  marketingStatus: string | null;
  trackedCatalog: CatalogHint[];
}

const ALTERNATIVES_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: ALTERNATIVES_TOOL_NAME,
    description: "Suggest possible substitute parts for a given component, matching against an already-tracked parts catalog where possible.",
    parameters: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          description: "Up to 3 real, specific part numbers that could plausibly substitute for the given part.",
          items: {
            type: "object",
            properties: {
              mpn: { type: "string" },
              rationale: { type: "string", description: "Why this part is a plausible substitute." },
              tradeoff: {
                type: "string",
                description:
                  "What's different or what would need engineering review - package change, voltage/pin difference, footprint, etc. State 'appears drop-in compatible based on known specs' if genuinely nothing stands out - never omit this field.",
              },
            },
            required: ["mpn", "rationale", "tradeoff"],
          },
        },
      },
      required: ["candidates"],
    },
  },
} as const;

export async function suggestAlternativeParts(input: SuggestAlternativePartsInput): Promise<unknown> {
  const details = [input.manufacturer, input.package, input.marketingStatus].filter(Boolean).join(", ");

  const userPrompt = [
    `Part: ${input.mpn}${details ? ` (${details})` : ""}`,
    "",
    "Parts already tracked and verified in our catalog (prefer these as substitutes when they genuinely fit; never claim one fits if it doesn't):",
    formatCatalogList(input.trackedCatalog) || "(none tracked yet)",
  ].join("\n");

  return callGroqTool(
    ALTERNATIVES_TOOL_NAME,
    ALTERNATIVES_TOOL_SCHEMA,
    "You are a hardware component substitution assistant. Given one part, you suggest real, specific alternative part numbers that could plausibly serve the same function - preferring a genuinely suitable part from the provided tracked catalog when one exists, and naming real manufacturer part numbers from general knowledge otherwise. You never claim a part is tracked when it isn't in the provided list, and you never claim a substitute is a safe drop-in replacement - you state the actual tradeoff (package, voltage, pinout, lifecycle) so an engineer can judge it, since final approval is always theirs, never yours.",
    userPrompt,
  );
}
