# Troubleshooting

Common problems and what to do. Most disabled buttons explain themselves:
**hover over a disabled button to see why.**

## Signing in

| You see | Do this |
|---|---|
| *You're not logged into Posda* | Log into Posda in another tab, then click **Reload** |
| *Can't reach Posda* | Same. If it persists after logging in, contact your Posda administrator |

## Cycle

| Problem | Cause and fix |
|---|---|
| No **Start Next Cycle** button | A cycle is already in progress. Look at the banner for what it still needs. A release that's **released** but not yet live is still in progress |
| Assemble / Verify buttons missing, with *No cycle is currently in progress* | Start a cycle from the banner |
| Assemble says *its contents are fixed* | The release is finalized. New drafts belong to the next cycle |
| A recordset shows **Never released** — *won't be in this release without a draft* | Create a draft for it, or accept that it won't ship this time |

## Assemble

| Problem | Cause and fix |
|---|---|
| **Mark Ready** disabled | The draft has no files. Add some with **Manage** |
| **Manage** disabled | The draft is ready. Click **Reopen** first. Any QC review will go stale if files change |
| **Create Draft** missing | The recordset already has an open draft, or no cycle is in progress |

## Verify

| Problem | Cause and fix |
|---|---|
| **Start QC** disabled | Mark the draft ready in Assemble first |
| Tab shows *N stale* | The draft changed after sampling. **Manage** → **Sync** |
| Tab shows *N rejected* | A rejection keeps the review open. Fix the draft (Reopen → change → Mark Ready) and re-review |
| **Split** disabled | The slice has fewer than 2 pending series |
| **Combine** disabled | There's no other unfinished slice to combine into |
| Can't release, reassign, split or combine a slice | It's finished |
| A reviewer's decision won't save in Mirabelle | The series moved to another slice in a split, combine or sync. Reload Mirabelle |
| A new review isn't in anyone's **My QC** | Reviews start unclaimed. Claim or assign the slice, or have a reviewer pick it up from the QC queue |

## Bundle

| Problem | Cause and fix |
|---|---|
| No **Publish** button | The draft hasn't passed QC: it needs one complete review and none open or stale |
| **Finalize** disabled | The release is empty, or contains an unpublished draft. Publish it or **Remove** it |
| Tab shows *N not bundled* (blocked) | A recordset was published after the release was finalized. It will ship in the next cycle |

## Transfer

| Problem | Cause and fix |
|---|---|
| **Queue Transfer** disabled: *Sync this transfer's recordsets first* | The release's contents changed. Click **Sync** |
| *Generate this transfer's manifests first* | IDC: **Manage** → generate the missing manifests |
| Clinical manifest won't generate | Run the WordPress transfer first |
| *Set this transfer's bucket path first* | The dataset has no WordPress page linked. Link it in Setup |
| Warning about files that are *neither DICOM nor Clinical Data* | They can't go to IDC and won't be sent. Check the recordset's destinations |
| Tab shows *N failed* | Click **Queue** to retry the failed files (IDC and WordPress) |
| IDC status *Errored* | Fix the reported problems and re-queue <!-- Q13 --> |
| IDC status unknown | The module couldn't read the IDC bucket's status. Try again later <!-- Q13 --> |
| Recordsets *have no destination configured* | They'll ship nowhere. Add a destination in Setup |

## Disseminate

| Problem | Cause and fix |
|---|---|
| **Publish All & Go Live** disabled | Hover for the reason. Usually a transfer still in flight, IDC not yet **Processed**, or a page not updated |
| **Update Page** disabled: *Generate the manifest first* | Click **Generate** |
| **Update Page** disabled: *The page already has this file* | Nothing to do |
| *Published N, but M failed* | Fix the named pages in WordPress and click again. The release stays **released** until all succeed |
| Recordset shows **Not Linked** | Link its download page in Setup |

## Still stuck

<!-- Q: who to contact; see QUESTIONS.md Q15 -->

## Related

- [Back to contents](README.md)
