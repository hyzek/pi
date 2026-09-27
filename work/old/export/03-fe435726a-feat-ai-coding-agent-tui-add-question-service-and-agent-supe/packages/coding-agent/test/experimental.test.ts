import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalPiExperimental = process.env.FLUX_EXPERIMENTAL;

	afterEach(() => {
		if (originalPiExperimental === undefined) {
			delete process.env.FLUX_EXPERIMENTAL;
		} else {
			process.env.FLUX_EXPERIMENTAL = originalPiExperimental;
		}
	});

	it("returns false when FLUX_EXPERIMENTAL is unset", () => {
		delete process.env.FLUX_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when FLUX_EXPERIMENTAL is empty", () => {
		process.env.FLUX_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when FLUX_EXPERIMENTAL is set to 1", () => {
		process.env.FLUX_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when FLUX_EXPERIMENTAL is set to 0", () => {
		process.env.FLUX_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when FLUX_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.FLUX_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});
