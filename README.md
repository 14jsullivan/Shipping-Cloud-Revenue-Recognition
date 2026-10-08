# Shipping Cloud Revenue Integrity

A Fridge app for catching, diagnosing and fixing revenue recognition issues on Shipping Cloud labels, then tracking the fixes.

**Live app:** https://shipping-revenue-integrity.fridge.redo.builders (private; add viewers in Fridge)

## What it shows

| Tab | Purpose |
|---|---|
| **Summary** | The last 60 days only. Totals not collected and collected beyond plan, a few lines on what stands out, then the ten biggest under-billed and over-billed issues. Each issue is one line: **brand, carrier, type of charge, on N shipments, costing $X**, followed by one sentence of **Cause** (backed by label vs carrier-measured weight and box, or the most common product, where they explain it) and one of **Fix**. Each row shows whether it is still happening, the product analyst, fix status, and opens the shipments behind it. |
| **Issues** | Five steps, each narrowing the next. **1 Issues over time**: under- and over-billed by day, month, quarter or year, as a chart or a table (click a period to zoom in). **2 Which carriers**: totals for both directions, or a pivot of carrier by period or by issue type (click a carrier; click its orange or blue bar to pick a direction). The headline then shows what you're diagnosing; it starts on the biggest carrier. **3 What was billed**: the issue types for that carrier, and a bridge of every carrier charge, surcharge, credit and merchant charge that adds up to the total. **4 Where it concentrates**: share of issue dollars against share of labels shipped, by merchant, Redo vs merchant label, weight, package size, zone, service, ship-to state, ship-to ZIP, ship-from and surcharge type, with the three biggest outliers called out. **5 Who owns the fix**: by PA or SE, with their merchants and fix status. Click any line in step 3 to open its shipments (see Drill-down). |
| **Owners** | The same dollars by Shipping Cloud product analyst (PA) or sales engineer (SE), with each owner's merchants and fix status. |
| **Reconcile** | Monthly Report label spread vs the label-level view, by period, with the gap. |
| **Progress** | Open balance over time (one reading per day), age of open issues, and the fix tracker. |

Clicking a merchant opens a detail view with its owners, trend, issue mix with the fix for each type, carrier surcharge reasons, the shipments to fix (tracking numbers, CSV export), and a fix status that is saved for everyone.

Global filters: **Both / Under-billed / Over-billed** (applies to every tab except Reconcile), period (30D, 90D, YTD, 12M, All, or a drilled period), grain, carrier, merchant, origin, destination, issue type, PA, SE.

### Drill-down

Clicking a line in step 3, or "See the shipments" on a Summary row, opens the shipments behind it:

- **What's breaking**, at the top: one sentence of cause and one of fix, in plain words, and the evidence that fits the kind of issue:
  - **Labels the merchant was never charged for** are split by what the carrier invoice says happened to each label: a prepaid **return label not used yet** (the carrier bills return labels only when a customer uses them, so this is not a loss yet), a **return label used but not charged** to the merchant (real loss; the carrier has billed us), a **shipping label never charged**, and orders where the charge went through later.
  - **Size-driven charges** (base rate above the label price, weight and size corrections, packaging, oversize, foreign currency bills): share of bills with a carrier weight or size correction line, share where the measured box is bigger than declared, share where the carrier's scale weight beats the label, and share where the products alone outweigh the label.
  - Weights and boxes are compared the way carriers price them: the label weight is rounded up first (to the next pound, or the next ounce under a pound on USPS and DHL eCommerce; FedEx and UPS always round to the pound), and boxes to whole inches. A 2.3 lb label priced as 3 lb is not "heavier" when the carrier bills 3 lb.
  - **Other carrier charges**: the charges as written on the carrier invoice (e.g. `POSTAGEDELTA AGGREGATED`, `Customs Duty`).
- **By product** and **Shipments** tables with only the columns that matter for that issue (weights and boxes for size issues; the uncharged label, its kind and what the carrier billed for label issues). Both export to CSV.

Totals cover every shipment with that line; patterns, SKUs and the shipment list come from the 5,000 largest.

## Data

All data is queried live from Snowflake through the Fridge runtime (`fridge.snowflake.query`). It is cached in the browser and in the store, and refreshes when the cache is more than 4 hours old or when you click refresh.

