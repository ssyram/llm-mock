# W-07 实现记录

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 当前结论

已实施获批五项：F2–F5＋Bedrock reasoning扩展。新增7项src单测，调整1项原单测；`cargo test` 116/116，`cargo build`、`cargo check --all-targets`通过。duality原样复跑795案＝688绿/107红，较W-06新绿0、新红5；fuzz 1600/1600、无crash。5新红均是旧oracle投掉新恢复字段，独立新契约capture断言5/5通过，交W-08更新；另6项Bedrock reasoning真实SDK验证通过。原102非绿保留（80T＋O18＋4个W-06 finding实例）。Codex仍T，不能声称endTurn真实SDK端到端通过。

图谱/三份对应规格已同步；仅源endTurn成功/长度域是真正L→E，另外四项原分类是D实现缺口，现细分wire可逆字段为E，原转换/投影仍D/L，不伪称统一L→E。冻结候选未获批项逐一排除，见下表。

## 权威、范围与批准

以 `freeze-verdict-2.md` 已批准的 atlas＋八份权威规格（覆盖十协议，另一个退役存根）为定义；不是十份独立权威页。锁定 TS 根 `<pi-mono>/packages/ai/src` 只读。30 分钟硬限时；运行阻塞等待30秒重试；不修改 `tests/**`。

开始基线：src 87文件 SHA256 `a36b52c0a90c5d4f79b1a768feccfbbc94ac72ee77eab8a18ab4d011b1357659`；tests（不计 node_modules）74文件 `9fafbb58b5537fece01fc40938bf485548ba40aa4c80628774503bc4c8e26148`；TS 243文件 `b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0`。现存 W-06 矩阵795案/693绿/102非绿，仅作对比基线，非本轮重跑。

根目录无 Git 元数据，`git status --short` exit128；不执行 add/stage/commit，无法独立核验 Git index。

监督方本轮明确批准 F2–F5＋Bedrock reasoning 扩展读取；其他条目列账但不实施。Bedrock 新映射亦经明确批准：有任一扩展键时 `options.reasoning=JSON.stringify(additionalModelRequestFields)`，无扩展为 None；按 JSON 值比较。不猜原始 level，不采用 thinking-only/完整对象的条件双形态。Codex 仅 completed/incomplete 补布尔 end_turn；failed 在 CX:768 先抛错，不能宣称 E。

## 全部候选清单

来源：`definition-freeze.md` D04/D08/D13/C03/C07/C16/C18、第7.4节；`freeze-verdict*.md`；atlas C2 F1–F7、C4 T1–T3；各规格明示的 W-07 候选。

| 候选 | 源码证据（TS 相对锁定根） | 本轮状态 |
|---|---|---|
| F1 Responses/Azure 外域 opaque 签名降级 | SH:265–267,688–693 | 未批准；签名策略需 owner 另批，维持 O18 |
| F2 Bedrock 工具结果图片 | BR:962–973；mock decode_messages.rs:113–139、decode_image.rs:4–15 | 已实施，3项Bedrock单测及真实SDK capture通过；旧oracle两新红交W-08 |
| F3 Mistral 工具结果 data URL 图片 | MI:875–920；mock decode_messages.rs:94–109、decode_content.rs:16–40 | 已实施，单测与真实SDK capture通过；旧oracle两新红交W-08 |
| F4 Mistral tools-only/no-system 合成工具承载 System | MI:777–810；mock decode_messages.rs:113–128 | 已实施，空transcript/no-system/已有system/schema/order单测通过；旧oracle一新红交W-08 |
| F5 Codex endTurn | CX:766–783；src/api/openai_codex_responses/encode.rs:1–7；共享终帧encode.rs:94–121 | 已实施，12组合单测通过；普通Responses不变；error不宣称E；SDK仍被zstd阻断 |
| Bedrock reasoning 扩展读取 | BR:1279–1332；mock decode.rs:39–42 | 已实施，统一JSON envelope；每扩展/缺省单测及6项真实锁定SDK验证通过 |
| F6 PM 模型扩容（extras、诊断、deferred/tool 执行记录、cacheRetention、有序 sections） | PM:375–400；types.ts:546–551,577–580,626–630 | 未批准；模型契约选择交 owner |
| F7 新 stop 拒绝/投影策略 | BR:1185–1198；MI:936–951 | 未批准；保持既有行为 |
| strict/constrainedSampling 终值、grammar/dynamic工具、对象 toolChoice、其他已发未读 options（含 OCC budgets/template，Bedrock cachePoint/requestMetadata，PM cacheRetention） | 对应规格第2/4/5节；atlas C2末段；definition-freeze C03/C07/C16/C21 | 排除；原意图不可逆，缺模型槽位者需扩模型，交 owner；不借本轮扩大支持域 |
| T1 Codex zstd 解压 | CX:208–231,377–385；src/mounts/routing.rs:16–22 | 排除；依赖、大小限制与错误策略需 owner |
| T2 Codex WS 状态机 | CX:295–372,1439–1477 | 排除；transport 扩展/隔离策略需 owner |
| T3 Vertex ADC 隔离 | GV:95–109,357–397,429–459 | 排除；真实 ADC 离线凭证/token隔离需 owner |
| W06-F1 AM aborted/deferred refusal 文案（两实例） | w06-experiments.md F1；src/api/anthropic_messages/encode.rs:111–114 | 非批准候选；定义/实现 finding 待 W-08/owner 裁定，不修 |
| W06-F2 Mistral retention-none 路由 | w06-experiments.md F2；src/mounts/protocol.rs:116–130 | 同上，不修 |
| W06-F3 Mistral 已发送空块被删 | w06-experiments.md F3；decode_messages.rs:69–75 | 同上，不修 |

