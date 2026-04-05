import { useState } from "react";
import { 
  useGetTeamEfficiency, 
  useListWorkers, 
  useListIdleAlerts, 
  useGetActivityTimeline,
  useGetWorker
} from "../api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Users, Timer, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function ModuleCPage() {
  const { data: efficiency } = useGetTeamEfficiency({ query: { refetchInterval: 10000 } as any });
  const { data: workers } = useListWorkers({ query: { refetchInterval: 10000 } as any });
  const { data: timeline } = useGetActivityTimeline({ query: { refetchInterval: 30000 } as any });
  const { data: idleAlerts } = useListIdleAlerts({ query: { refetchInterval: 10000 } as any });

  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  
  // Find selected worker from the workers list
  const selectedWorker = selectedWorkerId ? (Array.isArray(workers) ? workers : []).find((w: any) => w.trackId === selectedWorkerId || w.id === selectedWorkerId) : null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">Activity Analyst</h1>
          <p className="text-muted-foreground text-sm mt-1">Module C: Labor Efficiency & Movement</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-muted-foreground mb-1">Team Efficiency</div>
            <div className="text-3xl font-bold font-mono text-primary">{efficiency?.teamScore || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-muted-foreground mb-1">Active Workers</div>
            <div className="text-3xl font-bold font-mono">{efficiency?.activeWorkers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-muted-foreground mb-1">Idle Workers</div>
            <div className={cn("text-3xl font-bold font-mono", efficiency?.idleWorkers && efficiency.idleWorkers > 0 ? "text-amber-500" : "")}>
              {efficiency?.idleWorkers || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-muted-foreground mb-1">Avg Movement Score</div>
            <div className="text-3xl font-bold font-mono text-info">{efficiency?.avgMovementScore || 0}/100</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Column */}
        <div className="md:col-span-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                Hourly Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.isArray(timeline) ? timeline : []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorIdle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Area type="monotone" dataKey="activeWorkers" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorActive)" />
                    <Area type="monotone" dataKey="idleWorkers" stroke="hsl(var(--warning))" fillOpacity={1} fill="url(#colorIdle)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                Worker Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {(Array.isArray(workers) ? workers : []).map(worker => (
                    <div 
                      key={worker.id || worker.trackId} 
                      className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedWorkerId(worker.trackId || worker.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-mono font-bold border border-border">
                            {(worker.name || `W${worker.trackId || worker.id}`).split(' ').map((n: string)=>n[0]).join('')}
                          </div>
                          <div className={cn(
                            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                            worker.isIdle ? "bg-amber-500" :
                            (worker.status === 'active' || !worker.isIdle) ? "bg-emerald-500" :
                            worker.status === 'break' ? "bg-blue-500" : "bg-slate-500"
                          )} />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{worker.name || `Worker-${String(worker.trackId || worker.id).padStart(3, '0')}`}</div>
                          <div className="text-xs text-muted-foreground">{worker.role || 'Laborer'} • {worker.zone || 'Site'}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-muted-foreground">Efficiency</div>
                          <div className="font-mono text-sm">{worker.efficiencyScore || 0}%</div>
                        </div>
                        <div className="w-24 hidden md:block">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Movement</span>
                            <span>{worker.movementScore || 0}</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-info" style={{ width: `${worker.movementScore || 0}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="md:col-span-4 space-y-6">
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Timer className="w-5 h-5 text-warning" />
                Idle Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {!Array.isArray(idleAlerts) || idleAlerts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No idle workers</div>
                ) : (
                  idleAlerts.map(alert => (
                    <div key={alert.id} className="p-4">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">{alert.workerName}</span>
                        <span className="text-warning font-mono font-bold">{Math.floor(alert.idleDurationSeconds / 60)}m</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Zone: {alert.zone} • {new Date(alert.detectedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(Array.isArray(efficiency?.topPerformers) ? efficiency.topPerformers : []).map(p => (
                  <div key={p.workerId} className="p-3 flex justify-between items-center">
                    <span className="text-sm">{p.workerName}</span>
                    <Badge variant="outline" className="font-mono text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                      {p.efficiencyScore}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Worker Detail Dialog */}
      <Dialog open={!!selectedWorkerId} onOpenChange={(open) => !open && setSelectedWorkerId(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Worker Details</DialogTitle>
          </DialogHeader>
          {selectedWorker && (
            <div className="space-y-6 pt-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center font-mono text-xl font-bold border-2 border-border">
                  {(selectedWorker.name || `W${selectedWorker.trackId || selectedWorker.id}`).split(' ').map((n: string)=>n[0]).join('')}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{selectedWorker.name || `Worker-${String(selectedWorker.trackId || selectedWorker.id).padStart(3, '0')}`}</h3>
                  <p className="text-muted-foreground">{selectedWorker.role || 'Laborer'} • {selectedWorker.zone || 'Site'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted p-3 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={cn("font-bold capitalize mt-1", 
                    !selectedWorker.isIdle ? "text-emerald-500" :
                    selectedWorker.isIdle ? "text-amber-500" : "text-foreground"
                  )}>{selectedWorker.isIdle ? 'idle' : 'active'}</div>
                </div>
                <div className="bg-muted p-3 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">Efficiency</div>
                  <div className="font-bold font-mono text-primary mt-1">{selectedWorker.efficiencyScore || 0}%</div>
                </div>
                <div className="bg-muted p-3 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">PPE Status</div>
                  <div className={cn("font-bold capitalize mt-1",
                    selectedWorker.ppeCompliant ? "text-emerald-500" : "text-destructive"
                  )}>{selectedWorker.ppeCompliant ? 'compliant' : 'violating'}</div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">Activity tracking coming soon...</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}