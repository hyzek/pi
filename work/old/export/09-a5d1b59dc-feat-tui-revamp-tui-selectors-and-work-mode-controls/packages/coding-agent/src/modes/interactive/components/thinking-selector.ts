import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
	Container,
	type Focusable,
	getKeybindings,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SelectListTheme,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import { getSelectListTheme, theme } from "../theme/theme.ts";
import { THINKING_LEVEL_DESCRIPTIONS, THINKING_LEVEL_LABELS } from "../thinking-levels.ts";

const THINKING_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 18,
	maxPrimaryColumnWidth: 32,
	selectedItemMarker: "> ",
};

// The selected row is marked by the accent-colored `> ` marker and text alone; the base
// theme already styles it, and non-selected rows are left unstyled so it stands out.
const THINKING_SELECT_LIST_THEME: SelectListTheme = {
	...getSelectListTheme(),
	primaryText: (text: string) => text,
};

/**
 * Component that renders a reasoning effort selector.
 */
export class ThinkingSelectorComponent extends Container implements Focusable {
	private selectList: SelectList;
	private onSelect: (level: ThinkingLevel) => void;
	private onCancel: () => void;
	private onSelectAsDefault?: (level: ThinkingLevel) => void;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(
		currentLevel: ThinkingLevel,
		availableLevels: ThinkingLevel[],
		onSelect: (level: ThinkingLevel) => void,
		onCancel: () => void,
		onSelectAsDefault?: (level: ThinkingLevel) => void,
		defaultThinkingLevel?: ThinkingLevel,
		modelLabel?: string,
	) {
		super();
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.onSelectAsDefault = onSelectAsDefault;

		const items: SelectItem[] = availableLevels.map((level, index) => ({
			value: level,
			label: `${index + 1}. ${THINKING_LEVEL_LABELS[level]}${thinkingLevelSuffix(level, currentLevel, defaultThinkingLevel)}`,
			description: THINKING_LEVEL_DESCRIPTIONS[level],
		}));

		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.bold(modelLabel ? `Select Reasoning Level for ${modelLabel}` : "Select Reasoning Level"), 0, 0),
		);
		this.addChild(new Spacer(1));

		this.selectList = this.buildSelectList(items, currentLevel);
		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
	}

	private buildSelectList(items: SelectItem[], preselect?: ThinkingLevel): SelectList {
		const list = new SelectList(
			items,
			Math.max(1, items.length),
			THINKING_SELECT_LIST_THEME,
			THINKING_SELECT_LIST_LAYOUT,
		);
		const currentIndex = items.findIndex((item) => item.value === preselect);
		if (currentIndex !== -1) {
			list.setSelectedIndex(currentIndex);
		}
		list.onSelect = (item) => this.onSelect(item.value as ThinkingLevel);
		list.onCancel = () => this.onCancel();
		return list;
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "app.thinking.save") && this.onSelectAsDefault) {
			const item = this.selectList.getSelectedItem();
			if (item) this.onSelectAsDefault(item.value as ThinkingLevel);
			return;
		}

		this.selectList.handleInput(keyData);
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}

function thinkingLevelSuffix(
	level: ThinkingLevel,
	currentLevel: ThinkingLevel,
	defaultLevel: ThinkingLevel | undefined,
): string {
	const markers: string[] = [];
	if (level === defaultLevel) markers.push("default");
	if (level === currentLevel) markers.push("current");
	return markers.length > 0 ? ` (${markers.join(", ")})` : "";
}
