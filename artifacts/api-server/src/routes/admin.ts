/**
 * Admin Routes — database management and mode switching
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  alertsTable,
  ppeViolationsTable,
  zoneBreachesTable,
  idleAlertsTable,
  droneScansTable,
  structuralAnomaliesTable,
  auditReportsTable,
  activityTimelineTable,
  dailyProgressTable,
} from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { liveBrainState } from "../lib/brain-state";

const router: IRouter = Router();

/**
 * POST /api/admin/reset
 * Clears all runtime data (alerts, violations, scans, etc.) for a fresh
 * production session. Does NOT delete workers or camera definitions.
 */
router.post("/admin/reset", async (req, res) => {
  const { confirm } = req.body as { confirm?: boolean };

  if (!confirm) {
    res.status(400).json({ success: false, message: "Send { confirm: true } to confirm reset." });
    return;
  }

  try {
    // Clear all event/alert data tables
    await db.delete(alertsTable);
    await db.delete(ppeViolationsTable);
    await db.delete(zoneBreachesTable);
    await db.delete(idleAlertsTable);
    await db.delete(droneScansTable);
    await db.delete(structuralAnomaliesTable);
    await db.delete(auditReportsTable);
    await db.delete(activityTimelineTable);
    await db.delete(dailyProgressTable);

    // Reset the in-memory brain state
    liveBrainState.reset();

    logger.info("Database reset by admin — all event data cleared");

    res.json({
      success: true,
      message: "Database cleared. System ready for live data. Connect the brain to begin.",
    });
  } catch (err) {
    logger.error({ err }, "Admin reset failed");
    res.status(500).json({ success: false, message: "Reset failed. Check server logs." });
  }
});

export default router;
