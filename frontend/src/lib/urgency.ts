import type { Urgency } from "./types";

type UrgencyStyle = { label: string; dot: string; text: string; pulse: boolean };

export const URGENCY_STYLES: Record<Urgency, UrgencyStyle> = {
  critical: { label: "Critical", dot: "bg-urgency-critical", text: "text-urgency-critical", pulse: true },
  high: { label: "High", dot: "bg-urgency-high", text: "text-urgency-high", pulse: false },
  medium: { label: "Medium", dot: "bg-urgency-medium", text: "text-urgency-medium", pulse: false },
  low: { label: "Low", dot: "bg-urgency-low", text: "text-urgency-low", pulse: false },
};

type ConfidenceBand = "strong" | "fair" | "weak";

const STRONG_CONFIDENCE = 0.8;

export function confidenceBand(confidence: number, threshold: number): ConfidenceBand {
  if (confidence < threshold) return "weak";
  if (confidence >= STRONG_CONFIDENCE) return "strong";
  return "fair";
}