## 验证计划

单测仅放 `src/**`；cargo test 与 cargo build 后，原样加载 `tests/duality.mjs` 与 `tests/fuzz.mjs`。经监督方批准，内存替换 fs.writeFileSync 的两个已知结果目的地，将最终结果摘要、逐案新绿/新红与所有失败证据写入本文，不改变测试源码/期待/向量/忽略规则。正常 harness 的临时 capture 属运行行为。

## 本轮 duality 原样复跑（仅结果写入内存重定向）

```json
{
  "startedAt": "2000-01-01",
  "updatedAt": "2000-01-01",
  "total": 795,
  "pass": 688,
  "fail": 107,
  "newGreen": [],
  "newRed": [
    {
      "case": "bedrock-converse-stream/req/w06-vision-error-image-order",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 3"
      ],
      "actual": {
        "context": {
          "messages": [
            {
              "api": "bedrock-converse-stream",
              "content": [
                {
                  "arguments": {
                    "value": "hello"
                  },
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "type": "toolCall"
                }
              ],
              "model": "anthropic.claude-mock",
              "provider": "amazon-bedrock",
              "role": "assistant",
              "stopReason": "stop",
              "timestamp": 0,
              "usage": {
                "cacheRead": 0,
                "cacheWrite": 0,
                "cost": {
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "input": 0,
                  "output": 0,
                  "total": 0
                },
                "input": 0,
                "output": 0,
                "totalTokens": 0
              }
            },
            {
              "content": [
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                },
                {
                  "text": "middle"
                },
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                }
              ],
              "isError": true,
              "role": "toolResult",
              "timestamp": 0,
              "toolCallId": "call-1|fc_item",
              "toolName": ""
            }
          ]
        },
        "model": "anthropic.claude-mock",
        "options": {
          "maxTokens": 64
        }
      },
      "expected": {
        "model": "anthropic.claude-mock",
        "context": {
          "messages": [
            {
              "role": "assistant",
              "content": [
                {
                  "type": "toolCall",
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "arguments": {
                    "value": "hello"
                  }
                }
              ],
              "api": "bedrock-converse-stream",
              "provider": "amazon-bedrock",
              "model": "anthropic.claude-mock",
              "usage": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "totalTokens": 0,
                "cost": {
                  "input": 0,
                  "output": 0,
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "total": 0
                }
              },
              "stopReason": "stop",
              "timestamp": 0
            },
            {
              "role": "toolResult",
              "toolCallId": "call-1|fc_item",
              "toolName": "",
              "content": [
                {
                  "text": "middle"
                }
              ],
              "isError": true,
              "timestamp": 0
            }
          ]
        },
        "options": {
          "maxTokens": 64
        }
      }
    },
    {
      "case": "bedrock-converse-stream/req/w06-vision-image-only",
      "diffs": [
        "$.context.messages[1].content: expected length 0, got 1"
      ],
      "actual": {
        "context": {
          "messages": [
            {
              "api": "bedrock-converse-stream",
              "content": [
                {
                  "arguments": {
                    "value": "hello"
                  },
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "type": "toolCall"
                }
              ],
              "model": "anthropic.claude-mock",
              "provider": "amazon-bedrock",
              "role": "assistant",
              "stopReason": "stop",
              "timestamp": 0,
              "usage": {
                "cacheRead": 0,
                "cacheWrite": 0,
                "cost": {
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "input": 0,
                  "output": 0,
                  "total": 0
                },
                "input": 0,
                "output": 0,
                "totalTokens": 0
              }
            },
            {
              "content": [
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                }
              ],
              "isError": false,
              "role": "toolResult",
              "timestamp": 0,
              "toolCallId": "call-1|fc_item",
              "toolName": ""
            }
          ]
        },
        "model": "anthropic.claude-mock",
        "options": {
          "maxTokens": 64
        }
      },
      "expected": {
        "model": "anthropic.claude-mock",
        "context": {
          "messages": [
            {
              "role": "assistant",
              "content": [
                {
                  "type": "toolCall",
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "arguments": {
                    "value": "hello"
                  }
                }
              ],
              "api": "bedrock-converse-stream",
              "provider": "amazon-bedrock",
              "model": "anthropic.claude-mock",
              "usage": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "totalTokens": 0,
                "cost": {
                  "input": 0,
                  "output": 0,
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "total": 0
                }
              },
              "stopReason": "stop",
              "timestamp": 0
            },
            {
              "role": "toolResult",
              "toolCallId": "call-1|fc_item",
              "toolName": "",
              "content": [],
              "isError": false,
              "timestamp": 0
            }
          ]
        },
        "options": {
          "maxTokens": 64
        }
      }
    },
    {
      "case": "mistral-conversations/req/w06-vision-error-image-order",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 3"
      ],
      "actual": {
        "context": {
          "messages": [
            {
              "api": "mistral-conversations",
              "content": [
                {
                  "arguments": {
                    "value": "hello"
                  },
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "type": "toolCall"
                }
              ],
              "model": "mock-gpt",
              "provider": "mistral",
              "role": "assistant",
              "stopReason": "stop",
              "timestamp": 0,
              "usage": {
                "cacheRead": 0,
                "cacheWrite": 0,
                "cost": {
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "input": 0,
                  "output": 0,
                  "total": 0
                },
                "input": 0,
                "output": 0,
                "totalTokens": 0
              }
            },
            {
              "content": [
                {
                  "text": "[tool error] middle"
                },
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                },
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                }
              ],
              "isError": false,
              "role": "toolResult",
              "timestamp": 0,
              "toolCallId": "call-1|fc_item",
              "toolName": "echo"
            }
          ]
        },
        "model": "mock-gpt",
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      },
      "expected": {
        "model": "mock-gpt",
        "context": {
          "messages": [
            {
              "role": "assistant",
              "content": [
                {
                  "type": "toolCall",
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "arguments": {
                    "value": "hello"
                  }
                }
              ],
              "api": "mistral-conversations",
              "provider": "mistral",
              "model": "mock-gpt",
              "usage": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "totalTokens": 0,
                "cost": {
                  "input": 0,
                  "output": 0,
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "total": 0
                }
              },
              "stopReason": "stop",
              "timestamp": 0
            },
            {
              "role": "toolResult",
              "toolCallId": "call-1|fc_item",
              "toolName": "echo",
              "content": [
                {
                  "text": "[tool error] middle"
                }
              ],
              "isError": false,
              "timestamp": 0
            }
          ]
        },
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      }
    },
    {
      "case": "mistral-conversations/req/w06-vision-image-only",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 2"
      ],
      "actual": {
        "context": {
          "messages": [
            {
              "api": "mistral-conversations",
              "content": [
                {
                  "arguments": {
                    "value": "hello"
                  },
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "type": "toolCall"
                }
              ],
              "model": "mock-gpt",
              "provider": "mistral",
              "role": "assistant",
              "stopReason": "stop",
              "timestamp": 0,
              "usage": {
                "cacheRead": 0,
                "cacheWrite": 0,
                "cost": {
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "input": 0,
                  "output": 0,
                  "total": 0
                },
                "input": 0,
                "output": 0,
                "totalTokens": 0
              }
            },
            {
              "content": [
                {
                  "text": "(see attached image)"
                },
                {
                  "data": "AQID",
                  "mimeType": "image/png"
                }
              ],
              "isError": false,
              "role": "toolResult",
              "timestamp": 0,
              "toolCallId": "call-1|fc_item",
              "toolName": "echo"
            }
          ]
        },
        "model": "mock-gpt",
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      },
      "expected": {
        "model": "mock-gpt",
        "context": {
          "messages": [
            {
              "role": "assistant",
              "content": [
                {
                  "type": "toolCall",
                  "id": "call-1|fc_item",
                  "name": "echo",
                  "arguments": {
                    "value": "hello"
                  }
                }
              ],
              "api": "mistral-conversations",
              "provider": "mistral",
              "model": "mock-gpt",
              "usage": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "totalTokens": 0,
                "cost": {
                  "input": 0,
                  "output": 0,
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "total": 0
                }
              },
              "stopReason": "stop",
              "timestamp": 0
            },
            {
              "role": "toolResult",
              "toolCallId": "call-1|fc_item",
              "toolName": "echo",
              "content": [
                {
                  "text": "(see attached image)"
                }
              ],
              "isError": false,
              "timestamp": 0
            }
          ]
        },
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      }
    },
    {
      "case": "mistral-conversations/req/w06-tools-only-strict",
      "diffs": [
        "$.context.messages: expected length 1, got 2"
      ],
      "actual": {
        "context": {
          "messages": [
            {
              "content": "",
              "role": "system",
              "timestamp": 0,
              "toolsAdded": [
                {
                  "description": "Echo",
                  "name": "echo",
                  "parameters": {
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "anyOf": [
                          {
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "required": [
                      "value"
                    ],
                    "type": "object"
                  }
                }
              ]
            },
            {
              "content": "tools",
              "role": "user",
              "timestamp": 0
            }
          ]
        },
        "model": "mock-gpt",
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      },
      "expected": {
        "model": "mock-gpt",
        "context": {
          "messages": [
            {
              "role": "user",
              "content": "tools",
              "timestamp": 0
            }
          ]
        },
        "options": {
          "maxTokens": 64,
          "sessionId": "d-s1"
        }
      }
    }
  ],
  "addedCases": [],
  "byApi": {
    "openai-completions": {
      "pass": 81,
      "fail": 0
    },
    "openai-responses": {
      "pass": 68,
      "fail": 10
    },
    "azure-openai-responses": {
      "pass": 69,
      "fail": 9
    },
    "openai-codex-responses": {
      "pass": 0,
      "fail": 78
    },
    "anthropic-messages": {
      "pass": 77,
      "fail": 2
    },
    "google-generative-ai": {
      "pass": 80,
      "fail": 0
    },
    "google-vertex": {
      "pass": 80,
      "fail": 0
    },
    "bedrock-converse-stream": {
      "pass": 79,
      "fail": 2
    },
    "mistral-conversations": {
      "pass": 73,
      "fail": 6
    },
    "pi-messages": {
      "pass": 81,
      "fail": 0
    }
  },
  "failures": [
    {
      "case": "openai-responses/req/w06-unicode-session",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255."
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-kahuwo-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-claude2-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-claude-reason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-deepseek-mixed-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-deepseek-codegen-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-deepseek-longreason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-kimi-reason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-kimi-toolerr-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-responses/reply/reply-corpus-b4-glm53-mixed-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-kahuwo-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-claude2-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-claude-reason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-deepseek-mixed-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-deepseek-codegen-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-deepseek-longreason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-kimi-reason-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-kimi-toolerr-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "azure-openai-responses/reply/reply-corpus-b4-glm53-mixed-2",
      "diffs": [
        "Unexpected token 'r', \"reasoning_content\" is not valid JSON"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-sys-user",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-orphan-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-full-convo",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-claude-full",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-thinking",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-plain-multi-glm5",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-plain-multi-glm52",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-claude-thinking",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-claude-parallel-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-claude-tool-error",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-mixed-zh-en",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-codegen",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-long-thinking",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-glm52-codegen-mixed",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-glm52-parallel-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-glm52-tool-error-zh",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-kimi-reason",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-kimi-thinking-tool-error",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-glm53-parallel-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/corpus-b4-glm53-mixed",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-tools-declared",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-multi-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-same-model-thinking",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-assistant-multi-text",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-error-assistant-dropped",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-user-blocks",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-user-image",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-no-system",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/syn-schema-metadata",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-signed-empty-and-call",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-vision-error-image-order",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-vision-image-only",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-tools-only-strict",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-native-zero-max",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-long-session",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-unicode-session",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255."
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-retention-none",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-surrogate-order",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/req/w06-foreign-item-id",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-text-stop",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-thinking-text",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-single-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-multi-toolcall",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-length",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-error-finish-reason",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-response-id",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-kahuwo-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-kahuwo-4",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-claude-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-claude-4",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-glm5-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-claude2-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-glm52-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-claude-reason-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-claude-multitool-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-claude-multitool-5",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-claude-toolerr-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-claude-toolerr-4",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-deepseek-mixed-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-deepseek-codegen-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-deepseek-longreason-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm52-codegen-mixed-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm52-multitool-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm52-multitool-5",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm52-toolerr-zh-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm52-toolerr-zh-4",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-kimi-reason-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-kimi-toolerr-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-kimi-toolerr-4",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm53-multitool-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm53-multitool-5",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-corpus-b4-glm53-mixed-2",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/reply-nonzero-cache-usage",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/w06-r-text-signatures",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/w06-r-toolUse-no-call",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/w06-r-usage-zero-total",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/w06-r-error-missing",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "openai-codex-responses/reply/w06-r-error-empty",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1"
      ]
    },
    {
      "case": "anthropic-messages/reply/w06-r-aborted",
      "diffs": [
        "$.errorMessage: expected \"cancelled\", got \"unsupported stop reason for anthropic-messages: Aborted\""
      ]
    },
    {
      "case": "anthropic-messages/reply/w06-r-deferred",
      "diffs": [
        "$.errorMessage: expected \"The model refused to complete the request\", got \"unsupported stop reason for anthropic-messages: Deferred\""
      ]
    },
    {
      "case": "bedrock-converse-stream/req/w06-vision-error-image-order",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 3"
      ]
    },
    {
      "case": "bedrock-converse-stream/req/w06-vision-image-only",
      "diffs": [
        "$.context.messages[1].content: expected length 0, got 1"
      ]
    },
    {
      "case": "mistral-conversations/req/w06-vision-error-image-order",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 3"
      ]
    },
    {
      "case": "mistral-conversations/req/w06-vision-image-only",
      "diffs": [
        "$.context.messages[1].content: expected length 1, got 2"
      ]
    },
    {
      "case": "mistral-conversations/req/w06-tools-only-strict",
      "diffs": [
        "$.context.messages: expected length 1, got 2"
      ]
    },
    {
      "case": "mistral-conversations/req/w06-unicode-session",
      "diffs": [
        "expected exactly 1 capture file, got 0: ; SDK: Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255."
      ]
    },
    {
      "case": "mistral-conversations/req/w06-retention-none",
      "diffs": [
        "capture API: expected mistral-conversations, got openai-completions"
      ]
    },
    {
      "case": "mistral-conversations/req/w06-surrogate-order",
      "diffs": [
        "$.context.messages[2].content: expected length 2, got 1"
      ]
    }
  ]
}
```

