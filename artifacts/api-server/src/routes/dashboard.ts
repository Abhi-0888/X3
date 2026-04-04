import { Router } from "express";
import { liveBrainState, liveAlerts } from "../lib/brain-state";

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

export default router;
