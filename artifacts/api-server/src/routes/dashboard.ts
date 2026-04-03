import { Router } from "express";
import { db } from "@workspace/db";
import {
  droneScansTable,
  structuralAnomaliesTable,
  workersTable,
  alertsTable,
  idleAlertsTable,
  ppeViolationsTable,
  dailyProgressTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/pulse", async (req, res) => {
  try {
    const [workers, pendingAlerts, anomalies, latestScan] = await Promise.all([
      db.select().from(workersTable),
      db
        .select()
        .from(alertsTable)
        .where(eq(alertsTable.acknowledged, false)),
      db
        .select()
        .from(structuralAnomaliesTable)
        .where(eq(structuralAnomaliesTable.resolved, false)),
      db
        .select()
        .from(droneScansTable)
        .orderBy(sql`${droneScansTable.scanTime} desc`)
        .limit(1),
    ]);

    const activeWorkers = workers.filter((w) => w.status === "active").length;
    const idleWorkers = workers.filter((w) => w.status === "idle").length;
    const violatingWorkers = workers.filter(
      (w) => w.ppeStatus === "violation"
    ).length;
    const totalWorkers = workers.length || 1;

    const ppeComplianceRate =
      ((totalWorkers - violatingWorkers) / totalWorkers) * 100;
    const avgEfficiency =
      workers.reduce((s, w) => s + w.efficiencyScore, 0) / totalWorkers;

    const lastScan = latestScan[0];
    const progressPct = lastScan?.progressPct ?? 48.5;

    const violations = await db
      .select()
      .from(ppeViolationsTable)
      .where(eq(ppeViolationsTable.resolved, false));

    const safetyScore = Math.max(
      0,
      100 - violations.length * 8 - anomalies.length * 3
    );

    res.json({
      safetyScore: Math.round(safetyScore * 10) / 10,
      deviationsFound: anomalies.length,
      progressPercent: progressPct,
      activeWorkers,
      idleWorkers,
      pendingAlerts: pendingAlerts.length,
      lastScanTime: lastScan?.scanTime?.toISOString() ?? new Date().toISOString(),
      moduleAStatus: lastScan?.status === "in_progress" ? "scanning" : "active",
      moduleBStatus: violations.length > 0 ? "active" : "active",
      moduleCStatus: idleWorkers > 2 ? "active" : "active",
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard pulse");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/metrics", async (req, res) => {
  try {
    const [workers, violations, anomalies, progress] = await Promise.all([
      db.select().from(workersTable),
      db
        .select()
        .from(ppeViolationsTable)
        .where(eq(ppeViolationsTable.resolved, false)),
      db
        .select()
        .from(structuralAnomaliesTable)
        .where(eq(structuralAnomaliesTable.resolved, false)),
      db
        .select()
        .from(dailyProgressTable)
        .orderBy(sql`${dailyProgressTable.date} desc`)
        .limit(7),
    ]);

    const totalWorkers = workers.length || 1;
    const violatingWorkers = workers.filter(
      (w) => w.ppeStatus === "violation"
    ).length;
    const ppeCompliance = ((totalWorkers - violatingWorkers) / totalWorkers) * 100;
    const avgEfficiency =
      workers.reduce((s, w) => s + w.efficiencyScore, 0) / totalWorkers;

    const totalDeviationPct = anomalies.reduce(
      (s, a) => s + a.deviationPct,
      0
    );
    const structuralAccuracy = Math.max(
      0,
      100 - totalDeviationPct / Math.max(1, anomalies.length)
    );

    const costImpact = anomalies.reduce((s, a) => {
      const multiplier =
        a.severity === "critical"
          ? 15000
          : a.severity === "high"
            ? 8000
            : a.severity === "medium"
              ? 3000
              : 1000;
      return s + multiplier;
    }, 0);

    const latestProgress = progress[0]?.progressPct ?? 48.5;
    const prevProgress = progress[1]?.progressPct ?? 44.5;
    const progressDelta = latestProgress - prevProgress;

    const floorProgress = [
      {
        floor: "Floor 1",
        todayPct: 98,
        yesterdayPct: 95,
        delta: 3,
      },
      {
        floor: "Floor 2",
        todayPct: latestProgress,
        yesterdayPct: prevProgress,
        delta: progressDelta,
      },
      {
        floor: "Floor 3",
        todayPct: 22,
        yesterdayPct: 18,
        delta: 4,
      },
      {
        floor: "Rooftop",
        todayPct: 5,
        yesterdayPct: 0,
        delta: 5,
      },
    ];

    res.json({
      structuralAccuracy: Math.round(structuralAccuracy * 10) / 10,
      ppeComplianceRate: Math.round(ppeCompliance * 10) / 10,
      laborEfficiencyScore: Math.round(avgEfficiency * 10) / 10,
      totalDeviationsToday: anomalies.length,
      totalViolationsToday: violations.length,
      costImpactEstimate: costImpact,
      progressDelta: Math.round(progressDelta * 10) / 10,
      floorProgress,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
