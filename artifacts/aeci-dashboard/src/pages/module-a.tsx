import { useState } from "react";
import { 
  useListDroneScans, 
  useCreateDroneScan, 
  useListAnomalies, 
  useResolveAnomaly,
  useGetConstructionProgress 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plane, AlertTriangle, Play, Map, BarChart3, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "@/hooks/use-toast";

export default function ModuleAPage() {
  const { data: scans, isLoading: isLoadingScans } = useListDroneScans({}, { query: { refetchInterval: 10000 } });
  const { data: anomalies, isLoading: isLoadingAnomalies } = useListAnomalies({ resolved: false }, { query: { refetchInterval: 10000 } });
  const { data: progress, isLoading: isLoadingProgress } = useGetConstructionProgress({ query: { refetchInterval: 10000 } });
  
  const createScan = useCreateDroneScan();
  const resolveAnomaly = useResolveAnomaly();
  const { toast } = useToast();

  const handleStartScan = () => {
    createScan.mutate(
      { data: { droneId: "DRN-001", flightPath: "PATH_AUTO" } },
      {
        onSuccess: () => {
          toast({
            title: "Scan Initiated",
            description: "Drone DRN-001 has been deployed.",
          });
        }
      }
    );
  };

  const handleResolve = (id: number) => {
    resolveAnomaly.mutate(
      { anomalyId: id },
      {
        onSuccess: () => {
          toast({
            title: "Anomaly Resolved",
            description: "The structural anomaly has been marked as resolved.",
          });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">Drone-BIM Navigator</h1>
          <p className="text-muted-foreground text-sm mt-1">Module A: Structural Integrity & Progress</p>
        </div>
        <Button onClick={handleStartScan} disabled={createScan.isPending} className="font-mono">
          <Play className="w-4 h-4 mr-2" />
          TRIGGER SCAN
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Map / Scans View */}
        <div className="md:col-span-8 space-y-6">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border">
              <CardTitle className="text-lg flex items-center gap-2">
                <Map className="w-5 h-5 text-muted-foreground" />
                Site Anomaly Map
              </CardTitle>
              <Badge variant="outline" className="font-mono bg-muted/50">ZONE A-4</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative aspect-[21/9] bg-slate-900 w-full overflow-hidden">
                {/* Placeholder for actual 3D viewer or map */}
                <div className="absolute inset-0 opacity-20" 
                     style={{
                       backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)`,
                       backgroundSize: '20px 20px'
                     }}>
                </div>
                
                {/* Mock Anomaly Hotspots */}
                {anomalies?.slice(0, 3).map((anomaly, i) => (
                  <div 
                    key={anomaly.id} 
                    className="absolute group"
                    style={{
                      left: `${30 + i * 20}%`,
                      top: `${40 + (i % 2 === 0 ? 10 : -10)}%`
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-destructive shadow-[0_0_12px_rgba(220,38,38,0.8)] animate-pulse" />
                    <div className="absolute left-6 top-0 bg-background/90 backdrop-blur border border-border p-2 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity w-48 z-10 pointer-events-none">
                      <p className="font-bold text-destructive mb-1">{anomaly.elementId}</p>
                      <p>{anomaly.deviationDescription}</p>
                    </div>
                  </div>
                ))}
                
                <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs font-mono text-muted-foreground">
                  <span>COORD: 34.0522° N, 118.2437° W</span>
                  <span>ELEVATION: 142.5m</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                Structural Anomalies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Element</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Deviation</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No unresolved anomalies</TableCell>
                    </TableRow>
                  ) : (
                    anomalies?.map(anomaly => (
                      <TableRow key={anomaly.id}>
                        <TableCell className="font-mono font-medium">{anomaly.elementId}</TableCell>
                        <TableCell>{anomaly.zone}</TableCell>
                        <TableCell>
                          <span className="text-destructive font-mono">{anomaly.deviationPct}%</span>
                          <p className="text-xs text-muted-foreground line-clamp-1">{anomaly.deviationDescription}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={anomaly.severity === 'critical' ? 'destructive' : 'secondary'}>
                            {anomaly.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => handleResolve(anomaly.id)}>
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-500" />
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Progress & Scans */}
        <div className="md:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                Overall Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm text-muted-foreground">Site Completion</span>
                  <span className="text-3xl font-bold font-mono">{progress?.overallPct || 0}%</span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${progress?.overallPct || 0}%` }} />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Element Breakdown</h4>
                {progress?.elementBreakdown?.map(el => (
                  <div key={el.type} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="capitalize">{el.type}</span>
                      <span className="font-mono">{el.builtCount} / {el.totalCount}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${el.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plane className="w-5 h-5 text-muted-foreground" />
                Recent Scans
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {scans?.slice(0,5).map(scan => (
                  <div key={scan.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm font-bold">{scan.droneId}</div>
                      <div className="text-xs text-muted-foreground">{new Date(scan.scanTime).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={scan.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                        {scan.status}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">Prog: {scan.progressPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}