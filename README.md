# Astra-Eye Construction Intelligence (AECI)

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0%2B-brightgreen)](https://mongodb.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **AI-Powered Digital Twin for Construction Site Monitoring**

AECI is an intelligent construction monitoring system that combines computer vision, deep learning, and real-time analytics to provide 360° situational awareness for construction sites. It integrates with Twinmotion to analyze live construction feeds and provides actionable insights through a modern React dashboard.

![AECI Dashboard](docs/images/dashboard-preview.png)

---

## 🎯 Project Overview

Astra-Eye Construction Intelligence transforms standard construction site cameras into an intelligent monitoring system using three specialized AI modules:

| Module | Name | Purpose | Technology |
|--------|------|---------|------------|
| **A** | Drone-BIM Navigator | Structural deviation detection & progress tracking | Multi-view prototype DB, ORB/SIFT feature matching, SSIM analysis |
| **B** | 360° Guardian | PPE compliance & safety monitoring | YOLOv8, Region-based color analysis, Danger zone detection |
| **C** | Activity Analyst | Worker efficiency & productivity tracking | MediaPipe Pose, Movement analysis, Idle detection |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TWINMOTION                              │
│              (Live Construction Visualization)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Window Capture
┌─────────────────────────────────────────────────────────────────┐
│                      AECI AI BRAIN (Python)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Module A   │  │   Module B   │  │      Module C       │  │
│  │ Structural  │  │    PPE       │  │   Activity          │  │
│  │ Analysis    │  │  Detection   │  │   Tracking          │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP Ingest API
┌─────────────────────────────────────────────────────────────────┐
│                    API SERVER (Node.js/Express)                 │
│              Port: 8080 | MongoDB Persistence                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Endpoints: /api/ingest/* | /api/live/* | /api/dashboard/*│ │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ REST API / SSE
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD (React/Vite)                     │
│              Port: 23753 | Real-time Data Visualization        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Live Feed   │  │   Alerts     │  │      Metrics        │  │
│  │ Twinmotion  │  │    Panel     │  │      Charts         │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Repository Structure

```
X3/
├── brain/                      # Python AI Pipeline
│   ├── brain.py               # Main brain orchestrator
│   ├── train.py               # Training pipeline for custom models
│   ├── models/                # AI model implementations
│   │   ├── module_a.py        # Structural analysis (Prototype DB)
│   │   ├── module_b.py        # PPE detection (YOLOv8)
│   │   ├── module_c.py        # Activity tracking (MediaPipe)
│   │   └── prototype_db.py    # Multi-view feature database
│   ├── assets/                # Trained models & data
│   │   └── trained/           # YOLO weights, prototype DB
│   └── requirements.txt       # Python dependencies
│
├── artifacts/                  # Application Services
│   ├── api-server/            # Express.js API backend
│   │   ├── src/routes/        # API endpoints
│   │   ├── src/lib/           # Brain state, alerts store
│   │   └── package.json
│   └── aeci-dashboard/        # React/Vite frontend
│       ├── src/pages/         # Dashboard pages
│       ├── src/components/    # UI components
│       └── package.json
│
├── lib/                       # Shared Libraries
│   ├── db/                    # MongoDB schemas & connection
│   ├── api-client-react/      # React query hooks
│   └── api-spec/              # OpenAPI specification
│
├── .env                       # Environment configuration
├── launch-all.ps1            # PowerShell launcher script
└── README.md                  # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Python** 3.10+ with `pip`
- **Node.js** 20+ with `pnpm` (`npm install -g pnpm`)
- **MongoDB** 6.0+ running locally or remotely
- **Twinmotion** (optional, for live feed)

### 1. Clone & Install

```bash
git clone https://github.com/Abhi-0888/X3.git
cd X3

# Install Node.js dependencies
pnpm install

# Install Python dependencies
cd brain
pip install -r requirements.txt
cd ..
```

### 2. Configure Environment

Create `.env` in project root:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/aeci

# API Server
PORT=8080
BASE_PATH=/

# Dashboard
VITE_API_URL=http://localhost:8080

# AI Brain
AECI_MODE=production
AECI_API_URL=http://localhost:8080/api
VIDEO_SOURCE=twinmotion
CAMERA_VIEW=auto
```

### 3. Start All Services

**Option 1: Unified Launcher (Windows PowerShell)**

```powershell
.\launch-all.ps1
```

**Option 2: Manual Start (3 separate terminals)**

```bash
# Terminal 1: API Server
pnpm --filter @workspace/api-server run dev

# Terminal 2: Dashboard
pnpm --filter @workspace/aeci-dashboard run dev

# Terminal 3: AI Brain
cd brain
py brain.py
```

### 4. Access the System

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:23753 |
| API Server | http://localhost:8080 |
| Health Check | http://localhost:8080/api/healthz |
| Live Status | http://localhost:8080/api/live/status |

---

## 🤖 AI Modules Detail

### Module A — Drone-BIM Navigator

**Purpose**: Detect structural deviations and track construction progress against BIM models.

**Technology Stack**:
- Multi-view prototype database (35 camera angles)
- ORB & SIFT feature matching
- SSIM (Structural Similarity Index) for quality assessment
- Histogram comparison for material detection

**Key Features**:
- Compares live Twinmotion feed against "Finished" prototype database
- Detects structural anomalies (walls, columns, beams)
- Calculates construction progress percentage
- Identifies deviation zones for remediation

**Training**:
```bash
cd brain
py train.py
# Creates assets/trained/prototype_database.pkl
```

---

### Module B — 360° Guardian

**Purpose**: Ensure worker safety through PPE compliance monitoring and danger zone detection.

**Technology Stack**:
- YOLOv8 for object detection
- Region-based color analysis for helmet/vest verification
- Polygon-based danger zone breach detection

**Key Features**:
- Real-time PPE detection (helmet, hi-vis vest)
- Custom trained construction PPE model
- Danger zone entry/exit tracking
- Safety score calculation
- Automatic alerts for violations

**Detectable Items**:
- Safety helmets (white, yellow, red, blue)
- High-visibility vests
- Workers in restricted zones

---

### Module C — Activity Analyst

**Purpose**: Monitor worker productivity and identify efficiency bottlenecks.

**Technology Stack**:
- MediaPipe Pose for skeletal tracking
- Movement score calculation
- Idle time detection (>5 minutes)
- Activity timeline generation

**Key Features**:
- Tracks worker activity status (active/idle/break)
- Calculates team efficiency scores
- Identifies top performers and underperformers
- Generates idle alerts for supervisors
- Hour-by-hour productivity analytics

---

## 📊 Dashboard Features

### Digital Pulse (Main Dashboard)
- **Live Twinmotion Feed**: Real-time AI-processed video stream
- **Safety Score**: Overall PPE compliance percentage
- **Active Workers**: Real-time headcount with activity status
- **Deviations Found**: Structural anomalies count
- **Progress %**: Construction completion vs BIM model

### Module Pages
- **Drone-BIM**: Structural analysis details, anomaly list, progress timeline
- **360° Guardian**: PPE violations, zone breaches, camera status
- **Activity Analyst**: Worker efficiency, idle alerts, team performance

### Alert System
- Real-time alert ingestion from all 3 modules
- Severity levels: Critical, High, Medium, Low
- Alert acknowledgment workflow
- Historical alert log

### Audit Reports
- Automated report generation
- Period-based analysis (daily/weekly/monthly)
- Cost impact estimation
- Risk assessment
- Exportable recommendations

---

## 🔧 API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/healthz` | GET | Health check |
| `/api/live/status` | GET | Brain connection status & metrics |
| `/api/live/frame` | GET | Latest processed frame (base64 JPEG) |
| `/api/live/stream` | GET | SSE frame stream |
| `/api/alerts` | GET | List alerts with filtering |
| `/api/alerts/:id/ack` | POST | Acknowledge alert |
| `/api/dashboard/pulse` | GET | Dashboard metrics summary |
| `/api/dashboard/metrics` | GET | Detailed metrics for charts |

### Module Endpoints

| Module | Endpoint | Description |
|--------|----------|-------------|
| A | `/api/module-a/scans` | Drone scan history |
| A | `/api/module-a/anomalies` | Structural anomalies |
| A | `/api/module-a/progress` | Construction progress |
| B | `/api/module-b/safety-score` | Safety metrics |
| B | `/api/module-b/ppe-violations` | PPE violations list |
| B | `/api/module-b/zone-breaches` | Danger zone entries |
| C | `/api/module-c/efficiency` | Team efficiency |
| C | `/api/module-c/workers` | Worker list |
| C | `/api/module-c/idle-alerts` | Idle notifications |

### Ingest Endpoints (Brain → API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest/heartbeat` | POST | Brain state update |
| `/api/ingest/frame` | POST | Processed frame upload |
| `/api/ingest/alert` | POST | Alert generation |

---

## 🛠️ Development

### Building for Production

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Build Dashboard
pnpm --filter @workspace/aeci-dashboard run build
```

### Database Schema

MongoDB collections:
- `alerts` — System alerts from all modules
- `workers` — Worker profiles and status
- `drone_scans` — Module A scan records
- `structural_anomalies` — Detected deviations
- `ppe_violations` — Safety violations
- `zone_breaches` — Danger zone entries
- `idle_alerts` — Productivity alerts
- `audit_reports` — Generated reports
- `cameras` — Camera configurations

### Adding New Features

1. **New AI Module**: Add to `brain/models/`, register in `brain.py`
2. **New API Route**: Add to `artifacts/api-server/src/routes/`
3. **New Dashboard Page**: Add to `artifacts/aeci-dashboard/src/pages/`
4. **New Database Model**: Add to `lib/db/src/schema/aeci.ts`

---

## 📝 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/aeci` | MongoDB connection string |
| `PORT` | `8080` | API server port |
| `BASE_PATH` | `/` | API base path |
| `AECI_MODE` | `production` | Brain mode (dev/production) |
| `AECI_API_URL` | `http://localhost:8080/api` | Brain → API endpoint |
| `VIDEO_SOURCE` | `twinmotion` | Video input (twinmotion/file) |
| `CAMERA_VIEW` | `auto` | Camera perspective |

---

## 🐛 Troubleshooting

### Dashboard shows "NO FEED"
- Verify brain is running: check terminal for "Brain running"
- Check API health: `curl http://localhost:8080/api/healthz`
- Ensure Twinmotion window is visible (not minimized)

### MongoDB Connection Failed
- Verify MongoDB service is running
- Check `MONGODB_URI` in `.env`
- For local dev: `mongod --dbpath /data/db`

### PPE Detection Not Working
- Verify `construction_ppe_yolov8.pt` exists in `brain/assets/trained/`
- Run training: `cd brain && py train.py`
- Check YOLO model loads without errors

### High CPU Usage
- Reduce frame processing rate in `brain/config.py`
- Disable unused modules (press A/B/C to toggle)
- Lower YOLO inference resolution

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **YOLOv8** by Ultralytics for object detection
- **MediaPipe** by Google for pose estimation
- **Twinmotion** by Epic Games for visualization
- **OpenCV** for computer vision operations
- **MongoDB** for flexible data persistence

---

## 📞 Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/Abhi-0888/X3/issues) page.

---

**Built with ❤️ for safer, smarter construction sites.**
