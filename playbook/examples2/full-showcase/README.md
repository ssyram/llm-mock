# Full showcase：一份剧本，三个宿主

[`showcase.md`](showcase.md) 是 Pi、OpenCode 和 Claude Code 共用的本地 Mock 剧本。`transport/` 只适配宿主工具名和参数，不改变剧本。语法见 [三单元语言](../../docs/next-language/language.md)。

输入 `1` 后，剧本创建基线和有缺陷的样本，执行三轮检查，由 `aggregation` 验证批次；随后在用户边界停下。输入 `2` 修复样本，或输入 `3` 保留样本。最终验证图景由文件、真实工具回执和 `status.txt` 体现。

从仓库根目录，将以下命令作为本地 Mock 的挂载脚本：

```sh
node playbook/examples2/full-showcase/transport/mount.mjs --host pi --cache-dir target/playbook-cache/pi
```

OpenCode 和 Claude Code 分别使用 `--host oc`、`--host cc`，各用独立缓存目录。三者读取相同剧本；本机实验的 TUI 启动脚本和运行产物不随源码提交。

从仓库根目录运行 `node playbook/tests2/run-local-suite.mjs`；只运行本例真实 Pi 对偶用 `node playbook/tests2/independent/jobs/run-full-showcase-pi.mjs`。真实 Pi 只连接独立本地 Mock，合成三宿主接线测试不代表 OpenCode 和 Claude Code 已通过原生验收。
