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
2. Trainee A: split the review into 2 unclaimed slices.
3. Trainee B: claim one slice from the pickup queue.
4. Both: review your slices. Trainee B rejects one series with a reason.
5. Trainee A: reopen the draft in Assemble, remove the rejected series, and mark
   it ready again.
6. Back in Verify: deal with what happened to the review.
7. Finish the review so the publish gate shows **Ready**.

## Check your work

- [ ] Trainee B's dashboard showed the slice under **My QC Queue** after claiming
- [ ] After step 5, the Verify tab showed **stale**
- [ ] After step 6, earlier approvals were kept
- [ ] **Publish Gate** shows **Ready**

## Answer key

<details>
<summary>Show steps</summary>

1. **Verify** → **Start QC** → Type **Partial (sampled)** → Sample percentage
   **50** → **Create Review**.
2. Expand the row → **Manage** on the review → **Split** → **Into 2 unclaimed
   slices** → confirm. <!-- Q16: what happens to A's claimed first slice -->

3. **QC** in the navbar → **Claim** on the slice.
4. **Review** on your slice → decide each series in Mirabelle.
5. **Assemble** → **Reopen** → **Manage** → **Remove** tab → search by the
   series UID → remove it → close → **Mark Ready**.
6. The review is now **stale**. **Verify** → expand → **Manage** → **Clone** →
   **Carry forward** → confirm. Earlier decisions are kept, and changed series
   go back to pending.
7. Review any pending series. The new review completes when every unit is
   approved.

</details>
