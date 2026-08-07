import { useState } from "react";
import WpLinkModal from "@/components/WpLinkModal";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EditIcon, ExternalLinkIcon, LinkIcon } from "@/components/icons";
import {
  useWpMap,
  useWpObject,
  type WpObjectLive,
  type WpObjectTypeOption,
} from "@/lib/wpObjectMap";

type PosdaObjectType = "dataset" | "recordset";

/** Label/variant for a WordPress link pill. Checks `status === "trash"`
 *  rather than the slug -- WP appends "__trashed" to the slug on trash, so
 *  matching that string is brittle compared to reading the real status. */
export function wpBadgeState(
  linked: boolean,
  isError: boolean,
  data: WpObjectLive | undefined,
): { label: string; variant: "success" | "danger" | "warning" | "neutral" } {
  if (!linked) return { label: "Not Linked", variant: "warning" };
  if (isError) return { label: "Broken Link", variant: "danger" };
  if (data?.status === "trash") return { label: "Trashed", variant: "warning" };
  return { label: data?.slug ?? "Linked", variant: "success" };
}

/** Placeholder for the brief window between "linked" and the live slug
 *  arriving -- avoids showing "Linked" and then visibly swapping to the
 *  slug a moment later. */
export function WpBadgeSkeleton() {
  return (
    <span
      className="inline-block h-5 w-20 animate-pulse rounded-full"
      style={{ background: "var(--border-strong)" }}
    />
  );
}

/** The live-slug badge on its own. Its own component so each caller's live
 *  lookup (by the immutable wp_object_id, never cached in wp_object_map) is an
 *  independent query -- notably so Setup can render one per table row without
 *  calling a hook inside a `.map()`. */
export function WpBadge({
  posdaObjectType,
  posdaObjectId,
  linked,
}: {
  posdaObjectType: PosdaObjectType;
  posdaObjectId: number | undefined;
  linked: boolean;
}) {
  const { data, isLoading, isError } = useWpObject(
    posdaObjectType,
    posdaObjectId,
    linked,
  );
  if (linked && isLoading) return <WpBadgeSkeleton />;
  const badge = wpBadgeState(linked, isError, data);
  return (
    <StatusBadge
      status={linked ? "linked" : "not_linked"}
      label={badge.label}
      variant={badge.variant}
    />
  );
}

type WpLinkPillProps = {
  posdaObjectType: PosdaObjectType;
  posdaObjectId: number | undefined;
  typeOptions: WpObjectTypeOption[];
};

/** Compact WordPress link control for a detail page header: state badge plus
 *  link / view / edit icons, owning its own WpLinkModal. Replaces the
 *  full-width "WordPress Object" section the detail pages used to carry. */
export default function WpLinkPill({
  posdaObjectType,
  posdaObjectId,
  typeOptions,
}: WpLinkPillProps) {
  const [showModal, setShowModal] = useState(false);
  const { data: map, isLoading } = useWpMap(posdaObjectType, posdaObjectId);

  return (
    <div className="flex items-center gap-1">
      {isLoading ? (
        <StatusBadge status="loading" label="Loading…" variant="neutral" />
      ) : (
        <WpBadge
          posdaObjectType={posdaObjectType}
          posdaObjectId={posdaObjectId}
          linked={Boolean(map)}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        className="px-2"
        disabled={!posdaObjectId}
        aria-label="Link WordPress Object"
        title={map ? "Change WordPress link" : "Link WordPress Object"}
        onClick={() => setShowModal(true)}
      >
        <LinkIcon />
      </Button>
      {map?.wp_view_url && (
        <ExternalLinkButton
          size="sm"
          variant="ghost"
          className="px-2"
          aria-label="View on WordPress"
          title="View on WordPress"
          href={map.wp_view_url}
        >
          <ExternalLinkIcon />
        </ExternalLinkButton>
      )}
      {map?.wp_edit_url && (
        <ExternalLinkButton
          size="sm"
          variant="ghost"
          className="px-2"
          aria-label="Edit on WordPress"
          title="Edit on WordPress"
          href={map.wp_edit_url}
        >
          <EditIcon />
        </ExternalLinkButton>
      )}

      <WpLinkModal
        open={showModal}
        onClose={() => setShowModal(false)}
        posdaObjectType={posdaObjectType}
        posdaObjectId={posdaObjectId}
        typeOptions={typeOptions}
      />
    </div>
  );
}
