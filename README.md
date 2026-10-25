# PCAP: Payment Control Assurance Platform (prototype)

Working prototype for the NUS IS4234 Group 4 report "Approved but Not Understood: Control Design Lessons from Citibank's Revlon Payment Error".

**Synthetic data only.** No real people, accounts or payments. The Revlon replay is a simplified synthetic rebuild of a public court case.

## For teammates

**Look at this first (10 minutes).** Open https://bchuazw.github.io/is4234-pcap-prototype/ and press **Start the demo with the Revlon replay** on the How to demo screen. Follow the "Switch to ..." buttons through Maker, Checker, Approver and Op Risk (steps 1 to 4 of the demo path). Then open **Synthetic test** and press **Run seeds 1 to 50**. That is the whole case for the report in about ten clicks: the pre-release statement, the blind re-key, the Tier 3 hard stop, and the numbers in 5.8. The How to demo screen also has three short panels for the report and the Q&A: **How it answers the report** (RC1 to RC5 and R1 to R7 mapped to screens), **What this shows from IS4234** (three lines of defence and the lecture ideas mapped to screens) and **Feasibility and who has to agree**.

**Feedback wanted.**
- Does the consequence card say what the Revlon payment would do in words a non-technical marker understands?
- Is any screen or button confusing without Brian explaining it? Note the screen and what you expected.
- Anything that disagrees with your section of the report (module names, rule names, thresholds, Table 4 rows, cadence).
- Spot checks on the light theme on a projector, and on a phone.

**Keith, please confirm against 5.1 to 5.5** (the app and 5.6 to 5.9 assume these):
- Prevent = M2 and M3, Detect = M4 and M5, Govern = M1 and M6.
- Rule IDs and names R-01 Variance, R-02 Unscheduled principal, R-03 Unregistered workaround, R-04 Incomplete workaround, R-05 Certification, R-06 Independence, R-07 Active confirmation, R-08 Rubber-stamp score, R-09 Control health.
- R-01 tolerance is the larger of USD 500 or 0.1%, and Tier 3 starts above 10% or USD 5 million.
- Any payment using a valid registered override is at least Tier 2, and R-07 (blind re-key, two attempts) applies at Tiers 2 and 3 only.
- R-08 weights 40, 30, 30 with amber at 25 and red at 50. The score is per team per week and goes into the monthly second-line report (daily, monthly and quarterly cadence as in 5.5).
- Tier 1 routine, Tier 2 elevated, Tier 3 critical with hard stop and second-line (Operational Risk) release.
- A Tier 3 release is a documented risk acceptance (L5 slide 41): reason, a first-line risk owner (Head of Loan Ops), this payment only, expires the same day, reviewed by Internal Audit. This matches the "counter signed by an independent second-line operational risk officer" wording in 3.3.3.
- R-07 re-keys the amount and the payment type (interest only, principal and interest, or principal only), because 3.1.4 says the approver re-keys "amount and nature".

**Yong Kang**: the app tags events to Table 4 rows O1 to O7 in this order: delegation of authority, segregation of duties, competency and training, manuals and MIS, outsourcing accountability, legacy system limitation, sustained effectiveness. If Table 4 ends up with different rows or order, tell Brian and the tags change in `data/seed-data.js`. Table 2 in 3.2 now has seven MAS rows that differ slightly (competency and training are two rows there, there is no sustained-effectiveness row, and some paragraph numbers differ). See `Assignments/G4-Brian-PREP/prototype-relevance-review.md` for the list.

## What PCAP is

PCAP is an overlay on a bank's core payment system, not a replacement. Before a payment is released, it states in plain words how much money will leave the bank, where it goes and whether it is interest or principal, and it checks that against the loan schedule. It only lets certified, independent, in-house approvers release override payments, makes them re-key the amount and the payment type blind, holds critical payments for Operational Risk (who can release one only by recording a risk acceptance), and tags every control event to the obligation it evidences.

It is designed for a bank supervised by MAS, the report's benchmark (Internal Controls, Guidelines on Outsourcing (Banks), Notice 658, TRM, PDPA). Citibank is a US bank, so the court record and the OCC and Federal Reserve orders are the evidence of what failed, not the rules PCAP is built on.

## How to run it

