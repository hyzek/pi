import { Text } from "@earendil-works/pi-tui";
import type { Theme } from "../../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext, ToolRenderResultOptions } from "../../extensions/types.ts";

export const askUserRenderers: Pick<ToolDefinition, "renderCall" | "renderResult"> = {
	renderCall: (_args: unknown, theme: Theme) => new Text(theme.fg("toolTitle", theme.bold("ask_user")), 0, 0),
	renderResult: (_result, _options: ToolRenderResultOptions, theme: Theme, context: ToolRenderContext) =>
		new Text(theme.fg(context.isError ? "error" : "toolOutput", "Question response received"), 0, 0),
};
