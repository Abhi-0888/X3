import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// In-memory stores for serverless
const liveState = {
  online: false,
  lastSeen: null,
  mode: null,
  cameraView: null,
  safetyScore: null,
  deviationPct: null,
  progressPct: null,
  teamEfficiency: null,
  activeWorkers: null,
  idleWorkers: null,
  deviationCount: null,
  ppeViolations: null,
  zoneBreaches: null,
  moduleAActive: false,
  moduleBActive: false,
  moduleCActive: false,
  brainVersion: null,
};

let latestFrame = { frameB64: null, timestamp: null };
const alerts = [];
let alertIdCounter = 1;

// MongoDB connection
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  if (!process.env.DATABASE_URL) {
    console.log("[API] No DATABASE_URL, using in-memory mode");
    return;
  }
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("[API] MongoDB connected");
  } catch (err) {
    console.error("[API] MongoDB error:", err.message);
  }
};

// Health check
app.get("/api/healthz", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Live status
app.get("/api/live/status", (req, res) => {
  res.json(liveState);
});

// Live frame
app.get("/api/live/frame", (req, res) => {
  res.json(latestFrame);
});

// Ingest heartbeat
app.post("/api/ingest/heartbeat", async (req, res) => {
  await connectDB();
  const state = req.body;
  Object.assign(liveState, state, { online: true, lastSeen: new Date().toISOString() });
  res.json({ received: true });
});

// Ingest frame
app.post("/api/ingest/frame", async (req, res) => {
  const { frameB64, timestamp } = req.body;
  latestFrame = { frameB64, timestamp };
  res.json({ received: true });
});

// Ingest alert
app.post("/api/ingest/alert", async (req, res) => {
  await connectDB();
  const alert = {
    id: alertIdCounter++,
    ...req.body,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };
  alerts.unshift(alert);
  if (alerts.length > 100) alerts.pop();
  res.json({ received: true, id: alert.id });
});

// Get alerts
app.get("/api/alerts", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(alerts.slice(0, limit));
});

// Dashboard pulse
app.get("/api/dashboard/pulse", (req, res) => {
  res.json({
    safetyScore: liveState.safetyScore || 0,
    deviationsFound: liveState.deviationCount || 0,
    progressPercent: liveState.progressPct || 0,
    activeWorkers: liveState.activeWorkers || 0,
    idleWorkers: liveState.idleWorkers || 0,
    pendingAlerts: alerts.filter(a => !a.acknowledged).length,
    lastScanTime: liveState.lastSeen,
    moduleAStatus: liveState.moduleAActive ? "active" : "offline",
    moduleBStatus: liveState.moduleBActive ? "active" : "offline",
    moduleCStatus: liveState.moduleCActive ? "active" : "offline",
  });
});

// Acknowledge alert
app.post("/api/alerts/:id/ack", (req, res) => {
  const id = parseInt(req.params.id);
  const alert = alerts.find(a => a.id === id);
  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Alert not found" });
  }
});

// Module A - Scans
app.get("/api/module-a/scans", (req, res) => {
  res.json([]);
});

// Module A - Anomalies
app.get("/api/module-a/anomalies", (req, res) => {
  res.json([]);
});

// Module A - Progress
app.get("/api/module-a/progress", (req, res) => {
  res.json({
    overall: liveState.progressPct || 0,
    daily: [],
    zones: [],
  });
});

// Module B - Safety Score
app.get("/api/module-b/safety-score", (req, res) => {
  res.json({
    overall: liveState.safetyScore || 0,
    ppeCompliance: 0,
    zoneCompliance: 0,
    activeViolations: liveState.ppeViolations || 0,
    resolvedToday: 0,
    workersByStatus: { compliant: 0, violating: 0, unknown: 1 },
  });
});

// Module B - PPE Violations
app.get("/api/module-b/ppe-violations", (req, res) => {
  res.json([]);
});

// Module B - Zone Breaches
app.get("/api/module-b/zone-breaches", (req, res) => {
  res.json([]);
});

// Module C - Efficiency
app.get("/api/module-c/efficiency", (req, res) => {
  res.json({
    teamScore: liveState.teamEfficiency || 0,
    activeWorkers: liveState.activeWorkers || 0,
    idleWorkers: liveState.idleWorkers || 0,
    avgMovementScore: 0,
    topPerformers: [],
    underperformers: [],
  });
});

// Module C - Workers
app.get("/api/module-c/workers", (req, res) => {
  res.json([]);
});

// Admin - Reset
app.post("/api/admin/reset", (req, res) => {
  Object.keys(liveState).forEach(k => liveState[k] = null);
  liveState.online = false;
  latestFrame = { frameB64: null, timestamp: null };
  alerts.length = 0;
  res.json({ success: true, message: "Reset complete" });
});

export default app;