- **From the folder or the ZIP:** unzip, then double-click `index.html`. It opens in Edge, Chrome, Firefox or Safari. No install, no build step, no internet connection and no login.
- **Online:** https://bchuazw.github.io/is4234-pcap-prototype/
- On the payment desk, use **Acting as** to switch between Maker, Checker, Approver and Op Risk. The **Acting as** menu at the top also has Head of Loan Ops (first-line risk owner, owns the register) and Internal Audit (third line, read only, cannot run controls). When a payment waits for another role, the desk shows a "Switch to ..." button.
- Everything you do is kept in this browser only (localStorage). **Reset demo data** restores the starting point. If the browser blocks storage, the app still works and shows a notice that changes last until reload.
- The app opens in a dark theme. The **Light** button in the header switches to a light theme for projectors, and the choice is remembered in this browser (if storage is blocked it lasts until reload). Reset demo data does not change the theme.
- Dates are shown as "11 Aug 2020" and large amounts as "USD 7.8M" in lists, with full figures on the consequence card and in the event log.

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
| R-07 Active confirmation | M2 | At Tier 2 and 3 the approver re-keys the outgoing amount and says whether it is interest only, principal and interest, or principal only, without seeing the maker's figure or the checker's note. Both must match what PCAP computed. | First mismatch: re-check. Second mismatch: Tier 3. | Payment desk (Approver) |
| R-08 Rubber-stamp score | M4 | Team score from 0 to 100, scored weekly and reported monthly: fast looks at the consequence screen (40), re-key slips (30), Tier 2 approvals within 5 seconds of the warning (30). Shown only for teams of at least 3 approvers. | Amber at 25, red at 50. Never blocks a payment. | Behaviour analytics |
| R-09 Control health | M5 | Same-day independent reconciliation, register reviews, dispensations, certifications, hard-stop queue and the replay regression test. | Red, amber or green per control, fed to M6 | Control monitor |

**Tiers.** Tier 1 routine: the approver reads the consequence statement and releases. Tier 2 elevated: blind re-key plus an explicit confirmation. Tier 3 critical: hard stop that only Operational Risk can release, by recording a risk acceptance (reason, first-line risk owner, this payment only, expires at the end of the business day). Any payment using a valid registered override is at least Tier 2. The tier thresholds are the bank's risk tolerance levels: what each level of risk makes people do.

**Three lines of defence.** First line: the Wipro maker and checker (tasks only), the Citi approver and the Head of Loan Ops (owns M1 to M3 and the risk of a Tier 3 release). Second line: Operational Risk (Tier 3 holds, M4, M5) and Compliance (M6). Third line: Internal Audit, read only, reviews every risk acceptance and pulls the evidence pack, and the app stops it from running the controls it audits.

**Event log.** Every rule result, gate check, re-key, statement shown, hold, risk acceptance, release, register change, reconciliation and test writes an event tagged with its module, rule and obligation row (O1 to O7 from Table 4). M4, M5 and M6 are built from these events. The evidence pack exports them as JSON and CSV, with the risk acceptances listed separately for Internal Audit.

## Look and motion: the "Control Tower" theme

Payments are treated like flights that need clearance before take-off, which keeps the report's terms but gives the screens one clear idea:

- **Work queue as flight progress strips.** Each payment is a strip with its ID, amount, loan, a tier colour edge (green Tier 1, amber Tier 2, red Tier 3) and its status. Strips slide between "Waiting for you", "In progress" and "Done" when a payment is handed on.
- **Lifecycle as a clearance track.** The maker, checker, approver, Op Risk and release steps fill in as the payment moves on, and the track turns red for a ground stop and green when the payment is cleared and released.
- **Tier 3 as a ground stop.** The hard stop banner has a striped barrier edge and says "Ground stop: only Operational Risk can clear this payment for release". The official terms (Tier 1 to 3, M1 to M6, R-01 to R-09, maker, checker, approver) stay as they are in the report.
- **Motion with a purpose.** Screens fade and rise in, amounts on the consequence card count up while the schedule and payment bars grow, then the "115 times" line appears. Failed checks appear first. A blind re-key mismatch shakes the amount box, and a match glows green. Board KPIs count up and charts draw in once. Animations last about 150 to 400 ms (counting and drawing up to about 0.9 s) and are switched off when the computer is set to reduce motion.
- **Fonts.** Space Grotesk for headings and numbers, IBM Plex Sans for text and JetBrains Mono for IDs, account legs and rule IDs. All three are under the SIL Open Font License 1.1 (licence texts in `fonts/`). They are loaded with `font-display: block`, so there is no flash of fallback text on first paint.

## Five minute demo script (for the video)

The **How to demo** screen has a "Go" button for each step that switches role and opens the right screen.