| Source | Use |
|---|---|
| `KITCHEN.REVENUE.OMS_LABEL_BILLING_DIAGNOSTICS_CURRENT` | One row per merchant and fulfillment group with unresolved variance. Only `diagnostic_status = 'issue'` counts toward the totals. `within_grace` (still in the billing window) and `needs_review` (source data needs review) are shown separately as "Not yet counted". Dated by `issue_date` (America/Denver). |
| `KITCHEN.REVENUE.OUTBOUND_LABELS_REVENUE_BY_SHIPMENT_CURRENT` | Label-level merchant billing and carrier invoicing, used to classify each issue and for the label view of revenue. |
| `KITCHEN.REVENUE.OUTBOUND_LABEL_REVENUE_ADJUSTMENTS` | Every charge and credit after purchase (step 3 and the merchant view), carrier charge descriptions, and the merchant-record PA and SE. |
| `KITCHEN.PANTRY.INGR_LABEL_INVOICE_DETAIL` | Carrier-billed weight and box per tracking number (drill-down and Summary). |
| `KITCHEN.PANTRY.INGR_STG_ORDER_FULFILLMENT_LINE_ITEMS` | SKUs, product names and item weights, matched on tracking number (about 85% of shipments). This lookup scans about 200 GB (~10s), so it only runs for the drill-down and Summary, never on page load. |
| `KITCHEN.PANTRY.INGR_OUTBOUND_LABELS` | Label attributes for step 4: Redo or merchant label, service, zone, ship-to and ship-from address, and weight and size when the quote lacks them. Joined on shipment ID and tracking code. |
| `KITCHEN.REV_OPS.TEAMS`, `HUBSPOT_COMPANIES`, `HUBSPOT_DEALS` | Owners from HubSpot. |
| `KITCHEN.FINANCE.MONTHLY_REPORT_V2` (fallback `KITCHEN.PANTRY.INGR_MONTHLY_REPORT_V2`) | Monthly Report `OMS Label Spread Revenue`. |
| `KITCHEN.REVENUE.TOTAL_REVENUE_BY_HOUR` | Daily label spread (`product = 'OMS'`, `monetization_type = 'OMS Label Spread'`) for the day-level reconciliation. It sums to the Monthly Report within about $200 a month. |

### Issue types

Each fulfillment group's variance is split into a merchant part (net billed minus expected merchant charge) and a carrier part (everything else: the carrier invoice versus the quote). The larger part in the direction of the variance names the issue.

| Direction | Type | Rule |
|---|---|---|
| Under-billed | Merchant not billed | No merchant charge on a label that had an expected charge |
| Under-billed | Carrier billed above quote | Carrier part is negative and larger than the merchant part |
| Under-billed | Carrier billed extra label | Same as above, but most of it is on labels with no quote (extra piece or voided label) |
| Under-billed | Merchant under-billed | Merchant part is negative and larger |
| Over-billed | Carrier billed below quote | Carrier part is positive and larger |
| Over-billed | Merchant over-billed | Merchant part is positive and larger (often a duplicate charge) |
| Either | Other | Rounding or revenue-share differences |

### What was billed (step 3)

Each line is a group of revenue events from the adjustments table for the selected issues: carrier rate and credits (base rate above or below quote, later re-bills, credits, voided-label charges, currency), carrier surcharges (by charge description: weight or size correction, package type change, address correction and so on), and merchant billing (surcharges re-billed or reversed, duplicate charges, refunds, voided labels). The lines add up to the issue total; anything left over shows as "Not itemized" (about $2K on $258K for USPS under-billing). Lines under 1% of the gross are folded into "Other small items".

### Where it concentrates (step 4)

