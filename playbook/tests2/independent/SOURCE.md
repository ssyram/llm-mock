# 来源

本目录是 `target/playbook-next-QiJ8sY/independent-tests/` 的独立测试源副本；
2026-11-17 一次性同步该域最新版（不拷运行时 `artifacts/` 和 `.pi/`）。
原域的 `test-delivery.533e8818.md` SHA-256 为
`9050263b61cbc45cb6262348206ba45fc13bf89d79681b72c3a2c847224ebe22`；
`contract/static-dynamic-obligation-map.json` SHA-256 为
`ef8678ec3c08a4b85d57ab5af096873b5f0f21389390688e0b9c2fa32d8bccdc`。

`test-delivery.533e8818.pre-native-ir.md` 和 `test-delivery.md` 保留旧版交付
证据；`contract/expected-parse-observations.json` 是旧版静态/动态混合预期，
仅保留历史用途，不是当前 contract。当前权威测试使用
`contract/expected-static-ir.json` 与 `contract/static-dynamic-obligation-map.json`；
原域留存的 retired 数据位于 `contract/retired/`。

```sh
PLAYBOOK_ROOT=<repo>/playbook npm --prefix <repo>/playbook/tests2/independent test
PLAYBOOK_ROOT=<repo>/playbook npm --prefix <repo>/playbook/tests2/independent run test:api
PLAYBOOK_ROOT=<repo>/playbook npm --prefix <repo>/playbook/tests2/independent run test:target
```
