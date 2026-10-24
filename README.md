# PCAP: Payment Control Assurance Platform (prototype)

Working prototype for the NUS IS4234 Group 4 report "Approved but Not Understood: Control Design Lessons from Citibank's Revlon Payment Error".

**Synthetic data only.** No real people, accounts or payments. The Revlon replay is a simplified synthetic rebuild of a public court case.

## What PCAP is

PCAP is an overlay on a bank's core payment system, not a replacement. Before a payment is released, it states in plain words how much money will leave the bank, where it goes and whether it is interest or principal, and it checks that against the loan schedule. It only lets certified, independent, in-house approvers release override payments, makes them re-key the amount blind, holds critical payments for Operational Risk, and tags every control event to the obligation it evidences.

## How to run it

- **From the folder or the ZIP:** unzip, then double-click `index.html`. It opens in Edge, Chrome, Firefox or Safari. No install, no build step, no internet connection and no login.
- **Online:** https://bchuazw.github.io/is4234-pcap-prototype/
- On the payment desk, use **Acting as** to switch between Maker, Checker, Approver and Op Risk. On the other screens the **Acting as** menu at the top also has Head of Loan Ops (register owner). When a payment waits for another role, the desk shows a "Switch to ..." button.
- Everything you do is kept in this browser only (localStorage). **Reset demo data** restores the starting point. If the browser blocks storage, the app still works and shows a notice that changes last until reload.
- The app opens in a dark theme. The **Light** button in the header switches to a light theme for projectors, and the choice is remembered in this browser (if storage is blocked it lasts until reload).

## Folder layout

| Path | What it holds |
|---|---|
| `index.html` | The single page. Classic scripts only, so it also works from `file://`. |
| `css/styles.css` | All styles, with dark and light theme colours as CSS variables. No frameworks. |
| `fonts/` | Self-hosted fonts (Space Grotesk, IBM Plex Sans, JetBrains Mono, Latin subset, woff2) and their SIL Open Font License files. Nothing is loaded from the internet. |
| `js/engine.js` | **All rule logic**: R-01 to R-09, the consequence statement, tiers, the Revlon replay and the seeded synthetic test. Loads in the browser and in Node. |
| `js/store.js` | State, browser storage, payment actions and the tagged event log. |
| `js/charts.js` | Small inline SVG charts in the theme colours. No chart library. |
| `js/motion.js` | Transitions and animations only. It never changes data or events. |
| `js/views/*.js` | One file per screen. |
| `js/app.js` | Router, role switcher, reset and the payment detail dialog. |
| `data/seed-data.js` | Synthetic people, loans, register entries, controls and the Table 4 obligation rows. |
| `tests/` | Node unit tests (`node --test`). |

## Modules, rules and screens

| Module | Group | Screen in the app |
|---|---|---|
| M1 Workaround and Legacy Constraint Register | Govern | Register |
| M2 Pre-Release Consequence Engine | Prevent | Payment desk |
| M3 Authority and Independence Gate | Prevent | Payment desk (maker review step and approver gate) |
| M4 Approval Behaviour Analytics | Detect | Behaviour analytics |
| M5 Compensating Control Monitor | Detect | Control monitor |
| M6 Obligation Map and Oversight Dashboard | Govern | Obligations and Board, Event log |

| Rule | Module | Logic in the prototype | Action | Screen |
|---|---|---|---|---|
| R-01 Variance | M2 | Compares the amount PCAP computes will leave the bank with what the loan schedule expects on the value date, less anything already paid. Tolerance is the larger of USD 500 or 0.1%. | Over tolerance: Tier 2. Over 10% or USD 5 million, or nothing due: Tier 3. | Payment desk |
| R-02 Unscheduled principal | M2 | Principal leaving the bank when none (or less) is due that day. | Tier 3 | Payment desk |
| R-03 Unregistered workaround | M1 | Any override (code, wash-account setting or workaround operation) must match an active register entry for that operation with an in-date dispensation. | Tier 3 | Payment desk, Register |
| R-04 Incomplete workaround | M1 | A registered workaround must have all its required fields set. WA-01 needs FRONT, FUND and PRINCIPAL set to the wash account. | Tier 3 | Payment desk, Register |
| R-05 Certification | M3 | Approver holds a current certification for the override type and an approval limit at least equal to the computed outgoing amount. | M3 gate closes, blocked attempt logged, reassign | Payment desk |
| R-06 Independence | M3 | Approver is not the maker or checker, not in their team or reporting line, and in-house (Citi) for override payments. | M3 gate closes, blocked attempt logged, reassign | Payment desk |
| R-07 Active confirmation | M2 | At Tier 2 and 3 the approver re-keys the outgoing amount without seeing the maker's figure or the checker's note. | First mismatch: re-check. Second mismatch: Tier 3. | Payment desk (Approver) |
| R-08 Rubber-stamp score | M4 | Weekly team score from 0 to 100: fast looks at the consequence screen (40), re-key slips (30), Tier 2 approvals within 5 seconds of the warning (30). | Amber at 25, red at 50. Never blocks a payment. | Behaviour analytics |
| R-09 Control health | M5 | Same-day independent reconciliation, register reviews, dispensations, certifications, hard-stop queue and the replay regression test. | Red, amber or green per control, fed to M6 | Control monitor |

