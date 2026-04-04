import { useState } from "react";
import { useListReports, useGenerateReport, useGetReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Plus, Download, AlertTriangle, TrendingDown, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ReportsPage() {
  const { data: reports, refetch } = useListReports();
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const { data: selectedReport } = useGetReport(selectedReportId || 0, {
    query: { enabled: !!selectedReportId } as any
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    generateReport.mutate(
      { data: { period: "weekly", includeModuleA: true, includeModuleB: true, includeModuleC: true } },
      {
        onSuccess: () => {
          toast({
            title: "Report Generated",
            description: "AI Audit Report has been compiled successfully.",
          });
          refetch();
          setIsGenerating(false);
        },
        onError: () => setIsGenerating(false)
      }
    );
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase font-mono">Audit Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-generated site intelligence narratives</p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating} className="font-mono">
          {isGenerating ? <div className="w-4 h-4 mr-2 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          GENERATE NEW
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(Array.isArray(reports) ? reports : []).map(report => (
          <Card key={report.id} className="flex flex-col hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setSelectedReportId(report.id)}>
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg line-clamp-1">{report.title}</CardTitle>
                <Badge variant={
                  report.riskLevel === 'critical' ? 'destructive' : 
                  report.riskLevel === 'high' ? 'secondary' : 'outline'
                }>
                  {report.riskLevel} risk
                </Badge>
              </div>
              <CardDescription className="font-mono text-xs mt-2">
                {new Date(report.generatedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col">
              <div className="space-y-3 flex-1 text-sm text-muted-foreground line-clamp-3">
                {report.structuralSummary}
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 font-mono text-destructive">
                  <TrendingDown className="w-4 h-4" />
                  Est. Impact: ${report.costImpactEstimate.toLocaleString()}
                </div>
                <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Read Full <FileText className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReportId} onOpenChange={(open) => !open && setSelectedReportId(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-2xl font-bold">{selectedReport?.title}</DialogTitle>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground font-mono">
                  <span>Generated: {selectedReport ? new Date(selectedReport.generatedAt).toLocaleString() : ''}</span>
                  <span>Period: {selectedReport?.period}</span>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </DialogHeader>
          
          {selectedReport && (
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-8">
                {/* Executive Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-2 text-destructive mb-2 font-bold">
                      <AlertTriangle className="w-5 h-5" /> Risk Level
                    </div>
                    <div className="text-2xl font-mono uppercase text-destructive">{selectedReport.riskLevel}</div>
                  </div>
                  <div className="p-4 bg-muted border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-foreground mb-2 font-bold">
                      <TrendingDown className="w-5 h-5" /> Cost Impact
                    </div>
                    <div className="text-2xl font-mono">${selectedReport.costImpactEstimate.toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2 text-primary mb-2 font-bold">
                      <CheckCircle className="w-5 h-5" /> Status
                    </div>
                    <div className="text-2xl font-mono uppercase text-primary">AUDITED</div>
                  </div>
                </div>

                <div className="space-y-6">
                  <section>
                    <h3 className="text-lg font-bold border-b border-border pb-2 mb-3 text-primary">Structural Narrative (Module A)</h3>
                    <p className="text-muted-foreground leading-relaxed">{selectedReport.structuralSummary}</p>
                  </section>

                  <section>
                    <h3 className="text-lg font-bold border-b border-border pb-2 mb-3 text-primary">Safety Narrative (Module B)</h3>
                    <p className="text-muted-foreground leading-relaxed">{selectedReport.safetySummary}</p>
                  </section>

                  <section>
                    <h3 className="text-lg font-bold border-b border-border pb-2 mb-3 text-primary">Efficiency Narrative (Module C)</h3>
                    <p className="text-muted-foreground leading-relaxed">{selectedReport.efficiencySummary}</p>
                  </section>

                  <section className="bg-muted p-6 rounded-lg border border-border">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-warning" />
                      AI Recommendations
                    </h3>
                    <ul className="space-y-3">
                      {(Array.isArray(selectedReport.recommendations) ? selectedReport.recommendations : []).map((rec, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <div className="w-6 h-6 rounded bg-background flex items-center justify-center shrink-0 font-mono text-xs border border-border">{i+1}</div>
                          <span className="mt-0.5">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}