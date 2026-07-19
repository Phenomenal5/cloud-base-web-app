import * as yup from "yup";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";
import type { Category, Severity } from "../generated/prisma/enums.js";

// ─── Classification service (FR-20/21) ────────────────
//
// Assigns a fixed-set category + a LOW/MEDIUM/HIGH severity (with justification)
// to a report. The LLM returns JSON that we validate with Yup; any invalid or
// failed output falls back to a deterministic heuristic (§8.4 — invalid JSON
// triggers a fallback, never a crash).

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

// Hard output-token cap (FR-18) — locked as a constant, not env-tunable.
const CATEGORIZATION_MAX_TOKENS = 100;

export const CATEGORIES: Category[] = [
  "HUMAN_FACTORS",
  "AIRCRAFT_SYSTEMS",
  "WEATHER",
  "ATC_COMMUNICATION",
  "RUNWAY_SAFETY",
  "WILDLIFE",
  "PROCEDURAL",
  "OTHER",
];
export const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH"];

export interface Classification {
  category: Category;
  severity: Severity;
  justification: string;
}

const classificationSchema = yup.object({
  category: yup.string().oneOf(CATEGORIES).required(),
  severity: yup.string().oneOf(SEVERITIES).required(),
  justification: yup.string().trim().min(1).max(400).required(),
});

const SYSTEM_PROMPT = `You classify aviation safety (ASRS) incident reports. Return ONLY JSON:
{"category": one of [${CATEGORIES.join(", ")}], "severity": one of [LOW, MEDIUM, HIGH], "justification": "one short sentence"}
Pick the single best category. Severity reflects potential for harm (near-miss/emergency = HIGH; benign/precautionary = LOW).`;

export async function classifyReport(narrative: string): Promise<Classification> {
  if (!client) return heuristicClassify(narrative);

  try {
    const response = await client.chat.completions.create({
      model: env.chatModel,
      temperature: 0,
      max_tokens: CATEGORIZATION_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: narrative },
      ],
    });

    recordTokenUsage("CLASSIFICATION", env.chatModel, response.usage);
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    const valid = await classificationSchema.validate(parsed, { stripUnknown: true });
    return valid as Classification;
  } catch (error) {
    logger.warn(
      `Classification fell back to heuristic: ${error instanceof Error ? error.message : String(error)}`,
    );
    return heuristicClassify(narrative);
  }
}

// ─── Deterministic fallback ───────────────────────────
// Keyword heuristic — used when no API key is set or the LLM output is invalid.
function heuristicClassify(narrative: string): Classification {
  const text = narrative.toLowerCase();

  let category: Category = "OTHER";
  if (/\bbird|wildlife|deer\b/.test(text)) category = "WILDLIFE";
  else if (/runway|incursion|taxi|hold.?short|apron/.test(text)) category = "RUNWAY_SAFETY";
  else if (/icing|weather|wind|fog|turbulence|thunderstorm|ice\b/.test(text)) category = "WEATHER";
  else if (/\batc\b|clearance|controller|frequency|tower|ground control/.test(text))
    category = "ATC_COMMUNICATION";
  else if (/engine|oil|hydraul|pressure|gear|electrical|system|pitot|transducer/.test(text))
    category = "AIRCRAFT_SYSTEMS";
  else if (/fatigue|distract|workload|situational|complacen|automation|human.?factor/.test(text))
    category = "HUMAN_FACTORS";
  else if (/checklist|procedure|policy|\bsop\b|qrh/.test(text)) category = "PROCEDURAL";

  let severity: Severity = "MEDIUM";
  if (/emergency|declared|fire|stall|terrain|near.?miss|collision|incursion|surge/.test(text))
    severity = "HIGH";
  else if (/uneventful|minor|precautionary|no injuries|stabiliz|corrected/.test(text))
    severity = "LOW";

  return {
    category,
    severity,
    justification:
      "Heuristic classification (dev fallback — set OPENAI_API_KEY for LLM classification).",
  };
}
