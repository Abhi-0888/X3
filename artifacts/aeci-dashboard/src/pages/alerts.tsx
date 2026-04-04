import { useState } from "react";
import { useListAlerts, useAcknowledgeAlert } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, ShieldAlert, Activity, Construction } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function AlertsPage() {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("UNACKNOWLEDGED");

  const { data: alerts, isLoading } = useListAlerts({ 
    type: typeFilter !== "ALL" ? typeFilter as any : undefined,
    acknowledged: statusFilter === "ALL" ? undefined : statusFilter === "ACKNOWLEDGED",
    limit: 100
  }, { query: { refetchInterval: 10000 } as any });

  const acknowledgeAlert = useAcknowledgeAlert();
  const { toast } = useToast();

  const handleAcknowledge = (id: number) => {
    acknowledgeAlert.mutate(
      { anomalyId: id } as any, // Mocking generic acknowledge
      {
        onSuccess: () => {
          toast({
            title: "Alert Acknowledged",
            description: "The alert has been marked as acknowledged.",
          });
        }
      }
    );
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'DEVIATION': return <Construction className="w-4 h-4" />;
      case 'PPE_VIOLATION': return <ShieldAlert className="w-4 h-4" />;
      case 'ZONE_BREACH': return <AlertTriangle className="w-4 h-4" />;
      case 'IDLE_WORKER': return <Activity className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">Alert Log</h1>
          <p className="text-muted-foreground text-sm mt-1">System-wide critical events and notifications</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="DEVIATION">Structural Deviation</SelectItem>
                <SelectItem value="PPE_VIOLATION">PPE Violation</SelectItem>
                <SelectItem value="ZONE_BREACH">Zone Breach</SelectItem>
                <SelectItem value="IDLE_WORKER">Idle Worker</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="UNACKNOWLEDGED">Unacknowledged</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!Array.isArray(alerts) || alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                    No alerts matching criteria
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => (
                  <TableRow key={alert.id} className={cn(!alert.acknowledged ? "bg-muted/20" : "opacity-70")}>
                    <TableCell>
                      {getIcon(alert.type)}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {new Date(alert.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {alert.type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'secondary' : 'outline'}
                        className={cn(
                          alert.severity === 'critical' && !alert.acknowledged && "animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                        )}
                      >
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="font-medium text-sm truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{alert.zone}</TableCell>
                    <TableCell className="text-right">
                      {!alert.acknowledged ? (
                        <Button size="sm" variant="ghost" onClick={() => handleAcknowledge(alert.id)}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Ack
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <CheckCircle className="w-3 h-3" /> Acknowledged
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}