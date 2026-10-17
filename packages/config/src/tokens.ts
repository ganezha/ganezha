export const TOKENS = {
	color: {
		bg: "#10110F",
		surface: "#171815",
		border: "#2A2B26",
		gold: "#D4AF37",
		goldText: "#E6C76A",
		goldMuted: "#8C7A3E",
		text: "#EDEAE0",
		textMuted: "#A8A497",
		accent: "#4B8FC8",
		light: {
			bg: "#FAF8F2",
			surface: "#FFFFFF",
			border: "#E3DCC8",
			gold: "#9A7B1F",
			goldText: "#7A5F12",
			text: "#1A1B18",
			textMuted: "#5C5A52",
			accent: "#2F6FA8",
		},
	},
	space: [0, 4, 8, 12, 16, 24, 32, 48], // CSS pixel values
	radius: {
		sm: 4,
		md: 8,
		lg: 12,
	},
	stroke: {
		thin: 1,
		base: 2,
		bold: 3,
	},
	type: {
		fontFamily: "JetBrains Mono",
		size: {
			xs: 11,
			sm: 13,
			md: 16,
			lg: 20,
			xl: 28,
		},
		weight: {
			regular: 400,
			bold: 700,
		},
	},
	motion: {
		duration: {
			fast: "1.2s",
			base: "1.8s",
			slow: "3s",
		},
		easing: "ease-in-out",
		reducedMotion: true,
	},
	card: {
		width: 495,
		height: 195,
	},
	banner: {
		width: 1200,
		height: 300,
	},
} as const;

export type DesignTokens = typeof TOKENS;
