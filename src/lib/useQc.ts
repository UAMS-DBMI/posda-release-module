import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope, type ListEnvelope } from "@/lib/apiFetch";

const BASE = "/papi/v1/distribution";

export type QcReviewType = "full" | "partial";
export type QcReviewStatus = "open" | "complete" | "cancelled" | "stale";

/** Raw qc_review row (as returned by the detail endpoint). */
export type QcReviewRow = {
  qc_review_id: number;
  recordset_draft_id: number;
  review_type: QcReviewType;
  review_status: QcReviewStatus;
  sample_percentage: number | null;
  sample_seed: number | null;
  review_notes: string | null;
  cloned_from_review_id: number | null;
  when_created: string;
  who_created: number | null;
  when_updated: string;
  who_updated: number | null;
};

/** List row = qc_review row + per-review series counts joined by the list endpoint. */
export type QcReview = QcReviewRow & {
  series_total: number;
  series_pending: number;
  series_approved: number;
  series_rejected: number;
  series_flagged: number;
};

export type QcAssignment = {
  assignment_id: number;
  qc_review_id: number;
  assigned_to: number | null;
  assignment_status: string;
  share_percentage: number | null;
  when_created: string;
  who_created: number | null;
  when_updated: string;
  who_updated: number | null;
  series_total: number;
  series_pending: number;
  series_approved: number;
  series_rejected: number;
  series_flagged: number;
};

export type QcStatusCount = { qc_status: string; count: number };
export type QcModalityCount = { modality: string; qc_status: string; count: number };
export type QcStaleBreakdown = {
  changed: number;
  would_add: number;
  would_drop: number;
};

export type QcReviewDetail = {
  review: QcReviewRow;
  assignments: QcAssignment[];
  series_by_status: QcStatusCount[];
  series_by_modality: QcModalityCount[];
  stale_breakdown: QcStaleBreakdown | null;
};

export type CreateQcReviewBody = {
  review_type: QcReviewType;
  sample_percentage?: number | null;
  sample_seed?: number | null;
  review_notes?: string | null;
};

export type CloneQcReviewBody = {
  mode?: "carry_forward" | "resample";
  review_notes?: string | null;
};

export const qcKeys = {
  reviewsForDraft: (draftId: string | number) =>
    ["qc-reviews", "draft", String(draftId)] as const,
  review: (reviewId: string | number) =>
    ["qc-review", String(reviewId)] as const,
};

// ----------------------------------- reviews -----------------------------------

/** List QC reviews for a recordset draft. */
export function useQcReviews(draftId: string | undefined) {
  return useQuery({
    queryKey: qcKeys.reviewsForDraft(draftId ?? ""),
    enabled: Boolean(draftId),
    queryFn: () =>
      apiFetch<ListEnvelope<QcReview>>(
        `${BASE}/recordsets/drafts/${draftId}/qc-reviews`,
      ),
    select: (env) => env.data,
  });
}

/** Create a QC review (full or partial sample) on a draft. */
export function useCreateQcReview(draftId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateQcReviewBody) =>
      apiFetch<ItemEnvelope<{ review: QcReview }>>(
        `${BASE}/recordsets/drafts/${draftId}/qc-reviews`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      if (draftId) {
        void queryClient.invalidateQueries({
          queryKey: qcKeys.reviewsForDraft(draftId),
        });
      }
    },
  });
}

/** QC review detail (review + assignments + status/modality breakdown + stale). */
export function useQcReview(reviewId: string | undefined) {
  return useQuery({
    queryKey: qcKeys.review(reviewId ?? ""),
    enabled: Boolean(reviewId),
    queryFn: () =>
      apiFetch<ItemEnvelope<QcReviewDetail>>(`${BASE}/qc/reviews/${reviewId}`),
    select: (env) => env.data,
  });
}