## 本轮 fuzz 原样复跑（仅结果写入内存重定向）

```json
{
  "seedCount": 200,
  "total": 1600,
  "pass": 1600,
  "fail": 0,
  "crashFindings": [],
  "newGreen": [],
  "newRed": [],
  "failures": []
}
```

## Bedrock真实锁定SDK→HTTP→capture扩展验证

内联独立固定期待，未调用canonical/decoder构造期待；不使用onPayload改写。

```json
[
  {
    "case": "anthropic.claude-3-7-sonnet",
    "reasoning": "high",
    "expected": {
      "thinking": {
        "type": "enabled",
        "budget_tokens": 16384,
        "display": "summarized"
      },
      "anthropic_beta": [
        "interleaved-thinking-2025-05-14"
      ]
    },
    "result": "passed"
  },
  {
    "case": "anthropic.claude-opus-4-6",
    "reasoning": "high",
    "expected": {
      "thinking": {
        "type": "adaptive",
        "display": "summarized"
      },
      "output_config": {
        "effort": "high"
      }
    },
    "result": "passed"
  },
  {
    "case": "anthropic.claude-opus-5",
    "reasoning": "high",
    "expected": {
      "thinking": {
        "type": "adaptive",
        "display": "summarized",
        "block_binding": {
          "prefix_mismatch_behavior": "drop_block"
        }
      },
      "output_config": {
        "effort": "high"
      },
      "anthropic_beta": [
        "thinking-binding-controls-2026-08-01"
      ]
    },
    "result": "passed"
  },
  {
    "case": "openai.gpt-oss-120b",
    "reasoning": "medium",
    "expected": {
      "reasoning_effort": "medium"
    },
    "result": "passed"
  },
  {
    "case": "openai.gpt-5",
    "reasoning": "xhigh",
    "expected": {
      "reasoning": {
        "effort": "xhigh"
      }
    },
    "result": "passed"
  },
  {
    "case": "anthropic.claude-mock",
    "reasoning": null,
    "expected": null,
    "result": "passed"
  }
]
```

