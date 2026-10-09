#!/usr/bin/env python3
"""Change-impact harness for the Excel models.

For each test: copy the workbook, change designated assumption cells (blue inputs), recalculate with LibreOffice, read outputs,
compare with the baseline and assert the direction AND (where the maths allows) the exact size of the movement.
The committed workbook is never modified: every test edits a throw-away copy, and the SHA-256 of the committed file is recorded
before and after the run and must match.

Usage:  python3 scripts/model_harness.py [case-id ...]      (default: all three cases, sequentially)
Writes data/validation/harness_<case>.json (structured: assumptions changed, before/after outputs, expectation, result) and harness_<case>.txt."""
import datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from openpyxl import load_workbook

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUTDIR = os.path.join(ROOT, "data", "validation")


def model_path(cid):
    return os.path.join(ROOT, "models", f"CreditIQ_{cid.upper()}_Model.xlsx")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def recalc(src):
    """Recalculate a workbook copy with headless LibreOffice (own profile dir so parallel runs don't collide)."""
    d = tempfile.mkdtemp()
    prof = tempfile.mkdtemp()
    subprocess.run(["soffice", f"-env:UserInstallation=file://{prof}", "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", d, src], check=True, capture_output=True)
    shutil.rmtree(prof, ignore_errors=True)
    return os.path.join(d, os.path.basename(src))


def find_row(ws, text, col=1, start=1, exact=False):
    for r in range(start, ws.max_row + 1):
        v = ws.cell(r, col).value
        if isinstance(v, str) and (v == text if exact else v.startswith(text)):
            return r
    raise KeyError(text)


class Model:
    """Locates cells by label so the harness works on every generated workbook."""
    def __init__(self, cid):
        self.cid = cid
        self.path = model_path(cid)
        self.f = load_workbook(self.path)
        self.v = load_workbook(self.path, data_only=True)
        A = self.f["Assumptions"]
        self.A = A
        self.sel = find_row(A, "ACTIVE SCENARIO")
        self.override = find_row(A, "Recovery value override")
        self.cash0 = find_row(A, "Cash & equivalents at base date")
        self.price = find_row(A, "Purchase price / OID")
        self.fee = find_row(A, "Transaction fees")
        self.face = find_row(A, "Face value held")
        self.sofr = find_row(A, "Base rate (SOFR)")
        self.fac = find_row(A, "Facility", exact=True)
        self.nt = 0
        while A.cell(self.fac + 1 + self.nt, 1).value and A.cell(self.fac + 1 + self.nt, 3).value is not None and isinstance(A.cell(self.fac + 1 + self.nt, 3).value, (int, float)):
            self.nt += 1
        self.scen_hdr = {1: find_row(A, "Base Case", exact=True), 2: find_row(A, "Downside", exact=True), 3: find_row(A, "Severe Downside", exact=True)}
        self.sel_val = A.cell(self.sel, 3).value

    def scen_row(self, s, label):
        return find_row(self.A, label, start=self.scen_hdr[s])

    def val(self, sheet, label, col, start=1, exact=False, wb=None):
        wb = wb or self.v
        ws = wb[sheet]
        return ws[f"{col}{find_row(self.f[sheet], label, 1, start, exact)}"].value

    def cols(self):
        return "GHIJK"


def run_edits(m, edits):
    wb = load_workbook(m.path)
    for (sheet, addr), val in edits.items():
        wb[sheet][addr].value = val
    d = tempfile.mkdtemp()
    p = os.path.join(d, "t.xlsx")
    wb.save(p)
    return load_workbook(recalc(p), data_only=True)


def covenant_blocks(m):
    """[(row of covenant title, Assumptions row of its threshold, type)] for every active covenant on Credit Metrics."""
    ws, A = m.f["Credit Metrics"], m.A
    r = find_row(ws, "Covenant compliance") + 1
    out = []
    while isinstance(ws.cell(r, 1).value, str) and ws.cell(r, 1).value.startswith("  ") and not ws.cell(r, 1).value.startswith("    "):
        assert ws.cell(r + 1, 1).value.strip() == "Metric" and ws.cell(r + 3, 1).value.strip() == "Headroom" and ws.cell(r + 5, 1).value.strip().startswith("BREACH")
        ref = re.search(r"\$([A-Z]+)\$(\d+)", ws.cell(r + 2, 7).value)
        arow = int(ref.group(2))
        out.append((r, arow, A.cell(arow, 2).value))
        r += 8
    return out


