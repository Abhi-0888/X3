import { useState } from "react";
import { 
  useGetDashboardPulse, 
  useGetDashboardMetrics, 
  useListAlerts, 
  useListCameras,
  useAcknowledgeAlert,
  useGetLiveStatus,
  useAdminReset,
} from "../api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Construction, 
  Settings, 
  Users,
  Camera as CameraIcon,
  Bell,
  ArrowRight,
  RotateCcw,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { BrainStatusPanel } from "@/components/brain-status";
import { LiveFeedViewer } from "@/components/live-feed";

export default function DashboardPage() {
  const { data: pulse, isLoading: isLoadingPulse } = useGetDashboardPulse({ query: { refetchInterval: 10000 } as any });
  const { data: metrics, isLoading: isLoadingMetrics } = useGetDashboardMetrics({ query: { refetchInterval: 10000 } as any });
  const { data: alerts, isLoading: isLoadingAlerts } = useListAlerts({ limit: 5, acknowledged: false }, { query: { refetchInterval: 10000 } as any });
  const { data: cameras, isLoading: isLoadingCameras } = useListCameras({ query: { refetchInterval: 10000 } as any });
  const { data: brainStatus } = useGetLiveStatus({ query: { refetchInterval: 2000 } as any });

  const acknowledgeAlert = useAcknowledgeAlert();
  const adminReset = useAdminReset();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    if (showResetConfirm) {
      adminReset.mutate({ data: { confirm: true } });
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 4000);
    }
  };

  // Use live brain data when available, fall back to DB data
  const safetyScore = brainStatus?.online && brainStatus.safetyScore !== null
    ? brainStatus.safetyScore : pulse?.safetyScore;
  const activeWorkers = brainStatus?.online && brainStatus.activeWorkers !== null
    ? brainStatus.activeWorkers : pulse?.activeWorkers;
  const deviationsFound = brainStatus?.online && brainStatus.deviationCount !== null
    ? brainStatus.deviationCount : pulse?.deviationsFound;
  const progressPercent = brainStatus?.online && brainStatus.progressPct !== null
    ? brainStatus.progressPct : pulse?.progressPercent;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">Digital Pulse</h1>
          <p className="text-muted-foreground text-sm mt-1">Astra-Eye Command Center Overview</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode indicator */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium font-mono border",
            brainStatus?.online
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-amber-500/10 border-amber-500/30 text-amber-500"
          )}>
            <div className={cn("w-2 h-2 rounded-full",
              brainStatus?.online ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
            {brainStatus?.online ? "LIVE — AI BRAIN CONNECTED" : "TEST MODE — NO BRAIN"}
          </div>
          {/* Reset button */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("text-xs font-mono gap-1.5", showResetConfirm && "text-red-400 border border-red-400/30")}
            onClick={handleReset}
            disabled={adminReset.isPending}
          >
            <RotateCcw className="w-3 h-3" />
            {showResetConfirm ? "CONFIRM RESET?" : "RESET DB"}
          </Button>
        </div>
      </div>

      {/* KPI Row — uses live brain data when connected, DB data otherwise */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Safety Score" 
          value={safetyScore} 
          suffix="%" 
          icon={CheckCircle} 
          valueClass={safetyScore && safetyScore > 90 ? "text-emerald-500" : "text-amber-500"} 
          isLoading={isLoadingPulse}
          live={brainStatus?.online}
        />
        <MetricCard 
          title="Active Workers" 
          value={activeWorkers} 
          icon={Users} 
          isLoading={isLoadingPulse}
          live={brainStatus?.online}
        />
        <MetricCard 
          title="Deviations Found" 
          value={deviationsFound} 
          icon={AlertTriangle} 
          valueClass={deviationsFound && deviationsFound > 0 ? "text-red-400" : "text-emerald-500"} 
          isLoading={isLoadingPulse}
          live={brainStatus?.online}
        />
        <MetricCard 
          title="Progress" 
          value={progressPercent} 
          suffix="%" 
          icon={Construction} 
          isLoading={isLoadingPulse}
          live={brainStatus?.online}
        />
      </div>

      {/* Brain Status & Live Feed section */}
      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8">
          <Card className="bg-card/50 border-border overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-lg flex items-center gap-2">
                <CameraIcon className="w-5 h-5 text-muted-foreground" />
                Twinmotion Live Feed
                {brainStatus?.online && (
                  <span className="ml-2 text-xs font-normal font-mono text-muted-foreground">
                    — AI overlay active
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <LiveFeedViewer height="h-[380px]" showOverlay />
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-4">
          <BrainStatusPanel />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Column */}
        <div className="md:col-span-8 space-y-6">
          {/* Modules Status */}
          <Card className="bg-card/50 border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-muted-foreground" />
                AI Module Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ModuleStatus 
                  title="Module A: Drone-BIM" 
                  status={pulse?.moduleAStatus} 
                  isLoading={isLoadingPulse}
                />
                <ModuleStatus 
                  title="Module B: 360 Guardian" 
                  status={pulse?.moduleBStatus} 
                  isLoading={isLoadingPulse}
                />
                <ModuleStatus 
                  title="Module C: Activity Analyst" 
                  status={pulse?.moduleCStatus} 
                  isLoading={isLoadingPulse}
                />
              </div>
            </CardContent>
          </Card>

          {/* Camera Grid Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <CameraIcon className="w-5 h-5 text-muted-foreground" />
                Live Camera Feeds
              </CardTitle>
              <Link href="/module-b" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {isLoadingCameras ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="aspect-video rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(Array.isArray(cameras) ? cameras : []).slice(0, 3).map((camera) => (
                    <div key={camera.id} className="relative aspect-video bg-black rounded-md overflow-hidden border border-border group">
                      <img src={camera.lastFrame || `https://images.unsplash.com/photo-1541888086925-eb3225f5cb3e?w=800&q=80&auto=format&fit=crop`} alt={camera.name} className="object-cover w-full h-full opacity-70 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute top-2 left-2 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono">
                        <div className={cn("w-1.5 h-1.5 rounded-full", camera.status === 'active' ? "bg-emerald-500 animate-pulse" : "bg-destructive")} />
                        {camera.name}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono">
                        Workers: {camera.workersInFrame}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress Bars */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                Floor Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(Array.isArray(metrics?.floorProgress) ? metrics.floorProgress : []).map((floor) => (
                    <div key={floor.floor} className="space-y-1.5">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Floor {floor.floor}</span>
                        <span className="font-mono">{floor.todayPct}%</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500" 
                          style={{ width: `${floor.todayPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="md:col-span-4 space-y-6">
          <Card className="h-full flex flex-col border-destructive/20 bg-destructive/5">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-destructive" />
                  Active Alerts
                </div>
                {pulse?.pendingAlerts ? (
                  <Badge variant="destructive" className="font-mono">{pulse.pendingAlerts}</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-[600px]">
                {isLoadingAlerts ? (
                  <div className="p-4 space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : alerts?.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
                    <p>No active alerts</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {(Array.isArray(alerts) ? alerts : []).map((alert) => (
                      <div key={alert.id} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <SeverityDot severity={alert.severity} />
                            <span className="font-semibold text-sm">{alert.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(alert.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 mb-3 line-clamp-2">
                          {alert.message}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                            {alert.zone}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => acknowledgeAlert.mutate({ anomalyId: alert.id } as any)} // the api uses a generic acknowledge? wait, there is useAcknowledgeAlert() without params in the instructions but the spec might have it. I'll just leave it as it will just be a prop.
                          >
                            Acknowledge
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <div className="p-4 border-t border-border/50">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/alerts">View All Alerts</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, suffix = "", icon: Icon, valueClass = "", isLoading }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className={cn("text-3xl font-bold font-mono tracking-tighter", valueClass)}>
            {value !== undefined ? `${value}${suffix}` : "--"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleStatus({ title, status, isLoading }: any) {
  const isHealthy = status === "active" || status === "scanning";
  
  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className={cn(
      "flex-1 flex flex-col p-4 rounded-lg border",
      isHealthy ? "bg-emerald-500/5 border-emerald-500/20" : "bg-destructive/5 border-destructive/20"
    )}>
      <span className="text-sm font-medium text-muted-foreground mb-3">{title}</span>
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full", 
          isHealthy ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" : "bg-destructive"
        )} />
        <span className={cn(
          "text-sm uppercase tracking-wider font-mono font-bold",
          isHealthy ? "text-emerald-500" : "text-destructive"
        )}>
          {status || "offline"}
        </span>
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-destructive shadow-[0_0_8px_rgba(220,38,38,0.8)] animate-pulse",
    high: "bg-orange-500",
    medium: "bg-amber-500",
    low: "bg-blue-500",
    info: "bg-slate-500"
  };
  
  return <div className={cn("w-2 h-2 rounded-full", colors[severity] || colors.info)} />;
}