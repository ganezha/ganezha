import { SLOGAN, THEME } from "@ganezha/config";
import { isOk, ok } from "@ganezha/shared";

const profileSummary = ok({
	slogan: SLOGAN[0],
	background: THEME.background,
	accent: THEME.gold,
});

if (isOk(profileSummary)) {
	console.log(
		profileSummary.value.slogan +
			" | background " +
			profileSummary.value.background +
			" | accent " +
			profileSummary.value.accent,
	);
}
