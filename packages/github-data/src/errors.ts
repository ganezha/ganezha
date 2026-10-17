export type DataError =
	| { kind: "auth" }
	| { kind: "rate_limit"; resetAt?: string }
	| { kind: "network"; message: string }
	| { kind: "graphql"; messages: string[] }
	| { kind: "schema"; issues: string[] };
