import * as yup from "yup";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";
import type { Category, Severity } from "../generated/prisma/enums.js";

// Assigns a category and a LOW/MEDIUM/HIGH severity to a report. The model
// returns JSON, which we validate with Yup; anything invalid falls back to a
// deterministic heuristic so ingestion never dies on a bad response.

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

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
      max_completion_tokens: CATEGORIZATION_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: narrative },
      ],
    });

    recordTokenUsage("CLASSIFICATION", env.chatModel, response.usage);
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    return (await classificationSchema.validate(parsed, { stripUnknown: true })) as Classification;
  } catch (error) {
    logger.warn(
      `Classification fell back to heuristic: ${error instanceof Error ? error.message : String(error)}`,
    );
    return heuristicClassify(narrative);
  }
}

// Keyword fallback, used when there's no API key or the model's output failed
// validation. Order matters: the more specific patterns are checked first.
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
    justification: "Heuristic classification (set OPENAI_API_KEY for LLM classification).",
  };
}
