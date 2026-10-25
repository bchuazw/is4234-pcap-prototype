/*
 * PCAP prototype: synthetic demo data.
 *
 * SYNTHETIC DATA ONLY. Every person, loan, lender count and amount here is made up
 * for the demo. Dates are stored as day offsets from the business date (the day the
 * demo is opened), so the demo always has payments due "today".
 * The Revlon replay loan lives in js/engine.js (REPLAY) so tests and the UI share it.
 *
 * Loads as a classic script in the browser (window.PCAP.data) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var DATA = {
    version: 1,
    notice: 'Synthetic demo data only. No real people, accounts or payments. The Revlon replay is a simplified synthetic rebuild of a public court case.',

    /* People. Names are invented. "employer" and "inHouse" drive the R-06 in-house rule. */
    users: [
      { id: 'U-MK1', name: 'Priya S.', employer: 'Wipro', inHouse: false, team: 'Wipro Loan Ops A', title: 'Payment maker (outsourced)', roles: ['maker'], reportsTo: 'U-SUP1', approvalLimit: 0, certs: [] },
      { id: 'U-CK1', name: 'Kiran N.', employer: 'Wipro', inHouse: false, team: 'Wipro Loan Ops A', title: 'Payment checker (outsourced)', roles: ['checker'], reportsTo: 'U-SUP1', approvalLimit: 0, certs: [] },
      { id: 'U-SUP1', name: 'Sunil I.', employer: 'Wipro', inHouse: false, team: 'Wipro Loan Ops A', title: 'Team manager (outsourced)', roles: ['checker', 'approver'], reportsTo: null, approvalLimit: 25000000, certs: [{ type: 'WA-01', validOffset: 140 }] },
      { id: 'U-AP1', name: 'Lena B.', employer: 'Citi', inHouse: true, team: 'Citi Approvers DE', title: 'Senior manager, loan operations', roles: ['approver'], reportsTo: 'U-HLO', approvalLimit: 2000000000, certs: [{ type: 'WA-01', validOffset: 210 }] },
      { id: 'U-AP2', name: 'Marco O.', employer: 'Citi', inHouse: true, team: 'Citi Approvers NY', title: 'Manager, loan operations', roles: ['approver'], reportsTo: 'U-HLO', approvalLimit: 2000000000, certs: [{ type: 'WA-01', validOffset: -24 }] },
      { id: 'U-AP3', name: 'Tom W.', employer: 'Citi', inHouse: true, team: 'Citi Approvers DE', title: 'Assistant manager, loan operations', roles: ['approver'], reportsTo: 'U-AP1', approvalLimit: 50000000, certs: [] },
      { id: 'U-AP4', name: 'Grace T.', employer: 'Citi', inHouse: true, team: 'Citi Approvers TPA', title: 'Manager, loan operations', roles: ['approver'], reportsTo: 'U-HLO', approvalLimit: 2000000000, certs: [{ type: 'WA-01', validOffset: 19 }] },
      { id: 'U-OR1', name: 'Rana H.', employer: 'Citi', inHouse: true, team: 'Citi Operational Risk', title: 'Operational Risk, second line', roles: ['oprisk'], reportsTo: null, approvalLimit: 0, certs: [] },
      { id: 'U-HLO', name: 'Dana F.', employer: 'Citi', inHouse: true, team: 'Citi Loan Ops Management', title: 'Head of Loan Operations, first line owner', roles: ['owner'], reportsTo: null, approvalLimit: 0, certs: [] },
      { id: 'U-TEC', name: 'Evan L.', employer: 'Citi', inHouse: true, team: 'Citi Technology', title: 'Tech lead, payments platform', roles: ['tech'], reportsTo: null, approvalLimit: 0, certs: [] }
    ],

    /* Demo personas behind the role switcher. */
    roles: [
      { id: 'maker', label: 'Maker (Wipro ops)', userId: 'U-MK1' },
      { id: 'checker', label: 'Checker (Wipro ops)', userId: 'U-CK1' },
      { id: 'approver', label: 'Approver (Citi, in-house)', userId: 'U-AP1' },
      { id: 'oprisk', label: 'Operational Risk (second line)', userId: 'U-OR1' },
      { id: 'owner', label: 'Head of Loan Ops (register owner)', userId: 'U-HLO' }
    ],

    /* Loans with schedules. "offset" is days from the business date. */
    loans: [
      { id: 'LN-1001', name: 'Harbourline Logistics term loan B', borrower: 'Harbourline Logistics (synthetic)', lenders: 42, principalOutstanding: 425000000,
        schedule: [
          { offset: -91, interest: 1275000, principal: 0, paidInterest: 1275000 },
          { offset: 0, interest: 1284375, principal: 0, note: 'Quarterly interest' },
          { offset: 91, interest: 1290000, principal: 0 }
        ] },
      { id: 'LN-1002', name: 'Kestrel Foods amortising term loan', borrower: 'Kestrel Foods (synthetic)', lenders: 18, principalOutstanding: 250000000,
        schedule: [
          { offset: 0, interest: 618750, principal: 12500000, note: 'Quarterly instalment' },
          { offset: 91, interest: 590625, principal: 12500000 }
        ] },
      { id: 'LN-1003', name: 'Meridian Retail revolving facility', borrower: 'Meridian Retail (synthetic)', lenders: 9, principalOutstanding: 120000000,
        schedule: [
          { offset: 5, interest: 487500, principal: 0, note: 'Monthly interest' }
        ] },
      { id: 'LN-1004', name: 'Northwind Energy term loan (roll-up today)', borrower: 'Northwind Energy (synthetic)', lenders: 27, principalOutstanding: 310000000,
        schedule: [
          { offset: 0, interest: 2145000, principal: 0, note: 'Accrued interest on roll-up. Principal stays in the bank via WA-01.' },
          { offset: 1460, interest: 0, principal: 310000000, note: 'Maturity' }
        ] },
      { id: 'LN-1005', name: 'Atlas Shipping term loan A', borrower: 'Atlas Shipping (synthetic)', lenders: 12, principalOutstanding: 180000000,
        schedule: [
          { offset: 0, interest: 1012500, principal: 0, note: 'Quarterly interest' }
        ] },
      { id: 'LN-1006', name: 'Solace Healthcare term loan', borrower: 'Solace Healthcare (synthetic)', lenders: 31, principalOutstanding: 560000000,
        schedule: [
          { offset: 0, interest: 3150000, principal: 0, note: 'Quarterly interest' }
        ] },
      { id: 'LN-1007', name: 'Copperline Mining facility (roll-up)', borrower: 'Copperline Mining (synthetic)', lenders: 22, principalOutstanding: 140000000,
        schedule: [
          { offset: 0, interest: 980000, principal: 0, note: 'Accrued interest on roll-up. Principal stays in the bank via WA-01.' }
        ] },
      { id: 'LN-1008', name: 'Brightwater Utilities term loan', borrower: 'Brightwater Utilities (synthetic)', lenders: 7, principalOutstanding: 96000000,
        schedule: [
          { offset: -1, interest: 845000, principal: 0, note: 'Quarterly interest' }
        ] }
    ],

    /* M1 Workaround and Legacy Constraint Register. Offsets are days from the business date. */
    register: [
      { id: 'WA-01', title: 'Interest-only payment through the wash account (roll-up)',
        constraint: 'The core loan system has no interest-only payment function, so a roll-up is booked as a full payoff.',
        workaround: 'Book the payoff and route the principal to the internal wash account so only interest leaves the bank.',
        requiredFields: ['FRONT', 'FUND', 'PRINCIPAL'], requiredValue: 'WASH', appliesTo: ['INTEREST_VIA_WASH'], certType: 'WA-01',
        ownerId: 'U-HLO', inUseSinceOffset: -2420, lastReviewOffset: -96, nextReviewOffset: 88, dispensationOffset: 250,
        refreshPlan: 'Interest-only function in the core upgrade, target Q2 2027', status: 'Active', onDesk: true },
      { id: 'WA-02', title: 'Manual holiday-calendar override for SGD value dates',
        constraint: 'The core calendar is missing some Singapore public holidays.',
        workaround: 'Ops overrides the value date by hand with a reason code.',
        requiredFields: ['VALUE_DATE_REASON', 'CALENDAR_REF'], requiredValue: 'SET', appliesTo: [], certType: 'WA-02',
        ownerId: 'U-HLO', inUseSinceOffset: -900, lastReviewOffset: -206, nextReviewOffset: -23, dispensationOffset: 160,
        refreshPlan: 'Calendar feed from treasury, target Q1 2027', status: 'Active', onDesk: false },
      { id: 'WA-03', title: 'Spreadsheet interest for payment-in-kind (PIK) loans',
        constraint: 'The core system cannot compute PIK interest.',
        workaround: 'Interest is computed in a controlled spreadsheet and keyed by hand with a second calculation.',
        requiredFields: ['CALC_SHEET_ID', 'SECOND_CALC'], requiredValue: 'SET', appliesTo: [], certType: 'WA-03',
        ownerId: 'U-HLO', inUseSinceOffset: -540, lastReviewOffset: -40, nextReviewOffset: 50, dispensationOffset: 20,
        refreshPlan: 'PIK module in the core upgrade, target Q3 2027', status: 'Active', onDesk: false },
      { id: 'WA-04', title: 'Principal suppression through a fee code (retired)',
        constraint: 'Old route to stop principal leaving the bank.',
        workaround: 'Book principal against a fee code. Retired after it was found to hide principal movements.',
        requiredFields: ['FRONT', 'FUND', 'PRINCIPAL'], requiredValue: 'WASH', appliesTo: ['INTEREST_VIA_WASH'], certType: 'WA-04',
        ownerId: 'U-HLO', inUseSinceOffset: -3100, lastReviewOffset: -330, nextReviewOffset: null, dispensationOffset: null, retiredOffset: -320,
        refreshPlan: 'Retired', status: 'Retired', onDesk: true }
    ],

    /* M5 compensating controls with owners and tests (obligation row 7). */
    controls: [
      { id: 'CC-01', name: 'Same-day independent reconciliation of released vs expected amounts', ownerId: 'U-OR1', frequency: 'Daily by 18:00' },
      { id: 'CC-02', name: 'Workaround register reviews on time', ownerId: 'U-HLO', frequency: 'Per entry review date' },
      { id: 'CC-03', name: 'Workaround dispensations in date', ownerId: 'U-HLO', frequency: 'Per entry expiry date' },
      { id: 'CC-04', name: 'Approver certifications current', ownerId: 'U-HLO', frequency: 'Monthly' },
      { id: 'CC-05', name: 'Hard-stop queue cleared the same day', ownerId: 'U-OR1', frequency: 'Daily' },
      { id: 'CC-06', name: 'Revlon replay regression test passes', ownerId: 'U-TEC', frequency: 'Monthly and after every rule change', lastRunOffset: -12 }
    ],

    /* Table 4 obligation rows agreed by the team (short wording). */
    obligations: [
      { id: 'O1', source: 'MAS IC 2.3.1 to 2.3.2', topic: 'Delegation of authority', risk: 'Override authority not matched to consequence', control: 'Consequence-based entitlements', modules: ['M3'], rules: ['R-05'], evidence: 'Entitlement log, blocked-attempt reports' },
      { id: 'O2', source: 'MAS IC 2.4.1, 2.4.3(d)', topic: 'Segregation of duties', risk: 'A shared error passes separated roles', control: 'Blind re-key, consequence statement, variance hard stop', modules: ['M2'], rules: ['R-01', 'R-02', 'R-07'], evidence: 'Confirmation logs, re-key mismatch rate, hard stops' },
      { id: 'O3', source: 'MAS IC 2.5, 2.12.1', topic: 'Competency and training', risk: 'Workaround unknown or misapplied', control: 'Certification per override type', modules: ['M3'], rules: ['R-05', 'R-04'], evidence: 'Certification register vs approvals' },
      { id: 'O4', source: 'MAS IC 2.1.3, 3.5.6', topic: 'Manuals and MIS', risk: 'Tacit workaround invisible to 2nd and 3rd line', control: 'Workaround register plus override-usage mining', modules: ['M1'], rules: ['R-03', 'R-04'], evidence: '% override usage mapped to a register entry' },
      { id: 'O5', source: 'MAS Notice 658, Outsourcing Guidelines 3.1.1', topic: 'Outsourcing accountability', risk: 'Accountability diluted by outsourcing', control: 'Named senior owner and one certified in-house approver', modules: ['M3', 'M1'], rules: ['R-06', 'R-08'], evidence: 'Approval-chain composition report, owner attestations' },
      { id: 'O6', source: 'MAS TRM 7.3.2 to 7.3.3, OCC (2020a) Art. V(2)(d)(i)', topic: 'Legacy system limitation', risk: 'Known system limitation tolerated', control: 'Refresh plan and time-limited dispensation', modules: ['M1'], rules: ['R-03', 'R-09'], evidence: 'Open and expired dispensations' },
      { id: 'O7', source: 'OCC (2020a) Art. XVI(5), Fed (2024)', topic: 'Sustained effectiveness', risk: 'Remediation without sustained effectiveness', control: 'Compensating controls with owners and tests', modules: ['M5'], rules: ['R-09'], evidence: 'Test results, overdue tests' }
    ],

    /* M4 approver teams, used for seeded weekly history (synthetic). */
    approverTeams: ['Citi Approvers DE', 'Citi Approvers NY', 'Citi Approvers TPA']
  };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = DATA;
  } else {
    root.PCAP = root.PCAP || {};
    root.PCAP.data = DATA;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
