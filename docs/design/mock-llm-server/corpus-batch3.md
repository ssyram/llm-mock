# Corpus batch 3 — real LLM sessions

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

采集目标：每个可用模型各 1 场工具会话 + 1 场 high-thinking 推理会话（14 场有效会话；预算约 15）。另有 3 次失败尝试，故共 17 个独立场次目录。每场使用 `.tmp-corpus-b3-<provider>-<model>-<n>/real-session`，插件只采集最终化统一 Message 到 `.pi/mock-corpus/`。

## 认证复核

运行 `pi auth check --provider <provider> --model <model> --json`。以下各指定组合返回 `status=ready`、`authType=api_key`：`provider-a/claude-sonnet-5`、`provider-a/claude-opus-5`、`provider-a/deepseek-v4-pro`、`provider-a/glm-5.2`、`provider-a/kimi-k3`、`provider-a/minimax-m3?`、`provider-b/glm-5.3`。但认证 ready 不保证模型 ID 存在：Pi 模型目录显示准确名称为 `provider-a/MiniMax-M3`，另对它重查认证后 ready 并成功采集；`minimax-m3?` 两次按自定义模型名请求均失败。`provider-b/glm-5.3` 实际解析到 `glm-5.3-flash`，并对该解析模型另行重查认证，结果 ready。

GPT 与 haiku 凭据已知失效，按要求跳过；没有对其发起会话请求。

## 场次清单

以下列表记录 17 次尝试，其中 14 场生成有效对话（7 个准确 provider/model 各有工具与推理场景）；3 场失败尝试保留在捕获数据中并明确标记。

| # | Provider / model | 场景 | Thinking | Tools | Rows / roles | Thinking 块 / signature | Exit / stderr |
|---|---|---|---|---|---|---|---|
| 1 | `provider-a/claude-sonnet-5` | tool | medium | read | 5 / assistant:2, system:1, toolResult:1, user:1 | no (signature=none) | 0; stderr=0B; 8.1s |

- Scene 1 directory: `.tmp-corpus-b3-provider-a-claude-sonnet-5-1/real-session`; probe: `probe.txt` (Batch 3 probe: 7 + 5 = 12.); prompt category: read-tool arithmetic.
| 2 | `provider-a/claude-sonnet-5` | reason | high | none | 3 / assistant:1, system:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 5.0s |

- Scene 2 directory: `.tmp-corpus-b3-provider-a-claude-sonnet-5-2/real-session`; probe: none; prompt category: multi-step reasoning.
| 3 | `provider-a/claude-opus-5` | tool | medium | read | 5 / assistant:2, system:1, toolResult:1, user:1 | no (signature=none) | 0; stderr=0B; 7.5s |

- Scene 3 directory: `.tmp-corpus-b3-provider-a-claude-opus-5-3/real-session`; probe: `probe.txt` (Batch 3 probe: 14 + 10 = 24.); prompt category: read-tool arithmetic.
| 4 | `provider-a/claude-opus-5` | reason | high | none | 3 / assistant:1, system:1, user:1 | no (signature=none) | 0; stderr=0B; 6.0s |

- Scene 4 directory: `.tmp-corpus-b3-provider-a-claude-opus-5-4/real-session`; probe: none; prompt category: translation.
| 5 | `provider-a/deepseek-v4-pro` | tool | medium | read | 5 / assistant:2, system:1, toolResult:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 15.8s |

- Scene 5 directory: `.tmp-corpus-b3-provider-a-deepseek-v4-pro-5/real-session`; probe: `probe.txt` (Batch 3 probe: 21 + 15 = 36.); prompt category: read-tool arithmetic.
| 6 | `provider-a/deepseek-v4-pro` | reason | high | none | 3 / assistant:1, system:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 10.2s |

- Scene 6 directory: `.tmp-corpus-b3-provider-a-deepseek-v4-pro-6/real-session`; probe: none; prompt category: code explanation.
| 7 | `provider-a/glm-5.2` | tool | medium | read | 5 / assistant:2, system:1, toolResult:1, user:1 | no (signature=none) | 0; stderr=0B; 7.8s |

- Scene 7 directory: `.tmp-corpus-b3-provider-a-glm-5.2-7/real-session`; probe: `probe.txt` (Batch 3 probe: 28 + 20 = 48.); prompt category: read-tool arithmetic.
| 8 | `provider-a/glm-5.2` | reason | high | none | 3 / assistant:1, system:1, user:1 | no (signature=none) | 0; stderr=0B; 6.5s |

- Scene 8 directory: `.tmp-corpus-b3-provider-a-glm-5.2-8/real-session`; probe: none; prompt category: planning.
| 9 | `provider-a/kimi-k3` | tool | medium | read | 5 / assistant:2, system:1, toolResult:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 11.5s |

- Scene 9 directory: `.tmp-corpus-b3-provider-a-kimi-k3-9/real-session`; probe: `probe.txt` (Batch 3 probe: 35 + 25 = 60.); prompt category: read-tool arithmetic.
| 10 | `provider-a/kimi-k3` | reason | high | none | 3 / assistant:1, system:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 9.9s |

- Scene 10 directory: `.tmp-corpus-b3-provider-a-kimi-k3-10/real-session`; probe: none; prompt category: proportional calculation.
| 11 | `provider-a/minimax-m3?` | tool | medium | read | 3 / assistant:1, system:1, user:1 | no (signature=none) | 0; stderr=84B; 1.1s |

