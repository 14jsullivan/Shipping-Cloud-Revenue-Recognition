# Shipping Cloud Revenue Integrity

A Fridge app for catching, diagnosing and fixing revenue recognition issues on Shipping Cloud labels, then tracking the fixes.

**Live app:** https://shipping-revenue-integrity.fridge.redo.builders (private; add viewers in Fridge)

## What it shows

| Tab | Purpose |
|---|---|
| **Issues** | Five steps, each narrowing the next. **1 Issues over time**: under- and over-billed by day, month, quarter or year, as a chart or a table (click a period to zoom in). **2 Which carriers**: totals for both directions, or a pivot of carrier by period or by issue type (click a carrier; click its orange or blue bar to pick a direction). The headline then shows what you're diagnosing; it starts on the biggest carrier. **3 What was billed**: the issue types for that carrier, and a bridge of every carrier charge, surcharge, credit and merchant charge that adds up to the total. **4 Where it concentrates**: share of issue dollars against share of labels shipped, by merchant, Redo vs merchant label, weight, package size, zone, service, ship-to state, ship-to ZIP, ship-from and surcharge type, with the three biggest outliers called out. **5 Who owns the fix**: by PA or SE, with their merchants and fix status. |
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
| `KITCHEN.REVENUE.OUTBOUND_LABEL_REVENUE_ADJUSTMENTS` | Every charge and credit after purchase (step 3 and the merchant view), carrier charge descriptions, and the merchant-record PA and SE. |
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
node print-sql.mjs where '{"dir":"u","car":["USPS"]}'  # step 4 for USPS under-billing
```

`LOADER=1 node smoke.mjs` runs the same test through the loader page.
