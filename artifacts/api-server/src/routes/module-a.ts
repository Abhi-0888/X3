import { Router } from "express";
import {
  DroneScanModel,
  StructuralAnomalyModel,
  DailyProgressModel,
} from "@workspace/db/schema";

const router = Router();

router.get("/module-a/scans", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);

    const scans = await DroneScanModel.find()
      .sort({ scanTime: -1 })
      .skip(offset)
      .limit(limit);

    const scansWithAnomalies = await Promise.all(
      scans.map(async (scan) => {
        const anomalies = await StructuralAnomalyModel.find({ scanId: scan.id });
        return {
          ...scan.toObject(),
          scanTime: scan.scanTime?.toISOString(),
          anomalies: anomalies.map((a) => ({
            ...a.toObject(),
            detectedAt: a.detectedAt?.toISOString(),
            resolvedAt: a.resolvedAt?.toISOString() ?? null,
            worldCoords: { x: a.worldX, y: a.worldY, z: a.worldZ },
          })),
        };
      })
    );

    res.json(scansWithAnomalies);
  } catch (err) {
    req.log.error({ err }, "Error listing drone scans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/module-a/scans", async (req, res) => {
  try {
    const { droneId, flightPath } = req.body;
    const scan = await DroneScanModel.create({
      droneId: droneId ?? "DRONE-001",
      flightPath: flightPath ?? "Grid-Alpha",
      status: "in_progress",
      totalFrames: 0,
      anomalyCount: 0,
      progressPct: 0,
    });

    setTimeout(async () => {
      const totalFrames = Math.floor(Math.random() * 200) + 150;
      const anomalyCount = Math.floor(Math.random() * 4);
      const progressPct = 44 + Math.random() * 10;

      await DroneScanModel.findByIdAndUpdate(scan.id, {
        status: "completed",
        totalFrames,
        anomalyCount,
        progressPct,
      });

      const alertTypes = [
        { elementId: "COL-B12", elementType: "column", deviation: 3.2, desc: "Column B12 misaligned by 3.2°", zone: "Zone-4", severity: "high", x: 12.3, y: 0, z: 8.5 },
        { elementId: "WALL-W7", elementType: "wall", deviation: 5.8, desc: "Wall W7 offset 5.8cm north", zone: "Zone-2", severity: "medium", x: 7.1, y: 0, z: 3.2 },
        { elementId: "BEAM-R3", elementType: "beam", deviation: 8.1, desc: "Beam R3 deflection exceeds tolerance", zone: "Zone-1", severity: "critical", x: 3.5, y: 4.2, z: 1.8 },
      ];

      for (let i = 0; i < anomalyCount; i++) {
        const template = alertTypes[i % alertTypes.length];
        await StructuralAnomalyModel.create({
          scanId: scan.id,
          elementId: template.elementId,
          elementType: template.elementType,
          deviationPct: template.deviation,
          deviationDescription: template.desc,
          zone: template.zone,
          severity: template.severity,
          resolved: false,
          worldX: template.x,
          worldY: template.y,
          worldZ: template.z,
        });
      }
    }, 3000);

    res.status(201).json({
      ...scan.toObject(),
      scanTime: scan.scanTime?.toISOString(),
      anomalies: [],
    });
  } catch (err) {
    req.log.error({ err }, "Error creating drone scan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-a/scans/:scanId", async (req, res) => {
  try {
    const scanId = req.params.scanId;
    const scan = await DroneScanModel.findById(scanId);
    if (!scan) return res.status(404).json({ error: "Scan not found" });

    const anomalies = await StructuralAnomalyModel.find({ scanId: scan.id });
    res.json({
      ...scan.toObject(),
      scanTime: scan.scanTime?.toISOString(),
      anomalies: anomalies.map((a) => ({
        ...a.toObject(),
        detectedAt: a.detectedAt?.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
        worldCoords: { x: a.worldX, y: a.worldY, z: a.worldZ },
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting drone scan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-a/anomalies", async (req, res) => {
  try {
    const { severity, resolved } = req.query;
    const query: Record<string, unknown> = {};
    if (severity) query.severity = severity;
    if (resolved !== undefined) query.resolved = resolved === "true";

    const anomalies = await StructuralAnomalyModel.find(query).sort({ detectedAt: -1 });
    res.json(anomalies.map((a) => ({
      ...a.toObject(),
      detectedAt: a.detectedAt?.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
      worldCoords: { x: a.worldX, y: a.worldY, z: a.worldZ },
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing anomalies");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/module-a/anomalies/:anomalyId/resolve", async (req, res) => {
  try {
    const anomalyId = req.params.anomalyId;
    const updated = await StructuralAnomalyModel.findByIdAndUpdate(
      anomalyId,
      { resolved: true, resolvedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Anomaly not found" });
    res.json({
      ...updated.toObject(),
      detectedAt: updated.detectedAt?.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      worldCoords: { x: updated.worldX, y: updated.worldY, z: updated.worldZ },
    });
  } catch (err) {
    req.log.error({ err }, "Error resolving anomaly");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-a/progress", async (req, res) => {
  try {
    const dailyProgress = await DailyProgressModel.find().sort({ date: 1 });
    const elementBreakdown = [
      { type: "Columns", builtCount: 48, totalCount: 60, pct: 80 },
      { type: "Walls", builtCount: 134, totalCount: 200, pct: 67 },
      { type: "Beams", builtCount: 82, totalCount: 120, pct: 68.3 },
      { type: "Slabs", builtCount: 12, totalCount: 20, pct: 60 },
      { type: "Foundation", builtCount: 1, totalCount: 1, pct: 100 },
    ];
    const latestPct = dailyProgress[dailyProgress.length - 1]?.progressPct ?? 48.5;
    res.json({
      overallPct: latestPct,
      dailyProgress: dailyProgress.map((d) => ({
        date: d.date,
        progressPct: d.progressPct,
        deviations: d.deviations,
      })),
      elementBreakdown,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting construction progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
