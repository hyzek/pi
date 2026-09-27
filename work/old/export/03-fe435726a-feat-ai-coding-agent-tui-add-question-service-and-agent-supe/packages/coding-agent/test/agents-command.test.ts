import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";

describe("/agents command", () => {
	it("is available in the interactive built-in command registry", () => {
		expect(BUILTIN_SLASH_COMMANDS.find((command) => command.name === "agents")).toEqual({
			name: "agents",
			description: "Inspect delegated child agents",
		});
	});
});
