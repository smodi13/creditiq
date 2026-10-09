#!/usr/bin/env python3
"""Static formula audit + independent recomputation for every CreditIQ workbook (fast: no recalculation needed).
Writes data/validation/audit_<case>.json.  Usage: python3 scripts/audit_model.py [case-id ...]   (exit 1 on any failure)
Dynamic change-impact tests live in scripts/model_harness.py."""
import datetime as dt, json, os, re, sys
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl

sys.path.insert(0, os.path.dirname(__file__))
from model_harness import find_row  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
INPUT_SHEETS = {"Assumptions", "Historical Financials", "Sensitivities", "Calc Engine"}
BLUE, GREEN = "FF0000FF", "FF007A33"
ALLOWED = {"0", "1", "2", "12", "31", "99", "100", "0.1", "0.5", "0.9", "0.001", "0.0001"}
LINK = re.compile(r"^=\s*('[^']+'|[A-Za-z_]+)!\$?[A-Z]{1,3}\$?\d+$")
STR = re.compile(r'"[^"]*"')
REF = re.compile(r"(?:'[^']+'|[A-Za-z_]+)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?")
NUM = re.compile(r"(?<![A-Za-z_.])\d+\.?\d*")
REF2 = re.compile(r"(?:'([^']+)'|([A-Za-z_]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?|(?<![A-Za-z_!'])\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?")
CALC_LABELS = re.compile(r"^(EBITDA|EBIT|Net income|Interest expense|Free cash flow|Ending balance|Total debt|Net debt|Gross profit|Credit score|IRR|MOIC|Recovery %|TOTAL RECOVERY|Loss|Ending cash|Net debt / EBITDA|Gross debt / EBITDA|Interest coverage|Debt service|Liquidity|Headroom|BREACH)", re.I)


def color(c):
    col = c.font.color
    return col.rgb if col is not None and col.type == "rgb" else None


