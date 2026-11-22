# Exercise 3 — Pick up and complete QC work

**Goal:** Find QC work, share it with a colleague, and handle a stale review.
**Time:** ~45 minutes <!-- Q: confirm; see manual/QUESTIONS.md Q3 -->
**Manual chapters:** [Verify](../manual/07-cycle-verify.md), [QC queue & reviews](../manual/11-qc.md)

Do this one in pairs.

## Setup

- A training dataset with a cycle in progress and one draft marked **ready**
  with no QC review yet. <!-- Q2 -->
- Both trainees can log in.

## Tasks

1. Trainee A: start a **partial** QC review of the draft at 50%.
2. Trainee A: claim the review's slice, then split it into 2, leaving the new
   slice unclaimed.
3. Trainee B: claim the new slice from the pickup queue.
4. Both: review your slices. Trainee B rejects one series with a reason.
5. Trainee A: reopen the draft in Assemble, remove the rejected series, and mark
   it ready again.
6. Back in Verify: deal with what happened to the review.
7. Finish the review so the publish gate shows **Ready**.

## Check your work

- [ ] Trainee B's dashboard showed the slice under **My QC** after claiming
- [ ] After step 5, the Verify tab showed **stale**
- [ ] After step 6, earlier approvals were kept and the rejected series was gone
- [ ] **Publish Gate** shows **Ready**

## Answer key

<details>
<summary>Show steps</summary>

1. **Verify** → **Start QC** → Type **Partial (sampled)** → Sample percentage
   **50** → **Create Review**. The review starts as one unclaimed slice.
2. Expand the row → **Manage** on the review → **Claim** on the slice →
   **Split** on the same slice → **Split into 2** → leave **New slice 1** as
   **Unclaimed** → **Split**.
3. **QC** in the navbar → **Claim** on the slice.
4. **Review** on your slice (or on its row under **My QC**) → decide each
   series in Mirabelle.
5. **Assemble** → **Reopen** → **Manage** → **Remove** tab → search by the
   series UID → remove it → close → **Mark Ready**.
6. The review is now **stale**. **Verify** → expand → **Manage** → **Sync**.
   The dialog shows 1 removed; confirm with **Sync**. The removed series goes
   with its rejection, and every other decision stays where it was.
7. Review any series still pending. The review completes when every unit is
   approved.

</details>
