import { Router } from "express";
import {
  WorkerModel,
  PPEViolationModel,
  ZoneBreachModel,
  CameraModel,
  DangerZoneModel,
} from "@workspace/db/schema";

const router = Router();

router.get("/module-b/safety-score", async (req, res) => {
  try {
    const [workers, violations, breaches] = await Promise.all([
      WorkerModel.find(),
      PPEViolationModel.find({ resolved: false }),
      ZoneBreachModel.find({ exitTime: null }),
    ]);

    const totalWorkers = workers.length || 1;
    const compliant = workers.filter((w: { ppeStatus: string }) => w.ppeStatus === "compliant").length;
    const violating = workers.filter((w: { ppeStatus: string }) => w.ppeStatus === "violation").length;
    const unknown = totalWorkers - compliant - violating;

    const ppeCompliance = (compliant / totalWorkers) * 100;
    const zoneCompliance = Math.max(0, 100 - (breaches.length / totalWorkers) * 100);
    const overall = (ppeCompliance * 0.6 + zoneCompliance * 0.4);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const resolvedToday = await PPEViolationModel.find({
      resolved: true,
      detectedAt: { $gte: oneDayAgo },
    });

    res.json({
      overall: Math.round(overall * 10) / 10,
      ppeCompliance: Math.round(ppeCompliance * 10) / 10,
      zoneCompliance: Math.round(zoneCompliance * 10) / 10,
      activeViolations: violations.length,
      resolvedToday: resolvedToday.length,
      workersByStatus: { compliant, violating, unknown },
    });
  } catch (err) {
    req.log.error({ err }, "Error getting safety score");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-b/ppe-violations", async (req, res) => {
  try {
    const { resolved, cameraId } = req.query;
    const query: Record<string, unknown> = {};
    if (resolved !== undefined) query.resolved = resolved === "true";
    if (cameraId) query.cameraId = cameraId;

    const violations = await PPEViolationModel.find(query).sort({ detectedAt: -1 });
    const result = await Promise.all(
      violations.map(async (v) => {
        const worker = await WorkerModel.findById(v.workerId);
        return {
          ...v.toObject(),
          workerName: worker?.name ?? "Unknown",
          missingItems: v.missingItems as string[],
          detectedAt: v.detectedAt?.toISOString(),
        };
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing PPE violations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-b/zone-breaches", async (req, res) => {
  try {
    const breaches = await ZoneBreachModel.find().sort({ entryTime: -1 });
    const result = await Promise.all(
      breaches.map(async (b) => {
        const worker = await WorkerModel.findById(b.workerId);
        return {
          ...b.toObject(),
          workerName: worker?.name ?? "Unknown",
          entryTime: b.entryTime?.toISOString(),
          exitTime: b.exitTime?.toISOString() ?? null,
        };
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing zone breaches");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-b/cameras", async (req, res) => {
  try {
    const cameras = await CameraModel.find();
    res.json(cameras.map((c) => ({
      ...c.toObject(),
      lastFrame: c.lastFrame?.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing cameras");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-b/danger-zones", async (req, res) => {
  try {
    const zones = await DangerZoneModel.find();
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "Error listing danger zones");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
