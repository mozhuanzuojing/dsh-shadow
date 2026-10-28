# ADR-0005: core / lab 边界与 shadow_lab

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0001、ADR-0006
- 定位：研究面如何不拖累默认请求。

## Context

v1 的 50 个研究 mode 不读 atoms、不参与召回，却共享 `read_shadow` 的 128 参数 schema；唯一真实部署中 20+ 个 mode 存储根从未出现。

## Decision

- core：采集、atoms、派生索引、召回、材料/纪要/Episode、观测/报告；10 个核心 mode。
- lab：51 个研究 mode（含 `index`），独立包 `dsh-shadow-lab`；`shadow_lab({mode,input,write})`，默认不注册、不进核心 schema。
- lab 不写 atoms；写型 mode 必须显式 `write:true`；只写 `.shadow/lab/`（旧 `.shadow/<mode>/` 只读兼容）。
- core 不 import lab；lab 未安装时 core 全绿；`read_shadow` 命中 lab mode 返回显式迁移提示。

## Consequences

- 默认请求不再背研究面 schema；研究面可独立停更/演进。
- lab 的 51 mode 需适配 core 的 ports，不能直接复用 v1 fs 服务。

## Non-goals

不把 lab 做成远程服务；不在 v2.0 删除任何 lab mode。
