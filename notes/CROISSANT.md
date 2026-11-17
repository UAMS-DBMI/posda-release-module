# CROISSANT.md — Croissant metadata for a dataset release

Notes for generating a [Croissant](https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html)
JSON-LD document (plus per-recordset CSVs) for each released dataset, so the
TCIA Data Retriever (TDR) and ML tooling can discover and download it. Started
2026-11-12. **Nothing here is built yet. Nothing is decided yet.** The working
assumption is that this happens at the **end of the release cycle, during
Disseminate**.

Related: [CYCLE_WIZARD.md](CYCLE_WIZARD.md) step 7 (Disseminate, retriever
manifests), [CRDC_TRANSFER.md](CRDC_TRANSFER.md) *Download manifests* (the
per-destination retriever formats), [ASPERA_TRANSFER.md](ASPERA_TRANSFER.md)
(TDR skips Aspera rows), [WP_UPDATES.md](WP_UPDATES.md) (download pages, version
DOIs).

Sources (read 2026-11-12):
- `kirbyju/tcia-croissant-odrl`: `docs/implementation-guide.md` (the TCIA
  team's current plan, dated 2026-11-12, which takes precedence over the repo's
  other docs), `docs/recordset-manifest-design.md`, and
  `examples/recordset-manifests/`. The CMB-AML example has three recordsets:
  public DICOM, controlled DRS, and Aspera pathology.
- `TCIA/data-retriever`: `README.md` and `core/app/croissant.go`.

## What TCIA is proposing

The guide assumes **WordPress** generates and hosts the documents. Posda's role
is open (see *Where Posda fits*).

- **One Croissant document per public Collection / Analysis Result.**
- **The target model is external CSV recordsets.** Each WordPress download
  becomes one Croissant `RecordSet`, backed by one CSV `FileObject` in
  `distribution`. Every `Field` names its source CSV and column. The CSV is a
  `FileObject` (one file), not a `FileSet`: a `FileSet` would describe the
  payload files themselves.
- An earlier, simpler format, **download summaries**, describes the WordPress
  download rows and links to existing files and manifests. It is acceptable for
  an early rollout. The two formats are not interchangeable.
- **The CSV merges the manifest with the metadata.** Patient ID, study and
  series descriptions, modality, sizes, and license all become columns. TCIA
  wants to retire the separate WordPress "metadata" attachment once this CSV
  becomes the authoritative inventory.
- **Each CSV has exactly one TDR route column:**

  | Route column | Used for | Posda destination |
  |---|---|---|
  | `SeriesInstanceUID` | public DICOM series | `idc`, `nbia` (TDR resolves through the IDC index and falls back to NBIA) |
  | `imageUrl` | direct public files (e.g. PathDB) | possibly `wp` media? |
  | `drs_uri` | controlled objects | `gc`, `ctdc` |

  Other recordsets, such as an Aspera inventory, keep their native key (for
  example `asset_id`) and a `retrievalRoute` column. TDR does not download them.
- **Constant columns added to every row:** `accessLevel` (`open` /
  `controlled`) and `retrievalRoute`. Controlled rows also get
  `authorizationAuthority` (e.g. `dbGaP phs002192`).
- **Proposed URLs:** `/collection/<slug>/croissant.jsonld`, plus
  `/collection/<slug>/recordsets/<wp-download-id>-<slug>.csv`. Recordset
  identity uses WordPress record IDs, not slugs, so it survives renames.
- **Regenerate whenever any input changes:** a download added, edited, deleted
  or reassigned (a reassignment regenerates both parents), dataset metadata
  changing (title, DOI, version, dates, visibility, access, license), or a
  manifest or inventory changing. Publish the JSON-LD and its CSVs together as
  one consistent version, with matching `sha256` and `contentSize`. If a
  generation fails, keep the last valid version and mark it stale. A withdrawal
  must explicitly remove the documents.
- **The page links to the document** in two places:
  - a `subjectOf` `CreativeWork` on the page's Schema.org `Dataset`;
  - `<link rel="alternate" type='application/ld+json; profile="http://mlcommons.org/croissant/1.1"'>`
    in the page `<head>`.

  Later, DataCite would also link it through `HasMetadata`.
- **Button:** "Download all with TCIA Data Retriever". If TDR can't retrieve
  every recordset (for example the Aspera ones), the label must say so.
- **ODRL / DUO** policy metadata is optional later work. Policy terms must
  **never** be inferred from disease labels or dbGaP accessions, and a manifest
  never grants access.
- **Never publish** credentials, tokens or signed URLs. A DRS URI is fine: it
  identifies an object without granting access.

### Top-level shape (CMB-AML example)

```text
@type sc:Dataset, @id = DOI URL, conformsTo http://mlcommons.org/croissant/1.1
name, alternateName (short title), description, url (landing page),
identifier + citeAs (DOI), license [per-recordset licenses], version,
datePublished, dateModified, isLiveDataset, conditionsOfAccess, usageInfo,
prov:wasGeneratedBy, additionalProperty,
distribution[]  cr:FileObject  {contentUrl, encodingFormat text/csv,
                                contentSize "N B", sha256, license}
recordSet[]     cr:RecordSet   {@id .../recordsets/<id>/records, name,
                                description, key -> route field,
                                conditionsOfAccess, usageInfo, field[]}
field[]         cr:Field       {name, dataType sc:Text|sc:URL|…, description,
                                source {fileObject @id, extract {column}}}
```

`@context` declares `sc`, `cr`, `rai`, `dct`, `prov`, `odrl` and `duo`.

## What TDR actually does (`core/app/croissant.go`, `main`)

