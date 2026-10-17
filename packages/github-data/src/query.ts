export const PROFILE_DATA_QUERY = /* GraphQL */ `
	query ProfileData($login: String!) {
		user(login: $login) {
			login
			name
			createdAt
			followers {
				totalCount
			}
			repositories(
				ownerAffiliations: OWNER
				isFork: false
				privacy: PUBLIC
				first: 100
				orderBy: { field: STARGAZERS, direction: DESC }
			) {
				totalCount
				nodes {
					name
					stargazerCount
					primaryLanguage {
						name
						color
					}
				}
			}
			contributionsCollection {
				totalCommitContributions
				totalPullRequestContributions
				totalIssueContributions
				contributionCalendar {
					totalContributions
					weeks {
						contributionDays {
							date
							contributionCount
						}
					}
				}
			}
		}
		repository(owner: "ganezha", name: "brankas-android") {
			stargazerCount
			latestRelease {
				tagName
				publishedAt
			}
		}
	}
`;