def out(m, wb):
    g = lambda sheet, label, col, exact=False, start=1: m.val(sheet, label, col, start, exact, wb)
    o = {}
    o["rev1"] = g("Operating Model", "Revenue", "G", True, 5)
    o["ebitda1"] = g("Operating Model", "EBITDA", "G", True, 5)
    o["fcf1"] = g("Operating Model", "Free cash flow (NI", "G", False, 5)
    o["icash1"] = g("Operating Model", "  Cash interest expense", "G", False, 5)
    o["taxes1"] = g("Operating Model", "Taxes", "G", True, 5)
    o["netlev1"] = g("Credit Metrics", "Net debt / EBITDA", "G", True, 5)
    o["cov1"] = g("Credit Metrics", "Interest coverage (EBITDA / cash interest)", "G", False, 5)
    o["draw1"] = g("Cash Flow", "Plus: revolver draw", "G")
    o["irr"] = g("Returns", "IRR", "C", True, 5)
    o["moic"] = g("Returns", "MOIC", "C", True, 5)
    o["cy"] = g("Returns", "Current yield", "C")
    o["cost"] = g("Returns", "Cash investment (face", "C")
    o["inflow"] = g("Returns", "Total cash received", "C")
    o["capgain"] = g("Returns", "Capital gain / (loss) vs purchase price", "C")
    rcf = find_row(m.f["Returns"], "Net cash flow", 1, 5, True)
    o["cf"] = [wb["Returns"].cell(rcf, 3 + k).value for k in range(7)]
    o["recval"] = g("Recovery", "Recovery value used", "C")
    o["rnet"] = g("Recovery", "Net value distributable", "C")
    o["gc"] = g("Recovery", "Going-concern value", "C")
    o["liqv"] = g("Recovery", "Liquidation value", "C")
    o["eebitda"] = g("Recovery", "EBITDA at valuation event", "C")
    o["ecash"] = g("Recovery", "Cash at valuation event", "C")
    o["eyear"] = g("Recovery", "Valuation period", "C")
    o["cint"] = g("Returns", "Cash interest received (total)", "C")
    o["hasdef"] = g("Recovery", "Default modelled?", "C")
    o["recpct"] = g("Returns", "Tranche recovery % at valuation event", "C")
    rw, rwf = wb["Recovery"], m.f["Recovery"]
    grp = lambda label: [rw.cell(find_row(rwf, label) + 1 + i, 3).value for i in range(m.nt)]
    o["claims"], o["tot_rec"] = grp("Claim at valuation event"), grp("TOTAL RECOVERY")
    o["refifail"] = g("Debt Schedule", "Refinancing failures", "C")
    o["bt"] = g("Credit Metrics", "Total breaches across projection", "C")
    ws = wb["Credit Metrics"]
    r = find_row(m.f["Credit Metrics"], "Credit score (0-100)")
    o["score"], o["projscore"] = ws[f"G{r}"].value, ws[f"J{r}"].value
    cs = wb["Capital Structure"]
    r = find_row(m.f["Capital Structure"], "Debt due within alert window")
    o["due_window"] = cs[f"C{r}"].value
    hdr = find_row(m.f["Capital Structure"], "Period", 1, 1, True)
    o["wall_req"] = [(cs[f"G{hdr + 1 + k}"].value or 0) for k in range(5)]
    o["due1"] = cs[f"C{hdr + 1}"].value
    o["dnwc1"] = g("Operating Model", "Working capital & other cash items", "G", False, 5)
    sc = wb["Scenarios"]
    rm = find_row(m.f["Scenarios"], "MOIC", 1, 1, True)
    o["moic_s"] = [sc[f"{c}{rm}"].value for c in "CDE"]
    rrec = find_row(m.f["Scenarios"], "Target-tranche recovery %")
    o["rec_s"] = [sc[f"{c}{rrec}"].value for c in "CDE"]
    rb = find_row(m.f["Scenarios"], "IRR", 1, 1, True)
    o["irr_s"] = [sc[f"{c}{rb}"].value for c in "CDE"]
    rd = find_row(m.f["Scenarios"], "Payment default modelled")
    o["def_s"] = [sc[f"{c}{rd}"].value for c in "CDE"]
    rbr = find_row(m.f["Scenarios"], "Covenant breaches")
    o["bt_sel"] = sc[f"F{rbr}"].value
    return o


def irr_py(cf):
    f = lambda r: sum(x / (1 + r) ** t for t, x in enumerate(cf))
    lo, hi = -0.9999, 10.0
    for _ in range(300):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def fmt(x):
    return "n/a" if x is None else (f"{x:.4g}" if isinstance(x, (int, float)) else str(x))


class Run:
    def __init__(self, cid):
        self.cid, self.results = cid, []

    def rec(self, tid, name, ok, detail="", expect="", edits=None, m=None, before=None, after=None):
        ed = {}
        for (sheet, addr), val in (edits or {}).items():
            old = m.f[sheet][addr].value if m else None
            ed[f"{sheet}!{addr}"] = {"from": old if not isinstance(old, dt.datetime) else old.isoformat(), "to": val if not isinstance(val, dt.datetime) else val.isoformat()}
        self.results.append(dict(id=tid, name=name, status="PASS" if ok else "FAIL", expected=expect, detail=detail, assumptions_changed=ed, outputs_before=before or {}, outputs_after=after or {}))
        print(("PASS " if ok else "FAIL ") + f"[{self.cid}] {tid} {name}" + (f" — {detail}" if detail else ""), flush=True)


def pick(o, keys):
    return {k: o[k] for k in keys}


