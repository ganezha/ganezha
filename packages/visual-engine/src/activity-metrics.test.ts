import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ActivityCalendarDay,
	calculateActivityMetrics,
} from "./activity-metrics";

function calendar(counts: readonly number[]): ActivityCalendarDay[] {
	return counts.map((count, index) => ({
		date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
		count,
	}));
}

describe("activity metric functional core", () => {
	it("returns no-data values for an empty calendar", () => {
		expect(calculateActivityMetrics([])).toEqual({
			hasCalendarData: false,
			mostActiveDay: null,
			currentStreak: 0,
			longestStreak: 0,
			last30DaysTotal: null,
		});
		expect(calculateActivityMetrics(undefined).longestStreak).toBe(0);
	});

	it("returns zero streaks and a real zero total for an all-zero calendar", () => {
		const metrics = calculateActivityMetrics(calendar([0, 0, 0, 0]));
		expect(metrics.hasCalendarData).toBe(true);
		expect(metrics.currentStreak).toBe(0);
		expect(metrics.longestStreak).toBe(0);
		expect(metrics.mostActiveDay).toBeNull();
		expect(metrics.last30DaysTotal).toBe(0);
	});

	it("counts a fully active calendar as one continuous streak", () => {
		const metrics = calculateActivityMetrics(calendar([1, 2, 1, 4, 1]));
		expect(metrics.currentStreak).toBe(5);
		expect(metrics.longestStreak).toBe(5);
	});

	it("breaks streaks at inactive days and reports the trailing current streak", () => {
		const metrics = calculateActivityMetrics(calendar([1, 1, 1, 0, 2]));
		expect(metrics.currentStreak).toBe(1);
		expect(metrics.longestStreak).toBe(3);
	});

	it("breaks a streak when calendar dates have a gap", () => {
		const metrics = calculateActivityMetrics([
			{ date: "2026-01-01", count: 1 },
			{ date: "2026-01-02", count: 1 },
			{ date: "2026-01-04", count: 1 },
		]);
		expect(metrics.currentStreak).toBe(1);
		expect(metrics.longestStreak).toBe(2);
	});

	it("finds the earliest most-active tie and sums the latest 30 calendar days", () => {
		const days = calendar(
			Array.from({ length: 31 }, (_, index) =>
				index === 0 || index === 30 ? 8 : 1,
			),
		);
		const metrics = calculateActivityMetrics(days);
		expect(metrics.mostActiveDay).toEqual({
			date: "2026-01-01",
			count: 8,
		});
		expect(metrics.last30DaysTotal).toBe(37);
	});

	it("keeps longest streak at least current and no longer than the calendar", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 12 }), { maxLength: 371 }),
				(counts) => {
					const metrics = calculateActivityMetrics(calendar(counts));
					return (
						metrics.longestStreak >= metrics.currentStreak &&
						metrics.longestStreak <= counts.length
					);
				},
			),
		);
	});
});