**Tiers.** Tier 1 routine: the approver reads the consequence statement and releases. Tier 2 elevated: blind re-key plus an explicit confirmation. Tier 3 critical: hard stop that only Operational Risk can release, with a recorded reason. Any payment using a valid registered override is at least Tier 2.

**Event log.** Every rule result, gate check, re-key, statement shown, hold, release, register change, reconciliation and test writes an event tagged with its module, rule and obligation row (O1 to O7 from Table 4). M4, M5 and M6 are built from these events. The evidence pack exports them as JSON and CSV.

## Look and motion: the "Control Tower" theme

Payments are treated like flights that need clearance before take-off, which keeps the report's terms but gives the screens one clear idea:

- **Work queue as flight progress strips.** Each payment is a strip with its ID, amount, loan, a tier colour edge (green Tier 1, amber Tier 2, red Tier 3) and its status. Strips slide between "Waiting for you", "In progress" and "Done" when a payment is handed on.
- **Lifecycle as a clearance track.** The maker, checker, approver, Op Risk and release steps fill in as the payment moves on, and the track turns red for a ground stop and green when the payment is cleared and released.
- **Tier 3 as a ground stop.** The hard stop banner has a striped barrier edge and says "Ground stop: only Operational Risk can clear this payment for release". The official terms (Tier 1 to 3, M1 to M6, R-01 to R-09, maker, checker, approver) stay as they are in the report.
- **Motion with a purpose.** Screens fade and rise in, amounts on the consequence card count up while the schedule and payment bars grow, then the "115 times" line appears. Failed checks appear first. A blind re-key mismatch shakes the amount box, and a match glows green. Board KPIs count up and charts draw in once. Animations last about 150 to 400 ms (counting and drawing up to about 0.9 s) and are switched off when the computer is set to reduce motion.
- **Fonts.** Space Grotesk for headings and numbers, IBM Plex Sans for text and JetBrains Mono for IDs, account legs and rule IDs. All three are under the SIL Open Font License 1.1 (licence texts in `fonts/`).

## Five minute demo script (for the video)

The **How to demo** screen has a "Go" button for each step that switches role and opens the right screen.

1. **0:00 to 0:20. Open it.** Show the page (GitHub Pages link or `index.html`). Point at the header: prototype, synthetic data. One sentence on the case: about USD 7.8M of interest was meant, about USD 894M of principal went out after six-eyes approval.
2. **0:20 to 1:15. Maker keys the Revlon replay.** Click "Start the demo with the Revlon replay". The New payment form opens at step 1, Instruction. Under Settlement routing, FRONT and FUND are still "Lenders" and only PRINCIPAL is on the wash account. Click **Review payment** (step 2). The ground stop banner says "Tier 3: hard stop" and the consequence card says "This payment will send USD 901.7M to 315 lenders, including USD 893.9M of principal", with bars showing 115 times what the schedule expects. R-04 (FRONT and FUND not set), R-02 (no principal due) and R-01 (USD 893.9M over the schedule) fail. Click **Submit to checker** anyway, as happened in 2020.
3. **1:15 to 1:35. Checker.** The stepper shows the payment at Checker review. Click **Switch to Checker**. Type the note "Principal set to wash" and click **Mark checked, send to approver**. Say that the approver will not see this note until after the blind re-key.
4. **1:35 to 2:35. Approver.** Click **Switch to Approver**. The amounts are hidden, even in the queue. The M3 gate is open (certified, independent, in-house). Open "Your source: agent notice", type 7,820,000 and click **Check amount**. It does not match, so type it again. R-07 escalates, the consequence card appears with the principal amount, and the time on screen is counted for M4. Add a note and click **Send to Operational Risk**.
5. **2:35 to 3:05. Operational Risk.** Click **Switch to Op Risk**. Show "Why it was held", the "Who saw it" card and the **Evidence trail** button. Write a reason and click **Reject and return to maker**. Optional if time allows: click **Switch to Maker**, then **Edit and resubmit**, set FRONT and FUND to the wash account, review and resubmit. It passes at Tier 2 with only USD 7.8M leaving and the principal staying inside the bank. Check it, re-key 7,820,000, tick the confirmation and release.
6. **3:05 to 3:25. M1 Register.** Switch to Head of Loan Ops. WA-02's review is overdue and WA-03's dispensation expires soon. Click "Mark reviewed" on WA-02 (an owner attestation in the log).
7. **3:25 to 3:45. M4 Behaviour analytics.** Team TPA has drifted into red on R-08: fast looks and fast approvals after Tier 2 warnings. Point at the privacy banner: team level by default, individual view only with a logged reason.
8. **3:45 to 4:05. M5 Control monitor.** As Operational Risk, click "Run same-day reconciliation". Show the red, amber and green controls (lapsed certification, expiring dispensation) and the replay regression test.
9. **4:05 to 4:35. M6 Obligations and Board.** Board KRIs with trends, then the obligation to control to evidence table with live counts. Click "Export evidence pack" and show the JSON and CSV files.
10. **4:35 to 5:00. Synthetic test.** 500 synthetic payments with 25 injected errors: every Tier 3 error held, 22 of 25 stopped before release, the 3 small slips inside tolerance found the same day by M5, 1.1% false alarms, and the Revlon replay passes. Close: PCAP narrows the gap between approving and understanding.