## 五项新红的独立新契约复核

基于本轮真实SDK capture，以固定期待独立断言（不调用canonical/decoder生成期待）：image bytes/MIME及wire顺序、文本前缀、Bedrock error状态、Mistral不猜error、tools-only工具strict schema/name/description。5/5通过；不是将矩阵FAIL改PASS。首次断言误把tools-only的strict schema期待写成原schema而失败；按冻结G27/CS严格化公式修正独立期待后通过，未改生产代码、定义或tests。

```json
[
  {
    "case": "bedrock-converse-stream/req/w06-vision-error-image-order",
    "result": "passed-new-contract",
    "oracle": "W-06旧投影，待W-08更新"
  },
  {
    "case": "bedrock-converse-stream/req/w06-vision-image-only",
    "result": "passed-new-contract",
    "oracle": "W-06旧投影，待W-08更新"
  },
  {
    "case": "mistral-conversations/req/w06-vision-error-image-order",
    "result": "passed-new-contract",
    "oracle": "W-06旧投影，待W-08更新"
  },
  {
    "case": "mistral-conversations/req/w06-vision-image-only",
    "result": "passed-new-contract",
    "oracle": "W-06旧投影，待W-08更新"
  },
  {
    "case": "mistral-conversations/req/w06-tools-only-strict",
    "result": "passed-new-contract",
    "oracle": "W-06旧投影，待W-08更新"
  }
]
```

