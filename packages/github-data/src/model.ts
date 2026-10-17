import type { ProfileData, ProfileUser } from "./schema";

export type TopLanguage = Readonly<{
	name: string;
	color: string | null;
	share: number;
}>;

export type ProfileSnapshot = Readonly<{
	login: string;
	name: string | null;
	followers: number;
	publicRepos: number;
	totalStars: number;
	topLanguages: readonly TopLanguage[];
	contributions: Readonly<{
		total: number;
		commits: number;
		prs: number;
		issues: number;
	}>;
	calendar: readonly Readonly<{ date: string; count: number }>[];
	brankas: Readonly<{
		stars: number;
		latestTag: string | null;
		publishedAt: string | null;
	}> | null;
	fetchedAt: string;
}>;

export type ProfileSnapshotInput = Omit<ProfileData, "user"> & {
	user: ProfileUser;
	fetchedAt: string;
};

/** Purely transforms validated GraphQL data and an injected ISO timestamp. */
export function toSnapshot(raw: ProfileSnapshotInput): ProfileSnapshot {
	const languageCounts = new Map<
		string,
		{ count: number; color: string | null }
	>();
	let languageRepositoryCount = 0;

	for (const repository of raw.user.repositories.nodes) {
		const language = repository.primaryLanguage;
		if (language === null) continue;

		languageRepositoryCount += 1;
		const current = languageCounts.get(language.name);
		if (current === undefined) {
			languageCounts.set(language.name, { count: 1, color: language.color });
		} else {
			current.count += 1;
			if (current.color === null && language.color !== null) {
				current.color = language.color;
			}
		}
	}

	const topLanguages = [...languageCounts.entries()]
		.map(([name, value]) => ({
			name,
			color: value.color,
			share:
				languageRepositoryCount === 0
					? 0
					: value.count / languageRepositoryCount,
			count: value.count,
		}))
		.sort((left, right) => {
			if (left.count !== right.count) return right.count - left.count;
			return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
		})
		.slice(0, 6)
		.map(({ name, color, share }) => ({ name, color, share }));

	const contributionCollection = raw.user.contributionsCollection;
	const calendarData = contributionCollection.contributionCalendar;
	const brankasRelease = raw.repository?.latestRelease ?? null;

	return {
		login: raw.user.login,
		name: raw.user.name,
		followers: raw.user.followers.totalCount,
		publicRepos: raw.user.repositories.totalCount,
		totalStars: raw.user.repositories.nodes.reduce(
			(total, repository) => total + repository.stargazerCount,
			0,
		),
		topLanguages,
		contributions: {
			total: calendarData.totalContributions,
			commits: contributionCollection.totalCommitContributions,
			prs: contributionCollection.totalPullRequestContributions,
			issues: contributionCollection.totalIssueContributions,
		},
		calendar: calendarData.weeks.flatMap((week) =>
			week.contributionDays.map((day) => ({
				date: day.date,
				count: day.contributionCount,
			})),
		),
		brankas:
			raw.repository === null
				? null
				: {
						stars: raw.repository.stargazerCount,
						latestTag: brankasRelease?.tagName ?? null,
						publishedAt: brankasRelease?.publishedAt ?? null,
					},
		fetchedAt: raw.fetchedAt,
	};
}
