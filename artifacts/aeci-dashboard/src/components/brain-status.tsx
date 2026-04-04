import { useGetLiveStatus } from "../api-client";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Brain, Camera, Activity } from "lucide-react";

export function BrainStatusBadge() {
  const { data: status } = useGetLiveStatus({ query: { refetchInterval: 2000 } });
  const online = status?.online ?? false;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium font-mono border",
        online
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-muted/40 border-border text-muted-foreground"
      )}
      title={online ? `Brain connected — ${status?.cameraView ?? "unknown"} view` : "Brain offline — No live data"}
    >
      <div className={cn("w-2 h-2 rounded-full", online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
      {online ? (
        <>
          <Brain className="w-3 h-3" />
          <span>BRAIN LIVE</span>
          {status?.cameraView && (
            <>
              <span className="text-muted-foreground">|</span>
              <Camera className="w-3 h-3" />
              <span className="uppercase">{status.cameraView}</span>
            </>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>BRAIN OFFLINE</span>
        </>
      )}
    </div>
  );
}

export function BrainStatusPanel() {
  const { data: status, isLoading } = useGetLiveStatus({ query: { refetchInterval: 2000 } });
  const online = status?.online ?? false;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", online ? "border-emerald-500/20" : "border-border")}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className={cn("w-4 h-4", online ? "text-emerald-500" : "text-muted-foreground")} />
          <span className="text-sm font-semibold font-mono uppercase tracking-wider">
            AI Brain Connection
          </span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border",
          online
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-muted border-border text-muted-foreground"
        )}>
          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {online ? "CONNECTED" : "OFFLINE"}
        </div>
      </div>

      {online ? (
        <>
          {/* Live metrics from brain */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <LiveMetric label="Safety" value={status?.safetyScore} suffix="%" colorize />
            <LiveMetric label="Efficiency" value={status?.teamEfficiency} suffix="%" colorize />
            <LiveMetric label="Progress" value={status?.progressPct} suffix="%" />
            <LiveMetric label="Deviation" value={status?.deviationPct} suffix="%" invertColor />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <LiveMetric label="Workers" value={status?.activeWorkers} compact />
            <LiveMetric label="Idle" value={status?.idleWorkers} compact invertColor />
            <LiveMetric label="Violations" value={status?.ppeViolations} compact invertColor />
            <LiveMetric label="Deviations" value={status?.deviationCount} compact invertColor />
            <LiveMetric label="Zone Breaches" value={status?.zoneBreaches} compact invertColor />
          </div>

          {/* Module status row */}
          <div className="flex items-center gap-4 pt-1 border-t border-border">
            <span className="text-xs text-muted-foreground font-mono">MODULES</span>
            <ModulePill label="A DRONE-BIM" active={status?.moduleAActive ?? false} />
            <ModulePill label="B GUARDIAN" active={status?.moduleBActive ?? false} />
            <ModulePill label="C ANALYST" active={status?.moduleCActive ?? false} />
            {status?.cameraView && (
              <span className="ml-auto text-xs font-mono text-muted-foreground uppercase flex items-center gap-1">
                <Camera className="w-3 h-3" /> {status.cameraView}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-6 space-y-3">
          <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              No live data — dashboard showing stored data
            </p>
            <p className="text-xs text-muted-foreground/60">
              Run <code className="bg-muted px-1 rounded text-emerald-500">python brain.py</code> locally to connect the Twinmotion feed
            </p>
          </div>
          <div className="text-xs text-left bg-muted/40 rounded-lg p-3 font-mono space-y-1">
            <div className="text-muted-foreground">Quick start:</div>
            <div className="text-emerald-500">cd brain</div>
            <div className="text-emerald-500">cp .env.example .env</div>
            <div className="text-foreground/80"># Set AECI_API_URL in .env</div>
            <div className="text-emerald-500">bash setup.sh && python brain.py</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveMetric({
  label,
  value,
  suffix = "",
  compact = false,
  colorize = false,
  invertColor = false,
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  compact?: boolean;
  colorize?: boolean;
  invertColor?: boolean;
}) {
  const display = value !== null && value !== undefined ? `${Math.round(value)}${suffix}` : "—";

  const colorClass =
    value === null || value === undefined
      ? "text-muted-foreground"
      : colorize
      ? value > 85 ? "text-emerald-500" : value > 70 ? "text-amber-500" : "text-red-400"
      : invertColor
      ? value === 0 ? "text-emerald-500" : value < 3 ? "text-amber-500" : "text-red-400"
      : "text-foreground";

  return (
    <div className="bg-muted/30 rounded-md p-2 text-center">
      <div className={cn(compact ? "text-base font-bold" : "text-lg font-bold", "font-mono", colorClass)}>
        {display}
      </div>
      <div className="text-xs text-muted-foreground truncate">{label}</div>
    </div>
  );
}

function ModulePill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border",
      active
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
        : "bg-muted border-border text-muted-foreground"
    )}>
      <div className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground")} />
      {label}
    </div>
  );
}