## 定义同步记录（仅已实施项）

| 实现 | 同步规格 | 图谱当前条目 | 分类边界 |
|---|---|---|---|
| Bedrock image helper＋工具结果逐块读取 | api/bedrock.md 第2节、4节Q-W07（:103）、第5节 | A08.06（:256）、N4、F2 | 原D漏读→wire图像字节/顺序E；jpg/base64表示及文本过滤仍D |
| Bedrock完整reasoning JSON envelope | api/bedrock.md 第2节、4节Q-其他模型/Q-W07（:100,103）、第5节 | A08.07/A08.07-E（:257–258） | 已发JSON对象E；原level/config→wire映射仍D，不逆猜源配置 |
| Mistral data URL图文结果 | api/mistral.md 第2节、G30（:64）、第5节 | A09.05/A09.05-E（:284–285）、N5、F3 | wire图文E；join/trim/错误前缀与原isError投影仍D/L |
| Mistral tools-only合成System | api/mistral.md 第2节、G27（:61）、第5节 | A09.01/A09.01-E（:278–279）、N5、F4 | wire工具快照E；原system/sections/工具增删历史仍D/L，strict标记未读 |
| Codex专用endTurn wrapper | api/family-variants.md 第3节、G37（:140）、第5/6节 | A04.08/A04.08-L（:136–137）、N10、F5 | completed/incomplete源布尔及缺省L→E；failed先抛错仍L，普通Responses/Azure不补发 |