## Tests

From this folder, with Node 18 or later (built and run on Node 25):

```
node --test
```

There are 26 tests in `tests/engine.test.js` and `tests/flow.test.js`. They check that:

- the Revlon replay is held at Tier 3 with R-01, R-02 and R-04 firing, and the statement shows the principal amount
- a normal scheduled interest payment releases at Tier 1, and a correct WA-01 roll-up is Tier 2 with the principal kept inside the bank
- each rule from R-01 to R-09 blocks or flags its own error case, including duplicates, wrong dates, retired and expired workarounds, lapsed certificates, low approval limits and a maker who checks their own payment
- a blind re-key mismatch is caught, and a second mismatch escalates to Tier 3
- the synthetic test is deterministic for a fixed seed, and across seeds every Tier 3 and gate error is stopped
- the payment desk actions log every step with module, rule and obligation tags, a release by Operational Risk shows up as a reconciliation break, and a maker cannot run an independent reconciliation

The browser screens were also checked in headless Microsoft Edge at 1400, 1024 and 390 px width, in both the dark and light themes: the full payment desk flow ran through every role with no JavaScript errors and no sideways scrolling, every step wrote the same event log entries as before the redesign, the app still works when browser storage is blocked, and it works with reduced motion switched on.

## Synthetic test results

Seed 4234, 500 payments, 25 injected errors (5%), 475 clean payments of which 5 read a stale schedule line, business days 1 to 30 Sep 2026. The seed was fixed before any results were known. Run fingerprint `f5f23476` (the same seed always gives the same numbers).

| Target from report 5.8 | Target | Result | Met |
|---|---|---|---|
| Tier 3 errors stopped | 100% | 15 of 15 (100%) | Yes |
| All injected errors stopped before release | at least 90% | 22 of 25 (88.0%) | No |
| False alarms on clean payments | below 5% | 5 of 475 (1.1%) | Yes |
| Median added approver time at Tiers 2 and 3 | under 2 minutes | 41.1 s (model estimate) | Yes |

