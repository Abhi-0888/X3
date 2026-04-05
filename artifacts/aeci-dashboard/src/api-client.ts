// Simple API client for Vercel deployment
// Replaces @workspace/api-client-react

import { useQuery } from "@tanstack/react-query";

let _baseUrl: string | null = null;

export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function setAuthTokenGetter(getter: (() => Promise<string | null> | string | null) | null): void {
  // No-op for now - not needed for demo
}

function applyBaseUrl(input: string): string {
  if (!_baseUrl) return input;
  if (!input.startsWith("/")) return input;
  return `${_baseUrl}${input}`;
}

export async function customFetch<T = unknown>(
  input: string,
  options: RequestInit = {}
): Promise<T> {
  const url = applyBaseUrl(input);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

// React Query hooks
export function useGetLiveStatus(options?: { query?: { refetchInterval?: number } }) {
  return useQuery({
    queryKey: ["live-status"],
    queryFn: () => customFetch("/api/live/status"),
    refetchInterval: options?.query?.refetchInterval || 5000,
  });
}

export function useGetLiveFrame(options?: { query?: { refetchInterval?: number } }) {
  return useQuery({
    queryKey: ["live-frame"],
    queryFn: () => customFetch("/api/live/frame"),
    refetchInterval: options?.query?.refetchInterval || 1000,
  });
}

export function useGetAlerts(options?: { query?: { limit?: number } }) {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => customFetch(`/api/alerts?limit=${options?.query?.limit || 50}`),
    refetchInterval: 10000,
  });
}

export function useGetDashboardPulse() {
  return useQuery({
    queryKey: ["dashboard-pulse"],
    queryFn: () => customFetch("/api/dashboard/pulse"),
    refetchInterval: 5000,
  });
}

// Stub hooks for module pages (using live data)
export function useGetDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => customFetch("/api/dashboard/pulse"),
    refetchInterval: 5000,
  });
}

export function useListAlerts(options?: any) {
  return useQuery({
    queryKey: ["alerts", options],
    queryFn: () => customFetch(`/api/alerts?limit=${options?.query?.limit || 50}`),
    refetchInterval: 10000,
  });
}

export function useListCameras(options?: any) {
  return useQuery({
    queryKey: ["cameras"],
    queryFn: () => customFetch("/api/cameras"),
    refetchInterval: options?.query?.refetchInterval || 10000,
  });
}

export function useAcknowledgeAlert() {
  return {
    mutateAsync: async (id: number) => {
      return customFetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
    },
  };
}

export function useAdminReset() {
  return {
    mutateAsync: async () => {
      return customFetch("/api/admin/reset", { method: "POST" });
    },
  };
}

// Module A - Drone-BIM (using real API data)
export function useListDroneScans() {
  return useQuery({ 
    queryKey: ["drone-scans"], 
    queryFn: () => customFetch("/api/module-a/scans"),
    refetchInterval: 10000,
  });
}
export function useCreateDroneScan() {
  return { 
    mutateAsync: async (data: any) => {
      return customFetch("/api/module-a/scans", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data?.data || {})
      });
    } 
  };
}
export function useListAnomalies() {
  return useQuery({ 
    queryKey: ["anomalies"], 
    queryFn: () => customFetch("/api/module-a/anomalies?resolved=false"),
    refetchInterval: 5000,
  });
}
export function useResolveAnomaly() {
  return { 
    mutateAsync: async (id: string) => {
      return customFetch(`/api/module-a/anomalies/${id}/resolve`, { method: "POST" });
    } 
  };
}
export function useGetConstructionProgress() {
  return useQuery({
    queryKey: ["progress"],
    queryFn: () => customFetch("/api/module-a/progress"),
    refetchInterval: 5000,
  });
}

// Module B - 360 Guardian (using real API data)
export function useListPPEViolations() {
  return useQuery({ 
    queryKey: ["ppe-violations"], 
    queryFn: () => customFetch("/api/alerts"),
    refetchInterval: 5000,
  });
}
export function useListDangerZones() {
  return useQuery({ 
    queryKey: ["danger-zones"], 
    queryFn: () => customFetch("/api/live/status"),
    refetchInterval: 10000,
  });
}
export function useGetSafetyScore() {
  return useQuery({
    queryKey: ["safety-score"],
    queryFn: () => customFetch("/api/safety-score"),
    refetchInterval: 5000,
  });
}
export function useListZoneBreaches() {
  return useQuery({ 
    queryKey: ["zone-breaches"], 
    queryFn: () => customFetch("/api/alerts"),
    refetchInterval: 5000,
  });
}

// Module C - Activity Analyst (using real API data)
export function useGetTeamEfficiency() {
  return useQuery({
    queryKey: ["team-efficiency"],
    queryFn: () => customFetch("/api/team-efficiency"),
    refetchInterval: 5000,
  });
}
export function useListWorkers() {
  return useQuery({ 
    queryKey: ["workers"], 
    queryFn: () => customFetch("/api/workers"),
    refetchInterval: 5000,
  });
}
export function useListIdleAlerts() {
  return useQuery({ 
    queryKey: ["idle-alerts"], 
    queryFn: () => customFetch("/api/alerts"),
    refetchInterval: 5000,
  });
}
export function useGetActivityTimeline() {
  return useQuery({ 
    queryKey: ["activity-timeline"], 
    queryFn: () => customFetch("/api/live/status"),
    refetchInterval: 10000,
  });
}
export function useGetWorker() {
  return useQuery({ 
    queryKey: ["worker"], 
    queryFn: () => customFetch("/api/workers"),
  });
}

// Reports stubs
export function useListReports() {
  return useQuery({ queryKey: ["reports"], queryFn: () => Promise.resolve([]) });
}
export function useGenerateReport() {
  return {
    mutateAsync: async () => ({ id: 1 }),
    isPending: false,
  };
}
export function useGetReport() {
  return useQuery({ queryKey: ["report"], queryFn: () => Promise.resolve(null) });
}
