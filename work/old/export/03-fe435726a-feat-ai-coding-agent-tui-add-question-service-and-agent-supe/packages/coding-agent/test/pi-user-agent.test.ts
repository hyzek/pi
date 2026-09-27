import { describe, expect, it } from "vitest";
import { getFluxUserAgent } from "../src/utils/pi-user-agent.ts";

describe("getFluxUserAgent", () => {
	it("formats the Flux user agent", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getFluxUserAgent("1.2.3");

		expect(userAgent).toBe(`flux/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^flux\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