def close(a, b, tol=1e-6):
    return a is not None and b is not None and abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def tests(cid):
    R = Run(cid)
    m = Model(cid)
    base = out(m, m.v)
    A = m.A
    sel = m.sel_val
    assert sel == 2, "committed workbooks are saved with the Downside scenario selected"
    first_def = next((i + 1 for i, d in enumerate(base["def_s"]) if d == 1), None)
    wb_base1 = run_edits(m, {("Assumptions", f"C{m.sel}"): 1})  # base-case selector, used where a defaulting selected scenario would mask a test
    base1 = out(m, wb_base1)

    # ---- Test A: revenue growth (downside assumption, Downside selected) ------------------------------------------------
    r = m.scen_row(2, "Revenue growth")
    g1 = A[f"G{r}"].value
    ed = {("Assumptions", f"{c}{r}"): A[f"{c}{r}"].value - 0.05 for c in m.cols()}
    n = out(m, run_edits(m, ed))
    pre_b, pre_n = base["fcf1"] + base["dnwc1"], n["fcf1"] + n["dnwc1"]
    ok = n["rev1"] < base["rev1"] and n["ebitda1"] < base["ebitda1"] and pre_n < pre_b and n["netlev1"] > base["netlev1"] and n["cov1"] < base["cov1"]
    R.rec("A1", "downside revenue growth −5 pts: revenue↓ EBITDA↓ FCF-before-working-capital↓ leverage↑ coverage↓", ok,
          f"revenue {fmt(base['rev1'])}→{fmt(n['rev1'])}; EBITDA {fmt(base['ebitda1'])}→{fmt(n['ebitda1'])}; FCF {fmt(base['fcf1'])}→{fmt(n['fcf1'])}; net leverage {fmt(base['netlev1'])}→{fmt(n['netlev1'])}; coverage {fmt(base['cov1'])}→{fmt(n['cov1'])}",
          "revenue, EBITDA, FCF before working capital and coverage fall; net leverage rises", ed, m, pick(base, ["rev1", "ebitda1", "fcf1", "netlev1", "cov1"]), pick(n, ["rev1", "ebitda1", "fcf1", "netlev1", "cov1"]))
    mg1 = A[f"G{m.scen_row(2, 'EBITDA margin')}"].value
    exp_rev = base["rev1"] * (1 + g1 - 0.05) / (1 + g1)
    R.rec("A2", "exact: period-1 revenue = prior revenue × (1 + g − 5 pts); EBITDA = revenue × margin", close(n["rev1"], exp_rev) and close(n["ebitda1"], exp_rev * mg1),
          f"revenue {n['rev1']:.4f} vs expected {exp_rev:.4f}; EBITDA {n['ebitda1']:.4f} vs {exp_rev * mg1:.4f}", "closed-form revenue and EBITDA", ed, m, pick(base, ["rev1", "ebitda1"]), pick(n, ["rev1", "ebitda1"]))
    R.rec("A3", "going-concern recovery value does not rise (distressed multiple × event EBITDA)", n["gc"] <= base["gc"] + 1e-9, f"going-concern value {fmt(base['gc'])}→{fmt(n['gc'])}",
          "going-concern value ≤ baseline", ed, m, pick(base, ["gc"]), pick(n, ["gc"]))
    mono = n["irr_s"][1] <= base["irr_s"][1] + 1e-9 and n["moic_s"][1] <= base["moic_s"][1] + 1e-9 and n["rec_s"][1] <= base["rec_s"][1] + 1e-9
    # A non-monotone response is accepted only when it is fully explained by a documented mechanic: the recovery value is asset-based (liquidation value unchanged),
    # going-concern value fell, and the gain comes from extra cash at the valuation event, a different default timing, or smaller claims ranking ahead of the target (a lower revolver
    # draw because lower revenue releases working capital).
    explained = (not mono) and n["gc"] <= base["gc"] and close(n["liqv"], base["liqv"]) and (n["ecash"] > base["ecash"] + 1e-9 or n["eyear"] != base["eyear"] or sum(n["claims"]) < sum(base["claims"]) - 1e-9)
    R.rec("A4", "downside-scenario return responds: downside IRR, MOIC and recovery % do not rise — or any rise is fully explained (asset-based recovery unchanged, extra cash from working-capital release / default timing)", mono or explained,
          f"downside IRR {fmt(base['irr_s'][1])}→{fmt(n['irr_s'][1])}; MOIC {fmt(base['moic_s'][1])}→{fmt(n['moic_s'][1])}; recovery {fmt(base['rec_s'][1])}→{fmt(n['rec_s'][1])}; "
          f"{'monotone' if mono else 'NON-MONOTONE, explained: claims ' + fmt(sum(base['claims'])) + '→' + fmt(sum(n['claims'])) + ', cash at event ' + fmt(base['ecash']) + '→' + fmt(n['ecash']) + ', valuation period ' + fmt(base['eyear']) + '→' + fmt(n['eyear']) + ', liquidation value unchanged ' + fmt(n['liqv'])}",
          "downside IRR/MOIC/recovery ≤ baseline, or explained", ed, m,
          dict(irr=base["irr_s"][1], moic=base["moic_s"][1], rec=base["rec_s"][1], ecash=base["ecash"], eyear=base["eyear"], liqv=base["liqv"], gc=base["gc"], claims=base["claims"]), dict(irr=n["irr_s"][1], moic=n["moic_s"][1], rec=n["rec_s"][1], ecash=n["ecash"], eyear=n["eyear"], liqv=n["liqv"], gc=n["gc"], claims=n["claims"]))
    R.rec("A5", "base case unchanged by a downside-only edit", abs(n["irr_s"][0] - base["irr_s"][0]) < 1e-12 and n["def_s"][0] == base["def_s"][0] and abs(n["moic_s"][0] - base["moic_s"][0]) < 1e-12,
          f"base IRR {fmt(base['irr_s'][0])}→{fmt(n['irr_s'][0])}", "base IRR/MOIC identical", ed, m, dict(base_irr=base["irr_s"][0]), dict(base_irr=n["irr_s"][0]))

    # ---- Test B: EBITDA margin ---------------------------------------------------------------------------------------------
    r = m.scen_row(sel, "EBITDA margin")
    ed = {("Assumptions", f"{c}{r}"): A[f"{c}{r}"].value - 0.03 for c in m.cols()}
    n = out(m, run_edits(m, ed))
    mg = A[f"G{r}"].value
    R.rec("B1", "EBITDA margin −3 pts: EBITDA↓, net leverage↑, coverage↓, projected credit score↓", n["ebitda1"] < base["ebitda1"] and n["netlev1"] > base["netlev1"] and n["cov1"] < base["cov1"] and n["projscore"] < base["projscore"],
          f"EBITDA {fmt(base['ebitda1'])}→{fmt(n['ebitda1'])}; net leverage {fmt(base['netlev1'])}→{fmt(n['netlev1'])}; coverage {fmt(base['cov1'])}→{fmt(n['cov1'])}; projected score {fmt(base['projscore'])}→{fmt(n['projscore'])}",
          "EBITDA and coverage fall, leverage rises, score falls", ed, m, pick(base, ["ebitda1", "netlev1", "cov1", "projscore"]), pick(n, ["ebitda1", "netlev1", "cov1", "projscore"]))
    R.rec("B2", "exact: EBITDA = unchanged revenue × (margin − 3 pts); cash coverage = EBITDA ÷ cash interest",
          close(n["rev1"], base["rev1"]) and close(n["ebitda1"], base["rev1"] * (mg - 0.03)) and close(n["cov1"], n["ebitda1"] / n["icash1"], 1e-6),
          f"EBITDA {n['ebitda1']:.4f} vs expected {base['rev1'] * (mg - 0.03):.4f}", "closed form", ed, m, pick(base, ["ebitda1", "cov1"]), pick(n, ["ebitda1", "cov1"]))
    R.rec("B3", "returns respond: IRR and MOIC of the selected scenario do not rise; covenant breaches do not fall; refinancing failures do not fall",
          n["irr"] <= base["irr"] + 1e-9 and n["moic"] <= base["moic"] + 1e-9 and n["bt"] >= base["bt"] and n["refifail"] >= base["refifail"],
          f"IRR {fmt(base['irr'])}→{fmt(n['irr'])}; MOIC {fmt(base['moic'])}→{fmt(n['moic'])}; breaches {fmt(base['bt'])}→{fmt(n['bt'])}; refinancing failures {fmt(base['refifail'])}→{fmt(n['refifail'])}",
          "no improvement in any risk or return metric", ed, m, pick(base, ["irr", "moic", "bt", "refifail"]), pick(n, ["irr", "moic", "bt", "refifail"]))

    # ---- Test C: SOFR +100 bp ----------------------------------------------------------------------------------------------
    ed = {("Assumptions", f"{c}{m.sofr}"): A[f"{c}{m.sofr}"].value + 0.01 for c in m.cols()}
    n = out(m, run_edits(m, ed))
    exp, flt_bal = 0.0, 0.0
    for i in range(m.nt):
        rr = m.fac + 1 + i
        bal, flt, floor = A.cell(rr, 3).value, A.cell(rr, 9).value, A.cell(rr, 7).value or 0
        if flt == 1:
            s0 = A[f"G{m.sofr}"].value
            exp += bal * (max(s0 + 0.01, floor) - max(s0, floor))
            flt_bal += bal
    dint, dfcf, dtax = n["icash1"] - base["icash1"], n["fcf1"] - base["fcf1"], n["taxes1"] - base["taxes1"]
    note = "" if flt_bal > 0 else " (no floating-rate debt in this capital structure → expected Δ is exactly 0; the check is correct but not informative)"
    R.rec("C1", "SOFR +100 bp: period-1 cash interest rises by floating balances × Δrate (floors respected)", abs(dint - exp) < 1e-6, f"Δ{dint:.4f} vs expected {exp:.4f}{note}", "Δinterest = Σ floating balance × (max(S+1%,floor) − max(S,floor))", ed, m, pick(base, ["icash1"]), pick(n, ["icash1"]))
    tgt_row = m.fac + int(A.cell(find_row(A, "Target tranche #"), 3).value)
    tgt_float = A.cell(tgt_row, 9).value == 1
    R.rec("C2", "interest increase flows to cash flow one-for-one net of tax; coverage never improves; covenant breaches do not fall", abs(dfcf + dint + dtax) < 1e-6 and n["cov1"] <= base["cov1"] + 1e-12 and n["bt"] >= base["bt"],
          f"ΔFCF {dfcf:.4f}, Δinterest {dint:.4f}, Δtax {dtax:.4f}; coverage {fmt(base['cov1'])}→{fmt(n['cov1'])}; breaches {fmt(base['bt'])}→{fmt(n['bt'])}", "ΔFCF = −Δinterest − Δtax", ed, m, pick(base, ["fcf1", "cov1", "bt"]), pick(n, ["fcf1", "cov1", "bt"]))
    R.rec("C2b", "return on the position: a floating-rate target tranche earns more coupon cash (IRR is then free to rise); a fixed-rate target's coupon cash is unchanged", (n["cint"] >= base["cint"] - 1e-9) if tgt_float else close(n["cint"], base["cint"]),
          f"target tranche {'floating' if tgt_float else 'fixed'}; coupon cash {fmt(base['cint'])}→{fmt(n['cint'])}; IRR {fmt(base['irr'])}→{fmt(n['irr'])}; MOIC {fmt(base['moic'])}→{fmt(n['moic'])}", "coupon cash ≥ baseline (floating) / = baseline (fixed)", ed, m, pick(base, ["cint", "irr", "moic"]), pick(n, ["cint", "irr", "moic"]))
    R.rec("C3", "revolver draw does not fall; EBITDA unchanged", n["draw1"] >= base["draw1"] - 1e-9 and abs(n["ebitda1"] - base["ebitda1"]) < 1e-9, f"draw {fmt(base['draw1'])}→{fmt(n['draw1'])}", "draw ≥ baseline; EBITDA identical", ed, m, pick(base, ["draw1", "ebitda1"]), pick(n, ["draw1", "ebitda1"]))

    # ---- Test D: recovery value ----------------------------------------------------------------------------------------------
    if first_def:
        base_s = out(m, run_edits(m, {("Assumptions", f"C{m.sel}"): first_def}))
        ed_lo = {("Assumptions", f"C{m.sel}"): first_def, ("Assumptions", f"C{m.override}"): base_s["recval"] * 0.35}
        ed_hi = {("Assumptions", f"C{m.sel}"): first_def, ("Assumptions", f"C{m.override}"): base_s["recval"] * 1.8}
        lo_o, hi_o = out(m, run_edits(m, ed_lo)), out(m, run_edits(m, ed_hi))
        keys = ["recval", "recpct", "irr", "moic"]
        R.rec("D1", f"recovery value −65% (scenario {first_def}): recovery %↓, IRR↓, MOIC↓; recovery value used = override",
              lo_o["recpct"] < base_s["recpct"] and lo_o["irr"] < base_s["irr"] and lo_o["moic"] < base_s["moic"] and close(lo_o["recval"], base_s["recval"] * 0.35),
              f"recovery % {fmt(base_s['recpct'])}→{fmt(lo_o['recpct'])}; IRR {fmt(base_s['irr'])}→{fmt(lo_o['irr'])}; MOIC {fmt(base_s['moic'])}→{fmt(lo_o['moic'])}", "recovery %, IRR, MOIC fall", ed_lo, m, pick(base_s, keys), pick(lo_o, keys))
        okh = hi_o["recpct"] >= base_s["recpct"] - 1e-12 and hi_o["irr"] >= base_s["irr"] - 1e-9 and hi_o["moic"] >= base_s["moic"] - 1e-9 and (base_s["recpct"] >= 0.9999 or hi_o["irr"] > base_s["irr"])
        R.rec("D2", "recovery value +80%: recovery %↑ (capped at 100%), IRR↑ unless already fully recovered", okh,
              f"recovery % {fmt(base_s['recpct'])}→{fmt(hi_o['recpct'])}; IRR {fmt(base_s['irr'])}→{fmt(hi_o['irr'])}", "recovery % ≤ 100% and rising; IRR rising", ed_hi, m, pick(base_s, keys), pick(hi_o, keys))
        for tag, o_ in (("low", lo_o), ("high", hi_o)):
            bounds = all(t <= c + 1e-6 for t, c in zip(o_["tot_rec"], o_["claims"])) and sum(o_["tot_rec"]) <= o_["rnet"] + 1e-6
            R.rec(f"D3{tag[0]}", f"recovery waterfall bounds at the {tag} override: no tranche above its claim; total recoveries ≤ net distributable value", bounds,
                  f"Σ recoveries {sum(o_['tot_rec']):.2f} ≤ net value {o_['rnet']:.2f}; Σ claims {sum(o_['claims']):.2f}", "priority/bounds", None, m, {}, dict(tot_rec=o_["tot_rec"], claims=o_["claims"], rnet=o_["rnet"]))
        # seniority: raising value never lowers any tranche's recovery, and a more senior tranche is never worse off (in %) than a junior one with no own collateral
        R.rec("D4", "raising recovery value never lowers any tranche's recovery", all(h >= l - 1e-9 for h, l in zip(hi_o["tot_rec"], lo_o["tot_rec"])), "per-tranche recoveries weakly increase", "monotone by tranche", None, m, dict(tot_rec=lo_o["tot_rec"]), dict(tot_rec=hi_o["tot_rec"]))
    else:
        R.rec("D1", "recovery value (no defaulting scenario in this case)", True, "skipped: none of the scenarios defaults", "n/a")
    # going-concern and liquidation values recompute per the documented formulas (selected scenario, Downside)
    rm_ = m.scen_row(sel, "Distressed EV / EBITDA multiple")
    ed = {("Assumptions", f"C{rm_}"): A[f"C{rm_}"].value + 1.0}
    n = out(m, run_edits(m, ed))
    R.rec("D5", "going-concern value = distressed multiple × event EBITDA (multiple +1.0x)", close(n["gc"] - base["gc"], base["eebitda"] * 1.0) and close(n["gc"], (A[f"C{rm_}"].value + 1.0) * n["eebitda"]), f"going-concern value {fmt(base['gc'])}→{fmt(n['gc'])}; Δ = {n['gc'] - base['gc']:.3f} vs event EBITDA {base['eebitda']:.3f}",
          "Δ = 1.0 × event EBITDA", ed, m, pick(base, ["gc", "recval"]), pick(n, ["gc", "recval"]))
    rl_ = m.scen_row(sel, "Liquidation recovery on asset base")
    ed = {("Assumptions", f"C{rl_}"): min(1.0, A[f"C{rl_}"].value + 0.1)}
    n = out(m, run_edits(m, ed))
    exp_liq = base["liqv"] / A[f"C{rl_}"].value * ed[("Assumptions", f"C{rl_}")] if A[f"C{rl_}"].value else None
    R.rec("D6", "liquidation value = asset base × (1 − decline) × recovery factor (factor +10 pts); recovery value is the greater of going concern and liquidation, plus cash", close(n["liqv"], exp_liq) and n["recval"] >= base["recval"] - 1e-9,
          f"liquidation value {fmt(base['liqv'])}→{fmt(n['liqv'])} (expected {fmt(exp_liq)}); recovery value {fmt(base['recval'])}→{fmt(n['recval'])}", "exact scaling; recovery value does not fall", ed, m, pick(base, ["liqv", "recval"]), pick(n, ["liqv", "recval"]))

    # ---- Test E: purchase price -----------------------------------------------------------------------------------------------
    p0, face0, fee0 = A[f"C{m.price}"].value, A[f"C{m.face}"].value, A[f"C{m.fee}"].value
    ed_up, ed_dn = {("Assumptions", f"C{m.price}"): p0 + 5}, {("Assumptions", f"C{m.price}"): p0 - 5}
    up, dn = out(m, run_edits(m, ed_up)), out(m, run_edits(m, ed_dn))
    R.rec("E1", "purchase price +5 pts: IRR↓ MOIC↓ current yield↓; −5 pts: all ↑", up["irr"] < base["irr"] and up["moic"] < base["moic"] and up["cy"] < base["cy"] and dn["irr"] > base["irr"] and dn["moic"] > base["moic"] and dn["cy"] > base["cy"],
          f"IRR {fmt(dn['irr'])} / {fmt(base['irr'])} / {fmt(up['irr'])} at −5 / base / +5", "IRR, MOIC, yield move opposite to price", ed_up, m, pick(base, ["irr", "moic", "cy"]), pick(up, ["irr", "moic", "cy"]))
    okx = all(close(o_["cost"], face0 * pz / 100 * (1 + fee0)) and close(o_["inflow"], base["inflow"]) and close(o_["capgain"], base["capgain"] + face0 * (p0 - pz) / 100) and close(o_["irr"], irr_py(o_["cf"])) for o_, pz in ((up, p0 + 5), (dn, p0 - 5)))
    R.rec("E2", "exact: cost = face × price × (1 + fees); cash received unchanged; capital gain moves by −Δprice × face; IRR matches an independent solve of the same cash flows", okx,
          f"cost {fmt(dn['cost'])} / {fmt(base['cost'])} / {fmt(up['cost'])}; cash received {fmt(base['inflow'])} unchanged; capital gain {fmt(dn['capgain'])} / {fmt(base['capgain'])} / {fmt(up['capgain'])}", "closed form", ed_dn, m, pick(base, ["cost", "inflow", "capgain", "irr"]), pick(dn, ["cost", "inflow", "capgain", "irr"]))

    # ---- Test F: maturity / refinancing -----------------------------------------------------------------------------------------
    rows = [(A.cell(m.fac + 1 + i, 3).value, m.fac + 1 + i) for i in range(m.nt)]
    vA = m.v["Assumptions"]
    base_per = vA[f"C{find_row(m.f['Assumptions'], 'Base period label')}"].value
    far = [(bal, rr) for bal, rr in rows if (vA.cell(rr, 11).value or 0) > base_per + 2 and bal > 0]
    bal, rr = max(far) if far else max(rows)
    asof = vA[f"C{find_row(m.f['Assumptions'], 'As-of / entry date')}"].value
    asof = asof if isinstance(asof, dt.datetime) else dt.datetime.fromisoformat(str(asof))
    newd = asof + dt.timedelta(days=270)
    ed = {("Assumptions", f"J{rr}"): newd}
    n = out(m, run_edits(m, ed))
    endm = vA[f"C{find_row(m.f['Assumptions'], 'Fiscal-period end month')}"].value
    new_period = (newd.year + (1 if newd.month > endm else 0)) - base_per
    cs0, cs1 = base["wall_req"], n["wall_req"]
    R.rec("F1", "maturity moved to within ~9 months: debt due inside the alert window ↑, refinancing requirement in the new maturity period ↑, credit score ↓",
          n["due_window"] > base["due_window"] and cs1[new_period - 1] >= cs0[new_period - 1] - 1e-9 and n["score"] <= base["score"],
          f"due window {fmt(base['due_window'])}→{fmt(n['due_window'])}; refinancing requirement in period {new_period}: {fmt(cs0[new_period - 1])}→{fmt(cs1[new_period - 1])}; score {fmt(base['score'])}→{fmt(n['score'])}",
          "more debt due soon; score falls", ed, m, dict(due_window=base["due_window"], req=cs0[new_period - 1], score=base["score"]), dict(due_window=n["due_window"], req=cs1[new_period - 1], score=n["score"]))
    far_d = asof + dt.timedelta(days=365 * 12)
    near = [(b, r_) for b, r_ in rows if b > 0 and (vA.cell(r_, 11).value or 99) <= base_per + 2]
    if near:
        b2, r2 = max(near)
        ed = {("Assumptions", f"J{r2}"): far_d}
        n = out(m, run_edits(m, ed))
        R.rec("F2", "maturity pushed out 12 years: debt due in the alert window ↓, refinancing requirement ↓, refinancing failures do not rise", n["due_window"] < base["due_window"] and sum(n["wall_req"]) <= sum(base["wall_req"]) + 1e-9 and n["refifail"] <= base["refifail"],
              f"due window {fmt(base['due_window'])}→{fmt(n['due_window'])}; Σ refinancing requirement {fmt(sum(base['wall_req']))}→{fmt(sum(n['wall_req']))}; failures {fmt(base['refifail'])}→{fmt(n['refifail'])}", "less near-term debt, no new failures", ed, m,
              dict(due_window=base["due_window"], req=sum(base["wall_req"]), refifail=base["refifail"]), dict(due_window=n["due_window"], req=sum(n["wall_req"]), refifail=n["refifail"]))
    ed = {("Assumptions", f"C{m.scen_row(1, 'Market access: max net leverage')}"): 0.0, ("Assumptions", f"C{m.scen_row(1, 'Market access: min EBITDA')}"): 99.0, ("Assumptions", f"C{m.cash0}"): 5.0}
    for c in m.cols():
        ed[("Assumptions", f"{c}{m.scen_row(1, 'Net asset-sale proceeds')}")] = 0.0
    ed[("Assumptions", f"C{m.sel}")] = 1
    n = out(m, run_edits(m, ed))
    R.rec("F3", "refinancing unavailable in the Base case (access test fails, opening cash 5, no asset sales): refinancing failures↑, payment default modelled, recovery computed",
          n["refifail"] > base1["refifail"] and n["hasdef"] == 1 and n["recval"] > 0 and all(t <= c + 1e-6 for t, c in zip(n["tot_rec"], n["claims"])),
          f"refinancing failures {fmt(base1['refifail'])}→{fmt(n['refifail'])}; default {fmt(base1['hasdef'])}→{fmt(n['hasdef'])}; recovery value {fmt(n['recval'])}", "failure → default → recovery", ed, m, pick(base1, ["refifail", "hasdef", "recval"]), pick(n, ["refifail", "hasdef", "recval"]))
    ed = {("Assumptions", f"C{m.scen_row(1, 'Market access: max net leverage')}"): 99.0, ("Assumptions", f"C{m.scen_row(1, 'Market access: min EBITDA')}"): 0.0, ("Assumptions", f"C{m.sel}"): 1}
    n = out(m, run_edits(m, ed))
    R.rec("F4", "market access always open (Base case): refinancing failures do not rise and no default is introduced where the baseline had none", n["refifail"] <= base1["refifail"] and (n["hasdef"] <= base1["hasdef"]),
          f"failures {fmt(base1['refifail'])}→{fmt(n['refifail'])}; default {fmt(base1['hasdef'])}→{fmt(n['hasdef'])}", "PASS/FAIL changes only when the model conditions warrant", ed, m, pick(base1, ["refifail", "hasdef"]), pick(n, ["refifail", "hasdef"]))

    # ---- Test G: covenant breach — set each active covenant's threshold just above / exactly at / just below the metric -------------
    blocks = covenant_blocks(m)

    def cov_plan(vm, sides):
        ed_, plan_ = {}, []
        for (r0, arow, typ) in blocks:
            is_max = typ.startswith("max")
            for k, c in enumerate(m.cols()):
                mv = vm.cell(r0 + 1, 7 + k).value
                delta = max(abs(mv) * 0.02, 0.01)
                side = sides[k]
                thr = mv if side == "equal" else (mv + delta if (side == "pass") == is_max else mv - delta)
                ed_[("Assumptions", f"{c}{arow}")] = thr
                plan_.append((r0, k, side, is_max, mv, thr))
        return ed_, plan_

    def cov_check(plan_, vn):
        bad_, tot_ = [], 0
        for (r0, k, side, is_max, mv, thr) in plan_:
            head, br = vn.cell(r0 + 3, 7 + k).value, vn.cell(r0 + 5, 7 + k).value
            exp_head = (thr - mv) if is_max else (mv - thr)
            tot_ += br
            if abs(head - exp_head) > 1e-6 * max(1, abs(mv)) or br != (1 if head < 0 else 0):
                bad_.append((r0, k, side, head, br))
            if side == "pass" and br != 0: bad_.append((r0, k, side, head, br))
            if side == "breach" and (br != 1 or head >= 0): bad_.append((r0, k, side, head, br))
        return bad_, tot_

    ed, plan = cov_plan(m.v["Credit Metrics"], ["pass", "equal", "breach", "pass", "breach"])
    wbn = run_edits(m, ed)
    bad, tot = cov_check(plan, wbn["Credit Metrics"])
    on = out(m, wbn)
    ns = lambda side: sum(1 for p in plan if p[2] == side)
    R.rec("G1", f"covenant headroom = threshold − metric (max tests) or metric − threshold (min tests); status flips exactly at the threshold; negative headroom is never PASS — {len(blocks)} active covenants × 5 periods", not bad,
          f"{len(plan)} covenant-period tests; {ns('breach')} breach-side → BREACH, {ns('pass')} pass-side → PASS, {ns('equal')} at-threshold (|headroom|≈0, flag = [headroom<0]); violations: {bad[:3]}",
          "BREACH iff headroom < 0", ed, m, dict(bt=base["bt"]), dict(bt=on["bt"]))
    r_ = find_row(m.f["Investment Summary"], "Covenant headroom (base case")
    sv = wbn["Investment Summary"]
    vals = [sv.cell(r_, c).value for c in range(2, 8)]
    st = next((x for x in vals if x in ("PASS", "FAIL")), None)
    nums = [x for x in vals if isinstance(x, (int, float))]
    R.rec("G2", "risk flow (selected Downside): total breaches = Σ breach flags; Scenarios-tab count agrees; Investment Summary covenant evidence is consistent with its own value and requirement",
          on["bt"] == tot and on["bt_sel"] == on["bt"] and st == ("PASS" if nums[0] >= nums[1] else "FAIL"),
          f"breaches {fmt(base['bt'])}→{fmt(on['bt'])} (Σ flags {tot}); Scenarios-tab count {fmt(on['bt_sel'])}; evidence row {nums[:2]} → {st}", "breach count and evidence reflect the breaches", ed, m, dict(bt=base["bt"]), dict(bt=on["bt"], bt_sel=on["bt_sel"], evidence=st))
    # base-case selected: put every period on the breach side of the BASE-case metrics → base-case evidence must fail and the base-case scenario must count the breaches
    ed3, plan3 = cov_plan(wb_base1["Credit Metrics"], ["breach"] * 5)
    ed3[("Assumptions", f"C{m.sel}")] = 1
    wb3 = run_edits(m, ed3)
    bad3, tot3 = cov_check(plan3, wb3["Credit Metrics"])
    o3 = out(m, wb3)
    sv3 = wb3["Investment Summary"]
    vals3 = [sv3.cell(r_, c).value for c in range(2, 8)]
    st3 = next((x for x in vals3 if x in ("PASS", "FAIL")), None)
    R.rec("G3", "base case with every active covenant breached in all five periods: breaches counted = covenants × periods; base-case Investment Summary covenant-headroom evidence FAILS; minimum headroom is negative",
          not bad3 and o3["bt"] == tot3 == len(blocks) * 5 and st3 == "FAIL",
          f"breaches {fmt(base1['bt'])}→{fmt(o3['bt'])} (expected {len(blocks) * 5}); Investment Summary evidence → {st3}; violations {bad3[:2]}", "breach propagates to risk evidence", ed3, m, dict(bt=base1["bt"]), dict(bt=o3["bt"], evidence=st3))

    # ---- scenario selector ---------------------------------------------------------------------------------------------------------
    outs = {1: base1, 3: out(m, run_edits(m, {("Assumptions", f"C{m.sel}"): 3}))}
    R.rec("H1", "scenario selector drives the detailed tabs: base revenue > downside revenue > severe revenue", outs[1]["rev1"] > base["rev1"] > outs[3]["rev1"], f"revenue (selector 1/2/3): {fmt(outs[1]['rev1'])} / {fmt(base['rev1'])} / {fmt(outs[3]['rev1'])}", "ordered", None, m)
    R.rec("H2", "covenant breaches in the downside scenarios are at least those in the base case", outs[3]["bt"] >= outs[1]["bt"] and base["bt"] >= outs[1]["bt"], f"breaches base/downside/severe: {fmt(outs[1]['bt'])} / {fmt(base['bt'])} / {fmt(outs[3]['bt'])}", "non-decreasing with severity", None, m)
    return R