- **It accepts `.json` and `.jsonld` input.** A document qualifies if it has a
  `recordSet`, a `distribution`, or `isBasedOn` DataDownloads.
- **External-CSV RecordSets are supported on `main` now.** A RecordSet with no
  inline `data` has its field-source `FileObject`s treated as nested TDR
  manifests, and the CSV is parsed like any spreadsheet manifest. The guide
  says the TDR build it inspected *didn't* do this, so check which **released**
  version does before relying on it.
- **Roles:** `data file` (downloaded directly), `manifest` (expanded, but only
  when its access mechanism contains "Data Retriever"), and `transfer package`
  (skipped with a warning). A row counts as a transfer package if its mechanism
  says Aspera or its URL contains `faspex`. Nested manifests can be `.tcia`,
  `.s5cmd`, `.csv`, `.tsv` or `.xlsx`.
- **Download-summary rows** carry `additionalProperty` names TDR reads:
  `tciaDownloadId`, `tciaDownloadArtifactRole`, `tciaAccessMechanism`,
  `tciaAccessLevel`, `tciaSearchAccessUrl`, `tciaSearchSystem`,
  `tciaDownstreamAccessSystem`, `tciaDownloadRequirements`. Matching ignores
  case and punctuation.
- **Selection:** each component's ID is its RecordSet `@id`, or failing that
  the FileObject ID or download ID. The CLI flags `--croissant-list`,
  `--croissant-include ID`, `--croissant-exclude ID` and
  `--croissant-include-group isBasedOn` select by that ID. **RecordSet `@id`s
  must therefore be stable across regenerations.**
- **`isBasedOn` DataDownloads are opt-in.** They are listed but not selected by
  default. This fits an **analysis result**, whose source collection's images
  appear as optional `isBasedOn` downloads. In Posda that relationship would
  come from `dataset_relation_type`.
- TDR writes `metadata/metadata.csv` under the output directory and
  de-duplicates rows that point at the same URL.
- Controlled downloads use the user's own Gen3/CRDC key (`--auth`). Nothing of
  ours goes in the document.

## Where Posda fits (thinking, not decided)

- **Posda has the authoritative inventory.** The guide notes that "WordPress
  download metadata alone does not supply all payload inventory rows." Posda
  knows every series and file in each `recordset_release`, its DICOM metadata,
  and, after Transfer, the destination identifiers: the IDC/NBIA series UIDs
  and the CRDC DRS IDs (`drs://nci-crdc.datacommons.io/` + the Data Hub
  `fileID`). Posda could at least produce the **recordset CSVs**, even if
  WordPress assembles the JSON-LD.
- **Natural mapping:**
  - `dataset_release` → one Croissant document (`version` = release number,
    `identifier` = DOI);
  - each member `recordset_release` / download page → one `RecordSet` + CSV;
  - the destination flagged for the page → the route column.
- **It is the retriever manifest, enriched.** CYCLE_WIZARD.md step 7 already
  builds a per-`(transfer, recordset_release)` retriever manifest at
  Disseminate (`transfer_recordset.retriever_manifest_file_id`). The Croissant
  CSV is that manifest plus metadata columns plus `accessLevel` /
  `retrievalRoute`, and the Croissant document sits one level up, per dataset
  release.
- **Why Disseminate, not earlier:** DRS URIs exist only after the CRDC
  transfer, and an IDC UID list only resolves once IDC publishes a data release
  containing those series. Disseminate's gate (every transfer `success`) is the
  first point where every route value is real. Bundle could still build a
  **preview** for checking.
- **Regenerating outside the cycle.** TCIA's triggers include edits that
  happen outside a release cycle, such as a title or license change or a
  download reassignment. If Posda only generates at Disseminate, those edits
  need WordPress-side regeneration or a manual "regenerate Croissant" action.

## Open questions

1. **Who generates and hosts it: WordPress or Posda?** If Posda generates, the
   files go to WordPress as media, the same way retriever manifests do today.
   Bring this to Justin and Jeff.
2. **Storage in Posda.** Is it a file on the `dataset_release` (a new
   `croissant_file_id`?) and per-recordset CSVs on `transfer_recordset`? Either
   is a **schema change**, so it needs a dated migration.
3. **Mixed-destination recordsets.** One CSV can hold only one route column. A
   recordset split across destinations, such as DICOM to IDC and pathology to
   Aspera, becomes two RecordSets. Does a WordPress download map 1:1 to a
   recordset release, or not always?
4. **Which columns belong in the stable TCIA profile?** TCIA itself lists this
   as a review question. Wait for TCIA's answer before choosing columns.
5. **Checksums.** Croissant uses `sha256`, while Posda's file digests are MD5.
   That's fine for the CSV FileObjects, since we compute them at generation
   time. Payload files aren't modeled as FileSets yet.
6. **Faspex links.** TCIA's own CMB-AML example puts the Faspex public-link
   `context` (which includes the passcode) in `transferHandoffUrl`. Public
   package links are public by design (ASPERA_TRANSFER.md), but this sits
   uneasily with "no tokens". Confirm it with TCIA.
7. **Version DOIs.** Justin wants a DOI per dataset version (WP_UPDATES.md). If
   each version gets one, is each Croissant document keyed to the version DOI,
   and does the stable `/croissant.jsonld` always describe the latest version?
8. **Validation.** The guide uses `mlcroissant` (Python). Adding it to oneposda
   would be a **new dependency, so ask first**. An alternative is to validate
   only on the TCIA side.
9. **Which TDR release** first supports external-CSV recordsets, and does it
   pass RecordSet selection from a WordPress button?
