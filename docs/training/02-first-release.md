# Exercise 2 — Ship your first release

**Goal:** Take a dataset through all six cycle stages, from a changed recordset to
a live release.
**Time:** ~1–2 hours, depending on IDC processing <!-- Q: confirm; see manual/QUESTIONS.md Q3 -->
**Manual chapters:** [The release cycle](../manual/04-cycle-overview.md) through [Disseminate](../manual/10-cycle-disseminate.md)

> **Warning:** This exercise queues real transfers and publishes WordPress pages.
> Use the training environment only. <!-- Q: see manual/QUESTIONS.md Q1, Q4 -->

## Setup

- A training dataset whose Setup stage is **done**: recordsets with destinations
  and WordPress links. <!-- Q2 -->
- No cycle in progress: the banner shows **Start Next Cycle**.
- An activity timepoint with new files for one of its recordsets. <!-- Q2 -->

## Tasks

1. Check Setup is complete.
2. Start a new cycle.
3. Create a draft for one recordset from the activity timepoint, and mark it
   ready. Leave the other recordsets carrying forward.
4. Run a full QC review of the draft and approve every series.
5. Publish the draft, then finalize the dataset release with a release note.
6. Create, configure and queue the release's transfers. For IDC, set the version
   to Ready once it's uploaded.
7. Update each recordset's download page, then take the release live.

## Check your work

- [ ] The dataset details page's **Releases** table shows the new version as **live**
- [ ] The recordset you changed has a new version; the others don't
- [ ] Every Transfer row shows delivered (IDC: **Processed**)
- [ ] Every Disseminate row shows **Page updated**
- [ ] The banner offers **Start Next Cycle**

## Answer key

<details>
<summary>Show steps</summary>

1. Dataset → **Release Cycle** → **Setup** tab shows **done**.
2. Banner → **Start Next Cycle**. The header now shows `vN (draft)`.
3. **Assemble** → recordset row → **Create Draft** → **From Activity** → search
   for the activity → pick the **Timepoint** → **Create Draft**. When the file
   count looks right, click **Mark Ready**.
4. **Verify** → **Start QC** → Type **Full** → **Create Review**. Expand the row →
   **Review** on your slice → approve every series in Mirabelle. The review
   completes on its own; **Publish Gate** shows **Ready**.
5. **Bundle** → **Publish** on the recordset → **Publish**. Then
   **Finalize Release** → check the summary → add **Release Notes** →
   **Finalize**.
6. **Transfer** → **Create** on each destination row. Queue **WordPress** first
   (**Queue** → **Queue Transfer**). For IDC: **Manage** → **Generate** the
   dataset, imaging and clinical manifests → close → **Queue** →
   **Queue Transfer**. When it shows **success** → **Set to Ready** → confirm.
   Wait for IDC to reach **Processed**.
7. **Disseminate** → for each recordset: **Manage** → **Generate** (for a
   manifest) → **Update Page**. Then **Publish All & Go Live**.

</details>
