# PCAP: Payment Control Assurance Platform (prototype)

Working prototype for the NUS IS4234 Group 4 report "Approved but Not Understood: Control Design Lessons from Citibank's Revlon Payment Error".

**Synthetic data only.** No real people, accounts or payments. The Revlon replay is a simplified synthetic rebuild of a public court case.

## For teammates

**Look at this first (10 minutes).** Open https://bchuazw.github.io/is4234-pcap-prototype/. The app opens on **Home**. Press **See how PCAP would have stopped it** and then only **Next**: the guided tour replays the 2020 payment in the real app in nine steps (maker keys it, PCAP says what will really leave, the checker passes it on, you as the approver type your own figure, PCAP stops it, Operational Risk decides, the fix, and a routine payment released in one click). At the end press **Explore on your own**, pick a role card under **Try it yourself** (for example **I approve payments**) and do a real release. Then open **Test results** and press **Run seeds 1 to 50**. The material for the report and the Q&A (RC1 to RC5 and R1 to R7 mapped to screens, the IS4234 concepts, feasibility, the rules table, tiers, limitations and the synthetic test notes) is on **About this prototype**, linked at the bottom of Home and in the footer. Turn on **Show report codes** in the header to see M1 to M6 and R-01 to R-09 as small tags on every screen.

**Feedback wanted.**
- Does the consequence card say what the Revlon payment would do in words a non-technical marker understands?
- Is any screen or button confusing without Brian explaining it? Note the screen and what you expected. (See the five-second test in `Assignments/G4-Brian-PREP/zero-learning-review.md`.)
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

## Design principle: zero learning

Brian's feedback on the previous version: "when i look at the dashboard and the how to demo guide, i am confused. i dont know what im looking at, what is happening, and what i need to do, or what this platform does. if the platform requires teaching and learning, it deters people from using it."

Yang Lu made the same point in L1 (slide 13): governance that "may create unnecessary troubles or workload for your employees or for other relevant groups such as vendor side, third party side ... may be hated by these kind of groups", so it meets resistance (Yang 2026a). A control people have to learn is a control people work around, and a workaround is how the 2020 payment went out.

So the screens explain themselves by what they show, not by text about themselves:

- **Home** says what PCAP does in one sentence, shows how it works in three steps, shows the case in one glance (meant to pay USD 7.8M of interest, actually sent USD 894M, three people approved it) and offers two ways in: the guided tour, or **Try it yourself** with practice payments for a chosen role.
- **Plain words by default.** Tabs are Home, Payments, Workarounds, Approval habits, Daily checks, Board and audit, Test results and Activity log. Tiers read **Routine**, **Needs a closer look** and **Stopped**, with the tier number small beside them. Module and rule codes (M1 to M6, R-01 to R-09) are hidden until **Show report codes** is turned on, and then show as small tags.
- **One line at the top of every screen** says what the screen is for and what to do now, for the role you are in (for example "Release payments once you know what they will really do. 2 payments are waiting. The first is open: read what it will do, then release it or stop it.").
- **Long tables fold away** (the workaround list, certificates, the obligation map, the team table, each kind of planted mistake).
- **Marker material moved, not deleted,** to **About this prototype**, where codes are always shown.

## What PCAP is

PCAP is an overlay on a bank's core payment system, not a replacement. Before a payment is released, it states in plain words how much money will leave the bank, where it goes and whether it is interest or principal, and it checks that against the loan schedule. It only lets certified, independent, in-house approvers release override payments, makes them re-key the amount and the payment type blind, holds critical payments for Operational Risk (who can release one only by recording a risk acceptance), and tags every control event to the obligation it evidences.

It is designed for a bank supervised by MAS, the report's benchmark (Internal Controls, Guidelines on Outsourcing (Banks), Notice 658, TRM, PDPA). Citibank is a US bank, so the court record and the OCC and Federal Reserve orders are the evidence of what failed, not the rules PCAP is built on.

## Why people would use it

Yang Lu warned in class that governance "may create unnecessary troubles or workload for your employees or for other relevant groups such as vendor side, third party side. And this may be hated by these kind of groups" (L1 slide 13). Every group is self-interested, so "you will face a huge resistance in terms of getting all of them on board" (L3 recording, 1:17:46). And when risk, compliance, audit and frontline teams are stretched, "the compliance becomes a burden for them" (L4 slide 17). A control that is slow or annoying gets worked around, and a workaround is how the 2020 payment went out. So PCAP asks for effort only where the risk is real.

