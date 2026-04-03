/**
 * Live Routes — serve real-time brain status and frames to the dashboard
 *
 * The React dashboard polls these endpoints to display live Twinmotion feed
 * and real-time AI metrics from the local brain.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { liveBrainState, latestFrame } from "../lib/brain-state";

const router: IRouter = Router();

/**
 * GET /api/live/status
 * Returns the current brain connection status and latest metrics snapshot.
 * Polled by the dashboard every 2 seconds.
 */
router.get("/live/status", (_req, res) => {
  const state = liveBrainState.get();
  res.json(state);
});

/**
 * GET /api/live/frame
 * Returns the latest processed video frame as base64 JPEG.
 * Polled by the dashboard's live feed viewer every 200ms.
 */
router.get("/live/frame", (_req, res) => {
  const frame = latestFrame.get();
  res.json(frame);
});

/**
 * GET /api/live/stream
 * Server-Sent Events endpoint: pushes heartbeat events to all connected
 * dashboard clients whenever the brain sends a new heartbeat.
 */
router.get("/live/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial state immediately
  const initial = liveBrainState.get();
  res.write(`data: ${JSON.stringify(initial)}\n\n`);

  // Register as SSE client
  const clientId = Date.now();
  liveBrainState.addSSEClient(clientId, res);

  // Keepalive ping every 30s (prevents proxy timeout)
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepalive);
    liveBrainState.removeSSEClient(clientId);
  });
});

export default router;
