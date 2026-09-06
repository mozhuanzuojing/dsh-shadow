// dsh-shadow —— continuity/persist.ts：双层存储边界持久化。
// Global ~/.dsh-observer（observer 层）：observer/{config,boundary}.json + recall-index/index.json + lineage/continuity.json。
// Workspace ~/.dsh-shadow（world 层）：<ws>/.dsh-shadow/<kind>/<id>.json。
import path from "node:path";
import os from "node:os";
import type { ObserverConfig, ObserverBoundary, RecallIndex, ContinuityRecord, WorkspaceRecord } from "./types.js";

export const DEFAULT_OBSERVER_ROOT = path.join(os.homedir(), ".dsh-observer");

export const writeObserverConfig = async (fs: any, root: string, c: ObserverConfig) => {
  try { const t = await fs.resolve(`${root}/observer/config.json`, { cwd: root }); await fs.writeText(t, JSON.stringify(c)); } catch (err: any) { console.log("[dsh-shadow] observer config write failed:", err && err.message); }
};
export const writeObserverBoundary = async (fs: any, root: string, b: ObserverBoundary) => {
  try { const t = await fs.resolve(`${root}/observer/boundary.json`, { cwd: root }); await fs.writeText(t, JSON.stringify(b)); } catch (err: any) { console.log("[dsh-shadow] observer boundary write failed:", err && err.message); }
};
export const writeRecallIndex = async (fs: any, root: string, ri: RecallIndex) => {
  try { const t = await fs.resolve(`${root}/recall-index/index.json`, { cwd: root }); await fs.writeText(t, JSON.stringify(ri)); } catch (err: any) { console.log("[dsh-shadow] recall-index write failed:", err && err.message); }
};
export const writeLineage = async (fs: any, root: string, lr: ContinuityRecord) => {
  try { const t = await fs.resolve(`${root}/lineage/continuity.json`, { cwd: root }); await fs.writeText(t, JSON.stringify(lr)); } catch (err: any) { console.log("[dsh-shadow] lineage write failed:", err && err.message); }
};
export const writeWorkspaceRecord = async (fs: any, ws: string, r: WorkspaceRecord) => {
  try { const base = `${r.workspace}/.dsh-shadow`; const t = await fs.resolve(`${base}/${r.kind}/${Date.now()}.json`, { cwd: ws }); await fs.writeText(t, JSON.stringify(r)); } catch (err: any) { console.log("[dsh-shadow] workspace record write failed:", err && err.message); }
};

export const readObserverBoundary = async (fs: any, root: string): Promise<ObserverBoundary | null> => {
  try { const t = await fs.resolve(`${root}/observer/boundary.json`, { cwd: root }); const raw = await fs.readText(t); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
export const readRecallIndex = async (fs: any, root: string): Promise<RecallIndex | null> => {
  try { const t = await fs.resolve(`${root}/recall-index/index.json`, { cwd: root }); const raw = await fs.readText(t); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
export const readLineage = async (fs: any, root: string): Promise<ContinuityRecord | null> => {
  try { const t = await fs.resolve(`${root}/lineage/continuity.json`, { cwd: root }); const raw = await fs.readText(t); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