| Who | What PCAP does for them | What it costs them |
|---|---|---|
| Maker (Wipro) | Says in plain words what the payment will do before the checker sees it. New payment opens with the next unpaid schedule line and the last checker and approver. Marks any workaround leg still missing. | One review screen per payment, about 5 s (estimate). |
| Checker (Wipro) | Sees the same sentence and failed checks as the approver. A return reason is filled in from the failed checks. | Nothing extra at Tier 1 and 2. A short note only to send on a hard stop. |
| Approver (Citi) | A routine payment is one sentence and one button, focus is already on it and the next payment opens by itself. A blind re-key only when something is off. | About 7 s at Tier 1, 41 s at Tiers 2 and 3, 13 s on average (synthetic test model). |
| Operational Risk | Only hard stops reach them, with why each was held and who saw it. Release is folded behind one link and records a risk acceptance. | About 10 minutes per hold, 17 holds in the synthetic month (model). |
| Head of Loan Ops | A "Needs you" list on the register with the button next to each item, and the risk acceptances they own. | A few owner attestations a month. |
| Internal Audit | Every payment's evidence is collected as it happens. Every risk acceptance is listed with a one-click review that is logged. | Reviewing each acceptance. Replaces about 8 hours of hand sampling a quarter (assumption: 25 payments at 20 minutes). |
| Board Risk Committee | One line that says how many KRIs are red, KRIs with red first, and what PCAP costs and buys. | Reading one page a quarter. |
| Wipro service manager | Provider-level results for the monthly service review, with nobody named and no Citi approver data. | Nothing extra. |

Measured by driving the app in headless Edge at 1400 px (full method in `Assignments/G4-Brian-PREP/usability-value-review.md`): releasing two routine payments went from 3 clicks to 2 key presses, a Tier 2 roll-up from 6 clicks and 2 scrolls to 5 clicks and 1 scroll, and recording an Internal Audit review from impossible to 2 clicks. On a 390 px phone the release button used to be about two screens down. A bar at the bottom now keeps it in reach.

Honest limits of these numbers:

