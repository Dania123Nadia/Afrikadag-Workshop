import type { WorkshopContent } from "./types";

// Default texts for the participant-facing introduction. Every text can be
// changed per workshop in Setup → Introduction content.
export const DEFAULT_CONTENT: Required<WorkshopContent> = {
  challenge:
    "The Netherlands has labour shortages in several sectors. Kenya has a young, growing workforce and wants decent jobs and skills for its people. Migration can help both, but only if it is fair, well organised and politically sustainable. Today we look at one proposal and test it from different perspectives.",
  circular:
    "People work in the Netherlands for a set period, then return to Kenya. If the arrangement works well, they can come back for another period. It aims to balance Dutch labour shortages, political concerns about immigration, fair and dignified opportunities, and the transfer of knowledge and skills.",
  traffic:
    "Each sector is assessed against labour market needs in both countries, so migration is only actively facilitated where it makes sense for both.",
  cotraining:
    "For green and amber sectors, Kenya and the Netherlands select and train candidates together: standardised skills assessments in Kenya, cooperation with local NGOs and schools, Dutch sector input on assessments, skills and language training, continued training while working in the Netherlands, and possibly better routes to long-term stay.",
  green_examples: "",
  amber_examples: "",
  red_examples: "",
};

export function contentOf(c: WorkshopContent | null | undefined): Required<WorkshopContent> {
  const out = { ...DEFAULT_CONTENT };
  for (const [k, v] of Object.entries(c ?? {})) if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k] = v;
  return out;
}

export const TRAFFIC = [
  {
    key: "green",
    label: "Green",
    title: "Facilitate",
    text: "High demand in the Netherlands and a surplus of workers in this sector in Kenya.",
    color: "var(--color-go)",
    soft: "var(--color-go-soft)",
  },
  {
    key: "amber",
    label: "Amber",
    title: "Careful consideration",
    text: "Demand in the Netherlands, but Kenya also needs workers in this sector.",
    color: "var(--color-caution)",
    soft: "var(--color-caution-soft)",
  },
  {
    key: "red",
    label: "Red",
    title: "Do not actively facilitate",
    text: "Not enough justification, considering the needs of both countries.",
    color: "var(--color-stop)",
    soft: "var(--color-stop-soft)",
  },
] as const;

export const COTRAINING_STEPS = [
  "Standardised skills assessment in Kenya",
  "Cooperation with local NGOs and schools",
  "Dutch sector input on assessments",
  "Skills and language training",
  "Training continues while working in NL",
  "Possible route to long-term stay",
];

export const ITEM_META = {
  opportunity: { label: "Opportunities", one: "opportunity", prompt: "What could this model make better? For whom?", placeholder: "Add an opportunity…", color: "var(--color-go)", soft: "var(--color-go-soft)" },
  risk: { label: "Risks & challenges", one: "risk", prompt: "Concerns, unintended consequences, practical barriers.", placeholder: "Add a risk or challenge…", color: "var(--color-stop)", soft: "var(--color-stop-soft)" },
  recommendation: { label: "Recommendations", one: "recommendation", prompt: "How would you improve the model?", placeholder: "Add a recommendation…", color: "var(--color-brand)", soft: "var(--color-brand-soft)" },
} as const;

export const LEVEL_LABEL = { core: "Starter", deeper: "Deeper", challenge: "Challenge" } as const;