/** Update a review's status / notes. */
export function useUpdateQcReview(reviewId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { review_status?: string; review_notes?: string | null }) =>
      apiFetch<ItemEnvelope<QcReviewRow>>(`${BASE}/qc/reviews/${reviewId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qc-review"] });
      void queryClient.invalidateQueries({ queryKey: ["qc-reviews"] });
    },
  });
}

/** Soft-cancel a review. */
export function useCancelQcReview(reviewId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ItemEnvelope<QcReviewRow>>(
        `${BASE}/qc/reviews/${reviewId}/cancel`,
        { method: "PUT" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qc-review"] });
      void queryClient.invalidateQueries({ queryKey: ["qc-reviews"] });
    },
  });
}

/** Clone a review (carry_forward or resample). Returns the new review. */
export function useCloneQcReview(reviewId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CloneQcReviewBody) =>
      apiFetch<ItemEnvelope<{ review: QcReviewRow }>>(
        `${BASE}/qc/reviews/${reviewId}/clone`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qc-reviews"] });
    },
  });
}

// --------------------------------- assignments ---------------------------------

function useReviewInvalidation(reviewId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qcKeys.review(reviewId ?? "") });
    void queryClient.invalidateQueries({ queryKey: ["qc-assignments"] });
  };
}

/** Split / rebalance a review across N slices (by count or by user_ids). */
export function useSplitReview(reviewId: string | undefined) {
  const invalidate = useReviewInvalidation(reviewId);
  return useMutation({
    mutationFn: (body: {
      user_ids?: number[];
      count?: number;
      force?: boolean;
    }) =>
      apiFetch<ListEnvelope<QcAssignment>>(
        `${BASE}/qc/reviews/${reviewId}/split`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: invalidate,
  });
}

/** Claim an unclaimed slice for the current user. */
export function useClaimAssignment(reviewId: string | undefined) {
  const invalidate = useReviewInvalidation(reviewId);
  return useMutation({
    mutationFn: (assignmentId: number) =>
      apiFetch<ItemEnvelope<QcAssignment>>(
        `${BASE}/qc/assignments/${assignmentId}/claim`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

/** Release a slice back to the pickup pool. */
export function useReleaseAssignment(reviewId: string | undefined) {
  const invalidate = useReviewInvalidation(reviewId);
  return useMutation({
    mutationFn: (assignmentId: number) =>
      apiFetch<ItemEnvelope<QcAssignment>>(
        `${BASE}/qc/assignments/${assignmentId}/release`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

/** Reassign a slice to a specific user (PUT assigned_to). */
export function useUpdateAssignment(reviewId: string | undefined) {
  const invalidate = useReviewInvalidation(reviewId);
  return useMutation({
    mutationFn: (vars: { assignmentId: number; assigned_to: number }) =>
      apiFetch<ItemEnvelope<QcAssignment>>(
        `${BASE}/qc/assignments/${vars.assignmentId}`,
        {
          method: "PUT",
          body: JSON.stringify({ assigned_to: vars.assigned_to }),
        },
      ),
    onSuccess: invalidate,
  });
}

// ------------------------------ queue + flags (Phase C) ------------------------------

/** Assignment row with joined review/recordset context (from GET /qc/assignments). */
export type QcQueueAssignment = QcAssignment & {
  review_type: QcReviewType;
  review_status: QcReviewStatus;
  recordset_draft_id: number;
  recordset_id: number;
  recordset_name: string;
};

export type UserFlag = {
  user_flag_id: number;
  object_type: string;
  object_id: number;
  series_instance_uid: string | null;
  flagged_for: number;
  flagged_by: number;
  note: string | null;
  flag_status: string;
  when_created: string;
  when_resolved: string | null;
  who_resolved: number | null;
};

/** Assignment queue: pickup pool (unassigned + needs_qc) or a user's queue. */
export function useAssignmentQueue(params: {
  unassigned?: boolean;
  assignedTo?: number;
  status?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}) {
  const search = new URLSearchParams();
  if (params.unassigned) search.set("unassigned", "true");
  if (params.assignedTo != null) search.set("assigned_to", String(params.assignedTo));
  if (params.status) search.set("status", params.status);
  if (params.page != null) search.set("page", String(params.page));
  if (params.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  return useQuery({
    queryKey: ["qc-assignments", qs],
    enabled: params.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<ListEnvelope<QcQueueAssignment>>(
        `${BASE}/qc/assignments${qs ? `?${qs}` : ""}`,
      ),
  });
}

/** Open flags addressed to the current user (dashboard action items). */
export function useMyFlags(limit?: number) {
  const search = new URLSearchParams({ flagged_for: "me", status: "open" });
  if (limit != null) search.set("limit", String(limit));
  return useQuery({
    queryKey: ["flags", "mine", limit ?? "all"],
    queryFn: () =>
      apiFetch<ListEnvelope<UserFlag>>(`${BASE}/flags?${search.toString()}`),
  });
}

/** Resolve a flag. */
export function useResolveFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (flagId: number) =>
      apiFetch<ItemEnvelope<UserFlag>>(`${BASE}/flags/${flagId}`, {
        method: "PUT",
        body: JSON.stringify({ flag_status: "resolved" }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["flags"] });
    },
  });
}