1. **0:00 to 0:20. Open it.** Show the page (GitHub Pages link or `index.html`). Point at the header: prototype, synthetic data. One sentence on the case: about USD 7.8M of interest was meant, about USD 894M of principal went out after six-eyes approval.
2. **0:20 to 1:15. Maker keys the Revlon replay.** Click "Start the demo with the Revlon replay". The New payment form opens at step 1, Instruction. Under Settlement routing, FRONT and FUND are still "Lenders" and only PRINCIPAL is on the wash account. Click **Review payment** (step 2). The ground stop banner says "Tier 3: hard stop" and the consequence card says "This payment will send USD 901.7M to 315 lenders, including USD 893.9M of principal", with bars showing 115 times what the schedule expects. R-04 (FRONT and FUND not set), R-02 (no principal due) and R-01 (USD 893.9M over the schedule) fail. Click **Submit to checker** anyway, as happened in 2020.
3. **1:15 to 1:35. Checker.** The stepper shows the payment at Checker review. Click **Switch to Checker**. Type the note "Principal set to wash" and click **Mark checked, send to approver**. Say that the approver will not see this note until after the blind re-key.
4. **1:35 to 2:35. Approver.** Click **Switch to Approver**. The amounts are hidden, even in the queue. The M3 gate is open (certified, independent, in-house). Open "Your source: agent notice", type 7,820,000, pick **Interest only** and click **Check amount**. It does not match, so do it again. R-07 escalates, the consequence card appears with the principal amount, and the time on screen is counted for M4. Add a note and click **Send to Operational Risk**.
5. **2:35 to 3:05. Operational Risk.** Click **Switch to Op Risk**. Show "Why it was held", the "Who saw it" card and the **Evidence trail** button. Point at the release option: it is a risk acceptance with a first-line owner and a same-day expiry (L5). Write a reason and click **Reject and return to maker**. Optional if time allows: click **Switch to Maker**, then **Edit and resubmit**, set FRONT and FUND to the wash account, review and resubmit. It passes at Tier 2 with only USD 7.8M leaving and the principal staying inside the bank. Check it, re-key 7,820,000 as Interest only, tick the confirmation and release.
6. **3:05 to 3:25. M1 Register.** Switch to Head of Loan Ops. WA-02's review is overdue and WA-03's dispensation expires soon. Click "Mark reviewed" on WA-02 (an owner attestation in the log).
7. **3:25 to 3:45. M4 Behaviour analytics.** Team TPA has drifted into red on R-08: fast looks and fast approvals after Tier 2 warnings. Point at the privacy banner: team level by default, at least 3 approvers per team, individual view only with a logged reason. Below, the outsourced provider card counts the check that sent a Tier 3 payment on.
8. **3:45 to 4:05. M5 Control monitor.** As Operational Risk, click "Run same-day reconciliation". Show the red, amber and green controls (lapsed certification, expiring dispensation) and the replay regression test.
9. **4:05 to 4:35. M6 Obligations and Board.** Switch to Internal Audit (third line). Board KRIs with trends (including the R6 legacy roadmap KRI), then the obligation to control to evidence table with live counts and the risk acceptance log. Click "Export evidence pack" and show the JSON and CSV files.
10. **4:35 to 5:00. Synthetic test.** 500 synthetic payments with 25 injected errors: every Tier 3 error held, 22 of 25 stopped before release, the 3 small slips inside tolerance found the same day by M5, 1.1% false alarms, and the Revlon replay passes. Close: PCAP narrows the gap between approving and understanding.

## Tests

From this folder, with Node 18 or later (built and run on Node 25):

```
node --test
```

There are 30 tests in `tests/engine.test.js` and `tests/flow.test.js` (all passing, last run 25 Oct 2026). They check that:

- the Revlon replay is held at Tier 3 with R-01, R-02 and R-04 firing, and the statement shows the principal amount
- a normal scheduled interest payment releases at Tier 1, and a correct WA-01 roll-up is Tier 2 with the principal kept inside the bank
- each rule from R-01 to R-09 blocks or flags its own error case, including duplicates, wrong dates, retired and expired workarounds, lapsed certificates, low approval limits and a maker who checks their own payment
- a blind re-key mismatch is caught, and a second mismatch escalates to Tier 3, and the right amount with the wrong payment type (interest only when principal leaves) also fails
- a Tier 3 release by Operational Risk records a risk acceptance with a first-line owner, one-payment scope and a same-day expiry, and is refused if the owner is Operational Risk, the outsourced provider or someone who took part in the payment
- every approver team in the demo has at least 3 approvers, smaller teams get no score, and Internal Audit cannot run the reconciliation or the regression test
- the synthetic test is deterministic for a fixed seed, and across seeds every Tier 3 and gate error is stopped
- the payment desk actions log every step with module, rule and obligation tags, a release by Operational Risk shows up as a reconciliation break, and a maker cannot run an independent reconciliation

