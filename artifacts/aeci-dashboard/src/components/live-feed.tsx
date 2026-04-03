/**
 * LiveFeedViewer — displays the real-time processed Twinmotion feed
 *
 * The AI brain sends JPEG frames (base64) to /api/ingest/frame every ~3 frames.
 * This component polls /api/live/frame and renders them as a live video stream.
 *
 * When the brain is offline, shows a "Waiting for connection..." placeholder.
 */
import { useState, useEffect, useRef } from "react";
import { useGetLiveFrame, useGetLiveStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Camera, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LiveFeedViewerProps {
  className?: string;
  cameraLabel?: string;
  height?: string;
  showOverlay?: boolean;
}

export function LiveFeedViewer({
  className,
  cameraLabel,
  height = "h-[360px]",
  showOverlay = true,
}: LiveFeedViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(Date.now());

  const { data: status } = useGetLiveStatus({ query: { refetchInterval: 2000 } });
  const { data: frame } = useGetLiveFrame({
    query: {
      refetchInterval: status?.online ? 200 : 5000, // 5fps when live, slow-poll when offline
      refetchIntervalInBackground: true,
    },
  });

  const online = status?.online ?? false;
  const hasFrame = !!frame?.frameB64;
  const view = cameraLabel ?? status?.cameraView ?? "feed";

  // FPS counter
  useEffect(() => {
    if (hasFrame) {
      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsCalcRef.current > 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsCalcRef.current)));
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }
    }
  }, [frame, hasFrame]);

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden bg-black border",
        online ? "border-emerald-500/30" : "border-border",
        expanded ? "fixed inset-4 z-50 h-auto" : height,
        className
      )}
    >
      {/* Live frame */}
      {hasFrame ? (
        <img
          src={`data:image/jpeg;base64,${frame!.frameB64}`}
          alt="Live AI feed"
          className="w-full h-full object-contain"
        />
      ) : (
        <NoFeedPlaceholder online={online} />
      )}

      {/* HUD overlays */}
      {showOverlay && (
        <>
          {/* Top-left: camera label + status */}
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono backdrop-blur-sm",
              online ? "bg-black/60 text-emerald-400" : "bg-black/60 text-muted-foreground"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
              <Camera className="w-3 h-3" />
              <span className="uppercase">{view}</span>
            </div>
            {online && hasFrame && fps > 0 && (
              <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                {fps}fps
              </div>
            )}
          </div>

          {/* Top-right: module indicators */}
          {online && (
            <div className="absolute top-2 right-8 flex items-center gap-1.5">
              <ModuleIndicator label="A" active={status?.moduleAActive ?? false} />
              <ModuleIndicator label="B" active={status?.moduleBActive ?? false} />
              <ModuleIndicator label="C" active={status?.moduleCActive ?? false} />
            </div>
          )}

          {/* Bottom metrics bar */}
          {online && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
              <div className="flex items-center gap-4 text-xs font-mono">
                {status?.safetyScore !== null && status?.safetyScore !== undefined && (
                  <MetricPill
                    label="SAFETY"
                    value={`${Math.round(status.safetyScore)}%`}
                    color={status.safetyScore > 85 ? "text-emerald-400" : status.safetyScore > 70 ? "text-amber-400" : "text-red-400"}
                  />
                )}
                {status?.deviationPct !== null && status?.deviationPct !== undefined && (
                  <MetricPill
                    label="DEV"
                    value={`${status.deviationPct.toFixed(1)}%`}
                    color={status.deviationPct > 5 ? "text-red-400" : "text-emerald-400"}
                  />
                )}
                {status?.teamEfficiency !== null && status?.teamEfficiency !== undefined && (
                  <MetricPill
                    label="EFF"
                    value={`${Math.round(status.teamEfficiency)}%`}
                    color={status.teamEfficiency > 70 ? "text-emerald-400" : "text-amber-400"}
                  />
                )}
                {status?.activeWorkers !== null && status?.activeWorkers !== undefined && (
                  <MetricPill label="WORKERS" value={String(status.activeWorkers)} color="text-foreground/80" />
                )}
                {frame?.timestamp && (
                  <span className="ml-auto text-muted-foreground text-[10px]">
                    {new Date(frame.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Expand/collapse button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 bg-black/40 hover:bg-black/60 text-white"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        </>
      )}
    </div>
  );
}

function NoFeedPlaceholder({ online }: { online: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 text-center p-8">
      {/* Scanline animation */}
      <div className="relative w-24 h-24">
        <div className={cn(
          "absolute inset-0 rounded-full border-2",
          online ? "border-emerald-500/30 animate-ping" : "border-border"
        )} />
        <div className="absolute inset-3 rounded-full border border-border flex items-center justify-center">
          <Camera className="w-8 h-8 text-muted-foreground/40" />
        </div>
      </div>

      {online ? (
        <div className="space-y-1">
          <p className="text-sm font-mono text-emerald-500">BRAIN CONNECTED</p>
          <p className="text-xs text-muted-foreground">Waiting for first frame...</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-mono text-muted-foreground">NO FEED</p>
          <p className="text-xs text-muted-foreground/60">
            Start the AI brain locally to see live Twinmotion feed
          </p>
          <code className="text-xs text-emerald-500/80 block">python brain/brain.py</code>
        </div>
      )}
    </div>
  );
}

function ModuleIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      "w-5 h-5 rounded text-[10px] font-bold font-mono flex items-center justify-center backdrop-blur-sm",
      active ? "bg-emerald-500/80 text-white" : "bg-black/50 text-muted-foreground border border-border"
    )}>
      {label}
    </div>
  );
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={color}>{value}</span>
    </span>
  );
}
