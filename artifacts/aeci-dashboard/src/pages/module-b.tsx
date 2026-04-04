import { useState } from "react";
import { 
  useListCameras, 
  useListPPEViolations, 
  useListDangerZones, 
  useGetSafetyScore,
  useListZoneBreaches
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Camera, ShieldAlert, ActivitySquare, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function ModuleBPage() {
  const { data: cameras } = useListCameras({ query: { refetchInterval: 10000 } as any });
  const { data: ppeViolations } = useListPPEViolations({ resolved: false }, { query: { refetchInterval: 10000 } as any });
  const { data: dangerZones } = useListDangerZones({ query: { refetchInterval: 10000 } as any });
  const { data: safetyScore } = useGetSafetyScore({ query: { refetchInterval: 10000 } as any });
  const { data: zoneBreaches } = useListZoneBreaches({ query: { refetchInterval: 10000 } as any });

  const pieData = [
    { name: "Compliant", value: safetyScore?.workersByStatus?.compliant || 0, color: "hsl(var(--success))" },
    { name: "Violating", value: safetyScore?.workersByStatus?.violating || 0, color: "hsl(var(--destructive))" },
    { name: "Unknown", value: safetyScore?.workersByStatus?.unknown || 0, color: "hsl(var(--muted-foreground))" },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">360 Guardian</h1>
          <p className="text-muted-foreground text-sm mt-1">Module B: Real-time Safety & PPE Monitoring</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Column */}
        <div className="md:col-span-8 space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="w-5 h-5 text-muted-foreground" />
                Live Camera Feeds
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-muted/20">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {(Array.isArray(cameras) ? cameras : []).map((camera) => (
                  <div key={camera.id} className={cn("relative aspect-video bg-black rounded-md overflow-hidden border", camera.status === 'offline' ? "border-destructive/50" : "border-border")}>
                    {camera.status === 'offline' ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <AlertOctagon className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs font-mono uppercase">Signal Lost</span>
                      </div>
                    ) : (
                      <img src={camera.lastFrame || `https://images.unsplash.com/photo-1541888086925-eb3225f5cb3e?w=800&q=80&auto=format&fit=crop`} alt={camera.name} className="object-cover w-full h-full opacity-60" />
                    )}
                    
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono">
                        <div className={cn("w-1.5 h-1.5 rounded-full", camera.status === 'active' ? "bg-emerald-500 animate-pulse" : "bg-destructive")} />
                        {camera.name}
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                      {camera.angle.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                Active PPE Violations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Missing Items</TableHead>
                    <TableHead>Camera</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Detected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!Array.isArray(ppeViolations) || ppeViolations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No active violations</TableCell>
                    </TableRow>
                  ) : (
                    ppeViolations.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.workerName}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {v.missingItems.map(item => (
                              <Badge key={item} variant="outline" className="text-[10px] capitalize border-destructive text-destructive">{item}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{v.cameraName}</TableCell>
                        <TableCell>
                          <Badge variant={v.severity === 'critical' ? 'destructive' : 'secondary'}>
                            {v.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-mono">
                          {new Date(v.detectedAt).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="md:col-span-4 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ActivitySquare className="w-5 h-5 text-muted-foreground" />
                Safety Score
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="relative h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold font-mono">{safetyScore?.overall || 0}</span>
                  <span className="text-xs text-muted-foreground">SCORE</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full mt-4">
                <div className="bg-muted/50 p-3 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">PPE Comp.</div>
                  <div className="text-xl font-bold font-mono">{safetyScore?.ppeCompliance || 0}%</div>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">Zone Comp.</div>
                  <div className="text-xl font-bold font-mono">{safetyScore?.zoneCompliance || 0}%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-muted-foreground" />
                Danger Zones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(Array.isArray(dangerZones) ? dangerZones : []).map(zone => (
                  <div key={zone.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm">{zone.name}</div>
                      <Badge variant={zone.riskLevel === 'critical' ? 'destructive' : zone.riskLevel === 'high' ? 'secondary' : 'outline'}>
                        {zone.riskLevel}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground capitalize mb-2">{zone.type.replace('_', ' ')}</div>
                    
                    {/* Related Breaches */}
                    {(Array.isArray(zoneBreaches) ? zoneBreaches : []).filter(b => b.zoneId === zone.id && !b.exitTime).length > 0 && (
                      <div className="bg-destructive/10 text-destructive text-xs p-2 rounded mt-2 flex items-center gap-2 border border-destructive/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                        Active breach detected
                      </div>
                    )}
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