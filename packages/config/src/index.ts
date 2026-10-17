import { TOKENS } from "./tokens";

export { contrastRatio, relativeLuminance } from "./contrast";
export type { DesignTokens } from "./tokens";
export { TOKENS } from "./tokens";

export const THEME = {
	background: TOKENS.color.bg,
	gold: TOKENS.color.gold,
} as const;

export const SLOGAN = [
	"Kasih Sayang Untuk Alam Semesta",
	"1. Jika Tuhan sudah mengingatkan mu. tidak akan ada yang bisa membuat mu Lupa.",
	"2. Semua mengalir begitu saja.",
	"3. Bug bukan musuh; ia guru yang merindukan muridnya. 🥺",
] as const;
