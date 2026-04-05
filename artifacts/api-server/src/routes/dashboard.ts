import { Router } from "express";
import { liveBrainState, liveAlerts, workerTracker } from "../lib/brain-state";

const router = Router();

router.get("/dashboard/pulse", (req, res) => {
  const brain = liveBrainState.get();
  const pendingCount = liveAlerts.count(false);

  res.json({
    safetyScore: brain.safetyScore ?? 100,
    deviationsFound: brain.deviationCount ?? 0,
    progressPercent: brain.progressPct ?? 0,
    activeWorkers: brain.activeWorkers ?? 0,
    idleWorkers: brain.idleWorkers ?? 0,
    pendingAlerts: pendingCount,
    lastScanTime: brain.lastSeen ?? new Date().toISOString(),
    moduleAStatus: brain.moduleAActive ? "active" : "inactive",
    moduleBStatus: brain.moduleBActive ? "active" : "inactive",
    moduleCStatus: brain.moduleCActive ? "active" : "inactive",
  });
});

router.get("/dashboard/metrics", (req, res) => {
  const brain = liveBrainState.get();
  const violations = liveAlerts.list({ type: "PPE_VIOLATION" });
  const deviations = liveAlerts.list({ type: "DEVIATION" });

  const structuralAccuracy = Math.max(0, 100 - (brain.deviationPct ?? 0));
  const ppeCompliance = brain.ppeViolations === 0 ? 100 : Math.max(0, 100 - (brain.ppeViolations ?? 0) * 10);
  const progressPct = brain.progressPct ?? 0;

  const costImpact = deviations.reduce((s, a) => {
    const multiplier = a.severity === "critical" ? 15000 : a.severity === "high" ? 8000 : a.severity === "medium" ? 3000 : 1000;
    return s + multiplier;
  }, 0);

  const floorProgress = [
    { floor: "Floor 1", todayPct: Math.min(100, progressPct + 50), yesterdayPct: Math.min(100, progressPct + 47), delta: 3 },
    { floor: "Floor 2", todayPct: Math.round(progressPct), yesterdayPct: Math.max(0, Math.round(progressPct - 4)), delta: 4 },
    { floor: "Floor 3", todayPct: Math.max(0, Math.round(progressPct - 20)), yesterdayPct: Math.max(0, Math.round(progressPct - 24)), delta: 4 },
    { floor: "Rooftop", todayPct: Math.max(0, Math.round(progressPct - 40)), yesterdayPct: Math.max(0, Math.round(progressPct - 45)), delta: 5 },
  ];

  res.json({
    structuralAccuracy: Math.round(structuralAccuracy * 10) / 10,
    ppeComplianceRate: Math.round(ppeCompliance * 10) / 10,
    laborEfficiencyScore: Math.round((brain.teamEfficiency ?? 0) * 10) / 10,
    totalDeviationsToday: deviations.length,
    totalViolationsToday: violations.length,
    costImpactEstimate: costImpact,
    progressDelta: 4,
    floorProgress,
  });
});

router.get("/workers", (req, res) => {
  const workers = workerTracker.list();
  const brain = liveBrainState.get();
  
  // If worker tracker is empty but brain has workers, populate from brain state
  if (workers.length === 0 && brain.workers && Array.isArray(brain.workers) && brain.workers.length > 0) {
    const brainWorkers = brain.workers.map((w: any, index: number) => ({
      id: `worker_${w.track_id ?? index}`,
      name: w.worker_name || `Worker-${String(w.track_id ?? index).padStart(3, '0')}`,
      trackId: w.track_id ?? index,
      efficiencyScore: Math.round(w.efficiency_score ?? 0),
      movementScore: Math.round(w.movement_score ?? 0),
      isIdle: w.is_idle ?? false,
      idleSeconds: w.idle_seconds ?? 0,
      totalWorkTime: w.total_work_time ?? 0,
      lastSeen: new Date().toISOString(),
      ppeCompliant: true,
    }));
    return res.json(brainWorkers);
  }
  
  res.json(workers);
});

router.get("/workers/active", (req, res) => {
  const count = workerTracker.getActiveCount();
  res.json({ count });
});

router.get("/workers/idle", (req, res) => {
  const count = workerTracker.getIdleCount();
  res.json({ count });
});

// Safety Score endpoint for Module B
router.get("/safety-score", (req, res) => {
  const brain = liveBrainState.get();
  const workers = workerTracker.list();
  const violations = liveAlerts.list({ type: "PPE_VIOLATION" });
  
  const totalWorkers = workers.length || 1;
  const compliantWorkers = workers.filter(w => w.ppeCompliant).length;
  const ppeCompliance = Math.round((compliantWorkers / totalWorkers) * 100);
  
  res.json({
    overall: brain.safetyScore ?? 100,
    ppeCompliance,
    zoneCompliance: 100 - (brain.zoneBreaches ?? 0) * 5,
    workersByStatus: {
      compliant: compliantWorkers,
      violating: violations.length,
      unknown: Math.max(0, totalWorkers - compliantWorkers - violations.length)
    }
  });
});

// Team Efficiency endpoint for Module C
router.get("/team-efficiency", (req, res) => {
  const brain = liveBrainState.get();
  const workers = workerTracker.list();
  
  const activeWorkers = workers.filter(w => !w.isIdle).length;
  const idleWorkers = workers.filter(w => w.isIdle).length;
  const avgMovement = workers.length > 0 
    ? workers.reduce((sum, w) => sum + w.movementScore, 0) / workers.length 
    : 0;
  
  // Get top performers (highest efficiency)
  const topPerformers = [...workers]
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .slice(0, 5)
    .map(w => ({
      workerId: w.trackId,
      workerName: w.name,
      efficiencyScore: w.efficiencyScore
    }));
  
  res.json({
    teamScore: Math.round(brain.teamEfficiency ?? 0),
    activeWorkers,
    idleWorkers,
    avgMovementScore: Math.round(avgMovement),
    topPerformers
  });
});

export default router;
