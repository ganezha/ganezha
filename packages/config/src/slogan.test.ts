import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SLOGAN } from "./index";

describe("SLOGAN", () => {
	it("contains the four canonical lines exactly", () => {
		expect(SLOGAN).toEqual([
			"Kasih Sayang Untuk Alam Semesta",
			"1. Jika Tuhan sudah mengingatkan mu. tidak akan ada yang bisa membuat mu Lupa.",
			"2. Semua mengalir begitu saja.",
			"3. Bug bukan musuh; ia guru yang merindukan muridnya. 🥺",
		]);
		expect(SLOGAN).toHaveLength(4);
	});

	it("matches the README and visual-engine banner fixture exactly", async () => {
		const [readme, fixture] = await Promise.all([
			readFile(new URL("../../../README.md", import.meta.url), "utf8"),
			readFile(
				new URL("../../visual-engine/fixtures/slogan.txt", import.meta.url),
				"utf8",
			),
		]);
		const section = readme.split(/^## Slogan\s*$/m)[1]?.split(/^## /m)[0] ?? "";
		const readmeLines = [...section.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(
			(match) => match[1] ?? "",
		);
		const fixtureLines = fixture.replaceAll("\r\n", "\n").trimEnd().split("\n");

		expect(SLOGAN.every((line) => line === line.trim())).toBe(true);
		expect(readmeLines).toEqual(SLOGAN);
		expect(fixtureLines).toEqual(SLOGAN);
	});
});
