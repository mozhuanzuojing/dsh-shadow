# 第三方依赖与许可（THIRD_PARTY_NOTICES）

本包在引入代码检索（tree-sitter 符号抽取）后含以下运行时依赖。均为宽松许可，随包分发需保留其许可声明。

| 依赖 | 版本（钉死） | 许可 | 用途 | 上游 |
|---|---|---|---|---|
| `web-tree-sitter` | 0.20.8 | MIT | tree-sitter 的 WASM 运行时 | https://github.com/tree-sitter/tree-sitter |
| `tree-sitter-wasms` | 0.1.13 | Unlicense（公有领域） | 各语言预编译 `.wasm` 语法（本机取 ts/tsx/js/py/go/rs/java/cs/cpp/c/rb/php/swift/scala/kt/lua/sh/bash/vue/dart/elixir/zig 等） | https://github.com/Gregoor/tree-sitter-wasms |

## 说明 / 约束

- **版本必须钉死**：`tree-sitter-wasms@0.1.13` 的 `.wasm` 使用旧 dylink 格式，只能被 `web-tree-sitter@0.20.x` 加载；升级任一者都可能 `getDylinkMetadata` 失败（升级需同步重建语法 wasm）。
- 依赖缺失或 wasm 不兼容时，`search_code` 的符号段显式标注「符号检索不可用」，BM25 结果不受影响（已实现动态加载，不会拖垮插件）。
- 安装体积：`tree-sitter-wasms` 解包约 **52MB**（37 个语言 wasm）。
- 许可原文见各自 npm 包内 `LICENSE` 文件；`Unlicense` 为公有领域授权，无附加义务；`MIT` 需保留版权与许可声明。
