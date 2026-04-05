import { Router } from "express";
import {
  DroneScanModel,
  StructuralAnomalyModel,
  DailyProgressModel,
} from "@workspace/db/schema";
import { droneBIMStore, liveBrainState } from "../lib/brain-state";

const router = Router();

// Helper to check if DB is available
async function isDBAvailable(): Promise<boolean> {
  try {
    await DroneScanModel.findOne();
    return true;
  } catch {
    return false;
  }
}

router.get("/module-a/scans", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const useDB = await isDBAvailable();
    
    if (useDB) {
      const scans = await DroneScanModel.find()
        .sort({ scanTime: -1 })
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
    } else {
      // Use in-memory store
      const scans = droneBIMStore.getScans(limit);
      res.json(scans);
    }
  } catch (err) {
    req.log.error({ err }, "Error listing drone scans");
    // Fallback to in-memory
    const scans = droneBIMStore.getScans(Number(req.query.limit ?? 20));
    res.json(scans);
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
    const useDB = await isDBAvailable();
    
    if (useDB) {
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
    } else {
      // In-memory fallback
      const anomalies = droneBIMStore.getAnomalies(resolved === "true");
      // Filter by severity if provided
      let filtered = anomalies;
      if (severity) {
        filtered = anomalies.filter(a => a.severity === severity);
      }
      res.json(filtered.map(a => ({
        ...a,
        worldCoords: { x: a.worldX, y: a.worldY, z: a.worldZ },
      })));
    }
  } catch (err) {
    req.log.error({ err }, "Error listing anomalies");
    // Fallback to in-memory
    const anomalies = droneBIMStore.getAnomalies();
    res.json(anomalies.map(a => ({
      ...a,
      worldCoords: { x: a.worldX, y: a.worldY, z: a.worldZ },
    })));
  }
});

router.post("/module-a/anomalies/:anomalyId/resolve", async (req, res) => {
  try {
    const anomalyId = req.params.anomalyId;
    const useDB = await isDBAvailable();
    
    if (useDB) {
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
    } else {
      // In-memory fallback
      const updated = droneBIMStore.resolveAnomaly(anomalyId);
      if (!updated) return res.status(404).json({ error: "Anomaly not found" });
      res.json({
        ...updated,
        worldCoords: { x: updated.worldX, y: updated.worldY, z: updated.worldZ },
      });
    }
  } catch (err) {
    req.log.error({ err }, "Error resolving anomaly");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-a/progress", async (req, res) => {
  try {
    const useDB = await isDBAvailable();
    const brain = liveBrainState.get();
    
    if (useDB) {
      const dailyProgress = await DailyProgressModel.find().sort({ date: 1 });
      const elementBreakdown = [
        { type: "Columns", builtCount: 48, totalCount: 60, pct: 80 },
        { type: "Walls", builtCount: 134, totalCount: 200, pct: 67 },
        { type: "Beams", builtCount: 82, totalCount: 120, pct: 68.3 },
        { type: "Slabs", builtCount: 12, totalCount: 20, pct: 60 },
        { type: "Foundation", builtCount: 1, totalCount: 1, pct: 100 },
      ];
      // Use brain's progress if available
      const brainProgress = brain.progressPct ?? dailyProgress[dailyProgress.length - 1]?.progressPct ?? 48.5;
      res.json({
        overallPct: brainProgress,
        dailyProgress: dailyProgress.map((d) => ({
          date: d.date,
          progressPct: d.progressPct,
          deviations: d.deviations,
        })),
        elementBreakdown,
      });
    } else {
      // In-memory fallback - use brain state
      const progress = droneBIMStore.getProgress();
      const elementBreakdown = progress.elementBreakdown;
      // Override with brain's real progress
      const overallPct = brain.progressPct ?? progress.overallPct ?? 0;
      res.json({
        overallPct,
        elementBreakdown,
        dailyProgress: [],
      });
    }
  } catch (err) {
    req.log.error({ err }, "Error getting construction progress");
    // Fallback to brain state
    const brain = liveBrainState.get();
    res.json({
      overallPct: brain.progressPct || 0,
      elementBreakdown: [
        { type: "Columns", builtCount: 48, totalCount: 60, pct: 80 },
        { type: "Walls", builtCount: 134, totalCount: 200, pct: 67 },
        { type: "Beams", builtCount: 82, totalCount: 120, pct: 68.3 },
        { type: "Slabs", builtCount: 12, totalCount: 20, pct: 60 },
        { type: "Foundation", builtCount: 1, totalCount: 1, pct: 100 },
      ],
      dailyProgress: [],
    });
  }
});

export default router;
