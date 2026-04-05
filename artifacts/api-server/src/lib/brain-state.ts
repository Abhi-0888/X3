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
  workers: any[] | null;
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
    workers: null,
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
      workers: null,
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

// ── Worker tracking store ──────────────────────────────────────────────────

interface WorkerState {
  id: string;
  name: string;
  trackId: number;
  efficiencyScore: number;
  movementScore: number;
  isIdle: boolean;
  idleSeconds: number;
  totalWorkTime: number;
  lastSeen: string;
  ppeCompliant: boolean;
}

class WorkerTracker {
  private _workers: Map<string, WorkerState> = new Map();

  update(workerData: { track_id: number; worker_name: string; efficiency_score: number; movement_score: number; is_idle: boolean; idle_seconds: number; total_work_time?: number }) {
    const id = `worker_${workerData.track_id}`;
    this._workers.set(id, {
      id,
      name: workerData.worker_name || `Worker-${String(workerData.track_id).padStart(3, '0')}`,
      trackId: workerData.track_id,
      efficiencyScore: workerData.efficiency_score,
      movementScore: workerData.movement_score,
      isIdle: workerData.is_idle,
      idleSeconds: workerData.idle_seconds,
      totalWorkTime: workerData.total_work_time || 0,
      lastSeen: new Date().toISOString(),
      ppeCompliant: true, // Will be updated by Module B
    });
  }

  list(): WorkerState[] {
    // Remove stale workers (not seen in 30 seconds)
    const now = Date.now();
    for (const [id, worker] of this._workers) {
      if (now - new Date(worker.lastSeen).getTime() > 30000) {
        this._workers.delete(id);
      }
    }
    return Array.from(this._workers.values());
  }

  getActiveCount(): number {
    return this.list().filter(w => !w.isIdle).length;
  }

  getIdleCount(): number {
    return this.list().filter(w => w.isIdle).length;
  }

  updatePPE(trackId: number, compliant: boolean) {
    const id = `worker_${trackId}`;
    const worker = this._workers.get(id);
    if (worker) {
      worker.ppeCompliant = compliant;
    }
  }
}

// ── Drone-BIM Data Store (Module A) ────────────────────────────────────────

interface AnomalyData {
  id: string;
  elementId: string;
  elementType: string;
  zone: string;
  deviationPct: number;
  deviationDescription: string;
  severity: string;
  resolved: boolean;
  detectedAt: string;
  resolvedAt: string | null;
  worldX: number;
  worldY: number;
  worldZ: number;
}

interface DroneScanData {
  id: string;
  droneId: string;
  flightPath: string;
  status: string;
  progressPct: number;
  totalFrames: number;
  anomalyCount: number;
  scanTime: string;
  anomalies: AnomalyData[];
}

interface ElementProgress {
  type: string;
  builtCount: number;
  totalCount: number;
  pct: number;
}

class DroneBIMStore {
  private _scans: DroneScanData[] = [];
  private _anomalies: AnomalyData[] = [];
  private _nextScanId = 1;
  private _nextAnomalyId = 1;
  private _overallProgress = 0;
  private _elementProgress: ElementProgress[] = [
    { type: "Columns", builtCount: 48, totalCount: 60, pct: 80 },
    { type: "Walls", builtCount: 134, totalCount: 200, pct: 67 },
    { type: "Beams", builtCount: 82, totalCount: 120, pct: 68.3 },
    { type: "Slabs", builtCount: 12, totalCount: 20, pct: 60 },
    { type: "Foundation", builtCount: 1, totalCount: 1, pct: 100 },
  ];

  // Add a new scan
  addScan(scan: Omit<DroneScanData, 'id' | 'scanTime'>): DroneScanData {
    const newScan: DroneScanData = {
      ...scan,
      id: `scan_${this._nextScanId++}`,
      scanTime: new Date().toISOString(),
    };
    this._scans.unshift(newScan);
    if (this._scans.length > 20) {
      this._scans = this._scans.slice(0, 20);
    }
    return newScan;
  }

  // Add an anomaly from brain detection
  addAnomaly(anomaly: Omit<AnomalyData, 'id' | 'detectedAt'>): AnomalyData {
    const newAnomaly: AnomalyData = {
      ...anomaly,
      id: `anomaly_${this._nextAnomalyId++}`,
      detectedAt: new Date().toISOString(),
    };
    this._anomalies.unshift(newAnomaly);
    if (this._anomalies.length > 100) {
      this._anomalies = this._anomalies.slice(0, 100);
    }
    return newAnomaly;
  }

  // Update progress from brain
  updateProgress(progressPct: number, elements?: ElementProgress[]) {
    this._overallProgress = progressPct;
    if (elements) {
      this._elementProgress = elements;
    }
  }

  // Get all scans
  getScans(limit = 20): DroneScanData[] {
    return this._scans.slice(0, limit);
  }

  // Get unresolved anomalies
  getAnomalies(resolved = false): AnomalyData[] {
    return this._anomalies.filter(a => a.resolved === resolved);
  }

  // Get all anomalies
  getAllAnomalies(): AnomalyData[] {
    return this._anomalies;
  }

  // Resolve an anomaly
  resolveAnomaly(id: string): AnomalyData | null {
    const anomaly = this._anomalies.find(a => a.id === id);
    if (anomaly) {
      anomaly.resolved = true;
      anomaly.resolvedAt = new Date().toISOString();
    }
    return anomaly || null;
  }

  // Get progress data
  getProgress(): { overallPct: number; elementBreakdown: ElementProgress[] } {
    return {
      overallPct: this._overallProgress,
      elementBreakdown: this._elementProgress,
    };
  }

  // Create a new scan when brain triggers one
  createScan(droneId = "DRN-001", flightPath = "PATH_AUTO"): DroneScanData {
    return this.addScan({
      droneId,
      flightPath,
      status: "in_progress",
      progressPct: 0,
      totalFrames: 0,
      anomalyCount: 0,
      anomalies: [],
    });
  }

  // Complete a scan with detected anomalies
  completeScan(scanId: string, progressPct: number, anomalies: Omit<AnomalyData, 'id' | 'detectedAt'>[]) {
    const scan = this._scans.find(s => s.id === scanId);
    if (scan) {
      scan.status = "completed";
      scan.progressPct = progressPct;
      scan.totalFrames = Math.floor(Math.random() * 200) + 150;
      
      // Add anomalies and link to scan
      const addedAnomalies = anomalies.map(a => this.addAnomaly(a));
      scan.anomalies = addedAnomalies;
      scan.anomalyCount = addedAnomalies.length;
    }
  }

  reset() {
    this._scans = [];
    this._anomalies = [];
    this._nextScanId = 1;
    this._nextAnomalyId = 1;
    this._overallProgress = 0;
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
export const workerTracker = new WorkerTracker();
export const droneBIMStore = new DroneBIMStore();
