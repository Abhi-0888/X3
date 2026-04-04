/**
 * In-memory brain state store
 *
 * The AI brain sends heartbeats every second. We keep the latest snapshot
 * in memory (not DB) so dashboard polling is instantaneous.
 *
 * Also manages the SSE client registry for /live/stream.
 */
import type { Response } from "express";

// ── Brain Status snapshot ──────────────────────────────────────────────────

interface BrainState {
  online: boolean;
  lastSeen: string | null;
  mode: string | null;
  cameraView: string | null;
  safetyScore: number | null;
  deviationPct: number | null;
  progressPct: number | null;
  teamEfficiency: number | null;
  activeWorkers: number | null;
  idleWorkers: number | null;
  deviationCount: number | null;
  ppeViolations: number | null;
  zoneBreaches: number | null;
  moduleAActive: boolean | null;
  moduleBActive: boolean | null;
  moduleCActive: boolean | null;
  brainVersion: string | null;
}

const OFFLINE_TIMEOUT_MS = 10_000; // mark offline after 10s with no heartbeat

class LiveBrainState {
  private _state: BrainState = {
    online: false,
    lastSeen: null,
    mode: null,
    cameraView: null,
    safetyScore: null,
    deviationPct: null,
    progressPct: null,
    teamEfficiency: null,
    activeWorkers: null,
    idleWorkers: null,
    deviationCount: null,
    ppeViolations: null,
    zoneBreaches: null,
    moduleAActive: null,
    moduleBActive: null,
    moduleCActive: null,
    brainVersion: null,
  };

  private _sseClients: Map<number, Response> = new Map();
  private _offlineTimer: NodeJS.Timeout | null = null;

  update(partial: Partial<BrainState>) {
    this._state = { ...this._state, ...partial, online: true };

    // Reset offline timer
    if (this._offlineTimer) clearTimeout(this._offlineTimer);
    this._offlineTimer = setTimeout(() => {
      this._state.online = false;
      this.notifySSE();
    }, OFFLINE_TIMEOUT_MS);
  }

  get(): BrainState {
    return { ...this._state };
  }

  reset() {
    if (this._offlineTimer) clearTimeout(this._offlineTimer);
    this._state = {
      online: false,
      lastSeen: null,
      mode: null,
      cameraView: null,
      safetyScore: null,
      deviationPct: null,
      progressPct: null,
      teamEfficiency: null,
      activeWorkers: null,
      idleWorkers: null,
      deviationCount: null,
      ppeViolations: null,
      zoneBreaches: null,
      moduleAActive: null,
      moduleBActive: null,
      moduleCActive: null,
      brainVersion: null,
    };
    this.notifySSE();
  }

  // ── SSE client registry ────────────────────────────────────────────────

  addSSEClient(id: number, res: Response) {
    this._sseClients.set(id, res);
  }

  removeSSEClient(id: number) {
    this._sseClients.delete(id);
  }

  notifySSE() {
    const data = JSON.stringify(this._state);
    for (const [id, res] of this._sseClients) {
      try {
        res.write(`data: ${data}\n\n`);
      } catch {
        this._sseClients.delete(id);
      }
    }
  }
}

// ── Latest frame store ────────────────────────────────────────────────────

interface FrameState {
  frameB64: string | null;
  timestamp: string | null;
  cameraView: string | null;
}

class LatestFrame {
  private _frame: FrameState = {
    frameB64: null,
    timestamp: null,
    cameraView: null,
  };

  set(frame: FrameState) {
    this._frame = frame;
  }

  get(): FrameState {
    return { ...this._frame };
  }
}

// ── Singleton exports ─────────────────────────────────────────────────────

// ── In-memory alerts store (works without PostgreSQL) ────────────────

interface InMemoryAlert {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  zone: string;
  entityId: number | null;
  acknowledged: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
}

class LiveAlerts {
  private _alerts: InMemoryAlert[] = [];
  private _nextId = 1;
  private readonly MAX_ALERTS = 200;

  add(alert: { type: string; severity: string; title: string; message: string; zone: string }): InMemoryAlert {
    const entry: InMemoryAlert = {
      ...alert,
      entityId: null,
      id: this._nextId++,
      acknowledged: false,
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
    };
    this._alerts.unshift(entry);
    if (this._alerts.length > this.MAX_ALERTS) {
      this._alerts = this._alerts.slice(0, this.MAX_ALERTS);
    }
    return entry;
  }

  list(opts?: { type?: string; acknowledged?: boolean; limit?: number }): InMemoryAlert[] {
    let result = this._alerts;
    if (opts?.type) result = result.filter((a) => a.type === opts.type);
    if (opts?.acknowledged !== undefined) result = result.filter((a) => a.acknowledged === opts.acknowledged);
    return result.slice(0, opts?.limit ?? 50);
  }

  acknowledge(id: number): InMemoryAlert | null {
    const alert = this._alerts.find((a) => a.id === id);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
    }
    return alert ?? null;
  }

  count(acknowledged?: boolean): number {
    if (acknowledged === undefined) return this._alerts.length;
    return this._alerts.filter((a) => a.acknowledged === acknowledged).length;
  }

  reset() {
    this._alerts = [];
    this._nextId = 1;
  }
}

export const liveBrainState = new LiveBrainState();
export const latestFrame = new LatestFrame();
export const liveAlerts = new LiveAlerts();
