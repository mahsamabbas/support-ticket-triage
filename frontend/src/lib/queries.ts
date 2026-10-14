"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, type TicketFilters } from "./api";
import type { ReviewRequest, Ticket, TicketCreate } from "./types";

export const queryKeys = {
  health: ["health"] as const,
  taxonomy: ["taxonomy"] as const,
  stats: ["stats"] as const,
  tickets: (filters: TicketFilters) => ["tickets", filters] as const,
  ticket: (id: string) => ["ticket", id] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: api.health, refetchInterval: 10_000, retry: false });
}

export function useTaxonomy() {
  return useQuery({ queryKey: queryKeys.taxonomy, queryFn: api.taxonomy, staleTime: Infinity });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.stats });
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => api.tickets(filters),
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: queryKeys.ticket(id ?? ""),
    queryFn: () => api.ticket(id ?? ""),
    enabled: id !== null,
  });
}

export function useTicketCacheSync() {
  const queryClient = useQueryClient();
  return useCallback(
    (ticket: Ticket) => {
      queryClient.setQueryData(queryKeys.ticket(ticket.id), ticket);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
    [queryClient],
  );
}

export function useCreateTicket() {
  const sync = useTicketCacheSync();
  return useMutation({ mutationFn: (payload: TicketCreate) => api.createTicket(payload), onSuccess: sync });
}

export function useReviewTicket() {
  const sync = useTicketCacheSync();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewRequest }) => api.reviewTicket(id, payload),
    onSuccess: sync,
  });
}
