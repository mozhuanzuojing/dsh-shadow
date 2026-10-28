/**
 * v2 engine/write — 采集状态机：事件 → pending → flush 事务。
 *
 * 核心保证：
 * - 写失败时 pending **保留**（不先删后写），可见 Signal，可重试；
 * - 同秒/同入口不覆盖（writeAtom 唯一命名）；
 * - 纯动作批走 audit 流；含线索的批落 atoms；
 * - consent=true 且无显式「记住」时只进 audit，并留可见信号。
 */

import { AUDIT_DIR } from "../../contract/paths.js";
import { err, ok, type Outcome } from "../../contract/outcome.js";
import type { Clock } from "../../contract/time.js";
import { fmtTime } from "../../contract/time.js";
import type { NormalizedConfig } from "../../contract/config.js";
import { classifyUser, extractMessage, extractReason, goalText, isExplicitRemember } from "../../domain/collect.js";
import { component, sanitizeText, under } from "../../domain/text.js";
import { writeAtom } from "../../store/atoms.js";
import type { FsPort } from "../../store/fs.js";
import type { SignalStore } from "../signals.js";
import { buildAtomText, primaryEntry, projectName, type Trace } from "./atom-text.js";

export interface CaptureDeps {
  fs: FsPort;
  config: NormalizedConfig;
  clock: Clock;
  signals: SignalStore;
  resolveWs: (agentId: string | undefined) => string | null;
  getAgentById?: (id: string | undefined) => any;
}

export interface FlushResult {
  written: number;
  audit: number;
  retained: number;
  rel?: string;
}

const UNKNOWN = "__unknown__";
const MAX_PENDING = 60;
const HARD_CAP = 500;

export class Capture {
  readonly cwdBySession = new Map<string, string>();
  private pending = new Map<string, Trace[]>();
  private goals = new Map<string, string>();
  private attempts = new Map<string, number>();
  /** 同一 agent 串行 flush，避免 auto-flush 与 turn-stopping 并发重复写。 */
  private chains = new Map<string, Promise<Outcome<FlushResult>>>();

  constructor(private readonly deps: CaptureDeps) {}

  private note(capability: string, code: string, message: string, effect: string): void {
    this.deps.signals.note(capability, code, message, effect);
  }

  push(agentId: string | undefined, rec: Omit<Trace, "at" | "date"> & { date?: string }): void {
    const id = agentId || UNKNOWN;
    if (!agentId) this.note("capture.unattributed", "NO_AGENT", "事件没有可归属的 agent", "已落到 __unknown__ 桶；可能跨会话串线，请检查宿主归属。");
    const arr = this.pending.get(id) ?? [];
    arr.push({ at: this.deps.clock.stamp(), date: rec.date ?? this.deps.clock.today(), ...rec });
    if (arr.length > HARD_CAP) {
      const dropped = arr.splice(0, arr.length - HARD_CAP);
      this.note("capture.pending", "OVERFLOW", `pending 超过硬上限，丢弃最旧 ${dropped.length} 条事件`, "这些事件不再进入 atoms；先修 flush 失败/consent 积压。");
    }
    this.pending.set(id, arr);
    if (arr.length >= MAX_PENDING) {
      void this.flush(id).catch((e) => this.note("capture.flush", "THROW", String(e), "自动 flush 抛错；pending 仍在，下一次 flush 可重试。"));
    }
  }

  onFsObserved(target: any, _observation: any, actor: any): void {
    const abs = target?.displayPath || target?.targetKey || "";
    if (!abs) return;
    const id = this.agentIdOf(actor);
    const ws = this.deps.resolveWs(id);
    if (!ws) {
      this.note("capture.scope", "NO_WS", "fs/observed 无法解析工作区", "该动作不会进入记忆；请配置 shadowRoot 或确保 session cwd 存在。");
      return;
    }
    this.push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
  }

  onToolsResult(exec: any): void {
    const id = exec?.agent?.id;
    const tool = String(exec?.name || "tool");
    this.push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
  }

  onGoalChanged(payload: any): void {
    const id = payload?.agent?.id;
    const change = payload?.change;
    const obj = change?.goal?.objective || "";
    if (id && (change?.operation === "clear" || change?.goal === undefined)) this.goals.delete(String(id));
    else if (id && obj) this.goals.set(String(id), String(obj).slice(0, 160));
    const stmt = goalText(change);
    this.push(id, { kind: "decision", text: `决定 ${stmt}`, statement: stmt, comp: "", source: "goal" });
  }

  onSessionEvent(session: any, event: any): void {
    const sid = session?.id;
    const cwd = session?.header?.cwd;
    if (sid && cwd) this.cwdBySession.set(String(sid), String(cwd));
    const m = extractMessage(event);
    if (!m) return;
    const id = this.deps.getAgentById?.(sid)?.id || (sid ? String(sid) : undefined);
    const text = sanitizeText(m.text);
    if (m.kind === "assistant") {
      this.push(id, { kind: "assistant", text: `我：${text}`, comp: "", source: "assistant" });
      return;
    }
    const sub = classifyUser(text);
    this.push(id, { kind: "user", text: `用户：${text}`, comp: "", source: "user" });
    if (sub === "decision") {
      const stmt = text.slice(0, 160);
      this.push(id, { kind: "decision", text: `决定 ${stmt}`, statement: stmt, reason: extractReason(text), comp: "", source: "user" });
    }
  }

