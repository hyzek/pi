import { describe, expect, it } from "vitest";
import type { PermissionMode } from "../src/core/permission-mode.ts";
import { isRpcSettablePermissionMode, RPC_SETTABLE_PERMISSION_MODES } from "../src/modes/rpc/rpc-types.ts";

describe("RPC settable permission modes", () => {
	it("offers the modes the protocol can actually serve", () => {
		expect([...RPC_SETTABLE_PERMISSION_MODES]).toEqual(["auto", "plan"]);
		expect(isRpcSettablePermissionMode("auto")).toBe(true);
		expect(isRpcSettablePermissionMode("plan")).toBe(true);
	});

	it("rejects manual, which needs an approval channel RPC does not provide", () => {
		// Manual mode blocks every mutating tool behind a ToolCallApprovalHandler, and this
		// protocol has no approval request/response pair for a host to answer. Accepting it
		// would leave the session unable to run any mutating tool.
		const allModes: PermissionMode[] = ["auto", "manual", "plan"];
		expect(allModes.filter(isRpcSettablePermissionMode)).toEqual(["auto", "plan"]);
	});
});