| Injected error | Count | Stopped before release | Found same day by M5 | Missed | Rules that fired |
|---|---|---|---|---|---|
| Missing FRONT or FUND on the wash workaround | 3 | 3 | 0 | 0 | R-01, R-02, R-04, R-07 |
| Extra zero on the amount | 3 | 3 | 0 | 0 | R-01, R-07 |
| Unscheduled principal included | 2 | 2 | 0 | 0 | R-01, R-02, R-07 |
| Unregistered or retired override | 2 | 2 | 0 | 0 | R-03 |
| Wrong value date (nothing due that day) | 3 | 3 | 0 | 0 | R-01 |
| Duplicate of a payment already released | 2 | 2 | 0 | 0 | R-01 |
| Approver not certified for the override | 3 | 3 | 0 | 0 | R-05 (M3 gate) |
| Approver not independent (maker's team) | 2 | 2 | 0 | 0 | R-06 (M3 gate) |
| Amount slip of 2% to 8% | 2 | 2 | 0 | 0 | R-01, R-07 |
| Amount slip under USD 500 (inside tolerance) | 3 | 0 | 3 | 0 | none before release, then a reconciliation break (R-09) |

- **Why 88% and not 90%:** the three misses before release are slips of under USD 500, which sit inside the R-01 tolerance by design and were released at Tier 1. M5's same-day reconciliation found all three, so nothing was missed entirely. Tightening the tolerance would catch them but raise false alarms.
- **False alarms:** all 5 were R-01 on a stale schedule line, all at Tier 2, and all released after the approver's blind re-key matched. None was held at Tier 3. Another 64 clean override payments went to Tier 2 by policy without any rule firing, which adds time but is not counted as a false alarm.
- **Added time (model estimate):** median approver time added is 7.2 s at Tier 1 and 41.1 s at Tiers 2 and 3, with a mean of 13.2 s over all payments. Tier 3 holds then wait a median 10.2 min for Operational Risk. These are assumptions, not a timed walk-through.
- **R-08:** the simulated rubber-stamp team (Citi Approvers TPA) scored 75 (red). The other two teams scored 5 and 7 (green).
- **Revlon replay:** passes. R-01, R-02 and R-04 fire, the blind re-key of USD 7,820,000 also fires R-07, the payment is held at Tier 3 and the statement shows the USD 893,900,000 of principal.
- **Across seeds 1 to 50** (the "Run seeds 1 to 50" button): 1,138 of 1,250 injected errors stopped before release (91.0% pooled, lowest 88%, median 92%, highest 96% per seed), every Tier 3 error (748 of 748), gate error (250 of 250) and Tier 2 error (130 of 130) stopped, 112 of the 122 below-tolerance slips found the same day by M5 and the other 10 stopped earlier, none missed, false alarms 1.0% with none held at Tier 3, and the replay passed every time.

## Design choices the prototype had to make

These fill gaps where the report drafts do not yet fix the behaviour. They are easy to change in `js/engine.js`.

- The pre-release check runs the M1 register rules (R-03, R-04), the M3 gate (R-05, R-06) and the M2 engine (R-01, R-02) together at submission and again at the approver's hold point. M1 stays a Govern module: the check consults the register, which is owned and reviewed.
- R-05 includes a consequence-based approval limit as well as certification per override type, because Table 4 row 1 calls for consequence-based entitlements. The limit is checked against the amount PCAP computes, not the amount keyed.
- Any payment using a valid registered override is at least Tier 2.
- R-07 applies only at Tiers 2 and 3, so Tier 1 keeps the current flow. The approver gets two attempts. Only "slips" (the approver's own first figure was wrong) count against them in R-08. A mismatch that ends in escalation counts as a catch.
- R-01 tolerance is the larger of USD 500 or 0.1%. Tier 3 starts above 10% or USD 5 million. The R-08 weights (40, 30, 30) and thresholds (25, 50) are illustrative.
- In the replay, the loan schedule holds the USD 7,820,000 of interest as an off-cycle roll-up payment notified to lenders, so R-01 has an expected amount to compare against. The 315 lenders and exact amounts are synthetic.
- Table 4 does not name M4, so R-08 events are tagged to rows 2 and 5.
- A fifth role, Head of Loan Ops, is added so register reviews are owner attestations rather than something any user can do.

## Limitations

- **Synthetic data only.** Every person, loan and amount is invented. Results show that PCAP catches the errors we imagined, not that it would catch the next real one.
- **Not connected to Flexcube** or any bank system. The Flexcube-style screen is a simulation and the consequence engine models only the FRONT, FUND and PRINCIPAL wash-account rule.
- **Browser-only storage.** State lives in one browser's localStorage. There is no server, no shared data between users and no audit-grade storage.
- **No login or access control.** Anyone can switch roles. In production, approvers would not see the event log or the agent notice inside PCAP.
- **Added time is modelled,** not measured with volunteer approvers. The app does measure real time on the consequence screen for the approvals you make, and M4 shows it.
- **What it does not check:** beneficiary account details, payment dates in the reconciliation (it compares amounts), or a payment made against the wrong schedule line when the amount is similar. That last case would be Tier 2 and could be released if the approver's source agrees with it.
- **M4 privacy** is a design note (team level by default, logged individual view), not a legal review under the PDPA.

## AI use

This prototype was built with help from **Claude Code** (Anthropic), an AI coding assistant, in October 2026. Brian gave it the team's report drafts, the rule list (R-01 to R-09), the module design and the agreed Table 4 rows. Claude Code wrote most of the code, the unit tests, the synthetic test generator and this README, and checked the screens in a headless browser. A suggested line for the report's "Acknowledging Your Use of AI" table, for the team to check and edit:

> Claude Code (Anthropic): generated most of the prototype code (HTML, CSS and JavaScript), its unit tests and README from Group 4's module design, rule list and obligation map. The team reviewed, tested and adjusted the output.