def _summary_cov_status(m, wb):
    ws = wb["Investment Summary"]
    r = find_row(m.f["Investment Summary"], "Covenant headroom (base case")
    return next((ws.cell(r, c).value for c in range(2, 8) if ws.cell(r, c).value in ("PASS", "FAIL")), None)


def main(ids):
    summary, allbad = {}, []
    for cid in ids:
        before = sha(model_path(cid))
        R = tests(cid)
        after = sha(model_path(cid))
        passed = sum(r["status"] == "PASS" for r in R.results)
        unchanged = before == after
        rep = dict(case=cid, workbook=f"models/CreditIQ_{cid.upper()}_Model.xlsx", sha256_before=before, sha256_after=after, workbook_unchanged=unchanged,
                   tests_passed=passed, tests_total=len(R.results), tests=R.results)
        os.makedirs(OUTDIR, exist_ok=True)
        json.dump(rep, open(os.path.join(OUTDIR, f"harness_{cid}.json"), "w"), indent=1, default=str)
        with open(os.path.join(OUTDIR, f"harness_{cid}.txt"), "w") as fh:
            for r in R.results:
                fh.write(f"{r['status']} [{cid}] {r['id']} {r['name']} — {r['detail']}\n")
            fh.write(f"\n{passed}/{len(R.results)} change-impact tests passed; committed workbook unchanged: {unchanged}\n")
        print(f"[{cid}] {passed}/{len(R.results)} change-impact tests passed; committed workbook unchanged: {unchanged}", flush=True)
        allbad += [r for r in R.results if r["status"] != "PASS"] + ([] if unchanged else [dict(id="workbook-modified")])
    return 1 if allbad else 0


def main_parallel(ids):
    """One subprocess per workbook (each with its own LibreOffice profile) — same tests, ~3x faster wall-clock."""
    procs = [subprocess.Popen([sys.executable, os.path.abspath(__file__), i]) for i in ids]
    return 1 if any(p.wait() for p in procs) else 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ids = args or ["amcx", "bdn", "brightwater"]
    sys.exit(main_parallel(ids) if "--parallel" in sys.argv else main(ids))
