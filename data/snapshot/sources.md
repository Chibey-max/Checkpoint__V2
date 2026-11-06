# Offer snapshot: capture log

This folder holds the price evidence the Guard rules run on (PRD §9, §10.2). Every offer in `offers.json` is a real public price with a source URL and a capture time. Synthetic test rows live separately in `fixtures/adversarial.json` and are never mixed into `offers.json`.

| | |
|---|---|
| Snapshot | `snap-v0-2026-11-05` (v0, not frozen yet; freezes at P-1.3 after David's validator runs) |
| Captured | 2026-11-05, between 17:00 and 17:40 UTC. Every offer carries `captured_at: 2026-11-05T17:30:00Z`. |
| Captured by | Patrick |
| Method | `capture_method: "script"`. Each pricing page was fetched and the plan's price read from the page text. Screenshots were taken with headless Chrome at 1366×2200. |
| Category | Compute and dev infrastructure (decision D-01) |
| Currency | USD. Two Hetzner prices are listed in EUR and converted at the ECB reference rate for 2026-11-05: **1 EUR = 1.1224 USD**. The result is floored to micro-USD. |
| Units | Prices are integer micro-USD (1 USD = 1,000,000). The Coordinator converts 1 USD to 1 cpUSD (6 decimals). |

## Catalogue

| item_key | What | Minimum spec |
|---|---|---|
| `vps-2c4g-month` | VPS, 2 vCPU / 4 GB RAM, 1 month | `{"vcpu": 2, "ram_gb": 4}` |
| `domain-com-year` | .com domain registration, 1 year | `{"tld": "com"}` |
| `storage-1tb-month` | Object storage, 1 TB stored, 1 month | `{"storage_gb": 1000}` |
| `email-10k-month` | Transactional email, 10,000 emails, 1 month | `{"emails_per_month": 10000}` |

`storage_gb` and `emails_per_month` extend the `min_spec` fields listed in PRD §10.2, so storage and email can be spec-checked too (R-10).

## Stand-in vendors

Every offer is paid to a neutral stand-in testnet account (D-09). The UI shows these as "stand-in for offer from &lt;seller&gt;". Real brand names never appear in account IDs. Each seller always maps to the same stand-in.

| Stand-in | Sellers | Notes |
|---|---|---|
| `vendor-01` | DigitalOcean, Porkbun, Postmark | |
| `vendor-02` | Amazon Web Services, Gandi, Wasabi | |
| `vendor-03` | Cloudflare, Name.com, Mailgun | |
| `vendor-04` | Akamai (Linode), Hetzner, IONOS, Resend | |
| `vendor-05` | Fixture rows only | **Not allowlisted** (AT-04) |
| `vendor-06` | Backblaze, OVHcloud | **Not registered on cpUSD** (AT-10). Backblaze is the cheapest good storage offer, so the demo basket pays vendor-06. |

## Offers

Verdicts below are what Guard returns (`assessOffers` from `@checkpoint/guard`, rules hash `89e1b151…`), with the allowlist set to vendor-01–04 and 06. The loader merges `fixtures/*.json` into the evidence store (decisions-pending #5), so medians and ratios include the fixture rows. That is what the demo shows. Checked on 2026-11-05; `pnpm snapshot:check` is clean.

### VPS, 2 vCPU / 4 GB RAM, 1 month (median $24.00)

| offer_id | Seller | Stand-in | Price | Ratio | Expected | Source | Screenshot | Note |
|---|---|---|---|---|---|---|---|---|
| `vps-ovhcloud` | OVHcloud | vendor-06 | $4.54 | 18.91% | REVIEW (R-07) | [page](https://us.ovhcloud.com/vps/) | [jpg](screens/vps-ovhcloud.jpg) | 'Starting at' price as displayed; the lowest price may depend on commitment length. Kept as a real-world 'unusually low' case. |
| `vps-hetzner` | Hetzner | vendor-04 | $6.72 | 28.01% | REVIEW (R-07) | [page](https://www.hetzner.com/cloud/cost-optimized/) | **to capture** | Listed in EUR excl. VAT: €5.99 converted at the ECB reference rate of 2026-11-05 (1 EUR = 1.1224 USD), floored to micro-USD. Page showed 'currently unavailable' for new orders at capture time. |
| `vps-digitalocean` | DigitalOcean | vendor-01 | $24.00 | 100.00% | ALLOW (R-08) | [page](https://www.digitalocean.com/pricing/droplets) | [jpg](screens/vps-digitalocean.jpg) | Shared-CPU Basic plan. |
| `vps-akamai` | Akamai (Linode) | vendor-04 | $24.00 | 100.00% | ALLOW (R-08) | [page](https://www.akamai.com/cloud/pricing/cpu) | [jpg](screens/vps-akamai.jpg) | linode.com/pricing redirects here. |
| `vps-aws-lightsail` | Amazon Web Services | vendor-02 | $24.00 | 100.00% | ALLOW (R-08) | [page](https://aws.amazon.com/lightsail/pricing/) | **to capture** | IPv6-only bundle is $20; we use the IPv4 bundle as the like-for-like plan. |

### .com domain registration, 1 year (median $11.71)

| offer_id | Seller | Stand-in | Price | Ratio | Expected | Source | Screenshot | Note |
|---|---|---|---|---|---|---|---|---|
| `domain-ionos` | IONOS | vendor-04 | $1.00 | 8.53% | REVIEW (R-07) | [page](https://www.ionos.com/domains/com-domain) | **to capture** | Intro price; renewal not shown on the page. A real-world 'unusually low' case. |
| `domain-gandi` | Gandi | vendor-02 | $11.71 | 100.00% | ALLOW (R-08) | [page](https://www.gandi.net/en-US/domain/tld/com) | [jpg](screens/domain-gandi.jpg) | Excl. VAT. Renewal is much higher ($38.38); we price the 1-year registration only. |
| `domain-porkbun` | Porkbun | vendor-01 | $11.81 | 100.85% | ALLOW (R-08) | [page](https://porkbun.com/products/domains) | **to capture** | No promo; first year = renewal. |
| `domain-namecom` | Name.com | vendor-03 | $13.99 | 119.47% | REVIEW (R-06) | [page](https://www.name.com/pricing) | [jpg](screens/domain-namecom.jpg) | First-year price; struck-through $21.99 is probably the regular rate. |

### Object storage, 1 TB stored, 1 month (median $7.40)

| offer_id | Seller | Stand-in | Price | Ratio | Expected | Source | Screenshot | Note |
|---|---|---|---|---|---|---|---|---|
| `storage-backblaze` | Backblaze | vendor-06 | $6.95 | 93.91% | ALLOW (R-08) | [page](https://www.backblaze.com/cloud-storage/pricing) | **to capture** | 1 TB billed as listed per-TB rate. |
| `storage-hetzner` | Hetzner | vendor-04 | $7.28 | 98.43% | ALLOW (R-08) | [page](https://www.hetzner.com/storage/object-storage/) | [jpg](screens/storage-hetzner.jpg) | €6.49 converted at the ECB reference rate of 2026-11-05 (1.1224), floored to micro-USD. |
| `storage-wasabi` | Wasabi | vendor-02 | $7.99 | 107.97% | REVIEW (R-06) | [page](https://wasabi.com/pricing) | [jpg](screens/storage-wasabi.jpg) | – |
| `storage-cloudflare-r2` | Cloudflare | vendor-03 | $15.00 | 202.70% | BLOCK (R-05) | [page](https://developers.cloudflare.com/r2/pricing/) | [jpg](screens/storage-cloudflare-r2.jpg) | 1,000 GB x $0.015 = $15.00; the 10 GB free tier and request charges are ignored. |
| `storage-digitalocean` | DigitalOcean | vendor-01 | $20.00 | 270.27% | BLOCK (R-05) | [page](https://www.digitalocean.com/pricing/spaces-object-storage) | [jpg](screens/storage-digitalocean.jpg) | $5 base + 750 GiB x $0.02 = $20.00. |

### Transactional email, 10,000 emails, 1 month (median $15.00)

| offer_id | Seller | Stand-in | Price | Ratio | Expected | Source | Screenshot | Note |
|---|---|---|---|---|---|---|---|---|
| `email-aws-ses` | Amazon Web Services | vendor-02 | $1.00 | 6.66% | REVIEW (R-07) | [page](https://aws.amazon.com/ses/pricing/) | [jpg](screens/email-aws-ses.jpg) | 10 x $0.10 = $1.00, no attachments assumed. Usage-priced, so a real-world 'unusually low' case against flat plans. |
| `email-postmark` | Postmark | vendor-01 | $15.00 | 100.00% | ALLOW (R-08) | [page](https://postmarkapp.com/pricing) | [jpg](screens/email-postmark.jpg) | – |
| `email-mailgun` | Mailgun | vendor-03 | $15.00 | 100.00% | ALLOW (R-08) | [page](https://www.mailgun.com/pricing/) | [jpg](screens/email-mailgun.jpg) | – |
| `email-resend` | Resend | vendor-04 | $20.00 | 133.33% | BLOCK (R-05) | [page](https://resend.com/pricing) | [jpg](screens/email-resend.jpg) | Cheapest Resend plan that covers 10k/month; it includes 50k. |

### Expected demo basket

For the list "2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month, 10k transactional emails", the result should be the same with or without the fixtures:

| Item | Pick | Stand-in | Why |
|---|---|---|---|
| VPS ×2 | `vps-aws-lightsail` ($48.00) | vendor-02 | Three ALLOW offers tie at $24.00. The "fewer vendors overall" tie-breaker picks vendor-02, which already has the domain. |
| .com domain | `domain-gandi` ($11.71) | vendor-02 | Cheapest ALLOW. IONOS's $1 intro price is REVIEW (unusually low). |
| 1 TB storage | `storage-backblaze` ($6.95) | vendor-06 | Cheapest ALLOW. With fixtures, the cheaper `fx-storage-vendor05` is BLOCKed (not allowlisted). |
| 10k emails | `email-mailgun` ($15.00) | vendor-03 | Postmark and Mailgun tie at $15.00. Neither vendor is in the basket yet, so lexical `offer_id` decides. |

Total **$81.66 = 81,660,000 cpUSD base units** across 3 vendors (vendor-02 $59.71, vendor-03 $15.00, vendor-06 $6.95). The vendor-06 payout fails and should be restored exactly once (AT-10), leaving the basket PartiallyPaid.

## Adversarial fixtures (`fixtures/adversarial.json`)

These are synthetic. The sellers are fictional ("Fixture Seller A–F") and the source URLs point to `example.com`, so no fake price is ever attributed to a real company. The verdicts below were computed with the fixtures merged into the snapshot.

| offer_id | Item | Stand-in | Price | Expected | Tests |
|---|---|---|---|---|---|
| `fx-vps-overpriced` | `vps-2c4g-month` | vendor-01 | $31.00 | BLOCK (R-05) | Expect R-05 PRICE_POOR (> 120% of median) -> BLOCK. AT-03. |
| `fx-vps-spec-mismatch` | `vps-2c4g-month` | vendor-04 | $12.00 | BLOCK (R-10+R-08) | Expect R-10 SPEC_MISMATCH -> BLOCK, excluded from the median. |
| `fx-domain-too-cheap` | `domain-com-year` | vendor-03 | $4.99 | REVIEW (R-07) | Expect R-07 PRICE_UNUSUALLY_LOW (< 50% of median) -> REVIEW. |
| `fx-storage-vendor05` | `storage-1tb-month` | vendor-05 | $6.50 | BLOCK (R-04+R-08) | Cheapest storage offer, but vendor-05 is not allowlisted. Expect R-04 VENDOR_NOT_ALLOWED -> BLOCK. AT-04. |
| `fx-storage-dup-1` | `storage-1tb-month` | vendor-04 | $7.40 | ALLOW (R-08) | Duplicate pair with fx-storage-dup-2 (same seller + fingerprint). This lower one is kept. |
| `fx-storage-dup-2` | `storage-1tb-month` | vendor-04 | $7.60 | BLOCK (R-09+R-08) | Expect R-09 DUPLICATE_LISTING -> BLOCK, excluded from the median. |
| `fx-email-injection` | `email-10k-month` | vendor-01 | $15.50 | ALLOW (R-08) | Prompt-injection fixture for AT-13. raw_text is untrusted data; the verdict must follow the rules only. |

No real offer is above 120% of the VPS median, so `fx-vps-overpriced` supplies the AT-03 case for VPS. Among real offers, R2 and DO Spaces are already above 120% for storage, and Resend is above 120% for email.

## Known issues and to-dos

1. **Staleness (resolved in config, pending team OK).** `config/rules.config.json` now sets `max_age_hours` to 720 (decisions-pending #1), so these 5 Nov captures stay fresh until 5 Dec, past submission and judging. The snapshot is frozen as of 5 Nov: new rows go only into `fixtures/`.
2. **Five screenshots still need capturing by hand.** Lightsail, Hetzner Cloud, Porkbun, IONOS and Backblaze blocked headless Chrome. Open each source URL in a normal browser, take the screenshot with Flameshot, save it as `screens/<offer_id>.jpg` and set the offer's `screenshot` field.
3. **"Starting at" and intro prices** (OVHcloud $4.54 and IONOS $1) are kept as displayed. They are real examples of prices the rules should send to REVIEW rather than auto-buy.
4. **Excluded:** Vultr, Namecheap, Spaceship, GoDaddy and Hover blocked automated fetches. Cloudflare Registrar publishes no .com price on its product page, so it was skipped rather than taken from a third-party tracker. Dynadot's price needed a coupon.
5. **Rounding:** the R2 and DO Spaces prices are computed for 1,000 GB and 1,000 GiB respectively. The note on each offer shows the arithmetic.
