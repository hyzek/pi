import { type Component, Loader, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import type { WorkingIndicatorOptions } from "../../../core/extensions/index.ts";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { keyText } from "./keybinding-hints.ts";

// A bullet dot that pulses from the secondary-text gray (256-color grayscale #808080) to
// near-white, plus a working message whose word fades white→gray left to right. Both use a
// smooth quadratic (smoothstep) ease. Each frame cycle holds the dot bright and dips it
// quickly to gray; the text sweep restarts at the start of each cycle.
const WORKING_DOT = "\u2022";
const WORKING_DOT_FRAMES = 24;
const WORKING_DOT_INTERVAL_MS = 40;
const GRAY_INDEX_MIN = 244; // #808080 (secondary-text gray)
const GRAY_INDEX_MAX = 255; // near-white
const GRAY_RANGE = GRAY_INDEX_MAX - GRAY_INDEX_MIN;

function smoothstep(u: number): number {
	return u * u * (3 - 2 * u);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function grayIndex(brightness: number): number {
	return Math.round(GRAY_INDEX_MIN + clamp01(brightness) * GRAY_RANGE);
}

/**
 * Brightness (0 = gray, 1 = white) for the dot pulse, over one cycle [0,1]. A continuous,
 * bright-biased raised cosine so the dot breathes white → gray → white smoothly (no flat
 * hold, no abrupt dip); the power lifts the curve toward the bright end.
 */
function workingDotBrightness(t: number): number {
	const s = 0.5 + 0.5 * Math.cos(2 * Math.PI * t);
	return s ** 0.6;
}

/** Build the gray-to-white fade-dot frames. Frames render verbatim, so each has its own shade. */
/** The shared animated dot used by the main working indicator and compact tool rows. */
export function createWorkingDotIndicator(): WorkingIndicatorOptions {
	const frames: string[] = [];
	for (let i = 0; i < WORKING_DOT_FRAMES; i++) {
		const t = i / (WORKING_DOT_FRAMES - 1);
		frames.push(`\x1b[38;5;${grayIndex(workingDotBrightness(t))}m${WORKING_DOT}\x1b[39m`);
	}
	return { frames, intervalMs: WORKING_DOT_INTERVAL_MS };
}

export type StatusIndicatorKind = "working" | "retry" | "compaction" | "branchSummary";

export class StatusIndicator extends Loader {
	readonly kind: StatusIndicatorKind;

	constructor(
		kind: StatusIndicatorKind,
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string,
		indicator?: WorkingIndicatorOptions,
	) {
		super(ui, spinnerColorFn, messageColorFn, message, indicator);
		this.kind = kind;
	}

	renderInBorder(width: number): string {
		const line = super.render(width + 2)[1] ?? "";
		return truncateToWidth(line.startsWith(" ") ? line.slice(1).trimEnd() : line.trimEnd(), width, "");
	}

	renderSpinnerInBorder(width: number): string {
		return truncateToWidth(this.getRenderedIndicator(), width, "");
	}

	dispose(): void {
		this.stop();
	}
}

export class WorkingStatusIndicator extends StatusIndicator {
	private readonly baseMessage: string;
	private readonly interruptHint: string;
	private elapsedIntervalId: ReturnType<typeof setInterval> | undefined;
	private readonly startedAt = Date.now();

	constructor(ui: TUI, message: string, indicator?: WorkingIndicatorOptions, colorFn?: (text: string) => string) {
		super(
			"working",
			ui,
			colorFn ?? ((text) => theme.fg("accent", text)),
			colorFn ?? ((text) => theme.fg("muted", text)),
			message,
			indicator ?? createWorkingDotIndicator(),
		);
		this.baseMessage = message;
		const interruptKey = keyText("app.interrupt");
		// Short-form the Escape key so the hint reads "esc to interrupt".
		this.interruptHint = `${interruptKey === "escape" ? "esc" : interruptKey} to interrupt`;
		this.updateElapsedMessage();
		this.elapsedIntervalId = setInterval(() => {
			this.updateElapsedMessage();
		}, 1000);
	}

	private updateElapsedMessage(): void {
		const seconds = Math.max(1, Math.ceil((Date.now() - this.startedAt) / 1000));
		this.setMessage(`${this.baseMessage} (${seconds}s • ${this.interruptHint})`);
	}

	override dispose(): void {
		if (this.elapsedIntervalId !== undefined) {
			clearInterval(this.elapsedIntervalId);
			this.elapsedIntervalId = undefined;
		}
		super.dispose();
	}

	protected override renderMessage(message: string, frameIndex: number): string {
		// Sweep a white shine over the working word left→right. The position eases with a
		// quadratic (smoothstep) curve and the shine fades in/out (sin envelope) so the end of
		// one pass melts away instead of cutting abruptly before the next restarts.
		const base = this.baseMessage ?? message;
		const total = this.frames.length;
		const u = total <= 1 ? 0 : frameIndex / (total - 1);
		const position = smoothstep(u);
		const envelope = Math.sin(Math.PI * u);
		return this.sweepWord(base, position, envelope) + this.messageColorFn(message.slice(base.length));
	}

	/** Color each character white near the sweep center, gray away from it (scaled by envelope). */
	private sweepWord(word: string, position: number, envelope: number): string {
		if (word.length === 0) return "";
		let out = "";
		for (let i = 0; i < word.length; i++) {
			const pos = word.length <= 1 ? 1 : i / (word.length - 1);
			const brightness = clamp01(1 - Math.abs(pos - position) / 0.35) * envelope;
			out += `\x1b[38;5;${grayIndex(brightness)}m${word[i]}\x1b[39m`;
		}
		return out;
	}
}

export class RetryStatusIndicator extends StatusIndicator {
	private countdown: CountdownTimer | undefined;

	constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number) {
		const retryMessage = (seconds: number) =>
			`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
		super(
			"retry",
			ui,
			(spinner) => theme.fg("warning", spinner),
			(text) => theme.fg("muted", text),
			retryMessage(Math.ceil(delayMs / 1000)),
		);
		this.countdown = new CountdownTimer(
			delayMs,
			ui,
			(seconds) => {
				this.setMessage(retryMessage(seconds));
			},
			() => {
				this.countdown = undefined;
			},
		);
	}

	override dispose(): void {
		this.countdown?.dispose();
		this.countdown = undefined;
		super.dispose();
	}
}

export type CompactionStatusReason = "manual" | "threshold" | "overflow";

export class CompactionStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, reason: CompactionStatusReason) {
		const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
		const label =
			reason === "manual"
				? `Compacting context... ${cancelHint}`
				: `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
		super(
			"compaction",
			ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			label,
		);
	}
}

export class BranchSummaryStatusIndicator extends StatusIndicator {
	constructor(ui: TUI) {
		super(
			"branchSummary",
			ui,
			(spinner) => theme.fg("accent", spinner),
			(text) => theme.fg("muted", text),
			`Summarizing branch... (${keyText("app.interrupt")} to cancel)`,
		);
	}
}

export class IdleStatus implements Component {
	invalidate(): void {
		// No cached state to invalidate.
	}

	render(width: number): string[] {
		const emptyLine = " ".repeat(width);
		return [emptyLine, emptyLine];
	}
}