图谱统计已机械重算为243条件行＝E17/D125/L66/P32/T3（冻结基线239条件行）。新增4个条件子行，不用新E覆盖同组原始不可逆字段。未改freeze-verdict、definition-freeze或任何未实施项的定义。

## 复跑总账与 W-08 交接

- **矩阵新绿0**：没有把107非绿改写成通过。6个reasoning SDK探针与5个capture新契约断言是另外的局部绿，不混入795案分母。
- **W08-01** `bedrock-converse-stream/req/w06-vision-error-image-order`：旧oracle期望1文本块，实际image/text/image 3块；bytes=AQID、MIME=image/png、isError=true独立断言通过。
- **W08-02** `bedrock-converse-stream/req/w06-vision-image-only`：旧oracle期望0块，实际1图片；字节/MIME/顺序独立断言通过。
- **W08-03** `mistral-conversations/req/w06-vision-error-image-order`：旧oracle期望1文本块，实际前缀文本+2图片；按wire文本先聚合再图片，不假称恢复源交错；isError=false独立断言通过。
- **W08-04** `mistral-conversations/req/w06-vision-image-only`：旧oracle期望占位文本，实际占位文本+图片；isError=false独立断言通过。
- **W08-05** `mistral-conversations/req/w06-tools-only-strict`：旧oracle不合成System（1消息），实际工具System+User（2消息）；工具echo/Echo、严格化schema固定期待独立断言通过。
- **保留102非绿**：80T＝Codex zstd77＋Responses/Codex/Mistral Unicode header各1；O18＝Responses/Azure各9条外域签名拒绝；W06-F1的AM aborted/deferred两条文案＋W06-F2的Mistral retention-none路由＋W06-F3的Mistral surrogate-order空块，共4条finding实例。全部完整主键与diff已在上方JSON入账；本轮不裁定/修复。
- **Bedrock envelope当前无矩阵新红**：W-06向量未启用这些reasoning分支；因此不能从0新红推断旧oracle已支持。W-08须按Q-W07补完整对象期待与覆盖，不再只比较thinking；本轮6个真实SDK分支单独验证。
- **fuzz分母局限**：200 seeds×4 APIs×Q/R＝1600，全绿且crashFindings=[]；不覆盖Bedrock/Mistral/Codex新行为。

## 验证命令、失败与保护边界