For each group, the share of issue dollars is set against the share of all labels bought in the same period (at least the last 28 days; carrier and merchant filters apply). "2×" means the group has twice the issue dollars its volume would predict. Each shipment with an issue counts once, using its heaviest label. Over long periods the label count comes from a hash sample of shipments (about 40 days' worth), so shares are estimates. Surcharge type has no fair-share figure because label volume isn't split by surcharge.

### Export shipments (PLD)

**Export shipments** in the filter bar downloads a CSV with one row per shipment that has a billing issue: under-billed, over-billed or both, for the last 7 days, the last 30 days, the last full month or a custom range (by the date the issue was found). It can use the current filters, include products and SKUs (slower, it scans the store line items), and skip shipments under a minimum amount.

Columns: merchant, product analyst, sales engineer, fix status, shipment and tracking numbers, carrier, service, label provider, origin and destination, zone; label weight, the weight as the carrier priced it, the carrier's billed and scale weight, declared and measured box, and whether the carrier corrected size or weight; expected and actual merchant charge, carrier cost and margin, and the amount off plan; the main issue in plain words, carrier charges added after purchase, how much was passed on to the merchant, and **why the rest was not**.

Large exports run in parts of 8,000 shipments (by a hash of the shipment id, four at a time), each returning its rows as one JSON array; the cap is 300,000 shipments per export.

### Passed on to the merchant?

For under-billed shipments the export and the drill-down show whether carrier charges added after purchase were charged to the merchant (`merchant_surcharge_recovery` events, which are the `LABEL_SURCHARGE` balance transactions) and, if not, the first reason that applies:

- **Held: FedEx charge name not recognized.** Redo's surcharge job (`redo/fulfillment/service/src/surcharges`) checks every charge line on a FedEx bill against a list; one unknown name (such as `Weight and Dimension Discrepancy`, `Dimension Discrepancy`, their `Credit -` versions, or `Unitemized Adjustment`) sends the whole shipment to the retry queue and nothing is charged. The names are listed in `FEDEX_UNRECOGNIZED`.
- **Not covered: USPS base rate above the label price.** USPS surcharge billing only passes on USPS weight and size adjustments.
- **Carrier billed twice** (dispute it), **cancelled label**, **return to sender**: not covered by surcharge billing.
- **Arrived in the last 7 days**: may still be billed.

### Summary and the AI notes

The Summary always covers the last 60 days (Denver time), so the period buttons are hidden on that tab; carrier, merchant and other filters still apply. Each issue is assigned to its biggest line in the direction of its variance (the same lines as step 3), then grouped by merchant, carrier and line. Prepaid return labels customers have not used are left out of the ten and shown as one total underneath, since the carrier has not billed them. The ten largest groups are ranked in a few seconds; their weights, boxes and top SKU load next. With no filters, results are cached in the store for 4 hours.

Fridge has no AI model access at runtime yet, so the page cannot write summaries itself. Every row is written in the page from live data in plain language (no codes, symbols or invoice shorthand; the smoke test checks this and the one-line format). The **What stands out** lines and the per-issue cause and fix were written by Claude from the same 60-day queries plus follow-up checks, and saved to the store at `summary/ai.json` (a copy is in this repo, with `"window": 60`). When an issue has a note there (`type`, `cause`, `fix`), it replaces the generated text; `{amount}`, `{shipments}` and `{last30}` are filled with live numbers. Notes only show for issues still in the top 10. To refresh them, ask Claude to rerun the 60-day queries (`node dev/print-sql.mjs top '{"dir":"u","from":<today-59>,"to":<today>}'` in days since 2025-01-01, and `topfacts`) and rewrite `summary/ai.json`.

Merchants with no name in billing ("Unattributed") show as "Unidentified merchant, account ending" and the last six characters of the account ID.

### Owners

- **PA**: HubSpot company `OMS_PRODUCT_ANALYST_FULL_NAME` (via `TEAMS.HUBSPOT_COMPANY_ID`), falling back to the merchant record.
- **SE**: the merchant record's assigned sales engineer, falling back to the SE on the latest closed-won HubSpot Shipping deal (OMS deals first).
- **AE**: HubSpot company OMS owner, falling back to the deal owner.

### Reconciliation

- **Monthly Report**: `OMS Label Spread Revenue`, which includes cross-border spread. Books carrier and billing adjustments on the day they post.
- **Label view**: `current_spread_usd` for every non-internal label, on its purchase date. Every later adjustment is moved back to the purchase date.
- **Gap** = label view minus Monthly Report. It mixes timing differences with real errors. The current month is partial on both sides.

### Progress tracking

The diagnostics view restates: a fixed issue disappears from it. To show progress, the app saves one reading per day of the open totals to the store whenever it loads fresh data. A baseline was seeded on Oct 5, 2026.

## Storage

Fridge shared store `shipping-rev-rec`, which the site can write to:

- `snapshots` collection: one document per day (`YYYY-MM-DD`) with open totals.
- `actions` collection: fix status per merchant id (`open`, `working`, `fixed`), owner, note, who updated it and when.
- `cache/data-v1.json`: the last Snowflake pull, shared so the page opens instantly.
- `cache/top-v3.json`: the last Summary results (60 days, no filters).
- `summary/ai.json`: the AI briefing and notes for the Summary tab.
- `app/index.html`, `assets/fonts.css`: see Deploying.

## Deploying

`index.html` is the whole app: one file with inline CSS and JS, and no build step.

The Fridge site currently serves `deploy/loader.html`, a small page that loads `app/index.html` from the store and renders it. It was set up this way because the build environment couldn't reach Fridge git. To update the app that way, upload `index.html` to the store at `app/index.html`, for example with the `fridge_write_store_file` MCP tool.

To serve the app directly instead, push this repo to the site's Fridge remote. The repo root is a valid static site (`index.html` plus `assets/fonts.css`), and that replaces the loader:

```bash
git remote add fridge https://git.fridge.redo.builders/shipping-revenue-integrity.git
git push fridge HEAD:main
```

Fridge rejects SQL that contains comments or semicolons, so the queries in `index.html` have neither.

## Local development

```bash
cd dev && npm install
node server.mjs            # http://localhost:4321 with a mock Fridge SDK and synthetic data
node smoke.mjs ./shots     # clicks through every tab, the drawer and filters; fails on console errors
node print-sql.mjs cube 0  # prints a generated query to run directly in Snowflake
node print-sql.mjs where '{"dir":"u","car":["USPS"]}'  # step 4 for USPS under-billing
```

`LOADER=1 node smoke.mjs` runs the same test through the loader page.
