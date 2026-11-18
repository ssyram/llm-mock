const response = (say, calls = []) => ({ role: "response", say, calls });
const call = (id, command, result) => ({ id, name: "bash", arguments: { command }, result });
const silent = { contains: "(no output)" };
const trace = [0, 1, 2].map((n) => `round=${n}|frame=seen-${n}|payload=case-${n}`);

export const showcaseCases = Object.freeze([
  { id: "exact-fix", input: "2", status: "FIXED" },
  { id: "exact-keep", input: "3", status: "KEPT" },
  { id: "natural-fix", input: "请帮我修复", status: "FIXED" },
  { id: "negative-keep", input: "不要修复", status: "KEPT" },
  { id: "otherwise-keep", input: "暂停", status: "KEPT" }
]);

export function fullShowcaseScenario(testCase) {
  const fixed = testCase.status === "FIXED";
  const initial = response("Full showcase / 本地 fuzz 修复演练：准备基线和一个有缺陷的样本。当前宿主名在启动器中显示。两个工具调用属于同一批，宿主自行决定执行顺序。", [
    call("p2_1", "printf 'baseline=PASS\\n' > baseline.txt", silent),
    call("p2_2", "printf 'sample=buggy\\n' | tee sample.txt", { contains: "sample=buggy" })
  ]);
  const rounds = trace.map((line, n) => response("", [
    call(`p2_${n + 3}`, `printf '${line}\\n' >> trace.txt`, silent)
  ]));
  const branch = fixed
    ? response("选择修复：修复样本并记录 FIXED，然后读取全部产物并验证。", [
      call("p2_7", "printf 'sample=FIXED\\n' > sample.txt; printf 'status=FIXED\\n' > status.txt", silent)
    ])
    : response("选择保留失败：记录 KEPT，然后读取全部产物并验证。", [
      call("p2_7", "printf 'status=KEPT\\n' > status.txt", silent)
    ]);
  return { steps: [
    { role: "user", text: "1" },
    initial,
    ...rounds,
    response("", [call("p2_6", "printf 'batch=separated\\n' > boundary.txt", silent)]),
    response("Segment 正在调用宿主读取基线、样本和三轮 trace。", [
      call("segment-read-1", "cat baseline.txt sample.txt trace.txt", { contains: trace[2] })
    ]),
    response("读取片段结果：基线、缺陷样本和三轮独立帧均已读到。请输入 2 修复并验证，或输入 3 保留失败并结束；也可用自然语言要求修复。"),
    { role: "user", text: testCase.input },
    branch,
    response("", [call("p2_8", "cat baseline.txt sample.txt trace.txt boundary.txt status.txt", { contains: `status=${testCase.status}` })]),
    response("演练完成。请查看当前工作目录的 baseline.txt、sample.txt、trace.txt、boundary.txt 和 status.txt；工具回执已经过外接验证。")
  ] };
}

export const showcaseFiles = (status) => ({
  "baseline.txt": "baseline=PASS\n",
  "sample.txt": `sample=${status === "FIXED" ? "FIXED" : "buggy"}\n`,
  "trace.txt": `${trace.join("\n")}\n`,
  "boundary.txt": "batch=separated\n",
  "status.txt": `status=${status}\n`
});