def audit(cid):
    path = os.path.join(ROOT, "models", f"CreditIQ_{cid.upper()}_Model.xlsx")
    wbf, wbv = load_workbook(path), load_workbook(path, data_only=True)
    res = []
    tag = f"[{cid}] "

    def rec(name, ok, detail=""):
        res.append((tag + name, bool(ok), detail))
        print(("PASS " if ok else "FAIL ") + tag + name + (f" — {detail}" if detail else ""))

    n_formula = n_input = 0
    bad_hard, bad_color, bad_lit, bad_blue_f, uncomputed, errors = [], [], [], [], [], []
    for ws in wbf:
        wv = wbv[ws.title]
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if v is None:
                    continue
                if isinstance(v, str) and v.startswith("="):
                    n_formula += 1
                    col_ = color(c)
                    if col_ == BLUE:
                        bad_blue_f.append(f"{ws.title}!{c.coordinate}")
                    if LINK.match(v) and col_ != GREEN:
                        bad_color.append(f"{ws.title}!{c.coordinate}")
                    for n in NUM.findall(REF.sub("", STR.sub("", v))):
                        if n not in ALLOWED:
                            bad_lit.append(f"{ws.title}!{c.coordinate}: {n} in {v[:60]}")
                    cv = wv[c.coordinate].value
                    if cv is None:
                        uncomputed.append(f"{ws.title}!{c.coordinate}")
                    if isinstance(cv, str) and (cv.startswith("#") or cv.startswith("Err:")):
                        errors.append(f"{ws.title}!{c.coordinate}={cv}")
                elif isinstance(v, (int, float, dt.date, dt.datetime)) and not isinstance(v, bool):
                    n_input += 1
                    if color(c) != BLUE:
                        bad_hard.append(f"{ws.title}!{c.coordinate}={v}")
                    elif ws.title not in INPUT_SHEETS:
                        bad_hard.append(f"{ws.title}!{c.coordinate}={v} (input outside input tabs)")
    rec("S1 every numeric constant is a blue input on an input tab", not bad_hard, f"{n_input} inputs; offenders {bad_hard[:4]}")
    rec("S2 no blue (input) cell contains a formula", not bad_blue_f, str(bad_blue_f[:4]))
    rec("S3 pure cross-sheet links are green", not bad_color, str(bad_color[:4]))
    rec("S4 no embedded numeric literals in formulas (beyond structural 0/1/2/12/31/99/100 and IRR starting guesses)", not bad_lit, f"{n_formula} formulas; offenders {bad_lit[:4]}")
    rec("S5 no #REF!, #DIV/0!, #VALUE!, #N/A, #NAME?, #NUM! or circular-reference (Err:5xx) in any computed cell", not errors, str(errors[:4]))
    rec("S6 every formula has a computed value", not uncomputed, f"{len(uncomputed)} uncomputed")

    off = []
    for ws in wbf:
        if ws.title in ("Assumptions", "Sources", "Cover"):
            continue
        for r in range(1, ws.max_row + 1):
            lab = ws.cell(r, 1).value
            if isinstance(lab, str) and CALC_LABELS.match(lab.strip()) and "adjustment" not in lab and not (ws.title == "Historical Financials" and lab.strip().startswith(("Interest expense", "Income taxes"))):
                for cc in range(3, 12):
                    cell = ws.cell(r, cc)
                    if isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool):
                        off.append(f"{ws.title}!{cell.coordinate}")
    rec("S7 rows labelled as calculated outputs contain only formulas", not off, str(off[:4]))

    def precedents(sheet, coord):
        v = wbf[sheet][coord].value
        if not (isinstance(v, str) and v.startswith("=")):
            return []
        out = []
        for m in REF2.finditer(STR.sub("", v)):
            sh = m.group(1) or m.group(2)
            if sh:
                c1, r1, c2, r2 = m.group(3), m.group(4), m.group(5), m.group(6)
            else:
                sh, c1, r1, c2, r2 = sheet, m.group(7), m.group(8), m.group(9), m.group(10)
            if sh not in wbf.sheetnames:
                continue
            c2, r2 = c2 or c1, r2 or r1
            for rr in range(int(r1), int(r2) + 1):
                for cc in range(ci(c1), ci(c2) + 1):
                    out.append((sh, f"{gl(cc)}{rr}"))
        return out

    def trace(root):
        seen, stack, leaves = set(), [root], set()
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            p = precedents(*n)
            val = wbf[n[0]][n[1]].value
            if not p and val is not None and not str(val).startswith("="):
                leaves.add(n)
            stack.extend(p)
        return seen, leaves

    isum = wbf["Investment Summary"]
    for lbl, need in (("Base-case IRR", {"Scenarios", "Calc Engine", "Assumptions", "Historical Financials"}), ("Probability-weighted IRR", {"Assumptions", "Historical Financials"}),
                      (f"Net leverage — base period", {"Assumptions", "Historical Financials"}), ("Credit score", {"Assumptions", "Historical Financials"}), ("Recovery (selected", {"Assumptions", "Historical Financials"})):
        rr = find_row(isum, lbl)
        s_, l_ = trace(("Investment Summary", f"C{rr}"))
        tabs, leaf_tabs = {s for s, _ in s_}, {s for s, _ in l_}
        rec(f"S8 '{lbl}' traces back through formulas to blue inputs on Assumptions / Historical", need <= tabs and {"Assumptions", "Historical Financials"} <= leaf_tabs, f"{len(s_)} cells, input leaves on {sorted(leaf_tabs)}")
    dr = find_row(isum, "DECISION")
    s_, l_ = trace(("Investment Summary", f"C{dr}"))
    rec("S8b recommendation traces to inputs through Scenarios and Calc Engine", {"Scenarios", "Calc Engine", "Assumptions"} <= {s for s, _ in s_}, f"{len(s_)} cells")
    ro = find_row(isum, "OVERALL MODEL STATUS")
    rec("S9 in-workbook integrity checks all pass", wbv["Investment Summary"][f"D{ro}"].value == "ALL CHECKS PASS", str(wbv["Investment Summary"][f"D{ro}"].value))

    names = {n: d.attr_text for n, d in wbf.defined_names.items()}
    ok_names = all(isinstance(wbv[a.split("!")[0].strip("'")][a.split("!")[1].replace("$", "")].value, (int, float, str, dt.datetime, type(None))) for a in names.values())
    rec("S10 named ranges resolve to cells", bool(names) and ok_names, ", ".join(sorted(names)))

    # sensitivity monotonicity
    ws = wbv["Sensitivities"]
    def table(title):
        r0 = find_row(wbf["Sensitivities"], title)
        return [[ws.cell(r0 + 2 + i, c).value for c in (3, 4, 5)] for i in range(5)]
    t1, t2, t7 = table("Table 1"), table("Table 2"), table("Table 7")
    mono = lambda t, up: all(all((t[i + 1][j] >= t[i][j] - 1e-9) if up else (t[i + 1][j] <= t[i][j] + 1e-9) for i in range(4)) for j in range(3))
    rec("S11 sensitivity monotonicity: IRR falls as purchase price rises; IRR and MOIC rise with recovery / exit value", mono(t1, False) and mono(t2, True) and mono(t7, True), f"price table base col {[round(r[0], 3) for r in t1]}")
    errs = [c for r in (t1 + t2 + table("Table 3") + table("Table 4") + table("Table 5") + table("Table 6") + t7) for c in r if c is None or (isinstance(c, str) and c.startswith("#"))]
    rec("S11b all seven sensitivity tables are fully populated (63 simulated cases) with no errors", not errs, f"{len(errs)} bad cells")

    # public cases: provenance of historical inputs
    case = json.load(open(os.path.join(ROOT, "models", "cases", f"{cid}.json")))
    if case["dataClass"] == "public":
        wh, whf = wbv["Historical Financials"], wbf["Historical Financials"]
        reg = {}
        wso = wbv["Sources"]
        r0 = find_row(wbf["Sources"], "Datapoint ID", 1, 1, True)
        for r in range(r0 + 1, wso.max_row + 1):
            if wso.cell(r, 1).value:
                reg[wso.cell(r, 1).value] = (wso.cell(r, 4).value, wbf["Sources"].cell(r, 13).value)
        ids = {p["id"] for p in case["provenance"]}
        miss = []
        for inp in case["historicalSpec"]["inputs"]:
            for colid, v in (inp.get("src") or {}).items():
                if f"{cid}.{inp['key']}.{colid}" not in ids:
                    miss.append((inp["key"], colid))
        rec("S12a every sourced historical input has a datapoint (filing, accession, page/section, URL)", not miss, f"{len(ids)} datapoints; missing {miss[:3]}")
        bad = []
        for inp in case["historicalSpec"]["inputs"]:
            r = find_row(whf, inp["label"])
            for colid, dpid in (inp.get("src") or {}).items():
                col_ = {c["id"]: i for i, c in enumerate(case["historicalSpec"]["columns"])}[colid]
                cell_v = wh.cell(r, 2 + col_).value
                link_v = reg.get(dpid, (None,))[0]
                if link_v is None or abs(float(link_v) - float(cell_v)) > 1e-9:
                    bad.append((dpid, cell_v, link_v))
        rec("S12b Sources register values are live links that equal the Historical Financials inputs", not bad, f"{len(reg)} register rows; mismatches {bad[:3]}")
        ck = find_row(whf, "Check:")
        vals = [wh.cell(ck, c).value for c in range(2, 2 + len(case["historicalSpec"]["columns"])) if isinstance(wh.cell(ck, c).value, (int, float))]
        rec("S12c model-calculated EBITDA / NOI equals the company-reported figure in every period (to $0.005M)", vals and all(abs(x) < 0.005 for x in vals), f"{len(vals)} periods, max |diff| {max(abs(x) for x in vals):.4f}")

    # independent recomputation ---------------------------------------------------------------
    A = wbf["Assumptions"]
    v = lambda sheet, label, col, start=1, exact=False: wbv[sheet][f"{col}{find_row(wbf[sheet], label, 1, start, exact)}"].value
    # (a) operating lines for the selected scenario
    sel = A[f"C{find_row(A, 'ACTIVE SCENARIO')}"].value
    hdr = find_row(A, ["Base Case", "Downside", "Severe Downside"][sel - 1], exact=True)
    g = [A[f"{c}{find_row(A, 'Revenue growth', start=hdr)}"].value for c in "GHIJK"]
    m = [A[f"{c}{find_row(A, 'EBITDA margin', start=hdr)}"].value for c in "GHIJK"]
    cap = A[f"C{find_row(A, 'Capex', start=hdr)}"].value
    rev0 = v("Operating Model", "Revenue", "F", 5, True)
    ok, rv = True, rev0
    for i, c in enumerate("GHIJK"):
        rv *= 1 + g[i]
        ok &= abs(v("Operating Model", "Revenue", c, 5, True) - rv) < 1e-6 and abs(v("Operating Model", "EBITDA", c, 5, True) - rv * m[i]) < 1e-6 and abs(v("Operating Model", "Capex", c, 5, True) - rv * cap) < 1e-6
    rec("D1 independent Python recomputation of revenue, EBITDA and capex (5 periods, selected scenario) matches the workbook", ok)
    # (b) interest in period 1
    fac = find_row(A, "Facility", exact=True)
    sofr = A[f"G{find_row(A, 'Base rate (SOFR)')}"].value
    shock = A[f"C{find_row(A, 'Floating-rate shock', start=hdr)}"].value
    int1 = 0.0
    nt = 0
    while A.cell(fac + 1 + nt, 3).value is not None and isinstance(A.cell(fac + 1 + nt, 3).value, (int, float)):
        r = fac + 1 + nt
        bal, cpn, spr, flo, flt = A.cell(r, 3).value, A.cell(r, 5).value, A.cell(r, 6).value, A.cell(r, 7).value, A.cell(r, 9).value
        int1 += bal * ((max(sofr, flo) + spr + shock) if flt == 1 else cpn)
        nt += 1
    rec("D2 period-1 cash interest = Σ face × all-in rate (SOFR floor, spread, scenario shock) recomputed independently", abs(v("Operating Model", "  Cash interest expense", "G", 5) - int1) < 1e-6, f"{int1:.3f}")
    # (c) recovery waterfall (independent port, incl. collateral pools and deficiency claims)
    rw, rwf = wbv["Recovery"], wbf["Recovery"]
    def grp(label):
        r = find_row(rwf, label)
        return [rw.cell(r + 1 + i, 3).value for i in range(nt)]
    claims, ranks, cps = grp("Claim at valuation event"), grp("Seniority rank"), grp("Collateral share")
    net = v("Recovery", "Net value distributable", "C")
    defr = A[f"C{find_row(A, 'Rank at which secured deficiency')}"].value
    paid = [min(c, p * net) if p > 0 else 0 for c, p in zip(claims, cps)]
    gcl = [(c - pd) if p > 0 else c for c, p, pd in zip(claims, cps, paid)]
    gk = [defr if p > 0 else k for p, k in zip(cps, ranks)]
    rem = net - sum(paid)
    exp = []
    for i in range(nt):
        sen = sum(c for c, k in zip(gcl, gk) if k < gk[i]); same = sum(c for c, k in zip(gcl, gk) if k == gk[i])
        exp.append(paid[i] + (0 if same == 0 else gcl[i] / same * max(0, min(same, rem - sen))))
    got = grp("TOTAL RECOVERY")
    rec("D3 recovery waterfall (seniority, collateral pools, deficiency claims) matches an independent Python waterfall", all(abs(a - b) < 1e-6 for a, b in zip(exp, got)), f"model {[round(x, 1) for x in got]}")
    # (d) returns
    cf = [wbv["Returns"].cell(find_row(wbf["Returns"], "Net cash flow", 1, 5, True), 3 + k).value for k in range(7)]
    cost = -cf[0]
    inflow = sum(cf[1:])
    def npv(r): return sum(f / (1 + r) ** t for t, f in enumerate(cf))
    lo, hi = -0.9999, 10.0
    for _ in range(300):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0: hi = mid
        else: lo = mid
    irr_py = (lo + hi) / 2 if inflow > 0 else -1
    rec("D4 IRR and MOIC recomputed independently from the cash-flow row", abs(irr_py - v("Returns", "IRR", "C", 5, True)) < 1e-6 and abs(inflow / cost - v("Returns", "MOIC", "C", 5, True)) < 1e-9, f"IRR {irr_py:.5f}")
    # (d2) waterfall bounds: no tranche above its claim, total recovery within net distributable value, equity only after all claims
    tot_rec = sum(got)
    rec("D3b recovery bounds: every tranche ≤ its claim, total recoveries ≤ net distributable value, equity residual only when all claims are paid", all(g <= c + 1e-6 for g, c in zip(got, claims)) and tot_rec <= net + 1e-6 and (net - tot_rec < 1e-6 or all(abs(g - c) < 1e-6 for g, c in zip(got, claims))), f"recoveries {tot_rec:.1f} ≤ net value {net:.1f}; claims {sum(claims):.1f}")
    # (d3) return-method checks: known answer, XIRR, probability-weighted (expected-cash-flow) IRR, contractual-timing IRR
    def irr_py2(fl):
        f = lambda r: sum(x / (1 + r) ** t for t, x in enumerate(fl))
        lo, hi = -0.9999, 10.0
        for _ in range(300):
            mid = (lo + hi) / 2
            if f(lo) * f(mid) <= 0: hi = mid
            else: lo = mid
        return (lo + hi) / 2
    rec("D7 known-answer IRR: [-100, 10, 10, 110] → exactly 10.0000% (independent bisection)", abs(irr_py2([-100, 10, 10, 110]) - 0.10) < 1e-9 and abs(sum(f / 1.1 ** t for t, f in enumerate([-100, 10, 10, 110]))) < 1e-9)
    rw_ = wbv["Returns"]; rf_ = wbf["Returns"]
    xr = find_row(rf_, "XIRR (date-weighted")
    dr = find_row(rf_, "Dates for XIRR")
    dts = [rw_.cell(dr, 3 + k).value for k in range(7)]
    d0 = dts[0]
    def xirr_py(flows, dates):
        f = lambda r: sum(x / (1 + r) ** ((d - dates[0]).days / 365) for d, x in zip(dates, flows))
        lo, hi = -0.9999, 10.0
        for _ in range(300):
            mid = (lo + hi) / 2
            if f(lo) * f(mid) <= 0: hi = mid
            else: lo = mid
        return (lo + hi) / 2
    xi = xirr_py(cf, dts) if inflow > 0 else -1
    rec("D7b Excel XIRR equals an independent actual/365 XIRR of the same dated cash flows", abs(xi - rw_.cell(xr, 3).value) < 1e-4 or inflow <= 0, f"XIRR {xi:.5f} vs IRR {irr_py:.5f} (differences are leap-year day counts)")
    sc_, scf = wbv["Scenarios"], wbf["Scenarios"]
    pr = find_row(scf, "Scenario probability")
    P = [sc_.cell(pr, 3 + j).value for j in range(3)]
    rec("D8a scenario probabilities sum to 100%", abs(sum(P) - 1) < 1e-9, f"{P}")
    ce, cef = wbv["Calc Engine"], wbf["Calc Engine"]
    rows_ct = [r for r in range(1, cef.max_row + 1) if cef.cell(r, 1).value == "Net cash flow"][:3]
    flows3 = [[ce.cell(r, 3 + k).value for k in range(7)] for r in rows_ct]
    exp_fl = [sum(P[j] * flows3[j][k] for j in range(3)) for k in range(7)]
    exp_irr = irr_py2(exp_fl) if sum(exp_fl[1:]) > 0 else -1
    pw = sc_.cell(find_row(scf, "Probability-weighted IRR (IRR of expected"), 3).value
    avg = sc_.cell(find_row(scf, "Memo: probability-weighted AVERAGE"), 3).value
    avg_py = sum(P[j] * irr_py2(flows3[j]) for j in range(3)) if all(sum(f[1:]) > 0 for f in flows3) else None
    rec("D8 probability-weighted IRR = IRR of the probability-weighted cash flows (independent), shown separately from the average of scenario IRRs", abs(exp_irr - pw) < 1e-6 and (avg_py is None or abs(avg_py - avg) < 1e-6), f"expected-cash-flow IRR {exp_irr:.5f}; average of scenario IRRs {avg:.5f}")
    cr = find_row(rf_, "Contractual-timing IRR (annualised effective)")
    qr = find_row(rf_, "Sub-period #")
    freq = wbv["Assumptions"].cell(find_row(wbf["Assumptions"], "Coupon payments per year"), 3).value
    ok9, det9 = True, []
    for j in range(3):
        fl = [rw_.cell(qr + 1 + j, 3 + q).value for q in range(25)]
        ann = flows3[j]
        # rebuild the quarterly stream independently from the annual coupon/principal split
        qirr = irr_py2(fl) if sum(fl[1:]) > 0 else -1
        eff = (1 + qirr) ** 4 - 1 if sum(fl[1:]) > 0 else -1
        ok9 &= abs(eff - rw_.cell(cr, 3 + j).value) < 1e-6 and abs(sum(fl) - sum(ann)) < 1e-6
        det9.append(round(eff, 5))
    rec("D9 contractual-timing IRR recomputed independently from the re-timed quarterly flows; total cash unchanged vs the annual model", ok9, f"contractual IRR (base/downside/severe) {det9}; coupons per year {freq}")
    if freq and freq > 1:
        b = flows3[0]
        # actual-date check on the base case: coupons on sub-period dates, principal on annual dates (calendar months added to the entry date)
        import calendar
        def addm(d, m):
            y, mo = divmod(d.month - 1 + m, 12); y += d.year; day = min(d.day, calendar.monthrange(y, mo + 1)[1]); return d.replace(year=y, month=mo + 1, day=day)
        fl0 = [rw_.cell(qr + 1, 3 + q).value for q in range(25)]
        dd_ = [addm(d0, 3 * q) for q in range(25)]
        xi2 = xirr_py(fl0, dd_)
        ctr = rw_.cell(cr, 3).value
        rec("D9b contractual-timing IRR agrees with an actual/365 XIRR on calendar-month dates (base case, ±5 bp)", abs(xi2 - ctr) < 0.0005, f"XIRR {xi2:.5f} vs {ctr:.5f}")
    # (d4) independent re-derivation of the debt, leverage, coverage and recovery arithmetic from the workbook's own line items
    ds, dsf = wbv["Debt Schedule"], wbf["Debt Schedule"]
    cmv, cmf_ = wbv["Credit Metrics"], wbf["Credit Metrics"]
    cfv = wbv["Cash Flow"]
    opv = wbv["Operating Model"]
    cols_ = "GHIJK"
    roll_bad, int_bad, mat_bad = [], [], []
    mat_by_period = [0.0] * 5
    tot_end = [0.0] * 5
    prev_end = {}
    for i in range(nt):
        r0 = find_row(dsf, f"Tranche {i + 1}:")
        lab = {str(dsf.cell(r0 + k, 1).value).strip(): r0 + k for k in range(1, 14)}
        for pi_, c in enumerate(cols_):
            g_ = lambda name: ds[f"{c}{lab[name]}"].value or 0.0
            beg, end = g_("Beginning balance"), g_("Ending balance")
            calc_end = beg + g_("New borrowing (revolver draw)") + g_("PIK interest") - g_("Mandatory amortization") - g_("Repayment at maturity (from available cash)") - g_("Optional repayment (cash sweep)")
            # balance left unpaid at maturity stays outstanding (default) unless refinanced, in which case it rolls into the refinancing: ending = calc_end − refinanced amount
            if abs(end - calc_end) > 1e-6 and not (g_("Maturing this period? (1 = yes)") == 1):
                roll_bad.append((i + 1, pi_ + 1, round(end, 3), round(calc_end, 3)))
            if i in prev_end and pi_ > 0 and abs(beg - prev_end[(i, pi_ - 1)]) > 1e-6:
                roll_bad.append((i + 1, pi_ + 1, "beginning ≠ prior ending"))
            prev_end[(i, pi_)] = end
            prev_end[i] = True
            if abs(g_("Cash interest expense") - beg * g_("All-in interest rate applied")) > 1e-6:
                int_bad.append((i + 1, pi_ + 1))
            tot_end[pi_] += end
    rec("D11 debt roll-forward recomputed independently: ending = beginning + draws + PIK − amortization − repayment − sweep (non-maturing periods), beginning = prior ending, cash interest = beginning balance × all-in rate",
        not roll_bad and not int_bad, f"{nt} tranches × 5 periods; exceptions {roll_bad[:2]} {int_bad[:2]}")
    r_nd = find_row(cmf_, "Net debt", 1, 6, True); r_td = find_row(cmf_, "Total debt (face value)")
    r_nl = find_row(cmf_, "Net debt / EBITDA", 1, 6, True); r_ic = find_row(cmf_, "Interest coverage (EBITDA / cash interest)")
    r_eb = find_row(wbf["Operating Model"], "EBITDA", 1, 5, True); r_ci = find_row(wbf["Operating Model"], "  Cash interest expense", 1, 5)
    r_ec = find_row(wbf["Cash Flow"], "Ending cash", 1, 5, True)
    m_bad = []
    for pi_, c in enumerate(cols_):
        td, nd_, nl, ic = (cmv[f"{c}{r}"].value for r in (r_td, r_nd, r_nl, r_ic))
        eb, cint_, ec = opv[f"{c}{r_eb}"].value, opv[f"{c}{r_ci}"].value, cfv[f"{c}{r_ec}"].value
        if abs(td - tot_end[pi_]) > 1e-6 or abs(nd_ - (td - ec)) > 1e-6 or (eb > 0 and abs(nl - nd_ / eb) > 1e-6) or (cint_ > 0 and abs(ic - eb / cint_) > 1e-6):
            m_bad.append((pi_ + 1, round(td, 2), round(tot_end[pi_], 2), round(nd_, 2), round(td - ec, 2)))
    rec("D12 total debt = Σ tranche ending balances; net debt = total debt − ending cash; net leverage = net debt ÷ EBITDA; coverage = EBITDA ÷ cash interest (all 5 periods, independent)", not m_bad, f"exceptions {m_bad[:2]}")
    # maturity balances: debt due in a period equals the balances of tranches whose maturity period (Assumptions col K) falls there
    rm_ = find_row(dsf, "Contractual maturities by period")
    for i in range(nt):
        arow = fac + 1 + i
        per = wbv["Assumptions"].cell(arow, 11).value
        bal0 = wbv["Assumptions"].cell(arow, 3).value
        if per is not None and 1 <= per - wbv["Assumptions"][f"C{find_row(wbf['Assumptions'], 'Base period label')}"].value <= 5:
            mat_by_period[int(per - wbv["Assumptions"][f"C{find_row(wbf['Assumptions'], 'Base period label')}"].value) - 1] += bal0
    # (balance at maturity can differ from face when amortization/PIK/sweeps ran earlier, so compare only tranches with no amortization/PIK/sweep before maturity)
    sched = [ds[f"{c}{rm_}"].value or 0.0 for c in cols_]
    rec("D13 contractual maturities by period equal the face balances of tranches whose maturity falls in that period (no amortization / PIK / sweep before maturity)",
        all(abs(a - b) < 1e-6 for a, b in zip(sched, mat_by_period)),
        f"schedule {[round(x, 1) for x in sched]} vs Assumptions {[round(x, 1) for x in mat_by_period]}")
    # recovery arithmetic
    rv_, rvf = wbv["Recovery"], wbf["Recovery"]
    gv = lambda lbl: rv_.cell(find_row(rvf, lbl), 3).value
    gc_, liq_, cash_e, used, adm = gv("Going-concern value"), gv("Liquidation value"), gv("Cash at valuation event"), gv("Recovery value used"), gv("Less: administrative")
    ovr = A[f"C{find_row(A, 'Recovery value override')}"].value
    admin_pct = A[f"C{find_row(A, 'Administrative / DIP costs')}"].value
    rec("D14 recovery value = MAX(going-concern, liquidation) + cash at the event (unless overridden); admin costs = value × admin %; net = value − admin", (abs(used - (max(gc_, liq_) + cash_e)) < 1e-6 or ovr is not None) and abs(adm - used * admin_pct) < 1e-6 and abs(gv("Net value distributable") - (used - adm)) < 1e-6,
        f"going concern {gc_:.1f}, liquidation {liq_:.1f}, cash {cash_e:.1f} → value {used:.1f}")
    lgd_bad = []
    rr_ = find_row(rvf, "Recovery %"); ll_ = find_row(rvf, "Loss %")
    for i in range(nt):
        if abs(rv_.cell(ll_ + 1 + i, 3).value - (1 - rv_.cell(rr_ + 1 + i, 3).value)) > 1e-9:
            lgd_bad.append(i + 1)
    ranks_ = [rv_.cell(find_row(rvf, "Seniority rank") + 1 + i, 3).value for i in range(nt)]
    cps_ = [rv_.cell(find_row(rvf, "Collateral share") + 1 + i, 3).value for i in range(nt)]
    recs_ = [rv_.cell(rr_ + 1 + i, 3).value for i in range(nt)]
    prio_bad = [(i + 1, j + 1) for i in range(nt) for j in range(nt) if claims[i] > 0 and claims[j] > 0 and ranks_[i] < ranks_[j] and not cps_[i] and not cps_[j] and recs_[i] < recs_[j] - 1e-9]
    rec("D15 loss given default = 1 − recovery % for every tranche; a more senior claim never recovers a lower % than a junior one (tranches without a specific collateral pool)", not lgd_bad and not prio_bad, f"LGD exceptions {lgd_bad}; priority violations {prio_bad}")
    # (e) credit score
    cm, cmf = wbv["Credit Metrics"], wbf["Credit Metrics"]
    r0 = find_row(cmf, "Credit score (0-100)")
    pts = 0.0
    for r in range(r0 - 9, r0):
        val, best, worst, w = (cm.cell(r, c).value for c in (3, 4, 5, 6))
        pts += w * max(0, min(1, (val - worst) / (best - worst)))
    rec("D5 credit score recomputed independently from factor values, thresholds and weights", abs(pts - cm.cell(r0, 7).value) < 1e-6, f"{pts:.2f}")

    # web ⇄ Excel reconciliation snapshot
    rp = os.path.join(ROOT, "data", "recon", f"{cid}.json")
    if os.path.exists(rp):
        rc = json.load(open(rp))
        rec("D6 Excel ⇄ web reconciliation: every compared metric within tolerance", rc["pass_count"] == rc["total"], f"{rc['pass_count']}/{rc['total']} PASS")
    stats = dict(case=cid, formulas=n_formula, inputs=n_input, checks=[dict(name=n, ok=ok, detail=d) for n, ok, d in res])
    os.makedirs(os.path.join(ROOT, "data", "validation"), exist_ok=True)
    json.dump(stats, open(os.path.join(ROOT, "data", "validation", f"audit_{cid}.json"), "w"), indent=1)
    return res


if __name__ == "__main__":
    ids = sys.argv[1:] or ["brightwater", "amcx", "bdn"]
    allr = []
    for i in ids:
        allr += audit(i)
    bad = [n for n, ok, _ in allr if not ok]
    print(f"\n{len(allr) - len(bad)}/{len(allr)} audit checks passed")
    sys.exit(1 if bad else 0)
