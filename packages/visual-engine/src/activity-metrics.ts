export type ActivityCalendarDay = Readonly<{
	date: string;
	count: number;
}>;

export type ActivityMetrics = Readonly<{
	hasCalendarData: boolean;
	mostActiveDay: ActivityCalendarDay | null;
	currentStreak: number;
	longestStreak: number;
	last30DaysTotal: number | null;
}>;

type DatedActivityDay = ActivityCalendarDay & Readonly<{ ordinal: number }>;

function dateOrdinal(date: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const timestamp = Date.parse(`${date}T00:00:00.000Z`);
	if (
		!Number.isFinite(timestamp) ||
		new Date(timestamp).toISOString().slice(0, 10) !== date
	) {
		return null;
	}
	return Math.floor(timestamp / 86_400_000);
}

function normalizedDays(
	calendar: readonly ActivityCalendarDay[] | null | undefined,
): DatedActivityDay[] {
	if (!Array.isArray(calendar)) return [];
	return calendar
		.flatMap((day) => {
			if (day === null || typeof day !== "object") return [];
			const ordinal = dateOrdinal(day.date);
			if (
				ordinal === null ||
				!Number.isSafeInteger(day.count) ||
				day.count < 0
			) {
				return [];
			}
			return [{ date: day.date, count: day.count, ordinal }];
		})
		.sort((first, second) => first.ordinal - second.ordinal);
}

/** Purely derives contribution activity metrics from calendar days. */
export function calculateActivityMetrics(
	calendar: readonly ActivityCalendarDay[] | null | undefined,
): ActivityMetrics {
	const days = normalizedDays(calendar);
	if (days.length === 0) {
		return {
			hasCalendarData: false,
			mostActiveDay: null,
			currentStreak: 0,
			longestStreak: 0,
			last30DaysTotal: null,
		};
	}

	let mostActiveDay: ActivityCalendarDay | null = null;
	let longestStreak = 0;
	let runningStreak = 0;
	let previousOrdinal: number | null = null;
	for (const day of days) {
		if (day.count > 0) {
			if (
				runningStreak > 0 &&
				previousOrdinal !== null &&
				day.ordinal === previousOrdinal + 1
			) {
				runningStreak += 1;
			} else {
				runningStreak = 1;
			}
			longestStreak = Math.max(longestStreak, runningStreak);
			if (mostActiveDay === null || day.count > mostActiveDay.count) {
				mostActiveDay = { date: day.date, count: day.count };
			}
		} else {
			runningStreak = 0;
		}
		previousOrdinal = day.ordinal;
	}

	let currentStreak = 0;
	for (let index = days.length - 1; index >= 0; index -= 1) {
		const day = days[index];
		if (day === undefined || day.count === 0) break;
		const next = days[index + 1];
		if (next !== undefined && next.ordinal !== day.ordinal + 1) break;
		currentStreak += 1;
	}

	const latestOrdinal = days[days.length - 1]?.ordinal;
	const firstOrdinal =
		latestOrdinal === undefined ? Number.POSITIVE_INFINITY : latestOrdinal - 29;
	const last30DaysTotal = days
		.filter((day) => day.ordinal >= firstOrdinal)
		.reduce((total, day) => total + day.count, 0);

	return {
		hasCalendarData: true,
		mostActiveDay,
		currentStreak,
		longestStreak,
		last30DaysTotal,
	};
}
