import type { Mood } from "./types";

export const MOODS: (Mood & { min: number; max: number })[] = [
  { key: "feeding", label: "Feeding Frenzy", desc: "Funding is deeply negative and shorts are paying. The desk leans bid and burns faster.", color: "#3ee6a8", min: -Infinity, max: -0.004 },
  { key: "hunting", label: "Hunting", desc: "Funding is mildly negative. The desk quotes tight and fills often.", color: "#34b7dd", min: -0.004, max: 0 },
  { key: "cruising", label: "Cruising", desc: "Funding is neutral. Normal two-sided quoting and steady burns.", color: "#93d9ee", min: 0, max: 0.006 },
  { key: "circling", label: "Circling", desc: "Longs are crowded. The desk widens its quotes and waits for a wick.", color: "#ffc247", min: 0.006, max: 0.012 },
  { key: "breach", label: "Breach", desc: "Liquidation cascade detected. Wick bonus armed: the desk buys back into the flush.", color: "#ff5252", min: 0.012, max: Infinity },
];

export const moodFor = (funding: number): Mood => {
  const m = MOODS.find(x => funding >= x.min && funding < x.max) ?? MOODS[2];
  return { key: m.key, label: m.label, desc: m.desc, color: m.color };
};
