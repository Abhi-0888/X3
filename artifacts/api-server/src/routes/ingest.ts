/**
 * Ingest Routes — receive real-time data from the local AI brain
 *
 * The brain.py running on the user's local machine POSTs to these endpoints
 * every second with live metrics, processed frames, and alerts.
 */
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { liveBrainState, latestFrame, liveAlerts, workerTracker, droneBIMStore } from "../lib/brain-state";

const router: IRouter = Router();

/**
 * POST /api/ingest/heartbeat
 * Brain sends current site metrics every HEARTBEAT_INTERVAL seconds.
 */
router.post("/ingest/heartbeat", (req, res) => {
  const body = req.body as Record<string, unknown>;

  // Update the in-memory brain state store
  liveBrainState.update({
    online: true,
    lastSeen: new Date().toISOString(),
    mode: typeof body.mode === "string" ? body.mode : "production",
    cameraView: typeof body.cameraView === "string" ? body.cameraView : typeof body.camera_view === "string" ? body.camera_view : null,
    safetyScore: typeof body.safetyScore === "number" ? body.safetyScore : typeof body.safety_score === "number" ? body.safety_score : null,
    deviationPct: typeof body.deviationPct === "number" ? body.deviationPct : typeof body.deviation_pct === "number" ? body.deviation_pct : null,
    progressPct: typeof body.progressPct === "number" ? body.progressPct : typeof body.progress_pct === "number" ? body.progress_pct : null,
    teamEfficiency: typeof body.teamEfficiency === "number" ? body.teamEfficiency : typeof body.team_efficiency === "number" ? body.team_efficiency : null,
    activeWorkers: typeof body.activeWorkers === "number" ? body.activeWorkers : typeof body.active_workers === "number" ? body.active_workers : null,
    idleWorkers: typeof body.idleWorkers === "number" ? body.idleWorkers : typeof body.idle_workers === "number" ? body.idle_workers : null,
    deviationCount: typeof body.deviationCount === "number" ? body.deviationCount : typeof body.deviation_count === "number" ? body.deviation_count : null,
    ppeViolations: typeof body.ppeViolations === "number" ? body.ppeViolations : typeof body.ppe_violations === "number" ? body.ppe_violations : null,
    zoneBreaches: typeof body.zoneBreaches === "number" ? body.zoneBreaches : typeof body.zone_breaches === "number" ? body.zone_breaches : null,
    moduleAActive: typeof body.moduleAActive === "boolean" ? body.moduleAActive : typeof body.module_a_active === "boolean" ? body.module_a_active : null,
    moduleBActive: typeof body.moduleBActive === "boolean" ? body.moduleBActive : typeof body.module_b_active === "boolean" ? body.module_b_active : null,
    moduleCActive: typeof body.moduleCActive === "boolean" ? body.moduleCActive : typeof body.module_c_active === "boolean" ? body.module_c_active : null,
    brainVersion: typeof body.brainVersion === "string" ? body.brainVersion : typeof body.brain_version === "string" ? body.brain_version : null,
  });

  // Update worker data if provided (from Module C)
  if (body.workers && Array.isArray(body.workers)) {
    for (const worker of body.workers) {
      if (worker.track_id !== undefined) {
        workerTracker.update({
          track_id: worker.track_id,
          worker_name: worker.worker_name || `Worker-${String(worker.track_id).padStart(3, '0')}`,
          efficiency_score: worker.efficiency_score || 0,
          movement_score: worker.movement_score || 0,
          is_idle: worker.is_idle || false,
          idle_seconds: worker.idle_seconds || 0,
          total_work_time: worker.total_work_time || 0,
        });
      }
    }
  }

  // Update active/idle worker counts from tracker and store workers in brain state
  const activeCount = workerTracker.getActiveCount();
  const idleCount = workerTracker.getIdleCount();
  const workerList = workerTracker.list();
  if (activeCount > 0 || idleCount > 0 || workerList.length > 0) {
    liveBrainState.update({
      activeWorkers: activeCount,
      idleWorkers: idleCount,
      workers: workerList,
    });
  }

  // Notify any SSE clients listening on /live/stream
  liveBrainState.notifySSE();

  res.json({ ok: true, workers: workerTracker.list().length });
});

/**
 * POST /api/ingest/frame
 * Brain sends latest processed video frame as base64-encoded JPEG.
 * We store only the single most-recent frame in memory (not in DB).
 */
router.post("/ingest/frame", (req, res) => {
  const body = req.body as Record<string, unknown>;
  const frameB64 = typeof body.frameB64 === "string" ? body.frameB64 : typeof body.frame_b64 === "string" ? body.frame_b64 : null;

  if (!frameB64) {
    res.status(400).json({ ok: false, error: "frameB64 is required" });
    return;
  }

  latestFrame.set({
    frameB64,
    timestamp: typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString(),
    cameraView: typeof body.cameraView === "string" ? body.cameraView : typeof body.camera_view === "string" ? body.camera_view : "unknown",
  });

  res.json({ ok: true });
});

/**
 * POST /api/ingest/alert
 * Brain sends a new alert (PPE violation, deviation, zone breach, idle worker).
 * Alerts are inserted into the PostgreSQL alerts table so they persist.
 */
router.post("/ingest/alert", (req, res) => {
  const body = req.body as Record<string, unknown>;

  const alertType = typeof body.type === "string" ? body.type : "DEVIATION";
  const severity = typeof body.severity === "string" ? body.severity : "medium";
  const title = typeof body.title === "string" ? body.title : "Brain Alert";
  const message = typeof body.message === "string" ? body.message : "";
  const zone = typeof body.zone === "string" ? body.zone : "Unknown";

  const inserted = liveAlerts.add({ type: alertType, severity, title, message, zone });
  logger.info({ alertType, severity, title }, "Brain alert ingested (in-memory)");

  // If this is a structural deviation alert from Module A, also add to DroneBIM store
  if (alertType === "DEVIATION" && body.module === "A") {
    // Extract element info from the alert if available
    const elementId = body.elementId as string || title.match(/([A-Z]+-[A-Z0-9]+)/)?.[1] || "UNKNOWN";
    const elementType = body.elementType as string || "unknown";
    const deviationPct = body.deviationPct as number || 0;
    const deviationDesc = message;
    
    droneBIMStore.addAnomaly({
      elementId,
      elementType,
      zone: zone || "Site",
      deviationPct,
      deviationDescription: deviationDesc,
      severity,
      resolved: false,
      worldX: (body.worldX as number) || 0,
      worldY: (body.worldY as number) || 0,
      worldZ: (body.worldZ as number) || 0,
    });
    logger.info({ elementId, deviationPct }, "Module A anomaly added to DroneBIM store");
  }

  res.status(201).json({ ok: true, id: inserted.id });
});

export default router;
