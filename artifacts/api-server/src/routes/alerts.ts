import { Router } from "express";
import { liveAlerts } from "../lib/brain-state";

const router = Router();

router.get("/alerts", (req, res) => {
  const { type, acknowledged, limit } = req.query;
  const maxResults = Number(limit ?? 50);

  const alerts = liveAlerts.list({
    type: typeof type === "string" ? type : undefined,
    acknowledged: acknowledged !== undefined ? acknowledged === "true" : undefined,
    limit: maxResults,
  });

  res.json(alerts);
});

router.post("/alerts/:alertId/acknowledge", (req, res) => {
  const alertId = parseInt(req.params.alertId);
  const updated = liveAlerts.acknowledge(alertId);

  if (!updated) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.json(updated);
});

export default router;
