export function getFluxUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `flux/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
