function parseHex(hex: string): readonly [number, number, number] {
	if (!/^#[\da-fA-F]{6}$/.test(hex)) {
		throw new TypeError(`Expected a #RRGGBB color, received ${hex}.`);
	}

	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

function linearize(channel: number): number {
	const srgb = channel / 255;
	return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
	const [red, green, blue] = parseHex(hex);
	return (
		0.2126 * linearize(red) +
		0.7152 * linearize(green) +
		0.0722 * linearize(blue)
	);
}

export function contrastRatio(a: string, b: string): number {
	const luminanceA = relativeLuminance(a);
	const luminanceB = relativeLuminance(b);
	const lighter = Math.max(luminanceA, luminanceB);
	const darker = Math.min(luminanceA, luminanceB);
	return (lighter + 0.05) / (darker + 0.05);
}
