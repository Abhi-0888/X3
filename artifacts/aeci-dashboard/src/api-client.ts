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
