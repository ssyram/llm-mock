import { readFileSync, writeFileSync } from "node:fs";
import { artifactPath } from "./test-artifacts.mjs";

const definition = readFileSync(new URL("../docs/design/mock-llm-server/property-tests.md", import.meta.url), "utf8");
export function propertySummary(rows) {
	return {
		matched: rows.filter((r) => r.ok && !r.outcome).length,
		expectedRejections: rows.filter((r) => r.ok && r.outcome === "expected-rejection").length,
		notApplicable: rows.filter((r) => r.outcome === "not-applicable").length,
		failed: rows.filter((r) => !r.ok).length,
		rawFrameChanges: rows.filter((r) => r.rawFrameStable === false).length,
		rawProjectionChanges: rows.filter((r) => r.rawStable === false || r.rawIdempotent === false).length,
	};
}
export function savePropertyReport(state) {
	state.updatedAt = new Date().toISOString();
	state.summary = propertySummary(state.results);
	writeFileSync(artifactPath("property-results.json"), JSON.stringify(state, null, 2) + "\n");
	const lines = [definition, "", `状态：${state.status}；开始：${state.startedAt}；更新：${state.updatedAt}`, "",
		"| 性质 | matched | expected-rejection | not-applicable | failed | 帧变化观察 | 投影变化观察 |",
		"|---|---:|---:|---:|---:|---:|---:|"];
	for (const name of ["P1", "P2", "P3", "P4"]) {
		const s = propertySummary(state.results.filter((r) => r.property === name));
		lines.push(`| ${name} | ${s.matched} | ${s.expectedRejections} | ${s.notApplicable} | ${s.failed} | ${s.rawFrameChanges} | ${s.rawProjectionChanges} |`);
	}
	lines.push("", "## 实际失败", "");
	for (const row of state.results.filter((r) => !r.ok)) lines.push(`- ${row.property}/${row.api}/${row.target ?? ""}/${row.name}: ${JSON.stringify(row.diffs)}`);
	lines.push("", "## 直接执行备注", "", ...state.notes.map((note) => `- ${note}`));
	writeFileSync(artifactPath("property-tests.md"), lines.join("\n") + "\n");
}
