# Shipping Cloud Revenue Integrity

A Fridge app for catching, diagnosing and fixing revenue recognition issues on Shipping Cloud labels, then tracking the fixes.

**Live app:** https://shipping-revenue-integrity.fridge.redo.builders (private; add viewers in Fridge)

## What it shows

| Tab | Purpose |
|---|---|
| **Issues** | A guided path: the **biggest issue** (headline), an **issue type × carrier grid** (click any cell, carrier or issue), the **merchants affected**, the carrier surcharges behind it, and **who owns the fix** by PA or SE with each rep's fix status. Click the Under-billed or Over-billed tile to switch direction. Below that: issues over time (day, month, quarter, year; click a bar to zoom in) and a breakdown by origin, destination and the other dimensions. |
| **Owners** | The same dollars by Shipping Cloud product analyst (PA) or sales engineer (SE), with each owner's merchants and fix status. |
| **Reconcile** | Monthly Report label spread vs the label-level view, by period, with the gap. |
| **Progress** | Open balance over time (one reading per day), age of open issues, and the fix tracker. |

Clicking a merchant opens a detail view with its owners, trend, issue mix with the fix for each type, carrier surcharge reasons, the shipments to fix (tracking numbers, CSV export), and a fix status that is saved for everyone.

Global filters: period (30D, 90D, YTD, 12M, All, or a drilled period), grain, carrier, merchant, origin, destination, issue type, PA, SE.

## Data

All data is queried live from Snowflake through the Fridge runtime (`fridge.snowflake.query`). It is cached in the browser and in the store, and refreshes when the cache is more than 4 hours old or when you click refresh.

| Source | Use |
|---|---|
| `KITCHEN.REVENUE.OMS_LABEL_BILLING_DIAGNOSTICS_CURRENT` | One row per merchant and fulfillment group with unresolved variance. Only `diagnostic_status = 'issue'` counts toward the totals. `within_grace` (still in the billing window) and `needs_review` (source data needs review) are shown separately as "Not yet counted". Dated by `issue_date` (America/Denver). |
| `KITCHEN.REVENUE.OUTBOUND_LABELS_REVENUE_BY_SHIPMENT_CURRENT` | Label-level merchant billing and carrier invoicing, used to classify each issue and for the label view of revenue. |
| `KITCHEN.REVENUE.OUTBOUND_LABEL_REVENUE_ADJUSTMENTS` | Carrier invoice charge descriptions behind under-billed shipments, plus the merchant-record PA and SE. |
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
```

`LOADER=1 node smoke.mjs` runs the same test through the loader page.
