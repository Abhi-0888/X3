# Astra-Eye Construction Intelligence (AECI)

## Overview

AECI is a multi-agent spatial AI construction audit dashboard — a real-time command center for modern construction site management. It provides a "Digital Pulse" by integrating drone-based structural audits, 360° safety monitoring, and pose-based labor analytics.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, Recharts
- **State**: React Query with 10s auto-refetch

## Architecture

Three AI modules feeding a unified dashboard:

- **Module A — Drone-BIM Navigator**: Drone scan management, structural anomaly detection using ORB/SIFT feature matching and pixel-diff deviation maps. Shows anomaly map with world coordinates, element breakdown, daily progress tracking.
- **Module B — 360° Guardian**: 5-camera safety surveillance (Front/Back/Top/Left/Right). PPE violation detection (helmet/vest/gloves/boots/harness), danger zone management, zone breach events.
- **Module C — Activity Analyst**: MediaPipe-based pose tracking for 12+ workers. Movement score calculation, idle detection (>300s threshold), team efficiency scoring, hourly activity timeline.

## Key Pages

- `/` — Digital Pulse dashboard (live KPIs, module status, camera grid, alert feed)
- `/module-a` — Drone-BIM Navigator (anomaly map, scan list, progress charts)
- `/module-b` — 360° Guardian (camera grid, PPE violations, danger zones, safety score)
- `/module-c` — Activity Analyst (team efficiency, worker roster, activity timeline)
- `/alerts` — Alert Log (filterable, acknowledgeable)
- `/reports` — AI Audit Reports (generate and view structured reports)

## API Routes

All routes under `/api` prefix:

- `GET /api/dashboard/pulse` — Digital Pulse KPIs
- `GET /api/dashboard/metrics` — Dashboard metrics + floor progress
- `GET /api/module-a/scans` — Drone scans list
- `POST /api/module-a/scans` — Trigger new scan
- `GET /api/module-a/anomalies` — Structural anomalies
- `POST /api/module-a/anomalies/:id/resolve` — Resolve anomaly
- `GET /api/module-a/progress` — Construction progress data
- `GET /api/module-b/safety-score` — Safety health score
- `GET /api/module-b/ppe-violations` — PPE violations
- `GET /api/module-b/zone-breaches` — Zone breach events
- `GET /api/module-b/cameras` — 5 camera feeds
- `GET /api/module-b/danger-zones` — Danger zones
- `GET /api/module-c/efficiency` — Team efficiency
- `GET /api/module-c/workers` — Workers with status
- `GET /api/module-c/idle-alerts` — Idle worker alerts
- `GET /api/module-c/activity-timeline` — Hourly activity data
- `GET /api/alerts` — System alerts (filterable)
- `POST /api/alerts/:id/acknowledge` — Acknowledge alert
- `GET /api/reports` — Audit reports
- `POST /api/reports` — Generate new AI report
- `GET /api/reports/:id` — Report detail

## Database Tables

- `drone_scans` — Drone flight records
- `structural_anomalies` — BIM deviation detections
- `workers` — Site worker roster with efficiency scores
- `ppe_violations` — PPE compliance events
- `zone_breaches` — Danger zone entry events
- `cameras` — 5 camera configurations
- `danger_zones` — Site hazard zones
- `idle_alerts` — Worker idle detection events
- `alerts` — System-wide alert log
- `audit_reports` — AI-generated audit summaries
- `daily_progress` — Construction progress history
- `activity_timeline` — Hourly labor activity data

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/aeci-dashboard run dev` — run dashboard locally
