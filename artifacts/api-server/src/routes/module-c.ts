import { Router } from "express";
import {
  WorkerModel,
  IdleAlertModel,
  ActivityTimelineModel,
} from "@workspace/db/schema";

const router = Router();

router.get("/module-c/efficiency", async (req, res) => {
  try {
    const workers = await WorkerModel.find();
    const totalWorkers = workers.length || 1;

    const activeWorkers = workers.filter((w: { status: string }) => w.status === "active").length;
    const idleWorkers = workers.filter((w: { status: string }) => w.status === "idle").length;
    const avgMovement = workers.reduce((s: number, w: { movementScore: number }) => s + w.movementScore, 0) / totalWorkers;
    const teamScore = workers.reduce((s: number, w: { efficiencyScore: number }) => s + w.efficiencyScore, 0) / totalWorkers;

    const sorted = [...workers].sort((a, b) => b.efficiencyScore - a.efficiencyScore);
    const topPerformers = sorted.slice(0, 3).map((w) => ({
      workerId: w.id,
      workerName: w.name,
      efficiencyScore: w.efficiencyScore,
      movementScore: w.movementScore,
      idleMinutes: w.idleMinutes,
    }));
    const underperformers = sorted.slice(-3).reverse().map((w) => ({
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
    const workers = await WorkerModel.find().sort({ efficiencyScore: -1 });
    res.json(workers.map((w) => ({
      ...w.toObject(),
      joinedAt: w.joinedAt?.toISOString(),
      activityLog: [],
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing workers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/workers/:workerId", async (req, res) => {
  try {
    const workerId = req.params.workerId;
    const worker = await WorkerModel.findById(workerId);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const activityLog = [
      { time: new Date(Date.now() - 3600000).toISOString(), action: "Structural work — column reinforcement", duration: 45, movementScore: 82 },
      { time: new Date(Date.now() - 5400000).toISOString(), action: "Material transport", duration: 30, movementScore: 91 },
      { time: new Date(Date.now() - 7200000).toISOString(), action: "Idle period detected", duration: 18, movementScore: 8 },
      { time: new Date(Date.now() - 9000000).toISOString(), action: "Wall formwork assembly", duration: 60, movementScore: 74 },
    ];

    res.json({
      ...worker.toObject(),
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
    const alerts = await IdleAlertModel.find().sort({ detectedAt: -1 });
    const result = await Promise.all(alerts.map(async (a) => {
      const worker = await WorkerModel.findById(a.workerId);
      return {
        ...a.toObject(),
        workerName: worker?.name ?? "Unknown",
        detectedAt: a.detectedAt?.toISOString(),
      };
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing idle alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-c/activity-timeline", async (req, res) => {
  try {
    const timeline = await ActivityTimelineModel.find().sort({ hour: 1 });
    res.json(timeline);
  } catch (err) {
    req.log.error({ err }, "Error getting activity timeline");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