| 本轮命令/操作 | 结果 |
|---|---|
| `git status --short` | exit128，根无Git元数据；未运行add/stage/commit，不伪造index核验 |
| `cargo test` 首次 | exit101，115通过/1失败；新增Mistral单测把UserBlock误期待为带type的序列化对象，实际统一UserBlock为untagged；改为直接类型/文本断言后重跑，不改生产行为或削弱条件 |
| `cargo test` 修正后及最终 | exit0，116通过/0失败；新增7项单测（Bedrock3/Mistral3/Codex1），调整已有Mistral工具请求消息数2→3 |
| `cargo build` | exit0，真实SDK复跑使用新二进制 |
| `cargo check --all-targets` | exit0，无编译诊断 |
| `rustfmt --edition 2021 --config skip_children=true`，13个新/改Rust文件 | exit0；共享Responses encoder保持原有紧凑格式，避免无关格式重写；全部14个改动Rust文件非空非注释LOC≤200 |
| `node tests/duality.mjs`（原脚本通过内联ESM加载，fs结果路径内存重定向） | exit1，795＝688/107；newGreen=[]，newRed=5，新增用例0；未改oracle/向量/ignore |
| `node tests/fuzz.mjs`（同上，默认200 seeds） | exit0，1600/1600，无crash |
| `node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs tests/canonical-frozen-request.test.mjs tests/canonical-frozen-reply.test.mjs tests/canonical-occ-reply.test.mjs` | exit0，34/34；这是W-06测试自洽性，不替代新契约oracle |
| 内联Node真实锁定Bedrock SDK→HTTP→capture独立固定期待 | exit0，6/6；budget/interleaved、adaptive、binding/beta、flat GPT-OSS、nested GPT、无扩展；未通过hook修改wire |
| 内联Node读取本轮5新红capture、独立新定义断言 | 初次exit1（漏套已冻结strict schema公式）；更正独立期待后exit0，5/5；未修改tests/定义/生产码 |
| Python图谱计数/ID唯一/4份权威Markdown表格宽度与完整Rust引用范围检查 | exit0，243行分类精确相等；修正1处Codex单测引用上界后通过 |
| SHA256保护树复验（包括最后Node单测后） | tests74文件与TS243文件均与开始完全相同，见下方摘要；不计node_modules |

cargo并行校验曾显示包/产物锁等待，均在约1秒内自动恢复并exit0，未发生需30秒重试的环境阻塞；没有把测试断言失败当阻塞重试。一次atlas多块edit因末块原文不匹配整体拒绝，读取核对后成功重试，无部分写入。其他无效读取/探测不作成功证据。

最终保护摘要：tests=`9fafbb58b5537fece01fc40938bf485548ba40aa4c80628774503bc4c8e26148`；锁定TS=`b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0`。基线哈希至本次复验666.6秒，连同前置读取仍在30分钟硬限时内；报告按清点→矩阵→fuzz→SDK→终账增量落盘。

### 无改tests的复跑方式（复核入口）

实际执行是`node --input-type=module`内联：先保存fs.writeFileSync，拦截绝对路径为`tests/matrix-ten-results.json`或`tests/w06-fuzz-results.json`的写入，最后一次结果留内存；其余写入原样转交。调用`syncBuiltinESMExports()`后将`process.argv`设为原脚本绝对路径，再`await import(pathToFileURL(process.argv[1]))`；fuzz保持原isMain判定。`process.on("exit")`将结果汇总、全部失败主键/diff、新红actual/expected与逐案状态变化写入本文。stdout仅压缩显示，原脚本判断、异常、捕获流程及exitCode不变。两个脚本各自独立进程运行，基线从原W-06快照读取；没有替换converter/canonical/comparator。

## 改动文件与剩余风险

生产/模块：`src/api/bedrock_converse_stream/{decode.rs,decode_image.rs,decode_messages.rs,mod.rs}`；`src/api/mistral_conversations/{decode_content.rs,decode_messages.rs,mod.rs}`；`src/api/openai_codex_responses/{encode.rs,mod.rs}`；`src/api/openai_responses/encode.rs`。

单测：新增`src/api/bedrock_converse_stream/decode_gap_tests.rs`、`src/api/mistral_conversations/decode_gap_tests.rs`、`src/api/openai_codex_responses/encode_tests.rs`；调整`src/api/mistral_conversations/tests.rs`。

定义/报告：`docs/design/mock-llm-server/api/{bedrock.md,mistral.md,family-variants.md}`、`irreversibility-atlas.md`、本文；共19个新/改文件，未新增依赖/改Cargo配置。Mistral共享图片读取补上锁定MI实际发送的image_url字符串，同时保留已有url对象路径；这是F3必需的真实wire形状，不是模型扩展。

剩余风险：Codex zstd未解阻，endTurn只获源码+Rust帧级验证；全部107非绿保留待W-08/owner，不承诺矩阵全绿；新envelope按JSON值比较、与旧thinking-only字符串形状不同；完整模型/options/transport扩展均未批准；根无Git不能独立核验暂存区，仅可确认本轮无暂存操作。**独立reviewer gate待parent安排，作者不自批准。** 推荐先审阅五项生产diff及三份规格/atlas同步，再由W-08按新规则更新oracle。

