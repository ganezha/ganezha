import { z } from "zod";

const CountSchema = z.number().int().nonnegative();
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const CalendarDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00.000Z`);
		return (
			!Number.isNaN(parsed.getTime()) &&
			parsed.toISOString().slice(0, 10) === value
		);
	});

const LanguageSchema = z
	.object({
		name: z.string().min(1),
		color: z.string().nullable(),
	})
	.strict();

const RepositoryNodeSchema = z
	.object({
		name: z.string().min(1),
		stargazerCount: CountSchema,
		primaryLanguage: LanguageSchema.nullable(),
	})
	.strict();

const ProfileUserSchema = z
	.object({
		login: z.string().min(1),
		name: z.string().nullable(),
		createdAt: IsoDateTimeSchema,
		followers: z
			.object({
				totalCount: CountSchema,
			})
			.strict(),
		repositories: z
			.object({
				totalCount: CountSchema,
				nodes: z.array(RepositoryNodeSchema),
			})
			.strict(),
		contributionsCollection: z
			.object({
				totalCommitContributions: CountSchema,
				totalPullRequestContributions: CountSchema,
				totalIssueContributions: CountSchema,
				contributionCalendar: z
					.object({
						totalContributions: CountSchema,
						weeks: z.array(
							z
								.object({
									contributionDays: z.array(
										z
											.object({
												date: CalendarDateSchema,
												contributionCount: CountSchema,
											})
											.strict(),
									),
								})
								.strict(),
						),
					})
					.strict(),
			})
			.strict(),
	})
	.strict();

const ReleaseSchema = z
	.object({
		tagName: z.string().min(1),
		publishedAt: IsoDateTimeSchema,
	})
	.strict();

const BrankasRepositorySchema = z
	.object({
		stargazerCount: CountSchema,
		latestRelease: ReleaseSchema.nullable(),
	})
	.strict();

const SnapshotLanguageSchema = z
	.object({
		name: z.string().min(1),
		color: z.string().nullable(),
		share: z.number().finite().min(0).max(1),
	})
	.strict();

const SnapshotCalendarDaySchema = z
	.object({
		date: CalendarDateSchema,
		count: CountSchema,
	})
	.strict();

export const ProfileSnapshotSchema = z
	.object({
		login: z.string().refine((value) => value.trim().length > 0),
		name: z.string().nullable(),
		followers: CountSchema,
		publicRepos: CountSchema,
		totalStars: CountSchema,
		topLanguages: z.array(SnapshotLanguageSchema).max(6),
		contributions: z
			.object({
				total: CountSchema,
				commits: CountSchema,
				prs: CountSchema,
				issues: CountSchema,
			})
			.strict(),
		calendar: z.array(SnapshotCalendarDaySchema).max(371),
		brankas: z
			.object({
				stars: CountSchema,
				latestTag: z.string().nullable(),
				publishedAt: IsoDateTimeSchema.nullable(),
			})
			.strict()
			.nullable(),
		fetchedAt: IsoDateTimeSchema,
	})
	.strict();

export const ProfileDataSchema = z
	.object({
		user: ProfileUserSchema.nullable(),
		repository: BrankasRepositorySchema.nullable(),
	})
	.strict();

const GraphQLErrorSchema = z
	.object({
		message: z.string().min(1),
		type: z.string().optional(),
		locations: z
			.array(
				z
					.object({
						line: z.number().int().positive(),
						column: z.number().int().positive(),
					})
					.strict(),
			)
			.optional(),
		path: z.array(z.union([z.string(), CountSchema])).optional(),
		extensions: z.record(z.string(), z.unknown()).optional(),
	})
	.strict();

const GraphQLResponseEnvelopeSchema = z
	.object({
		// GraphQL may return partial data alongside errors, so validate data after errors.
		data: z.unknown().optional(),
		errors: z.array(GraphQLErrorSchema).optional(),
		extensions: z.record(z.string(), z.unknown()).optional(),
	})
	.strict();

export type ProfileData = z.infer<typeof ProfileDataSchema>;
export type ProfileUser = NonNullable<ProfileData["user"]>;
export type GraphQLError = z.infer<typeof GraphQLErrorSchema>;
export type GraphQLResponseEnvelope = z.infer<
	typeof GraphQLResponseEnvelopeSchema
>;

export function parseGraphQLResponseEnvelope(
	input: unknown,
): ReturnType<typeof GraphQLResponseEnvelopeSchema.safeParse> {
	return GraphQLResponseEnvelopeSchema.safeParse(input);
}
