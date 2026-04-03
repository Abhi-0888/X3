import { Router } from "express";
import { db } from "@workspace/db";
import {
  workersTable,
  ppeViolationsTable,
  zoneBreachesTable,
  camerasTable,
  dangerZonesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/module-b/safety-score", async (req, res) => {
  try {
    const [workers, violations, breaches] = await Promise.all([
      db.select().from(workersTable),
      db
        .select()
        .from(ppeViolationsTable)
        .where(eq(ppeViolationsTable.resolved, false)),
      db
        .select()
        .from(zoneBreachesTable)
        .where(sql`${zoneBreachesTable.exitTime} is null`),
    ]);

    const totalWorkers = workers.length || 1;
    const compliant = workers.filter((w) => w.ppeStatus === "compliant").length;
    const violating = workers.filter((w) => w.ppeStatus === "violation").length;
    const unknown = totalWorkers - compliant - violating;

    const ppeCompliance = (compliant / totalWorkers) * 100;
    const zoneCompliance = Math.max(
      0,
      100 - (breaches.length / totalWorkers) * 100
    );
    const overall = (ppeCompliance * 0.6 + zoneCompliance * 0.4);

    const resolvedToday = await db
      .select()
      .from(ppeViolationsTable)
      .where(
        and(
          eq(ppeViolationsTable.resolved, true),
          sql`${ppeViolationsTable.detectedAt} >= now() - interval '24 hours'`
        )
      );

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

    const conditions = [];
    if (resolved !== undefined)
      conditions.push(eq(ppeViolationsTable.resolved, resolved === "true"));
    if (cameraId)
      conditions.push(eq(ppeViolationsTable.cameraId, cameraId as string));

    const violations = conditions.length
      ? await db
          .select()
          .from(ppeViolationsTable)
          .where(and(...conditions))
          .orderBy(sql`${ppeViolationsTable.detectedAt} desc`)
      : await db
          .select()
          .from(ppeViolationsTable)
          .orderBy(sql`${ppeViolationsTable.detectedAt} desc`);

    const result = await Promise.all(
      violations.map(async (v) => {
        const [worker] = await db
          .select()
          .from(workersTable)
          .where(eq(workersTable.id, v.workerId));
        return {
          ...v,
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
    const breaches = await db
      .select()
      .from(zoneBreachesTable)
      .orderBy(sql`${zoneBreachesTable.entryTime} desc`);

    const result = await Promise.all(
      breaches.map(async (b) => {
        const [worker] = await db
          .select()
          .from(workersTable)
          .where(eq(workersTable.id, b.workerId));
        return {
          ...b,
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
    const cameras = await db.select().from(camerasTable);
    res.json(
      cameras.map((c) => ({
        ...c,
        lastFrame: c.lastFrame?.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error listing cameras");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/module-b/danger-zones", async (req, res) => {
  try {
    const zones = await db.select().from(dangerZonesTable);
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "Error listing danger zones");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
