import { Router } from "express";
import { db } from "@workspace/db";
import { alertsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/alerts", async (req, res) => {
  try {
    const { type, acknowledged, limit } = req.query;
    const maxResults = Number(limit ?? 50);

    const conditions = [];
    if (type) conditions.push(eq(alertsTable.type, type as string));
    if (acknowledged !== undefined)
      conditions.push(
        eq(alertsTable.acknowledged, acknowledged === "true")
      );

    const alerts = conditions.length
      ? await db
          .select()
          .from(alertsTable)
          .where(and(...conditions))
          .orderBy(sql`${alertsTable.createdAt} desc`)
          .limit(maxResults)
      : await db
          .select()
          .from(alertsTable)
          .orderBy(sql`${alertsTable.createdAt} desc`)
          .limit(maxResults);

    res.json(
      alerts.map((a) => ({
        ...a,
        createdAt: a.createdAt?.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error listing alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/alerts/:alertId/acknowledge", async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId);
    const [updated] = await db
      .update(alertsTable)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(eq(alertsTable.id, alertId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Alert not found" });

    res.json({
      ...updated,
      createdAt: updated.createdAt?.toISOString(),
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error acknowledging alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