The browser screens were also checked in headless Microsoft Edge at 1400, 1024 and 390 px width, in both the dark and light themes: the full payment desk flow ran through every role with no JavaScript errors and no sideways scrolling, every step wrote the same event log entries as before the redesign, the app still works when browser storage is blocked, and it works with reduced motion switched on. The last review also checked the keyboard tab order on every screen, that the theme and the open payment survive a reload (including a reload halfway through the approver's blind re-key, where the attempt count and the time on screen carry on), Reset demo data, the evidence pack download (JSON and CSV), the seed run and the 50-seed sweep (about 2 s, run in small chunks with progress on the button so the page never freezes), the register add, review and retire actions, the History and Event log filters, the dialogs and toasts, fonts loaded before first paint, and no layout shift on load. After the relevance review (25 Oct 2026), the changed screens were checked again at 1400 and 390 px in both themes: the How to demo panels, the approver re-key with the payment type, the Op Risk risk acceptance and release, the register, behaviour analytics, and the control monitor and Obligations and Board as Internal Audit. No JavaScript errors, no sideways scrolling (two older tables on Behaviour analytics and Control monitor were widening the page on phones and are now wrapped), and the synthetic test fingerprint is unchanged.

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
- R-01 tolerance is the larger of USD 500 or 0.1%. Tier 3 starts above 10% or USD 5 million. The R-08 weights (40, 30, 30) and thresholds (25, 50) are illustrative. R-08 is scored per team per week and reported in the monthly second-line report, so the app's reporting cadence stays daily, monthly and quarterly as in report 5.5.
- In the replay, the loan schedule holds the USD 7,820,000 of interest as an off-cycle roll-up payment notified to lenders, so R-01 has an expected amount to compare against. The 315 lenders and exact amounts are synthetic.
- Table 4 does not name M4, so R-08 events are tagged to rows 2 and 5.
- A fifth role, Head of Loan Ops, is added so register reviews are owner attestations rather than something any user can do. The same person is the first-line risk owner named in a Tier 3 risk acceptance.
- A sixth role, Internal Audit, is read only. It shows the third line and cannot run the reconciliation or the regression test, because it would then audit its own work.
- Releasing a Tier 3 hold keeps the report's design (Operational Risk countersigns, 3.3.3) but records it as a risk acceptance owned by the first line, so the second line does not end up owning the risk it oversees. Internal Audit reviews every acceptance, because Operational Risk also owns M4 and M5 and cannot be the only check on its own releases.
- R-07 asks for the payment type as well as the amount (report 3.1.4, "amount and nature"). It changes no synthetic test result, because every error it could catch is already caught by R-01 or R-02. Its value is that the approver has to say what the payment is.
- M4 adds an outsourced provider card at provider level (payments keyed, checks done, checks that sent on a Tier 3 payment), so 5.7's claim that M4 helps monitor the outsourced service is visible.
- M4 shows a team score only for teams of at least 3 approvers, so a team figure never points at one person. The demo has three approvers per team for this reason.

## Limitations

- **Synthetic data only.** Every person, loan and amount is invented. Results show that PCAP catches the errors we imagined, not that it would catch the next real one.
- **Not connected to Flexcube** or any bank system. The Flexcube-style screen is a simulation and the consequence engine models only the FRONT, FUND and PRINCIPAL wash-account rule.
- **Browser-only storage.** State lives in one browser's localStorage. There is no server, no shared data between users and no audit-grade storage.
- **No login or access control.** Anyone can switch roles. In production, approvers would not see the event log or the agent notice inside PCAP.
- **Added time is modelled,** not measured with volunteer approvers. The app does measure real time on the consequence screen for the approvals you make, and M4 shows it.
- **What it does not check:** beneficiary account details, payment dates in the reconciliation (it compares amounts), or a payment made against the wrong schedule line when the amount is similar. That last case would be Tier 2 and could be released if the approver's source agrees with it.
- **M4 privacy** is a design note (team level by default, at least 3 approvers per team, logged individual view), not a legal review under the PDPA.
- **The risk owner does not sign in the app.** Operational Risk records the acceptance and names the Head of Loan Ops as owner in one step. A live system would have the owner confirm it as a second key.
- **The agent notice is generated from the loan schedule** in the demo, so it is not a truly independent source. In production it is the agent's notice to lenders, held outside PCAP. The synthetic test does model it as independent.
- **Feasibility questions still open**: whether the core system and payment gateway can hold a payment for PCAP, the cost of the Wipro contract change, a build and running cost estimate, and a timed walk-through with real approvers. The How to demo screen lists who has to agree to what.

## AI use

This prototype was built with help from **Claude Code** (Anthropic), an AI coding assistant, in October 2026. Brian gave it the team's report drafts, the rule list (R-01 to R-09), the module design and the agreed Table 4 rows. Claude Code wrote most of the code, the unit tests, the synthetic test generator and this README, and checked the screens in a headless browser. A suggested line for the report's "Acknowledging Your Use of AI" table, for the team to check and edit:

> Claude Code (Anthropic): generated most of the prototype code (HTML, CSS and JavaScript), its unit tests and README from Group 4's module design, rule list and obligation map. The team reviewed, tested and adjusted the output.