## Structured acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Implemented only supervisor-approved F2-F5 and Bedrock reasoning envelope; synchronized affected specs/atlas; tests/** and locked TS hashes unchanged."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "116 Rust tests, 34 Node tests, 795 duality cases, 1600 fuzz cases; all 107 failures and five new-red actual/expected records, six SDK probes and five independent capture assertions persisted above."
    }
  ],
  "changedFiles": [
    "src/api/bedrock_converse_stream/decode.rs",
    "src/api/bedrock_converse_stream/decode_image.rs",
    "src/api/bedrock_converse_stream/decode_messages.rs",
    "src/api/bedrock_converse_stream/decode_gap_tests.rs",
    "src/api/bedrock_converse_stream/mod.rs",
    "src/api/mistral_conversations/decode_content.rs",
    "src/api/mistral_conversations/decode_messages.rs",
    "src/api/mistral_conversations/decode_gap_tests.rs",
    "src/api/mistral_conversations/mod.rs",
    "src/api/mistral_conversations/tests.rs",
    "src/api/openai_codex_responses/encode.rs",
    "src/api/openai_codex_responses/encode_tests.rs",
    "src/api/openai_codex_responses/mod.rs",
    "src/api/openai_responses/encode.rs",
    "docs/design/mock-llm-server/api/bedrock.md",
    "docs/design/mock-llm-server/api/mistral.md",
    "docs/design/mock-llm-server/api/family-variants.md",
    "docs/design/mock-llm-server/irreversibility-atlas.md",
    "docs/design/mock-llm-server/w07-implementation.md"
  ],
  "testsAddedOrUpdated": [
    "src/api/bedrock_converse_stream/decode_gap_tests.rs",
    "src/api/mistral_conversations/decode_gap_tests.rs",
    "src/api/mistral_conversations/tests.rs",
    "src/api/openai_codex_responses/encode_tests.rs"
  ],
  "commandsRun": [
    {
      "command": "git status --short",
      "result": "failed",
      "summary": "Exit128; project root has no Git metadata; no staging commands executed."
    },
    {
      "command": "cargo test (initial)",
      "result": "failed",
      "summary": "115/116; corrected new test assertion for existing untagged UserBlock shape, then reran."
    },
    {
      "command": "cargo test (final)",
      "result": "passed",
      "summary": "116/116; main/doc tests also clean."
    },
    {
      "command": "cargo build",
      "result": "passed",
      "summary": "New server binary built before SDK runs."
    },
    {
      "command": "cargo check --all-targets",
      "result": "passed",
      "summary": "No compiler diagnostics."
    },
    {
      "command": "node tests/duality.mjs via in-memory result redirection",
      "result": "failed",
      "summary": "Exit1: 688 pass/107 fail; zero new greens, five new reds; original oracle unchanged."
    },
    {
      "command": "node tests/fuzz.mjs via in-memory result redirection",
      "result": "passed",
      "summary": "1600/1600; no crashes."
    },
    {
      "command": "node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs tests/canonical-frozen-request.test.mjs tests/canonical-frozen-reply.test.mjs tests/canonical-occ-reply.test.mjs",
      "result": "passed",
      "summary": "34/34."
    },
    {
      "command": "Inline Bedrock locked-SDK reasoning capture assertions",
      "result": "passed",
      "summary": "Six independent fixed expectations passed."
    },
    {
      "command": "Inline five new-contract capture assertions (initial)",
      "result": "failed",
      "summary": "Forgot already-frozen strict-schema rewrite in independent expectation; no production/spec/test change."
    },
    {
      "command": "Inline five new-contract capture assertions (corrected)",
      "result": "passed",
      "summary": "5/5; matrix failures intentionally remain failures."
    },
    {
      "command": "Python atlas/docs/LOC/protected hashes/report JSON verification",
      "result": "passed",
      "summary": "243 unique atlas rows E17/D125/L66/P32/T3; table/reference checks; changed Rust files <=200 LOC; tests and locked TS unchanged."
    }
  ],
  "validationOutput": [
    "Cargo 116/116; Node unit 34/34.",
    "Duality 795=688 pass+107 fail; original102+new5, no new green.",
    "Fuzz1600/1600; SDK6/6; new-contract capture5/5."
  ],
  "residualRisks": [
    "Codex zstd still blocks real SDK endTurn E2E; Rust frame tests are not E2E proof.",
    "Five new oracle failures require W-08; original 102 non-green cases remain.",
    "Bedrock reasoning envelope changes old string shape; W-08 must add matching coverage.",
    "No root Git metadata: index emptiness cannot be independently inspected.",
    "Independent reviewer gate pending."
  ],
  "noStagedFiles": true,
  "diffSummary": "Five approved codec gaps implemented; seven new Rust tests and one existing assertion updated; three specs, atlas and W07 report synchronized; no dependency/model/transport expansion.",
  "reviewFindings": [
    "No additional definition-versus-locked-source conflict found in approved paths; excluded W06 findings retained.",
    "Independent review required; author does not self-approve gate."
  ],
  "manualNotes": "noStagedFiles means no add/stage/commit operation occurred in this run; git index cannot be verified because the project root is not a Git repository. Full candidate inventory, approval boundaries, per-case failure evidence and unchanged protected tree hashes are in this report."
}
```