- Scene 11 directory: `.tmp-corpus-b3-provider-a-minimax-m3?-11/real-session`; probe: `probe.txt` (Batch 3 probe: 42 + 30 = 72.); prompt category: read-tool arithmetic.
| 12 | `provider-a/minimax-m3?` | reason | high | none | 3 / assistant:1, system:1, user:1 | no (signature=none) | 0; stderr=84B; 1.6s |

- Scene 12 directory: `.tmp-corpus-b3-provider-a-minimax-m3?-12/real-session`; probe: none; prompt category: algorithm explanation.
| 13 | `provider-b/glm-5.3` → `glm-5.3-flash` | tool | medium | read | 3 / assistant:1, system:1, user:1 | no (signature=none; stopReason=error) | 0; stderr=0B; 2.0s |

- Scene 13 directory: `.tmp-corpus-b3-provider-b-glm-5.3-13/real-session`; probe: `probe.txt` (Batch 3 probe: 49 + 35 = 84.); prompt category: read-tool arithmetic. Captured assistant has `stopReason=error`; response: HTTP 400 code 1210, model requires thinking `low`, `high`, or `max` (medium rejected).
| 14 | `provider-b/glm-5.3` → `glm-5.3-flash` | reason | high | none | 3 / assistant:1, system:1, user:1 | yes (1; block.thinkingSignature:str) | 0; stderr=0B; 12.9s |

- Scene 14 directory: `.tmp-corpus-b3-provider-b-glm-5.3-14/real-session`; probe: none; prompt category: time arithmetic.
| 15 | `provider-b/glm-5.3` | tool | high | read | 5 / assistant:2, system:1, toolResult:1, user:1 | no (signature=none) | 0; stderr=0B; 9.9s |

- Scene 15 directory: `.tmp-corpus-b3-provider-b-glm-5.3-15/real-session`; probe: `probe.txt` (Batch 3 probe: 17 + 19 = 36.); prompt category: read-tool arithmetic.
| 16 | `provider-a/MiniMax-M3` | tool | model default | read | 5 / assistant:2, system:1, toolResult:1, user:1 | no (signature=none) | 0; stderr=0B; 24.9s |

- Scene 16 directory: `.tmp-corpus-b3-provider-a-MiniMax-M3-16/real-session`; probe: `probe.txt` (Batch 3 probe: 17 + 19 = 36.); prompt category: read-tool arithmetic.
| 17 | `provider-a/MiniMax-M3` | reason | high | none | 3 / assistant:1, system:1, user:1 | no (signature=none) | 0; stderr=0B; 14.2s |

- Scene 17 directory: `.tmp-corpus-b3-provider-a-MiniMax-M3-17/real-session`; probe: none; prompt category: multi-step reasoning.

## 失败与目录清单

- Scenes 11–12: 用户给出的 `provider-a/minimax-m3?` 虽然 `auth check` 返回 ready，但 Pi 报 `Warning: Model "minimax-m3?" not found for provider "provider-a"`，捕获的 assistant `stopReason=error`，HTTP 404 `model_not_found`。stderr 各 84 字节。目录列表中的 `provider-a/MiniMax-M3` 才是 Pi catalog 中真实模型名；该准确 ID 已重新认证并成功完成 scenes 16–17。
- Scene 13: `provider-b/glm-5.3` 解析到 `glm-5.3-flash`；工具场初次用 medium thinking，API 返回 HTTP 400 code 1210（模型始终思考、不支持 medium）。exit 0 但无有效回答，stderr 0 字节；错误详情保存在 assistant Message 的 `errorMessage`。改 high thinking 后 scene 15 成功。
- GPT 与 haiku：凭据失效，依任务要求跳过，未尝试会话调用。
- Pi CLI 所有 17 次尝试的退出码均为 0（其中失败场被 CLI 作为 assistant `stopReason=error` 消息结束）；只有 scenes 11–12 的 stderr 非空（各 84 B，模型不存在 warning）。工具场 scenes 1、3、5、7、9、15、16 均有 `read` toolCall 与 `toolResult`；推理场 scenes 2、4、6、8、10、14、17 均有效。
- 目录清单（每个均含 `real-session/`）：
  - `.tmp-corpus-b3-provider-a-claude-sonnet-5-{1,2}`
  - `.tmp-corpus-b3-provider-a-claude-opus-5-{3,4}`
  - `.tmp-corpus-b3-provider-a-deepseek-v4-pro-{5,6}`
  - `.tmp-corpus-b3-provider-a-glm-5.2-{7,8}`
  - `.tmp-corpus-b3-provider-a-kimi-k3-{9,10}`
  - `.tmp-corpus-b3-provider-a-minimax-m3?-{11,12}` (failed model-name attempts)
  - `.tmp-corpus-b3-provider-b-glm-5.3-{13,14,15}` (13 failed thinking-level attempt; 15 successful retry)
  - `.tmp-corpus-b3-provider-a-MiniMax-M3-{16,17}`

全量复核：所有捕获 JSONL 均逐行可解析，无坏行；14 个有效场景的角色数符合预期，7 个工具场均有 read 调用及结果。thinking 块的签名形态（存在时）统一为 `content[].thinkingSignature` 字符串值 `reasoning_content`；不存在 `signature` 块字段或顶层签名字段。
