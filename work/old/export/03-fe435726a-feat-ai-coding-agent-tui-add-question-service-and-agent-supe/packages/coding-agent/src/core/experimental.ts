export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.FLUX_EXPERIMENTAL === "1";
}
