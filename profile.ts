/** I would rather stay a student than pretend I already arrived. */
export type Mode = "learning" | "debugging" | "laughing";

export interface Ganezha {
  readonly name: "Ganezha";
  readonly prefers: "belajar";
  readonly avoids: "terlihat pintar";
  mode: Mode;
}

export const ganezha = {
  name: "Ganezha",
  prefers: "belajar",
  avoids: "terlihat pintar",
  mode: "learning",
} as const satisfies Ganezha;

type Step = "read" | "break" | "laugh" | "fix";

/** Finite unrolling. The infinite version is how I actually live. */
export type Loop = `${Step} → ${Step} → ${Step} → ${Step}`;

export const loop = "read → break → laugh → fix" as const satisfies Loop;

export const status = {
  compiling: true,
  eta: "lifetime",
  curious: true,
} as const;
