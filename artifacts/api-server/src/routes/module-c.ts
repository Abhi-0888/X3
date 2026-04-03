import { Router } from "express";
import { db } from "@workspace/db";
import {
  workersTable,
  idleAlertsTable,
  activityTimelineTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/module-c/efficiency", async (req, res) => {
  try {
    const workers = await db.select().from(workersTable);
    const totalWorkers = workers.length || 1;

    const activeWorkers = workers.filter((w) => w.status === "active").length;
    const idleWorkers = workers.filter((w) => w.status === "idle").length;
    const avgMovement =
      workers.reduce((s, w) => s + w.movementScore, 0) / totalWorkers;
    const teamScore =
      workers.reduce((s, w) => s + w.efficiencyScore, 0) / totalWorkers;

    const sorted = [...workers].sort(
      (a, b) => b.efficiencyScore - a.efficiencyScore
    );
    const topPerformers = sorted.slice(0, 3).map((w) => ({
      workerId: w.id,
      workerName: w.name,
      efficiencyScore: w.efficiencyScore,
      movementScore: w.movementScore,
      idleMinutes: w.idleMinutes,
    }));
    const underperformers = sorted
      .slice(-3)
      .reverse()
      .map((w) => ({
        workerId: w.id,
        workerName: w.name,
        efficiencyScore: w.efficiencyScore,
        movementScore: w.movementScore,
        idleMinutes: w.idleMinutes,
      }));

    res.json({
      teamScore: Math.round(teamScore * 10) / 10,
      activeWorkers,
      idleWorkers,
      avgMovementScore: Math.round(avgMovement * 10) / 10,
      topPerformers,
      underperformers,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting team efficiency");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/workers", async (req, res) => {
  try {
    const workers = await db
      .select()
      .from(workersTable)
      .orderBy(sql`${workersTable.efficiencyScore} desc`);
    res.json(
      workers.map((w) => ({
        ...w,
        joinedAt: w.joinedAt?.toISOString(),
        activityLog: [],
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error listing workers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/workers/:workerId", async (req, res) => {
  try {
    const workerId = parseInt(req.params.workerId);
    const [worker] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, workerId));

    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const activityLog = [
      {
        time: new Date(Date.now() - 3600000).toISOString(),
        action: "Structural work — column reinforcement",
        duration: 45,
        movementScore: 82,
      },
      {
        time: new Date(Date.now() - 5400000).toISOString(),
        action: "Material transport",
        duration: 30,
        movementScore: 91,
      },
      {
        time: new Date(Date.now() - 7200000).toISOString(),
        action: "Idle period detected",
        duration: 18,
        movementScore: 8,
      },
      {
        time: new Date(Date.now() - 9000000).toISOString(),
        action: "Wall formwork assembly",
        duration: 60,
        movementScore: 74,
      },
    ];

    res.json({
      ...worker,
      joinedAt: worker.joinedAt?.toISOString(),
      activityLog,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting worker");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/idle-alerts", async (req, res) => {
  try {
    const alerts = await db
      .select()
      .from(idleAlertsTable)
      .orderBy(sql`${idleAlertsTable.detectedAt} desc`);

    const result = await Promise.all(
      alerts.map(async (a) => {
        const [worker] = await db
          .select()
          .from(workersTable)
          .where(eq(workersTable.id, a.workerId));
        return {
          ...a,
          workerName: worker?.name ?? "Unknown",
          detectedAt: a.detectedAt?.toISOString(),
        };
      })
    );

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing idle alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/activity-timeline", async (req, res) => {
  try {
    const timeline = await db
      .select()
      .from(activityTimelineTable)
      .orderBy(sql`${activityTimelineTable.hour} asc`);
    res.json(timeline);
  } catch (err) {
    req.log.error({ err }, "Error getting activity timeline");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
