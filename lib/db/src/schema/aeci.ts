import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const droneScansTable = pgTable("drone_scans", {
  id: serial("id").primaryKey(),
  droneId: text("drone_id").notNull(),
  status: text("status").notNull().default("in_progress"),
  flightPath: text("flight_path").notNull(),
  totalFrames: integer("total_frames").notNull().default(0),
  anomalyCount: integer("anomaly_count").notNull().default(0),
  progressPct: real("progress_pct").notNull().default(0),
  scanTime: timestamp("scan_time").defaultNow(),
});

export const insertDroneScanSchema = createInsertSchema(droneScansTable).omit({
  id: true,
  scanTime: true,
});
export type InsertDroneScan = z.infer<typeof insertDroneScanSchema>;
export type DroneScan = typeof droneScansTable.$inferSelect;

export const structuralAnomaliesTable = pgTable("structural_anomalies", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id")
    .notNull()
    .references(() => droneScansTable.id),
  elementId: text("element_id").notNull(),
  elementType: text("element_type").notNull(),
  deviationPct: real("deviation_pct").notNull(),
  deviationDescription: text("deviation_description").notNull(),
  zone: text("zone").notNull(),
  severity: text("severity").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  worldX: real("world_x").notNull().default(0),
  worldY: real("world_y").notNull().default(0),
  worldZ: real("world_z").notNull().default(0),
});

export const insertAnomalySchema = createInsertSchema(
  structuralAnomaliesTable
).omit({ id: true, detectedAt: true });
export type InsertAnomaly = z.infer<typeof insertAnomalySchema>;
export type StructuralAnomaly = typeof structuralAnomaliesTable.$inferSelect;

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  zone: text("zone").notNull(),
  status: text("status").notNull().default("active"),
  efficiencyScore: real("efficiency_score").notNull().default(75),
  movementScore: real("movement_score").notNull().default(60),
  idleMinutes: integer("idle_minutes").notNull().default(0),
  ppeStatus: text("ppe_status").notNull().default("compliant"),
  currentCamera: text("current_camera").notNull().default("cam_front"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({
  id: true,
  joinedAt: true,
});
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;

export const ppeViolationsTable = pgTable("ppe_violations", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id),
  cameraId: text("camera_id").notNull(),
  cameraName: text("camera_name").notNull(),
  missingItems: jsonb("missing_items").notNull().default([]),
  severity: text("severity").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const insertPPEViolationSchema = createInsertSchema(
  ppeViolationsTable
).omit({ id: true, detectedAt: true });
export type InsertPPEViolation = z.infer<typeof insertPPEViolationSchema>;
export type PPEViolation = typeof ppeViolationsTable.$inferSelect;

export const zoneBreachesTable = pgTable("zone_breaches", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id),
  zoneId: integer("zone_id").notNull(),
  zoneName: text("zone_name").notNull(),
  cameraId: text("camera_id").notNull(),
  entryTime: timestamp("entry_time").defaultNow(),
  exitTime: timestamp("exit_time"),
  duration: integer("duration"),
});

export const insertZoneBreachSchema = createInsertSchema(
  zoneBreachesTable
).omit({ id: true });
export type InsertZoneBreach = z.infer<typeof insertZoneBreachSchema>;
export type ZoneBreach = typeof zoneBreachesTable.$inferSelect;

export const dangerZonesTable = pgTable("danger_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  riskLevel: text("risk_level").notNull(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
});

export const camerasTable = pgTable("cameras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  angle: text("angle").notNull(),
  status: text("status").notNull().default("active"),
  location: text("location").notNull(),
  workersInFrame: integer("workers_in_frame").notNull().default(0),
  lastFrame: timestamp("last_frame").defaultNow(),
});

export const idleAlertsTable = pgTable("idle_alerts", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id),
  idleDurationSeconds: integer("idle_duration_seconds").notNull(),
  zone: text("zone").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
});

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  zone: text("zone").notNull(),
  entityId: integer("entity_id"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

export const auditReportsTable = pgTable("audit_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
  period: text("period").notNull(),
  structuralSummary: text("structural_summary").notNull(),
  safetySummary: text("safety_summary").notNull(),
  efficiencySummary: text("efficiency_summary").notNull(),
  costImpactEstimate: real("cost_impact_estimate").notNull(),
  riskLevel: text("risk_level").notNull(),
  recommendations: jsonb("recommendations").notNull().default([]),
  fullReport: text("full_report").notNull(),
});

export const insertReportSchema = createInsertSchema(auditReportsTable).omit({
  id: true,
  generatedAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type AuditReport = typeof auditReportsTable.$inferSelect;

export const dailyProgressTable = pgTable("daily_progress", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  progressPct: real("progress_pct").notNull(),
  deviations: integer("deviations").notNull().default(0),
});

export const activityTimelineTable = pgTable("activity_timeline", {
  id: serial("id").primaryKey(),
  hour: text("hour").notNull(),
  activeWorkers: integer("active_workers").notNull(),
  idleWorkers: integer("idle_workers").notNull(),
  avgMovement: real("avg_movement").notNull(),
  tasksCompleted: integer("tasks_completed").notNull(),
});
