# Open questions — manual & training

Gaps the code can't answer. Each one is marked in the text with an HTML comment
(`<!-- Q… -->`), so `grep -rn "Q[0-9]" docs/` finds them. Delete an entry once
it's resolved and the text is updated.

## Environment & logistics

| # | Question | Where |
|---|---|---|
| Q1 | What are the production and training server addresses? How does a trainee get an account? | [00](00-getting-started.md) Before you start; [training README](../training/README.md) |
| Q2 | Which dataset (and which activity timepoint) should training use? Exercises 2 and 3 need specific starting states | All three exercises |
| Q3 | Are the exercise timings realistic (20 min / 1–2 h / 45 min)? | Exercises |
| Q4 | How is the training data reset between sessions? The test-data script `CLAUDE.md` points to (`oneposda/.../manual/create_dataset_module_test_data.sql`) doesn't exist; only the drop script is there | [training README](../training/README.md) |
| Q5 | Is the audience curators who are new to the release process, with QC reviewers as a secondary audience? The tone and depth assume that | Whole manual |

## Process guidance (policy, not UI)

| # | Question | Where |
|---|---|---|
| Q6 | Which destination(s) should each recordset type normally get, and which should be the Default Display? (e.g. radiology → IDC, pathology → Aspera, clinical → IDC + WordPress?) | [05 Setup](05-cycle-setup.md#setting-a-recordsets-destinations) |
| Q8 | When should a curator choose a full vs. partial QC review, and what sample percentage is standard? | [07 Verify](07-cycle-verify.md#starting-qc) |
| Q12 | What does a curator do when a retried transfer fails again? Who do they escalate to? | [09 Transfer](09-cycle-transfer.md#failed-transfers) |
| Q13 | IDC: typical processing time; who to contact on **Errored**; what to do when the status reads *unknown* | [09 Transfer](09-cycle-transfer.md#idc-after-the-upload), [13](13-troubleshooting.md) |
| Q15 | Support contact for "still stuck" | [13 Troubleshooting](13-troubleshooting.md#still-stuck) |

## Features and their current state

| # | Question | Where |
|---|---|---|
| Q11 | Confirm: only IDC and WordPress transfers actually deliver today; NBIA, Aspera and CRDC can be created but not sent (per `notes/*_TRANSFER.md`). Should training hide those destinations, or should the manual say less about them? | [09 Transfer](09-cycle-transfer.md) warning |
| Q14 | `/transfers` and `/recordsets` lists have no navbar link. Is that intended, or should the manual not mention them? | [12 Transfers](12-transfers.md) |

## UI issues found while writing (not manual questions)

Worth a look on the code side. Each one makes a manual step awkward to
write.

| # | Issue |
|---|---|
| Q7 | `/dashboard` and `/dashboard/settings` are unlinked scaffolding (Settings is placeholder text). Remove them, or will they be built out? The manual leaves them out |
| Q17 | The Datasets and Recordsets lists label their filter checkbox with the raw key `active_only`; the Transfers list says **Active only** |
| Q18 | Recordset release diffs (`recordsets/releases/{id}/diff/...`) exist in the API but nothing in the UI uses them, so the outline's "Comparing two releases" section was dropped. Is a diff view planned? |
| Q19 | The transfer status labels on the transfer pages (`draft / queued / submitted / failed`) don't match the statuses the cycle uses (`draft / queued / in_progress / success / failed`). `success` and `in_progress` show raw on those pages |
| Q20 | The test helper **Complete** (yellow) shows on every unfinished slice in the Manage dialog and on the review page. It approves the whole slice without review. Hide it outside dev? (Screenshots were taken with it hidden) |
| Q21 | A slice's **Share** shows unrounded percentages (*53.8462%*) |
| Q22 | The Transfers list search placeholder still says *Dataset name or DOI* |
| Q23 | Viewing an older release after the next cycle has started still shows *No cycle is currently in progress* and **Start Next Cycle** |
| Q24 | Assemble labels v1's drafts *published this cycle* while v2 is the cycle in progress |
| Q25 | With one open review on v2, the Verify tab said *51% reviewed* while the banner said *QC is 0% reviewed* |
| Q26 | While a recordset has an open draft, its page's **Releases** table shows an extra *draft* row with no version and 0 files |
| Q28 | The transfer name on the Transfer stage and a draft's name on the recordset page open in a new tab |