- **About 82% of payments are Tier 1, not 95%.** In the synthetic month 95% of payments are clean, but every payment that uses a registered workaround is Tier 2 by policy, so 64 clean payments out of 475 still get the re-key. That is the biggest cost PCAP adds, and changing it is a control decision for the team, not a usability fix.
- Times are model estimates (the synthetic test's time model and a keystroke-level count of clicks), not a timed walk-through with real staff.
- Each role sees its own "This week" strip, and the Board sees "What PCAP costs and what it buys". Counted figures come from the event log. Estimates are marked "est." and explain themselves.

## How to run it

- **From the folder or the ZIP:** unzip, then double-click `index.html`. It opens in Edge, Chrome, Firefox or Safari. No install, no build step, no internet connection and no login.
- **Online:** https://bchuazw.github.io/is4234-pcap-prototype/
- **Home** has the guided tour (**See how PCAP would have stopped it**) and **Try it yourself**. The tour starts from fresh demo data and asks first if you have made changes of your own. Each step does the action in the real app and frames it with a spotlight. **Next**, **Back** and **Skip tour** are on the card, the arrow keys move between steps and **Esc** closes it. It ends on "That's PCAP" with **Explore on your own** and **Replay**. A role card under **Try it yourself** starts from fresh demo data with practice work waiting for every role: a routine and a closer-look payment for the approver, one for the checker, the 2020 payment stopped for Operational Risk, a risk sign-off for Internal Audit to review, and the 2020 payment in the maker's form.
- On **Payments**, use **You are** to switch between Maker, Checker, Approver and Op Risk. The **You are** menu in the header also has Head of Loan Ops (first-line risk owner, owns the workarounds), Internal Audit (third line, cannot run controls), the Board Risk Committee and Wipro's service manager (both read only). Choosing a role there opens that role's own screen. When a payment waits for another role, the desk shows a "Switch to ..." button. If nothing waits for you, **Give me practice payments** puts some in your queue.
- **Show report codes** in the header adds the report's codes (M1 to M6, R-01 to R-09, obligation rows O1 to O7) as small tags on every screen and shows recorded evidence text exactly as stored. The choice is remembered in this browser. Codes are always shown on **About this prototype**.
- A number on a tab and in the role menu shows what needs the role acting now, and only things that role has to act on.
- Words with a dotted underline (wash account, Stopped, risk sign-off, "You can approve this" and so on) explain themselves when you point at them, tab to them or tap them.
- Desk keys: **J** and **K** move through the queue, **/** searches it, **Enter** presses the focused button and **Ctrl+Enter** does the main action of your panel. At Tier 1 the release button already has focus, so Enter releases and the next waiting payment opens by itself. A second Enter within 0.6 s is ignored, so a held key cannot release two payments.
- Everything you do is kept in this browser only (localStorage). **Reset demo data** restores the starting point. If the browser blocks storage, the app still works and shows a notice that changes last until reload.
- The app opens in a dark theme. The **Light** button in the header switches to a light theme for projectors, and the choice is remembered in this browser (if storage is blocked it lasts until reload). Reset demo data does not change the theme.
- Dates are shown as "11 Aug 2020" and large amounts as "USD 7.8M" in lists, with full figures on the consequence card and in the event log.

## Folder layout

| Path | What it holds |
|---|---|
| `index.html` | The single page. Classic scripts only, so it also works from `file://`. |
| `css/styles.css` | All styles, with dark and light theme colours as CSS variables. No frameworks. |
| `fonts/` | Self-hosted fonts (Space Grotesk, IBM Plex Sans, JetBrains Mono, Latin subset, woff2) and their SIL Open Font License files. Nothing is loaded from the internet. |
| `js/engine.js` | **All rule logic**: R-01 to R-09, the consequence statement, tiers, the Revlon replay and the seeded synthetic test. Loads in the browser and in Node. Unchanged by the zero-learning pass. |
| `js/plain.js` | The plain words: tab names, tier names (Routine, Needs a closer look, Stopped), role names, the Home role cards, the one line at the top of each screen, plain names for recorded steps, and the filter that shows recorded evidence text without codes. Loads in Node for the tests. |
| `js/tour.js` | The guided tour. Each step is a store action plus one render, so no step depends on timing. Back rebuilds from fresh demo data. Loads in Node for the tests. |
| `js/store.js` | State, browser storage, payment actions and the tagged event log. |
| `js/charts.js` | Small inline SVG charts in the theme colours. No chart library. |
| `js/motion.js` | Transitions and animations only. It never changes data or events. |
| `js/views/*.js` | One file per screen. `home.js` is Home and Try it yourself, `about.js` is About this prototype (the marker material that used to be on How to demo). `value.js` builds each role's "This week" strip, the "needs you" counts and the Board's cost and value card. |
| `js/app.js` | Router, role switcher, report codes switch, reset, the one line at the top of each screen and the payment detail dialog. |
| `data/seed-data.js` | Synthetic people, loans, register entries, controls and the Table 4 obligation rows. |
| `tests/` | Node unit tests (`node --test`). |

## Modules, rules and screens

| Module | Group | Screen in the app (plain name) |
|---|---|---|
| M1 Workaround and Legacy Constraint Register | Govern | Workarounds |
| M2 Pre-Release Consequence Engine | Prevent | Payments |
| M3 Authority and Independence Gate | Prevent | Payments (maker review step and "You can approve this") |
| M4 Approval Behaviour Analytics | Detect | Approval habits |
| M5 Compensating Control Monitor | Detect | Daily checks |
| M6 Obligation Map and Oversight Dashboard | Govern | Board and audit, Activity log |

| Rule | Module | Logic in the prototype | Action | Screen |
|---|---|---|---|---|
| R-01 Variance | M2 | Compares the amount PCAP computes will leave the bank with what the loan schedule expects on the value date, less anything already paid. Tolerance is the larger of USD 500 or 0.1%. | Over tolerance: Tier 2. Over 10% or USD 5 million, or nothing due: Tier 3. | Payments |
| R-02 Unscheduled principal | M2 | Principal leaving the bank when none (or less) is due that day. | Tier 3 | Payments |
| R-03 Unregistered workaround | M1 | Any override (code, wash-account setting or workaround operation) must match an active register entry for that operation with an in-date dispensation. | Tier 3 | Payments, Workarounds |
| R-04 Incomplete workaround | M1 | A registered workaround must have all its required fields set. WA-01 needs FRONT, FUND and PRINCIPAL set to the wash account. | Tier 3 | Payments, Workarounds |
| R-05 Certification | M3 | Approver holds a current certification for the override type and an approval limit at least equal to the computed outgoing amount. | M3 gate closes, blocked attempt logged, reassign | Payments |
| R-06 Independence | M3 | Approver is not the maker or checker, not in their team or reporting line, and in-house (Citi) for override payments. | M3 gate closes, blocked attempt logged, reassign | Payments |
| R-07 Active confirmation | M2 | At Tier 2 and 3 the approver re-keys the outgoing amount and says whether it is interest only, principal and interest, or principal only, without seeing the maker's figure or the checker's note. Both must match what PCAP computed. | First mismatch: re-check. Second mismatch: Tier 3. | Payments (approver) |
| R-08 Rubber-stamp score | M4 | Team score from 0 to 100, scored weekly and reported monthly: fast looks at the consequence screen (40), re-key slips (30), Tier 2 approvals within 5 seconds of the warning (30). Shown only for teams of at least 3 approvers. | Amber at 25, red at 50. Never blocks a payment. | Approval habits |
| R-09 Control health | M5 | Same-day independent reconciliation, register reviews, dispensations, certifications, hard-stop queue and the replay regression test. | Red, amber or green per control, fed to M6 | Daily checks |

**Tiers.** On screen the tiers read **Routine** (Tier 1), **Needs a closer look** (Tier 2) and **Stopped** (Tier 3), with the number small beside the name. Tier 1 routine: the approver reads the consequence statement and releases. Tier 2 elevated: blind re-key plus an explicit confirmation. Tier 3 critical: hard stop that only Operational Risk can release, by recording a risk acceptance (reason, first-line risk owner, this payment only, expires at the end of the business day). Any payment using a valid registered override is at least Tier 2. The tier thresholds are the bank's risk tolerance levels: what each level of risk makes people do.

**Three lines of defence.** First line: the Wipro maker and checker (tasks only), the Citi approver and the Head of Loan Ops (owns M1 to M3 and the risk of a Tier 3 release). Second line: Operational Risk (Tier 3 holds, M4, M5) and Compliance (M6). Third line: Internal Audit, read only, reviews every risk acceptance and pulls the evidence pack, and the app stops it from running the controls it audits.

**Activity log (the event log).** Every rule result, gate check, re-key, statement shown, hold, risk acceptance, release, register change, reconciliation and test writes an event tagged with its module, rule and obligation row (O1 to O7 from Table 4). M4, M5 and M6 are built from these events. The evidence pack exports them as JSON and CSV, with the risk acceptances listed separately for Internal Audit.

## Look and motion: the "Control Tower" theme

Payments are treated like flights that need clearance before take-off, which keeps the report's terms but gives the screens one clear idea:

- **Work queue as flight progress strips.** Each payment is a strip with its ID, amount, loan, a tier colour edge (green Tier 1, amber Tier 2, red Tier 3) and its status. Strips slide between "Waiting for you", "In progress" and "Done" when a payment is handed on.
- **Lifecycle as a clearance track.** The maker, checker, approver, Op Risk and release steps fill in as the payment moves on, and the track turns red for a ground stop and green when the payment is cleared and released.
- **Tier 3 as a ground stop.** The hard stop banner keeps its striped barrier edge and says "Stopped. Only Operational Risk can release this payment", with "Tier 3" as a small tag. The report's codes (M1 to M6, R-01 to R-09) are behind **Show report codes** and always on the About page. Maker, checker and approver keep their names.
- **Motion with a purpose.** Screens fade and rise in, amounts on the consequence card count up while the schedule and payment bars grow, then the "115 times" line appears. Failed checks appear first. A blind re-key mismatch shakes the amount box, and a match glows green. Board KPIs count up and charts draw in once. Animations last about 150 to 400 ms (counting and drawing up to about 0.9 s) and are switched off when the computer is set to reduce motion.
- **Fonts.** Space Grotesk for headings and numbers, IBM Plex Sans for text and JetBrains Mono for IDs, account legs and rule IDs. All three are under the SIL Open Font License 1.1 (licence texts in `fonts/`). They are loaded with `font-display: block`, so there is no flash of fallback text on first paint.

## Five minute demo script (for the video)

Press **Reset demo data** first. The guided tour does the payment desk part by itself, so the video is mostly pressing **Next** and talking. A manual path with a **Go** button per step is on About this prototype, under "Manual demo path", if you want to drive it by hand.

1. **0:00 to 0:20. Home.** Read the headline and point at the case card: meant to pay USD 7.8M of interest, actually sent USD 894M, three people approved it. Point at the three steps under "How it works".
2. **0:20 to 2:40. The tour.** Press **See how PCAP would have stopped it** and then **Next** at each step. What to say: (1) Priya keys the roll-up, and only PRINCIPAL is set to stay in the bank. (2) Before anything moves, PCAP says the payment will send USD 901.7M, 115 times what is due, and marks it Stopped (R-01, R-02 and R-04 fire). (3) The checker sees the same warning, and the tour passes it on as happened in 2020. (4) The approver's numbers are hidden: they type USD 7.8M of interest from their own notice (R-07, the blind re-key). (5) It does not match twice, so PCAP shows the real amount and the approver cannot release it. (6) Only Operational Risk can decide, and a release would need a written risk sign-off (L5 risk acceptance). (7) Sent back and fixed: only USD 7.8M of interest leaves and the principal stays in the bank, still a closer look because it uses a workaround. (8) A routine payment: one sentence and one click. (9) Every step was recorded for audit as it happened. End on "That's PCAP".
3. **2:40 to 3:15. Try it yourself.** Press **Explore on your own**, then **I approve payments**. Release the routine payment (the button names what will leave the bank), and the next one opens by itself asking for your own figure.
4. **3:15 to 3:35. Workarounds (M1).** Pick Head of Loan Ops in **You are**. The **Needs you** list shows WA-02's review is overdue and WA-03's dispensation ends soon. Click **Mark reviewed** next to WA-02.
5. **3:35 to 3:55. Approval habits (M4).** As Operational Risk: Team TPA is red on the rubber-stamp score (R-08). Point at "Team level only".
6. **3:55 to 4:15. Daily checks (M5).** Click **Run same-day reconciliation** and show the red, amber and green checks.
7. **4:15 to 4:40. Board and audit (M6).** As Internal Audit, click **No issue** on the risk sign-off and **Download evidence pack**. As the Board, show the numbers with red first and **What PCAP costs and what it buys** (about 82% of payments need no extra step, about 13 s of approver time per payment on average, from the synthetic model).
8. **4:40 to 5:00. Test results.** 500 made-up payments with 25 planted mistakes: every big mistake stopped, 22 of 25 stopped before release, the 3 tiny slips found the same day, 1.1% false alarms, and the 2020 payment test passes. Turn on **Show report codes** if the Q&A needs the codes. Close: PCAP narrows the gap between approving and understanding.

## Tests

From this folder, with Node 18 or later (built and run on Node 25):

```
node --test
```

There are 44 tests in `tests/engine.test.js`, `tests/flow.test.js`, `tests/value.test.js` and `tests/zero-learning.test.js` (all passing, last run 26 Oct 2026). They check that:

- the Revlon replay is held at Tier 3 with R-01, R-02 and R-04 firing, and the statement shows the principal amount
- a normal scheduled interest payment releases at Tier 1, and a correct WA-01 roll-up is Tier 2 with the principal kept inside the bank
- each rule from R-01 to R-09 blocks or flags its own error case, including duplicates, wrong dates, retired and expired workarounds, lapsed certificates, low approval limits and a maker who checks their own payment
- a blind re-key mismatch is caught, and a second mismatch escalates to Tier 3, and the right amount with the wrong payment type (interest only when principal leaves) also fails
- a Tier 3 release by Operational Risk records a risk acceptance with a first-line owner, one-payment scope and a same-day expiry, and is refused if the owner is Operational Risk, the outsourced provider or someone who took part in the payment
- every approver team in the demo has at least 3 approvers, smaller teams get no score, and Internal Audit cannot run the reconciliation or the regression test
- the synthetic test is deterministic for a fixed seed, and across seeds every Tier 3 and gate error is stopped
- the payment desk actions log every step with module, rule and obligation tags, a release by Operational Risk shows up as a reconciliation break, and a maker cannot run an independent reconciliation
- the Board estimates come from the synthetic month (409 of 500 payments at Tier 1, 13.2 s added per payment on average, about 1.8 approver hours a month) and the synthetic fingerprint is still `f5f23476`
- the weekly counts behind each role's "This week" strip are right, including a check that sends on a payment keyed at Tier 3 the week before and the money kept back by a hold that was a real error
- each role's "needs you" count only lists what that role has to act on, Internal Audit can record one review per risk acceptance (a finding needs a reason), and nobody else can record it
- the Board and Wipro's service manager cannot run controls, and the Tier 1 fast path removes no control: Tier 2 still needs the re-key and the confirmation and Tier 3 still needs Operational Risk
- every screen has a plain line at the top for every role, with no report codes, no em or en dashes and no semicolons, and tabs, tiers, roles and role cards use plain words (the old `#/guide` link opens Home)
- the tour has short plain steps, runs the real controls end to end (held at Tier 3 with R-01, R-02 and R-04, re-key escalated, rejected by Operational Risk, fixed to Tier 2 with no principal leaving, a routine payment released at Tier 1 with no re-key), rebuilds every step the same way for Back, and does not count as the person's own data
- a reset asks first only when the person has data of their own, and Try it yourself puts practice work in every role's queue, marked as demo data
- recorded evidence keeps its codes but every recorded text reads without codes on screen when report codes are off

The browser screens were also checked in headless Microsoft Edge at 1400, 1024 and 390 px width, in both the dark and light themes: the full payment desk flow ran through every role with no JavaScript errors and no sideways scrolling, every step wrote the same event log entries as before the redesign, the app still works when browser storage is blocked, and it works with reduced motion switched on. The last review also checked the keyboard tab order on every screen, that the theme and the open payment survive a reload (including a reload halfway through the approver's blind re-key, where the attempt count and the time on screen carry on), Reset demo data, the evidence pack download (JSON and CSV), the seed run and the 50-seed sweep (about 2 s, run in small chunks with progress on the button so the page never freezes), the register add, review and retire actions, the History and Event log filters, the dialogs and toasts, fonts loaded before first paint, and no layout shift on load. After the relevance review (25 Oct 2026), the changed screens were checked again at 1400 and 390 px in both themes: the How to demo panels, the approver re-key with the payment type, the Op Risk risk acceptance and release, the register, behaviour analytics, and the control monitor and Obligations and Board as Internal Audit. No JavaScript errors, no sideways scrolling (two older tables on Behaviour analytics and Control monitor were widening the page on phones and are now wrapped), and the synthetic test fingerprint is unchanged.

After the usability and value review (25 Oct 2026), a scripted pass in headless Edge drove every role at 1400 and 390 px in both themes, with 45 checks at 1400 px and 43 at 390 px, all passing: the checker's Tier 3 note rule, inline errors on the re-key, the confirmation and the Op Risk reason, the reason counter, the dotted-term explanations (focus, Escape), Enter releasing a Tier 1 payment, the next payment opening by itself, a second Enter within 0.6 s being ignored, the queue search, tier filter and J and K keys, New payment starting from the schedule line, Undo after loading a demo scenario over a filled form, the maker form opening at the routing with the missing legs marked, the owner's needs list, Internal Audit recording a review, the Board and Wipro views being read only, and each role opening on its own screen. No JavaScript errors, no sideways scrolling, and the synthetic test fingerprint is unchanged (`f5f23476`).

**Zero-learning pass (26 Oct 2026).** A scripted pass in headless Edge drove Home, every tour step, every role card, every screen as its own role, the report codes switch and the About page at 1400 and 390 px in both themes (and once with reduced motion), with 34 checks per run plus a spotlight check on every tour step: the tour starts without asking on fresh data and asks when there is data of your own, the spotlight frames each target with the card on screen and not covering it, Back and the arrow keys rebuild the same step, Esc closes it, Replay restarts it, Explore on your own returns to Home, each role card lands on work waiting for that role, the codes switch is remembered across a reload, and the visible copy on every screen has no em or en dashes, no semicolons and no report codes while codes are off. No JavaScript errors and no sideways scrolling. The five-second test for every screen, before and after, is in `Assignments/G4-Brian-PREP/zero-learning-review.md`.

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
- **Low effort for routine work (usability review, 25 Oct 2026).** At Tier 1 the release button names what will leave the bank ("Release USD 1.3M to 42 lenders"), has focus when the payment opens, and after a release the next payment waiting for that role opens by itself. There is no "approve all", not even for Tier 1, because reading the one sentence is the control. A keyboard press within 0.6 s of a new payment opening is ignored, so a held or double Enter cannot release two payments.
- Friction is kept at Tiers 2 and 3 and nothing was removed there. The blind re-key, the "I confirm" tick and the Tier 3 hold are unchanged. The approver's own payment type is kept for the second re-key attempt, but nothing from the maker or checker is ever filled in.
- A checker who sends on a Tier 3 payment has to write why (at least 10 characters). This is enforced on the payment desk only, not in `js/store.js`, so the synthetic test and the existing tests are unchanged.
- The approver no longer sees a ticking "time on this screen" counter, because a visible timer invites people to wait it out (gaming dwell time, report 5.9). The time is still recorded for M4 exactly as before.
- Two read-only roles were added so every user in the review has a screen: the Board Risk Committee (opens on Board and audit) and Wipro's service manager (opens on a provider-only view with no Citi approver data). Neither can run a control.
- Internal Audit can now record its review of each risk acceptance (no issue, or a finding with a reason). This is audit work, not running a control, so it does not break the rule that the third line does not run the controls it audits. It is logged as `ACCEPTANCE_REVIEWED` (M6, rows O1 and O2) and is in the evidence pack.
- "Needs you" counts show only things the role must act on (waiting payments, register items, acceptances to review, controls it owns that are not green, red KRIs for the Board, hard stops sent on for the provider). Nothing is pushed as a pop-up, to avoid alert fatigue.
- **Zero learning (26 Oct 2026).** The How to demo page is replaced by Home and the guided tour. The tour drives the real store actions and draws each step once, so it never waits on a timer. Back rebuilds the step from fresh demo data, which is why it is always the same. Practice payments are marked as demo data, so the next tour or role card does not ask before clearing them.
- Recorded evidence text (the activity log, control messages, risk sign-off follow-ups) is stored with the report's codes, because that is what an auditor tests and what the evidence pack exports. With codes off, the screens show it through a plain-words filter in `js/plain.js`. The stored text and the evidence pack never change.
- "Risk acceptance" reads as **risk sign-off** on screen and "blind re-key" as **your own figure**. The report's terms are in the dotted-term explanations and on the About page.
- The approver's typed-figure card says in plain words why PCAP wants a closer look (a workaround, an amount the schedule does not expect, or something badly off) without giving away any number.
- On phones the desk's "This week" strip steps aside so the payment is closer to the top. It stays on the other screens.

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
- **The cost and value figures are estimates.** Approver time comes from the synthetic test's time model, the audit saving from an assumption (25 payments a quarter at 20 minutes each, set in `VALUE_ASSUMPTIONS` in `js/engine.js`), and the click and time comparison from a keystroke-level model of what the test driver did. None of it is a timed walk-through with real staff. The "This week" numbers mix the seeded demo history with what you do in this browser.
- **About 82% of payments are Tier 1 in the synthetic month, not 95%.** Override payments are Tier 2 by policy, so about one clean payment in seven still gets the re-key. Lowering that is a control decision for the team.

## AI use

This prototype was built with help from **Claude Code** (Anthropic), an AI coding assistant, in October 2026. Brian gave it the team's report drafts, the rule list (R-01 to R-09), the module design and the agreed Table 4 rows. Claude Code wrote most of the code, the unit tests, the synthetic test generator and this README, and checked the screens in a headless browser. A suggested line for the report's "Acknowledging Your Use of AI" table, for the team to check and edit:

> Claude Code (Anthropic): generated most of the prototype code (HTML, CSS and JavaScript), its unit tests and README from Group 4's module design, rule list and obligation map. The team reviewed, tested and adjusted the output.