  private agentIdOf(thing: any): string | undefined {
    if (!thing || typeof thing !== "object") return undefined;
    const nested = thing.agent && typeof thing.agent === "object" ? thing.agent.id : undefined;
    const direct = typeof thing.id === "string" ? thing.id : undefined;
    return (typeof nested === "string" && nested) || direct || undefined;
  }

  private isPureAction(arr: Trace[]): boolean {
    return arr.every((t) => t.kind === "action");
  }

  private explicitRemember(arr: Trace[]): boolean {
    return arr.some((t) => t.kind === "user" && isExplicitRemember(t.text));
  }

  /** 同一 agent 串行：并发调用会排队，后一个能看到前一个之后的新事件。 */
  async flush(agentId: string | undefined): Promise<Outcome<FlushResult>> {
    const id = agentId || UNKNOWN;
    const prev = this.chains.get(id) ?? Promise.resolve<Outcome<FlushResult>>(ok({ written: 0, audit: 0, retained: 0 }));
    const next = prev.catch(() => ok({ written: 0, audit: 0, retained: 0 })).then(() => this.flushOnce(id));
    this.chains.set(id, next);
    try {
      return await next;
    } finally {
      if (this.chains.get(id) === next) this.chains.delete(id);
    }
  }

  /** 只消费调用开始时的快照；flush 期间新 push 的事件留在 pending。 */
  private async flushOnce(id: string): Promise<Outcome<FlushResult>> {
    try {
      const arr = [...(this.pending.get(id) ?? [])];
      if (!arr.length) return ok({ written: 0, audit: 0, retained: 0 });
      const ws = this.deps.resolveWs(id);
      if (!ws) {
        this.note("capture.scope", "NO_WS", "flush 无法解析工作区", "pending 保留；配置 shadowRoot 或修复 session cwd 后再试。");
        return err("UNAVAILABLE", "无法解析工作区");
      }
      const consent = this.deps.config.capture.consent && !this.explicitRemember(arr);
      const pure = this.isPureAction(arr);
      const auditOnly = consent || (pure && this.deps.config.capture.echo === "audit");

      if (auditOnly) {
        const a = await this.appendAudit(ws, id, arr);
        if (!a.ok) {
          this.note("capture.audit", a.error.code, a.error.message, "本批动作没有落盘；pending 保留可重试。");
          return a;
        }
        this.consume(id, arr.length);
        this.attempts.delete(id);
        if (consent) this.note("capture.consent", "CONSENT", "capture.consent=true 且本批无显式「记住」", "只写 audit 流，不写 atoms；要落记忆请显式说「记住」。");
        return ok({ written: 0, audit: arr.length, retained: 0 });
      }

      const last = arr[arr.length - 1]!;
      const date = last.date || this.deps.clock.today();
      const project = projectName(ws);
      const entry = primaryEntry(arr, ws);
      const text = buildAtomText(arr, {
        ws,
        entry,
        date,
        time: last.at.replace(/:/g, ""),
        agentId: id === UNKNOWN ? "" : id,
        project,
        goal: this.goals.get(id) ?? "",
        summary: this.deps.config.capture.summary,
      });
      const w = await writeAtom(this.deps.fs, ws, { entry, text, date, time: last.at.replace(/:/g, "") }, this.deps.clock);
      if (!w.ok) {
        const n = (this.attempts.get(id) ?? 0) + 1;
        this.attempts.set(id, n);
        this.note("capture.flush", w.error.code, w.error.message, `本批 ${arr.length} 条事件保留在 pending（第 ${n} 次失败）；atoms 未写入。`);
        return w;
      }
      this.consume(id, arr.length);
      this.attempts.delete(id);
      this.deps.signals.clear("capture.flush");
      return ok({ written: 1, audit: 0, retained: 0, rel: w.value.rel });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.note("capture.flush", "THROW", message, "flush 抛错；pending 保留，下一次 flush 可重试。");
      return err("INTERNAL", `flush 抛错：${message}`);
    }
  }

  /** 只移除本次已消费的前 n 条；flush 期间新增的事件保留。 */
  private consume(id: string, n: number): void {
    const cur = this.pending.get(id) ?? [];
    if (!cur.length) return;
    cur.splice(0, Math.min(n, cur.length));
    if (cur.length) this.pending.set(id, cur);
    else this.pending.delete(id);
  }

  private async appendAudit(ws: string, agentId: string, arr: Trace[]): Promise<Outcome<void>> {
    const date = arr[0]?.date || this.deps.clock.today();
    const rel = `${AUDIT_DIR}/${date}.jsonl`;
    const line = JSON.stringify({
      at: `${date}T${fmtTime(arr[0]?.at?.replace(/:/g, "") ?? "000000")}`,
      agent: agentId,
      events: arr,
    }) + "\n";
    return this.deps.fs.appendText(`${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`, line);
  }

  async flushAll(): Promise<void> {
    for (const id of [...this.pending.keys()]) await this.flush(id);
  }

  cleanup(): void {
    this.pending.clear();
    this.goals.clear();
    this.attempts.clear();
  }

  pendingCount(): number {
    let n = 0;
    for (const arr of this.pending.values()) n += arr.length;
    return n;
  }
}
