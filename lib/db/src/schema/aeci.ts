/**
 * MongoDB Schemas for AECI
 *
 * All collections use Mongoose schemas with proper TypeScript types.
 */
import mongoose from "mongoose";

// Alert Schema
const alertSchema = new mongoose.Schema({
  type: { type: String, required: true },
  severity: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  zone: { type: String, required: true },
  entityId: { type: Number, default: null },
  acknowledged: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  acknowledgedAt: { type: Date, default: null },
});

export const AlertModel = mongoose.model("Alert", alertSchema);

// Worker Schema
const workerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  zone: { type: String, required: true },
  status: { type: String, default: "active" },
  efficiencyScore: { type: Number, default: 75 },
  movementScore: { type: Number, default: 60 },
  idleMinutes: { type: Number, default: 0 },
  ppeStatus: { type: String, default: "compliant" },
  currentCamera: { type: String, default: "cam_front" },
  joinedAt: { type: Date, default: Date.now },
});

export const WorkerModel = mongoose.model("Worker", workerSchema);

// PPE Violation Schema
const ppeViolationSchema = new mongoose.Schema({
  workerId: { type: Number, required: true },
  cameraId: { type: String, required: true },
  cameraName: { type: String, required: true },
  missingItems: { type: [String], default: [] },
  severity: { type: String, required: true },
  detectedAt: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false },
});

export const PPEViolationModel = mongoose.model("PPEViolation", ppeViolationSchema);

// Zone Breach Schema
const zoneBreachSchema = new mongoose.Schema({
  workerId: { type: Number, required: true },
  zoneId: { type: Number, required: true },
  zoneName: { type: String, required: true },
  cameraId: { type: String, required: true },
  entryTime: { type: Date, default: Date.now },
  exitTime: { type: Date, default: null },
  duration: { type: Number, default: null },
});

export const ZoneBreachModel = mongoose.model("ZoneBreach", zoneBreachSchema);

// Structural Anomaly Schema
const structuralAnomalySchema = new mongoose.Schema({
  scanId: { type: Number, required: true },
  elementId: { type: String, required: true },
  elementType: { type: String, required: true },
  deviationPct: { type: Number, required: true },
  deviationDescription: { type: String, required: true },
  zone: { type: String, required: true },
  severity: { type: String, required: true },
  resolved: { type: Boolean, default: false },
  detectedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  worldX: { type: Number, default: 0 },
  worldY: { type: Number, default: 0 },
  worldZ: { type: Number, default: 0 },
});

export const StructuralAnomalyModel = mongoose.model("StructuralAnomaly", structuralAnomalySchema);

// Drone Scan Schema
const droneScanSchema = new mongoose.Schema({
  droneId: { type: String, required: true },
  status: { type: String, default: "in_progress" },
  flightPath: { type: String, required: true },
  totalFrames: { type: Number, default: 0 },
  anomalyCount: { type: Number, default: 0 },
  progressPct: { type: Number, default: 0 },
  scanTime: { type: Date, default: Date.now },
});

export const DroneScanModel = mongoose.model("DroneScan", droneScanSchema);

// Idle Alert Schema
const idleAlertSchema = new mongoose.Schema({
  workerId: { type: Number, required: true },
  idleDurationSeconds: { type: Number, required: true },
  zone: { type: String, required: true },
  detectedAt: { type: Date, default: Date.now },
  acknowledged: { type: Boolean, default: false },
});

export const IdleAlertModel = mongoose.model("IdleAlert", idleAlertSchema);

// Danger Zone Schema
const dangerZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  riskLevel: { type: String, required: true },
  description: { type: String, required: true },
  active: { type: Boolean, default: true },
});

export const DangerZoneModel = mongoose.model("DangerZone", dangerZoneSchema);

// Camera Schema
const cameraSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  angle: { type: String, required: true },
  status: { type: String, default: "active" },
  location: { type: String, required: true },
  workersInFrame: { type: Number, default: 0 },
  lastFrame: { type: Date, default: Date.now },
});

export const CameraModel = mongoose.model("Camera", cameraSchema);

// Audit Report Schema
const auditReportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },
  period: { type: String, required: true },
  structuralSummary: { type: String, required: true },
  safetySummary: { type: String, required: true },
  efficiencySummary: { type: String, required: true },
  costImpactEstimate: { type: Number, required: true },
  riskLevel: { type: String, required: true },
  recommendations: { type: [String], default: [] },
  fullReport: { type: String, required: true },
});

export const AuditReportModel = mongoose.model("AuditReport", auditReportSchema);

// Daily Progress Schema
const dailyProgressSchema = new mongoose.Schema({
  date: { type: String, required: true },
  progressPct: { type: Number, required: true },
  deviations: { type: Number, default: 0 },
});

export const DailyProgressModel = mongoose.model("DailyProgress", dailyProgressSchema);

// Activity Timeline Schema
const activityTimelineSchema = new mongoose.Schema({
  hour: { type: String, required: true },
  activeWorkers: { type: Number, required: true },
  idleWorkers: { type: Number, required: true },
  avgMovement: { type: Number, required: true },
  tasksCompleted: { type: Number, required: true },
});

export const ActivityTimelineModel = mongoose.model("ActivityTimeline", activityTimelineSchema);

// Export all models
export const models = {
  Alert: AlertModel,
  Worker: WorkerModel,
  PPEViolation: PPEViolationModel,
  ZoneBreach: ZoneBreachModel,
  StructuralAnomaly: StructuralAnomalyModel,
  DroneScan: DroneScanModel,
  IdleAlert: IdleAlertModel,
  DangerZone: DangerZoneModel,
  Camera: CameraModel,
  AuditReport: AuditReportModel,
  DailyProgress: DailyProgressModel,
  ActivityTimeline: ActivityTimelineModel,
};

// Legacy exports for compatibility
export const alertsTable = AlertModel;
export const workersTable = WorkerModel;
export const ppeViolationsTable = PPEViolationModel;
export const zoneBreachesTable = ZoneBreachModel;
export const structuralAnomaliesTable = StructuralAnomalyModel;
export const droneScansTable = DroneScanModel;
export const idleAlertsTable = IdleAlertModel;
export const dangerZonesTable = DangerZoneModel;
export const camerasTable = CameraModel;
export const auditReportsTable = AuditReportModel;
export const dailyProgressTable = DailyProgressModel;
export const activityTimelineTable = ActivityTimelineModel;
