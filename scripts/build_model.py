#!/usr/bin/env python3
"""Builds models/CreditIQ_<ID>_Model.xlsx — a fully formula-driven credit underwriting model — from models/cases/<id>.json.

Only these cells are hardcoded (blue): sourced historical inputs, explicit assumptions, scenario assumptions, transaction terms,
macro curve, covenant thresholds, sensitivity axes and structural block parameters.  Everything else is a formula.
The same JSON feeds the web app (npm run export:cases), so Excel and web share one set of inputs.
Usage: python3 scripts/build_model.py <case-id>
"""
import datetime as dt
import json
import os
import subprocess
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.dirname(__file__))
from xl import *  # noqa: E402,F403

HERE = os.path.dirname(os.path.abspath(__file__))
CID = sys.argv[1]
CASE = json.load(open(os.path.join(HERE, "..", "models", "cases", f"{CID}.json")))
OUT = os.path.join(HERE, "..", "models", f"CreditIQ_{CID.upper()}_Model.xlsx")
RAW = os.path.join(HERE, "..", "models", f"_raw_{CID}.xlsx")
MAPOUT = os.path.join(HERE, "..", "models", "cases", f"{CID}.xlsmap.json")

HIST = CASE["historicalSpec"]
if not HIST["lines"].get("sbc"):  # no SBC add-back applied: carry an explicit zero input so the line stays an input, not a hidden constant
    HIST["inputs"].append({"key": "sbc0", "label": "Share-based compensation add-back (none applied for this company)", "group": "income", "values": {c["id"]: 0 for c in HIST["columns"] if c["kind"] != "ltm"}})
    HIST["lines"]["sbc"] = [["sbc0", 1]]
TR = CASE["tranches"]
NT = len(TR)
COVS = CASE["covenants"]
ACOVS = [c for c in COVS if c.get("active", True) is not False]
NH = 4  # historical columns on the model sheets
HC = ["C", "D", "E", "F"]
PC = ["G", "H", "I", "J", "K"]
BASE = HC[-1]
SHEETS = ["Cover", "Assumptions", "Historical Financials", "Operating Model", "Debt Schedule", "Cash Flow", "Credit Metrics", "Scenarios", "Capital Structure", "Recovery",
          "Returns", "Sensitivities", "Investment Summary", "Sources", "Calc Engine"]
SCN = ["Base Case", "Downside", "Severe Downside"]
SKEY = ["base", "downside", "severe"]

wb = Workbook()
wb.remove(wb.active)
WS = {n: wb.create_sheet(n) for n in SHEETS}
for n, color in zip(SHEETS, ["1F3864"] + ["7F7F7F"] * 14):
    WS[n].sheet_properties.tabColor = color


def Q(ws):
    return f"'{ws.title}'!"


def dstr(s):
    return dt.date.fromisoformat(s)


# ═══════════════════════════ ASSUMPTIONS ═══════════════════════════
ws = WS["Assumptions"]
A, S, T, COV = {}, {1: {}, 2: {}, 3: {}}, {i: {} for i in range(1, NT + 1)}, {}
ws.column_dimensions["A"].width = 52
ws.column_dimensions["B"].width = 18
for c in "CDEFGHIJKLMNOPQR":
    ws.column_dimensions[c].width = 12
ws.column_dimensions["S"].width = 34
put(ws, "A1", f"Assumptions — {CASE['name']}: all explicit inputs live on this tab", "label").font = F_TITLE
flag = "PUBLIC DATA CASE" if CASE["dataClass"] == "public" else "DEMO DATA"
put(ws, "A2", f"{flag} · {CASE['termsLabel']} · Blue on pale yellow = hardcoded input · Black = formula · Green = link to another sheet · $ in millions", "label")


def aref(r, c="C"):
    return f"'Assumptions'!${c}${r}"


def scalar(r, key, label, val, fmt=GEN, unit="", kind="input"):
    put(ws, f"A{r}", label, "label")
    put(ws, f"B{r}", unit, "label")
    put(ws, f"C{r}", val, kind, fmt)
    A[key] = aref(r)


r = 4
section(ws, r, "1. General & model settings", 20); r += 1
scalar(r, "company", "Company", CASE["name"]); r += 1
scalar(r, "base_year", "Base period label (year in which the base / LTM period ends)", CASE["baseYear"], YEAR); r += 1
scalar(r, "fyend", "Fiscal-period end month (12 = calendar FY; 6 = LTM June periods)", CASE["fyEndMonth"], "0"); r += 1
scalar(r, "asof", "As-of / entry date", dstr(CASE["asOf"]), "yyyy-mm-dd"); r += 1
scalar(r, "tax", "Cash tax rate on positive EBT", CASE["taxRate"], PCT, "% of EBT"); r += 1
SEL_ROW = r
scalar(r, "scen", "ACTIVE SCENARIO selector (1=Base, 2=Downside, 3=Severe)", 2, "0", "select 1 / 2 / 3")
dv = DataValidation(type="list", formula1='"1,2,3"', allow_blank=False)
ws.add_data_validation(dv)
dv.add(f"C{r}")
put(ws, f"D{r}", f'=CHOOSE(C{r},"Base Case","Downside","Severe Downside")', "calc")
A["scen_name"] = aref(r, "D")
r += 1
scalar(r, "cash0", "Cash & equivalents at base date (balance sheet)", CASE["cash"], NUM, "$M"); r += 1
scalar(r, "mincash", "Minimum operating cash", CASE["minCash"], NUM, "$M"); r += 1
scalar(r, "sweep", "Cash sweep (% of excess cash applied to prepayable debt)", CASE["sweepPct"], PCT, "%"); r += 1
scalar(r, "override", "Recovery value override (leave blank = model-derived)", None, NUM, "$M, optional"); r += 1
scalar(r, "admin", "Administrative / DIP costs", CASE["adminPct"], PCT, "% of recovery value"); r += 1
scalar(r, "accr", "Accrued unpaid interest included in claims", CASE["accruedMonths"], "0", "months"); r += 1
scalar(r, "defrank", "Rank at which secured deficiency claims join general creditors", CASE["deficiencyRank"], "0"); r += 1
scalar(r, "win", "Maturity alert window", 2, "0", "periods from base"); r += 1
scalar(r, "mat_mat", "Materiality threshold for maturity alert", CASE["config"]["maturityMaterial"] + 0.10, PCT, "% of total debt"); r += 1
scalar(r, "conc", "Concentration threshold (single-period maturities)", 0.30, PCT, "% of total debt"); r += 1
scalar(r, "evmult", "Market-implied EV / EBITDA (analyst assumption)", CASE["evMultiple"], MULT, "x"); r += 1
scalar(r, "score_win", "Credit score: maturity-risk window", CASE["config"]["scoreWindow"], "0", "periods"); r += 1
r += 1
section(ws, r, "2. Collateral / asset base (recovery & LTV)", 20); r += 1
put(ws, f"A{r}", CASE["assetValueBasis"], "label"); r += 1
ASSET_FIRST = r
if CASE["assetCapRate"]:
    scalar(r, "capr", "Analyst cap rate on LTM NOI", CASE["assetCapRate"], PCT, "% (assumption)"); r += 1
    put(ws, f"A{r}", "Operating-property value = LTM NOI ÷ cap rate", "label")
    NOI_CELL = r
    r += 1
for comp in CASE["assetComponents"] or [{"label": "Appraised / collateral asset base", "value": CASE["assetBase"], "dp": None}]:
    put(ws, f"A{r}", comp["label"], "label")
    put(ws, f"C{r}", comp["value"], "input", NUM)
    if comp.get("dp"):
        put(ws, f"D{r}", comp["dp"], "label")
    r += 1
ASSET_LAST = r - 1
put(ws, f"A{r}", "Total asset base", "label", bold=True)
A["assets"] = aref(r)
ASSET_TOTAL_ROW = r
r += 2

section(ws, r, "3. Transaction / position being underwritten  —  " + CASE["termsLabel"], 20); r += 1
scalar(r, "tgt", "Target tranche # (row in the debt table below)", CASE["target"]["index"], "0"); r += 1
scalar(r, "face", "Face value held (legal claim)", CASE["target"]["face"], NUM, "$M"); r += 1
scalar(r, "price", "Purchase price / OID (UNDERWRITING ASSUMPTION)", CASE["tranches"][CASE["target"]["index"] - 1]["price"], PX, "% of face"); r += 1
scalar(r, "fee", "Transaction fees", CASE["target"]["feePct"], PCT2, "% of cost"); r += 1
scalar(r, "hold", "Hold period (whole years, 1-5)", CASE["target"]["holdYears"], "0", "periods"); r += 1
scalar(r, "payfreq", "Coupon payments per year on target tranche (contractual-timing cross-check only)", CASE["target"].get("payFreq", 1), "0", "per year"); r += 1
scalar(r, "lag", "Default → recovery cash receipt lag", CASE["resolutionLag"], "0", "periods"); r += 1
TH = CASE["thresholds"]
scalar(r, "hurdle", "Required IRR (hurdle)", TH["hurdleIrr"], PCT); r += 1
scalar(r, "mindown", "Minimum acceptable downside IRR", TH["minDownsideIrr"], PCT); r += 1
scalar(r, "minyield", "Minimum yield to maturity", TH["minYield"], PCT); r += 1
scalar(r, "maxlev", "Maximum net leverage (net debt / EBITDA)", TH["maxNetLeverage"], MULT); r += 1
scalar(r, "minrec", "Minimum downside recovery", TH["minRecovery"], PCT); r += 1
scalar(r, "minhead", "Minimum covenant headroom (base case)", TH["minCovenantHeadroom"], PCT); r += 1
scalar(r, "maxsec", "Decision rule: secondary test failures tolerated for PROCEED", 2, "0", "count"); r += 1
scalar(r, "passcore", "Decision rule: core test failures that force PASS", 3, "0", "count"); r += 1
scalar(r, "ddopen", "Unresolved high-priority diligence items (from the CreditIQ diligence tracker)", CASE["openHighDiligence"], "0", "count"); r += 1
r += 1
section(ws, r, "4. Macro assumptions", 20); r += 1
put(ws, f"A{r}", "Model period", "header")
for i, c in enumerate(PC):
    put(ws, f"{c}{r}", f"={A['base_year']}+1" if i == 0 else f"={PC[i - 1]}{r}+1", "calc", YEAR, bold=True)
r += 1
put(ws, f"A{r}", "Base rate (SOFR) curve — FRED SOFR 3.90% on 2026-10-06; path is an assumption" if CASE["dataClass"] == "public" else "Base rate (SOFR) curve — DEMO assumption", "label")
put(ws, f"B{r}", "% p.a.", "label")
A["sofr"] = {}
for c, v in zip(PC, CASE["sofr"]):
    put(ws, f"{c}{r}", v, "input", PCT2)
    A["sofr"][c] = f"'Assumptions'!${c}${r}"
r += 2

section(ws, r, "5. Debt tranches (list in order of cash-repayment priority; rank 1 = most senior, equal rank = pari passu)", 20); r += 1
cols = ["Facility", "Type", "Face / principal $M", "Commit. $M", "Fixed coupon", "Spread (floating)", "SOFR floor", "PIK rate", "Floating (1/0)", "Maturity date", "Maturity period", "Amort. % orig", "Rank",
        "Prepay (1/0)", "Secured (1/0)", "Revolver (1/0)", "Collateral share", "Mark / price", "Call protection / collateral"]
header_row(ws, r, cols)
r += 1
TR0 = r
ATTR = [("name", "name", GEN), ("kind", "kind", GEN), ("principal", "principal", NUM), ("commit", "commitment", NUM), ("rate", "rate", PCT2), ("spread", "spread", PCT2), ("floor", "floor", PCT2), ("pik", "pik", PCT2),
        ("float", "floating", "0"), ("matdate", "maturityDate", "yyyy-mm-dd"), ("mat", None, YEAR), ("amort", "amortPct", PCT), ("rank", "seniority", "0"), ("prepay", "prepay", "0"), ("secured", "secured", "0"),
        ("isrev", None, "0"), ("cp", "collateralPct", PCT), ("px", "price", PX), ("note", None, GEN)]
for i, t in enumerate(TR, start=1):
    for j, (key, jk, f) in enumerate(ATTR):
        c = col(j + 1)
        if key == "mat":
            put(ws, f"{c}{r}", f"=YEAR(J{r})+IF(MONTH(J{r})>{A['fyend']},1,0)", "calc", f)
        elif key == "isrev":
            put(ws, f"{c}{r}", 1 if t["kind"] == "revolver" else 0, "input", f)
        elif key == "note":
            put(ws, f"{c}{r}", (t["callProtection"] + " | " if t["callProtection"] else "") + t["collateral"], "label")
        else:
            v = t[jk]
            if key == "matdate":
                v = dstr(v)
            elif key in ("float", "prepay", "secured"):
                v = 1 if v else 0
            put(ws, f"{c}{r}", v, "input", f)
        T[i][key] = f"'Assumptions'!${c}${r}"
    r += 1
TR1 = r - 1
RANK_RNG = f"'Assumptions'!$M${TR0}:$M${TR1}"
CP_RNG = f"'Assumptions'!$Q${TR0}:$Q${TR1}"
put(ws, f"A{r}", "Floating tranches: all-in rate = MAX(SOFR, floor) + spread + scenario shock. Fixed: coupon. Interest accrues on beginning balances (no circularity). Maturity period = YEAR(date) + 1 if month > period-end month.", "label")
r += 2

section(ws, r, "6. Covenants (thresholds per model period). Disclosed = in issuer documents; Hypothetical = UNDERWRITING ASSUMPTION; inactive covenants are shown for reference only", 20); r += 1
header_row(ws, r, ["Covenant", "Type", "Basis", "Active (1/0)", "Reported ratio"])
for i, c in enumerate(PC):
    put(ws, f"{c}{r}", f"={A['base_year']}+1" if i == 0 else f"={PC[i - 1]}{r}+1", "calc", YEAR, bold=True)
r += 1
for j, cv in enumerate(COVS):
    put(ws, f"A{r}", cv["label"], "label")
    put(ws, f"B{r}", cv["type"], "label")
    put(ws, f"C{r}", cv["basis"], "label")
    put(ws, f"D{r}", 1 if cv.get("active", True) is not False else 0, "input", "0")
    if cv.get("reported") is not None:
        put(ws, f"E{r}", cv["reported"], "input", MULT)
    COV[j] = {"row": r, "thr": {}}
    for c, v in zip(PC, cv["thresholds"]):
        put(ws, f"{c}{r}", v, "input", MULT if cv["type"] not in ("maxLTV", "maxSecuredLTV") else PCT)
        COV[j]["thr"][c] = f"'Assumptions'!${c}${r}"
    COV[j]["active_ref"] = f"'Assumptions'!$D${r}"
    r += 1
r += 1

section(ws, r, "7. Scenario assumptions (selected via ACTIVE SCENARIO; all three run simultaneously on Calc Engine)", 20); r += 1
SERIES_LBL = [("g", "Revenue growth", PCT, "revenueGrowth"), ("gm", "Gross margin", PCT, "grossMargin"), ("m", "EBITDA margin", PCT, "ebitdaMargin"), ("sales", "Net asset-sale proceeds ($M)", NUM, "assetSales")]
SCAL_LBL = [("capex", "Capex", PCT, "% of revenue", "capexPct"), ("nwc", "Working-capital investment", PCT, "% of Δ revenue", "nwcPctOfRevChange"),
            ("drag", "Other cash items (+ outflow; incl. distributions, programming timing)", PCT, "% of revenue", "nwcExtraOutflowPct"), ("bps", "Floating-rate shock", PCT2, "% added to floating rates", "rateShock"),
            ("refi", "Refinancing rate (post-maturity)", PCT2, "%", "refiRate"), ("maxlev", "Market access: max net leverage to refinance", MULT, "x", "maxRefiNetLeverage"),
            ("mincov", "Market access: min EBITDA / pro-forma interest", MULT, "x", "minRefiCoverage"), ("exitm", "Exit EV / EBITDA multiple", MULT, "x", "exitMultiple"),
            ("exitpx", "Exit price if no default (cap, % of face)", PX, "% of face", "exitPrice"), ("distm", "Distressed EV / EBITDA multiple (going concern)", MULT, "x", "distressMultiple"),
            ("decl", "Asset value decline", PCT, "%", "assetValueDecline"), ("liq", "Liquidation recovery on asset base", PCT, "%", "liquidationRecovery")]
for si, s in enumerate((1, 2, 3)):
    SA = CASE["assumptions"][SKEY[si]]
    put(ws, f"A{r}", SCN[si], "header")
    for c in ["B", "C", "D", "E", "F"]:
        put(ws, f"{c}{r}", "", "header")
    for i, c in enumerate(PC):
        put(ws, f"{c}{r}", f"={A['base_year']}+1" if i == 0 else f"={PC[i - 1]}{r}+1", "calc", YEAR, bold=True)
    r += 1
    for k, lbl, f, jk in SERIES_LBL:
        put(ws, f"A{r}", lbl, "label")
        S[s][k] = {}
        for c, v in zip(PC, SA[jk]):
            put(ws, f"{c}{r}", v, "input", f)
            S[s][k][c] = f"'Assumptions'!${c}${r}"
        r += 1
    for k, lbl, f, u, jk in SCAL_LBL:
        put(ws, f"A{r}", lbl, "label")
        put(ws, f"B{r}", u, "label")
        put(ws, f"C{r}", SA[jk], "input", f)
        S[s][k] = aref(r)
        r += 1
    put(ws, f"A{r}", "Scenario probability", "label")
    put(ws, f"C{r}", CASE["probabilities"][SKEY[si]], "input", PCT)
    S[s]["prob"] = aref(r)
    r += 2
put(ws, f"A{r}", "Probabilities sum to", "label")
put(ws, f"C{r}", f"={S[1]['prob']}+{S[2]['prob']}+{S[3]['prob']}", "calc", PCT)
A["probsum"] = aref(r)
r += 2

section(ws, r, "8. Credit score methodology (transparent, linear between thresholds)", 20); r += 1
header_row(ws, r, ["Factor", "Unit", "Weight", "Best (full pts)", "Worst (0 pts)"])
r += 1
SW, ST = CASE["config"]["scoreWeights"], CASE["config"]["scoreThresholds"]
SCORE = [("lev", "Net leverage", "x", SW["leverage"], ST["leverage"]), ("cov", "Interest coverage", "x EBITDA/int", SW["coverage"], ST["coverage"]), ("liq", "Liquidity / next-period obligations", "x", SW["liquidity"], ST["liquidity"]),
         ("fcf", "FCF / debt", "%", SW["fcf"], ST["fcf"]), ("mat", "Debt maturing within window", "% of debt", SW["maturity"], ST["maturity"]), ("mst", "Margin stability (σ)", "pts", SW["marginStability"], ST["marginStability"]),
         ("rst", "Revenue stability (σ)", "pts", SW["revenueStability"], ST["revenueStability"]), ("ast", "Asset coverage", "x debt", SW["assetCoverage"], ST["assetCoverage"]), ("ind", "Industry risk factor (0-1; analyst input)", "0-1", SW["industry"], {"best": 1.0, "worst": 0.0})]
SC = {}
SCF = r
for k, lbl, u, w, th in SCORE:
    put(ws, f"A{r}", lbl, "label")
    put(ws, f"B{r}", u, "label")
    put(ws, f"C{r}", w, "input", "0")
    put(ws, f"D{r}", th["best"], "input", GEN)
    put(ws, f"E{r}", th["worst"], "input", GEN)
    SC[k] = {"w": aref(r, "C"), "b": aref(r, "D"), "wr": aref(r, "E")}
    r += 1
SCL = r - 1
scalar(r, "ind_val", "Industry risk factor for this company (analyst input)", CASE["industryFactor"], "0.00", "0-1"); r += 1
put(ws, f"A{r}", "Weights sum to", "label")
put(ws, f"C{r}", f"=SUM(C{SCF}:C{SCL})", "calc", "0")
A["wsum"] = aref(r)
r += 2
section(ws, r, "9. Risk bands", 20); r += 1
RB = {b["label"]: b["min"] for b in CASE["config"]["riskBands"]}
for k, lbl, v in [("band_low", "Low risk if score ≥", RB["Low"]), ("band_mod", "Moderate if ≥", RB["Moderate"]), ("band_elev", "Elevated if ≥ (else High)", RB["Elevated"])]:
    scalar(r, k, lbl, v, "0")
    r += 1
ws.freeze_panes = "C4"

# ═══════════════════════════ HISTORICAL ═══════════════════════════
wh = WS["Historical Financials"]
HCOLS = HIST["columns"]
HX = {c["id"]: col(2 + i) for i, c in enumerate(HCOLS)}  # column letter per historical column id
wh.column_dimensions["A"].width = 56
for c in HX.values():
    wh.column_dimensions[c].width = 13
SRC_COL = col(2 + len(HCOLS))
wh.column_dimensions[SRC_COL].width = 46
put(wh, "A1", f"Historical Financials — {CASE['name']}", "label").font = F_TITLE
put(wh, "A2", ("PUBLIC FILING data (blue = reported inputs, each traced to a datapoint on the Sources tab). " if CASE["dataClass"] == "public" else "DEMO data (fictional, illustrative). ") + "All subtotals, EBITDA, EBIT, net income, FCF and LTM columns are formulas.", "label")
header_row(wh, 4, ["US$ millions"] + [c["label"] for c in HCOLS] + ["Source datapoint IDs (see Sources tab)"])
IN_ROW, ROW_H = {}, {}
rr = 5
put(wh, f"A{rr}", "A. Reported inputs", "label", bold=True)
for c in range(1, len(HCOLS) + 3):
    wh.cell(row=rr, column=c).fill = FILL_HDR
rr += 1
INPUT_CELLS = {}  # (key, colid) -> address, for Sources mapping
for inp in HIST["inputs"]:
    IN_ROW[inp["key"]] = rr
    put(wh, f"A{rr}", inp["label"], "label")
    for c in HCOLS:
        a = f"{HX[c['id']]}{rr}"
        if c["kind"] == "ltm":
            L_ = HIST["ltm"]
            put(wh, a, f"={HX[L_['base']]}{rr}+{HX[L_['add']]}{rr}-{HX[L_['sub']]}{rr}", "calc", NUM)
        else:
            put(wh, a, inp["values"].get(c["id"], 0), "input", NUM)
            INPUT_CELLS[(inp["key"], c["id"])] = a
    srcs = sorted(set((inp.get("src") or {}).values()))
    put(wh, f"{SRC_COL}{rr}", (srcs[0].rsplit(".", 1)[0] + ".* (" + str(len(srcs)) + " datapoints)") if srcs else ("DEMO input" if CASE["dataClass"] == "demo" else "none reported"), "label")
    rr += 1
rr += 1
put(wh, f"A{rr}", "B. Standardized statements (calculated)", "label", bold=True)
for c in range(1, len(HCOLS) + 3):
    wh.cell(row=rr, column=c).fill = FILL_HDR
rr += 1


def hform(colid, spec_key):
    parts = HIST["lines"].get(spec_key, [])
    if not parts:
        return None
    terms = "".join(("+" if sgn > 0 else "-") + f"{HX[colid]}{IN_ROW[k]}" for k, sgn in parts)
    return "=" + terms.lstrip("+")


def hline(key, label, fn, fmt=NUM, bold=False):
    global rr
    ROW_H[key] = rr
    put(wh, f"A{rr}", label, "label", bold=bold)
    for c in HCOLS:
        v = fn(c["id"])
        if v is not None:
            put(wh, f"{HX[c['id']]}{rr}", v, "calc", fmt, bold=bold)
    rr += 1


def hf(colid, key):
    return f"{HX[colid]}{ROW_H[key]}"


hline("revenue", "Revenue", lambda c: hform(c, "revenue"), bold=True)
hline("cogs", "Direct costs / COGS", lambda c: hform(c, "cogs"))
hline("gp", "Gross profit (NOI for real estate)", lambda c: f"={hf(c, 'revenue')}-{hf(c, 'cogs')}", bold=True)
hline("opexAdj", "Operating expenses, cash & adjusted (excl. D&A and non-cash add-backs)", lambda c: hform(c, "opexAdj"))
hline("ebitda", "EBITDA (company-adjusted basis)", lambda c: f"={hf(c, 'gp')}-{hf(c, 'opexAdj')}", bold=True)
hline("da", "Depreciation & amortization", lambda c: hform(c, "da"))
hline("sbc", "Share-based compensation (non-cash add-back)", lambda c: hform(c, "sbc"))
hline("ebit", "EBIT (EBITDA − D&A − SBC)", lambda c: f"={hf(c, 'ebitda')}-{hf(c, 'da')}-{hf(c, 'sbc')}", bold=True)
hline("interest", "Interest expense", lambda c: hform(c, "interest"))
hline("ebt", "EBT", lambda c: f"={hf(c, 'ebit')}-{hf(c, 'interest')}", bold=True)
hline("taxes", "Income taxes", lambda c: hform(c, "taxes"))
hline("ni", "Net income (model basis; excludes impairments and one-offs)", lambda c: f"={hf(c, 'ebt')}-{hf(c, 'taxes')}", bold=True)
hline("capex", "Capex (incl. leasing costs where applicable)", lambda c: hform(c, "capex"))
if HIST["mode"] == "cfo":
    hline("cfo", "Net cash provided by operating activities (reported)", lambda c: hform(c, "cfo"))
    hline("fcf", "Free cash flow (CFO − capex)", lambda c: f"={hf(c, 'cfo')}-{hf(c, 'capex')}", bold=True)
    hline("dnwc", "Δ working capital & other (derived plug: NI + D&A + SBC − capex − FCF)", lambda c: f"={hf(c, 'ni')}+{hf(c, 'da')}+{hf(c, 'sbc')}-{hf(c, 'capex')}-{hf(c, 'fcf')}")
else:
    hline("dnwc", "Increase in working capital", lambda c: hform(c, "dnwc"))
    hline("fcf", "Free cash flow (NI + D&A + SBC − capex − ΔNWC)", lambda c: f"={hf(c, 'ni')}+{hf(c, 'da')}+{hf(c, 'sbc')}-{hf(c, 'capex')}-{hf(c, 'dnwc')}", bold=True)
rr += 1
put(wh, f"A{rr}", "C. Ratios & checks (calculated)", "label", bold=True)
for c in range(1, len(HCOLS) + 3):
    wh.cell(row=rr, column=c).fill = FILL_HDR
rr += 1
FYCOLS = [c["id"] for c in HCOLS if c["kind"] == "fy"]
hline("gmr", "Gross margin", lambda c: f"={hf(c, 'gp')}/{hf(c, 'revenue')}", PCT)
hline("mr", "EBITDA margin", lambda c: f"={hf(c, 'ebitda')}/{hf(c, 'revenue')}", PCT)


def growth(c):
    if c in FYCOLS and FYCOLS.index(c) > 0:
        return f"={hf(c, 'revenue')}/{hf(FYCOLS[FYCOLS.index(c) - 1], 'revenue')}-1"
    if c == "H1-2026" and "H1-2025" in HX:
        return f"={hf(c, 'revenue')}/{hf('H1-2025', 'revenue')}-1"
    return None


hline("g", "Revenue growth (YoY)", growth, PCT)
hline("eg", "EBITDA growth (YoY)", lambda c: (f"={hf(c, 'ebitda')}/{hf(FYCOLS[FYCOLS.index(c) - 1], 'ebitda')}-1" if c in FYCOLS and FYCOLS.index(c) > 0 else (f"={hf(c, 'ebitda')}/{hf('H1-2025', 'ebitda')}-1" if c == "H1-2026" and "H1-2025" in HX else None)), PCT)
if HIST.get("checks"):
    for chk in HIST["checks"]:
        calc_key = "gp" if chk["calcLine"] == "noi" else chk["calcLine"]
        ROW_H["check"] = rr
        put(wh, f"A{rr}", "Check: " + chk["label"] + " (should be 0.000)", "label")
        rep = next(i for i in HIST["inputs"] if i["key"] == chk["reportedKey"])
        CHECK_COLS = []
        for c in HCOLS:
            has = lambda cid_: bool(rep["values"].get(cid_))
            if c["kind"] == "ltm":
                use = has(HIST["ltm"]["base"]) and has(HIST["ltm"]["add"]) and has(HIST["ltm"]["sub"])
            else:
                use = has(c["id"])
            if use:
                put(wh, f"{HX[c['id']]}{rr}", f"={hf(c['id'], calc_key)}-{HX[c['id']]}{IN_ROW[chk['reportedKey']]}", "calc", "0.000")
                CHECK_COLS.append(c["id"])
        rr += 1
wh.freeze_panes = "B5"


def HREF(k, colid):
    return f"'Historical Financials'!{HX[colid]}{ROW_H[k]}"


OPS_HIST = FYCOLS[-3:] + [c["id"] for c in HCOLS if c["kind"] == "ltm"] if any(c["kind"] == "ltm" for c in HCOLS) else FYCOLS[-4:]
if len(OPS_HIST) < NH:
    OPS_HIST = FYCOLS[-NH:]
BASE_COLID = OPS_HIST[-1]
OPS_HCOL = dict(zip(OPS_HIST, HC[-len(OPS_HIST):]))

# asset base formulas
r_ = ASSET_FIRST
if CASE["assetCapRate"]:
    put(ws, f"C{NOI_CELL}", f"={HREF('gp', BASE_COLID)}/{A['capr']}", "calc", NUM)
put(ws, f"C{ASSET_TOTAL_ROW}", f"=SUM(C{NOI_CELL}:C{ASSET_LAST})" if CASE["assetCapRate"] else f"=SUM(C{ASSET_FIRST}:C{ASSET_LAST})", "calc", NUM, bold=True)

# ═══════════════════════════ ENGINE (row specs shared by the detailed tabs and the Calc Engine blocks) ═══════════════════════════
class Case:
    def __init__(self, scen, gadj=None, madj=None, sadj=None, dadj=None, show_hist=False):
        self.scen, self.gadj, self.madj, self.sadj, self.dadj, self.show_hist = scen, gadj, madj, sadj, dadj, show_hist


LOC = {}
CUR = [None]
NEED_E = {"year", "rev", "cash_end", "totdebt"}


def X(name, c, abs_=False):
    ws_, r_ = LOC[name]
    a = f"${c}${r_}" if abs_ else f"{c}{r_}"
    return a if ws_ is CUR[0] else f"{Q(ws_)}{a}"


def XR(name, c1=PC[0], c2=PC[-1]):
    ws_, r_ = LOC[name]
    a = f"${c1}${r_}:${c2}${r_}"
    return a if ws_ is CUR[0] else f"{Q(ws_)}{a}"


def XV(first, last, c="C"):
    ws_, r1 = LOC[first]
    _, r2 = LOC[last]
    a = f"${c}${r1}:${c}${r2}"
    return a if ws_ is CUR[0] else f"{Q(ws_)}{a}"


def CUM(name, pc):
    ws_, r_ = LOC[name]
    a = f"${PC[0]}${r_}:{pc}{r_}"
    return a if ws_ is CUR[0] else f"{Q(ws_)}{a}"


def prev(c):
    return col(ord(c) - 64 - 1)


def build_rows(cs):
    R = []

    def add(sec, name, label, kind="series", fmt=NUM, e=None, p=None, s=None, h=None, bold=False):
        R.append(dict(sec=sec, name=name, label=label, kind=kind, fmt=fmt, e=e, p=p, s=s, h=h, bold=bold))

    def sub(sec, name, label):
        R.append(dict(sec=sec, name=name, label=label, kind="sub"))

    def CH(key, c):
        if key in ("g", "gm", "m", "sales"):
            return f"CHOOSE({cs.scen},{S[1][key][c]},{S[2][key][c]},{S[3][key][c]})"
        return f"CHOOSE({cs.scen},{S[1][key]},{S[2][key]},{S[3][key]})"

    trs = range(1, NT + 1)
    HS = lambda k: (lambda c: f"={HREF(k, OPS_HIST[HC.index(c) - (NH - len(OPS_HIST))])}")  # hist link

    # ── operating model
    O = "ops"
    sub(O, "o_hdr", "Operating drivers (selected scenario → Assumptions)")
    add(O, "year", "Model period (year in which the period ends)", fmt=YEAR, e=lambda: f"={A['base_year']}", p=lambda c, pc, t: f"={X('year', pc)}+1", h=lambda c: None)
    add(O, "tidx", "Projection period #", fmt="0", p=lambda c, pc, t: f"={X('year', c)}-{A['base_year']}")
    add(O, "g", "Revenue growth", fmt=PCT, p=lambda c, pc, t: "=" + CH("g", c) + (f"+{cs.gadj}" if cs.gadj else ""), h=lambda c: None)
    add(O, "gm", "Gross margin", fmt=PCT, p=lambda c, pc, t: "=" + CH("gm", c), h=lambda c: None)
    add(O, "m", "EBITDA margin", fmt=PCT, p=lambda c, pc, t: "=" + CH("m", c) + (f"+{cs.madj}" if cs.madj else ""), h=lambda c: None)
    sub(O, "o_is", "Income statement ($M)")
    add(O, "rev", "Revenue", e=lambda: f"={HREF('revenue', BASE_COLID)}", h=HS("revenue"), p=lambda c, pc, t: f"={X('rev', pc)}*(1+{X('g', c)})", bold=True)
    add(O, "cogs", "Direct costs / COGS", h=HS("cogs"), p=lambda c, pc, t: f"={X('rev', c)}*(1-{X('gm', c)})")
    add(O, "gp", "Gross profit (NOI for real estate)", h=lambda c: f"={X('rev', c)}-{X('cogs', c)}", p=lambda c, pc, t: f"={X('rev', c)}-{X('cogs', c)}", bold=True)
    add(O, "opex", "Operating expenses (implied: gross profit − EBITDA)", h=HS("opexAdj"), p=lambda c, pc, t: f"={X('gp', c)}-{X('ebitda', c)}")
    add(O, "ebitda", "EBITDA", h=lambda c: f"={X('gp', c)}-{X('opex', c)}", p=lambda c, pc, t: f"={X('rev', c)}*{X('m', c)}", bold=True)
    add(O, "da", "D&A", h=HS("da"), p=lambda c, pc, t: f"={X('rev', c)}*{HREF('da', BASE_COLID)}/{HREF('revenue', BASE_COLID)}")
    add(O, "sbc", "Share-based compensation (non-cash)", h=HS("sbc"), p=lambda c, pc, t: f"={X('rev', c)}*{HREF('sbc', BASE_COLID)}/{HREF('revenue', BASE_COLID)}")
    add(O, "ebit", "EBIT", h=lambda c: f"={X('ebitda', c)}-{X('da', c)}-{X('sbc', c)}", p=lambda c, pc, t: f"={X('ebitda', c)}-{X('da', c)}-{X('sbc', c)}", bold=True)
    add(O, "icash", "  Cash interest expense (Debt Schedule)", p=lambda c, pc, t: "=" + "+".join(X(f"ci{i}", c) for i in trs))
    add(O, "ipik", "  PIK interest (non-cash)", p=lambda c, pc, t: "=" + "+".join(X(f"pk{i}", c) for i in trs))
    add(O, "itot", "Interest expense", h=HS("interest"), p=lambda c, pc, t: f"={X('icash', c)}+{X('ipik', c)}")
    add(O, "ebt", "EBT", h=lambda c: f"={X('ebit', c)}-{X('itot', c)}", p=lambda c, pc, t: f"={X('ebit', c)}-{X('itot', c)}", bold=True)
    add(O, "taxes", "Taxes", h=HS("taxes"), p=lambda c, pc, t: f"=MAX(0,{X('ebt', c)})*{A['tax']}")
    add(O, "ni", "Net income (model basis)", h=lambda c: f"={X('ebt', c)}-{X('taxes', c)}", p=lambda c, pc, t: f"={X('ebt', c)}-{X('taxes', c)}", bold=True)
    sub(O, "o_cf", "Free cash flow build ($M)")
    add(O, "capex", "Capex", h=HS("capex"), p=lambda c, pc, t: f"={X('rev', c)}*{CH('capex', c)}")
    add(O, "dnwc", "Working capital & other cash items (+ = outflow)", h=HS("dnwc"), p=lambda c, pc, t: f"={CH('nwc', c)}*({X('rev', c)}-{X('rev', pc)})+{CH('drag', c)}*{X('rev', c)}")
    add(O, "fcf", "Free cash flow (NI + D&A + SBC + PIK − capex − ΔNWC/other)", h=HS("fcf"), p=lambda c, pc, t: f"={X('ni', c)}+{X('da', c)}+{X('sbc', c)}+{X('ipik', c)}-{X('capex', c)}-{X('dnwc', c)}", bold=True)

    # ── debt schedule
    D = "debt"
    sub(D, "d_hdr", "Rates & market-access (refinancing) test")
    add(D, "sofr", "Base rate (SOFR)", fmt=PCT2, p=lambda c, pc, t: f"={A['sofr'][c]}")
    add(D, "shock", "Floating-rate shock (selected scenario)", kind="scalar", fmt=PCT2, s=lambda: f"={CH('bps', 'C')}" + (f"+{cs.sadj}" if cs.sadj else ""))
    add(D, "refir", "Refinancing rate (selected scenario)", kind="scalar", fmt=PCT2, s=lambda: f"={CH('refi', 'C')}")
    add(D, "maxlev", "Max net leverage to refinance", kind="scalar", fmt=MULT, s=lambda: f"={CH('maxlev', 'C')}")
    add(D, "mincov", "Min pro-forma coverage to refinance", kind="scalar", fmt=MULT, s=lambda: f"={CH('mincov', 'C')}")
    add(D, "begdebt", "Beginning total debt", p=lambda c, pc, t: "=" + "+".join(X(f"bg{i}", c) for i in trs))
    add(D, "begcash", "Beginning cash", p=lambda c, pc, t: f"={X('cash_end', pc)}")

    def base_rate(i, c):
        return f"IF({T[i]['float']}=1,MAX({X('sofr', c)},{T[i]['floor']})+{T[i]['spread']}+{X('shock', 'C', True)},{T[i]['rate']})"

    def pf(c, pc, t):
        terms = []
        for i in trs:
            cond = f"{X(f'du{i}', c)}=1" if t == 1 else f"OR({X(f'du{i}', c)}=1,{X(f'rf{i}', pc)}=1)"
            terms.append(f"{X(f'bg{i}', c)}*IF({cond},{X('refir', 'C', True)},{base_rate(i, c)})")
        return "=" + "+".join(terms)

    add(D, "pfint", "Pro-forma interest for refinancing test", p=pf)
    add(D, "access", "Market access to refinance? (1 = yes)", fmt="0",
        p=lambda c, pc, t: f"=IF({X('ebitda', c)}<=0,0,IF(AND(({X('begdebt', c)}-{X('begcash', c)})/{X('ebitda', c)}<={X('maxlev', 'C', True)},{X('ebitda', c)}/{X('pfint', c)}>={X('mincov', 'C', True)}),1,0))")
    for i in trs:
        sub(D, f"dh{i}", f"Tranche {i}: {TR[i - 1]['name']}")
        add(D, f"bg{i}", "  Beginning balance", p=lambda c, pc, t, i=i: f"={X(f'en{i}', pc)}")
        add(D, f"du{i}", "  Maturing this period? (1 = yes)", fmt="0", p=lambda c, pc, t, i=i: f"=IF({X('year', c)}={T[i]['mat']},1,0)")
        add(D, f"rf{i}", "  Refinanced (cumulative flag)", fmt="0",
            p=lambda c, pc, t, i=i: (f"=IF(AND({X(f'du{i}', c)}=1,{X('access', c)}=1),1,0)" if t == 1 else f"=IF({X(f'rf{i}', pc)}=1,1,IF(AND({X(f'du{i}', c)}=1,{X('access', c)}=1),1,0))"))
        add(D, f"rt{i}", "  All-in interest rate applied", fmt=PCT2,
            p=lambda c, pc, t, i=i: (f"={base_rate(i, c)}" if t == 1 else f"=IF({X(f'rf{i}', pc)}=1,{X('refir', 'C', True)},{base_rate(i, c)})"))
        add(D, f"ci{i}", "  Cash interest expense", p=lambda c, pc, t, i=i: f"={X(f'bg{i}', c)}*{X(f'rt{i}', c)}")
        add(D, f"pk{i}", "  PIK interest", p=lambda c, pc, t, i=i: f"={X(f'bg{i}', c)}*{T[i]['pik']}")
        add(D, f"am{i}", "  Mandatory amortization", p=lambda c, pc, t, i=i: f"=MIN({X(f'bg{i}', c)},{T[i]['amort']}*{T[i]['principal']})")
        add(D, f"nw{i}", "  New borrowing (revolver draw)",
            p=lambda c, pc, t, i=i: (f"=IF(AND({T[i]['isrev']}=1,{X('year', c)}<{T[i]['mat']}),MIN(MAX(0,-{X('cashA', c)}),MAX(0,{T[i]['commit']}-{X(f'bg{i}', c)})),0)" if t == 1 else
                                     f"=IF(AND({T[i]['isrev']}=1,OR({X('year', c)}<{T[i]['mat']},{X(f'rf{i}', pc)}=1)),MIN(MAX(0,-{X('cashA', c)}),MAX(0,{T[i]['commit']}-{X(f'bg{i}', c)})),0)"))

        def mat(c, pc, t, i=i):
            prior = "".join(f"-{X(f'mt{j}', c)}" for j in range(1, i))
            return f"={X(f'du{i}', c)}*MIN({X(f'bg{i}', c)}-{X(f'am{i}', c)}+{X(f'pk{i}', c)},MAX(0,{X('cashB', c)}-{A['mincash']}*{X('access', c)}{prior}))"

        add(D, f"mt{i}", "  Repayment at maturity (from available cash)", p=mat)

        def opt(c, pc, t, i=i):
            prior = "".join(f"-{X(f'op{j}', c)}" for j in range(1, i))
            return f"={T[i]['prepay']}*MIN({X(f'bg{i}', c)}+{X(f'nw{i}', c)}+{X(f'pk{i}', c)}-{X(f'am{i}', c)}-{X(f'mt{i}', c)},MAX(0,{X('sweepav', c)}{prior}))"

        add(D, f"op{i}", "  Optional repayment (cash sweep)", p=opt)
        add(D, f"up{i}", "  Unpaid at maturity (no refinancing, insufficient cash)", p=lambda c, pc, t, i=i: f"={X(f'du{i}', c)}*(1-{X('access', c)})*({X(f'bg{i}', c)}-{X(f'am{i}', c)}+{X(f'pk{i}', c)}-{X(f'mt{i}', c)})")
        add(D, f"en{i}", "  Ending balance", e=lambda i=i: f"={T[i]['principal']}",
            p=lambda c, pc, t, i=i: f"={X(f'bg{i}', c)}+{X(f'nw{i}', c)}+{X(f'pk{i}', c)}-{X(f'am{i}', c)}-{X(f'mt{i}', c)}-{X(f'op{i}', c)}", bold=True)
    sub(D, "d_tot", "Totals")
    add(D, "totdebt", "Total debt — ending", e=lambda: "=" + "+".join(X(f"en{i}", BASE) for i in trs), p=lambda c, pc, t: "=" + "+".join(X(f"en{i}", c) for i in trs), bold=True)
    add(D, "wall", "Contractual maturities by period (from maturity flags)", p=lambda c, pc, t: "=" + "+".join(f"{X(f'du{i}', c)}*{T[i]['principal']}" for i in trs))
    sub(D, "d_refi", "Refinancing risk engine — result per maturing tranche")
    for i in trs:
        add(D, f"rfb{i}", f"  Tranche {i}: balance at maturity", kind="scalar", s=lambda i=i: f"=SUMPRODUCT({XR(f'du{i}')},{XR(f'bg{i}')}-{XR(f'am{i}')}+{XR(f'pk{i}')})")
        add(D, f"rfc{i}", f"  Tranche {i}: repaid from cash at maturity", kind="scalar", s=lambda i=i: f"=SUMPRODUCT({XR(f'du{i}')},{XR(f'mt{i}')})")
        add(D, f"rfs{i}", f"  Tranche {i}: refinancing test", kind="scalar", fmt=GEN,
            s=lambda i=i: f'=IF(SUM({XR(f"du{i}")})=0,"n/a (beyond horizon)",IF(SUMPRODUCT({XR(f"du{i}")},{XR("access")})>0,"REFINANCING PASS","REFINANCING FAILURE"))')
        add(D, f"rfr{i}", f"  Tranche {i}: resolution", kind="scalar", fmt=GEN,
            s=lambda i=i: f'=IF(SUM({XR(f"du{i}")})=0,"n/a",IF({X(f"rfc{i}", "C")}>={X(f"rfb{i}", "C")}-0.001,"Repaid from cash",IF(SUMPRODUCT({XR(f"du{i}")},{XR("access")})>0,IF({X(f"rfc{i}", "C")}>0,"Partly repaid; remainder refinanced","Refinanced"),IF(SUM({XR(f"up{i}")})>0.001,IF({X(f"rfc{i}", "C")}>0,"Partial repayment; PAYMENT DEFAULT","PAYMENT DEFAULT"),"Repaid from cash"))))')
    add(D, "refifail", "Refinancing failures (count of maturing tranches)", kind="scalar", fmt="0",
        s=lambda: "=" + "+".join(f"IF({X(f'rfs{i}', 'C')}=\"REFINANCING FAILURE\",1,0)" for i in trs))

    # ── cash flow
    C_ = "cash"
    sub(C_, "c_h", "Cash flow & liquidity waterfall ($M)")
    add(C_, "cbeg", "Beginning cash", p=lambda c, pc, t: f"={X('cash_end', pc)}")
    add(C_, "cfcf", "Free cash flow (from Operating Model)", p=lambda c, pc, t: f"={X('fcf', c)}")
    add(C_, "casale", "Plus: net asset-sale proceeds", p=lambda c, pc, t: f"={CH('sales', c)}")
    add(C_, "cam", "Less: mandatory amortization", p=lambda c, pc, t: "=" + "+".join(X(f"am{i}", c) for i in trs))
    add(C_, "cashA", "Cash after mandatory debt service", p=lambda c, pc, t: f"={X('cbeg', c)}+{X('cfcf', c)}+{X('casale', c)}-{X('cam', c)}", bold=True)
    add(C_, "cdraw", "Plus: revolver draw", p=lambda c, pc, t: "=" + "+".join(X(f"nw{i}", c) for i in trs))
    add(C_, "cashB", "Cash available for maturities", p=lambda c, pc, t: f"={X('cashA', c)}+{X('cdraw', c)}", bold=True)
    add(C_, "cmat", "Less: repayment of maturing debt", p=lambda c, pc, t: "=" + "+".join(X(f"mt{i}", c) for i in trs))
    add(C_, "cashC", "Cash before sweep", p=lambda c, pc, t: f"={X('cashB', c)}-{X('cmat', c)}", bold=True)
    add(C_, "gap", "Funding gap (shortfall after cash & revolver)", p=lambda c, pc, t: f"=MAX(0,-{X('cashC', c)})")
    add(C_, "sweepav", "Excess cash available for sweep", p=lambda c, pc, t: f"=MAX(0,{X('cashC', c)}-{A['mincash']})*{A['sweep']}")
    add(C_, "copt", "Less: optional repayment (cash sweep)", p=lambda c, pc, t: "=" + "+".join(X(f"op{i}", c) for i in trs))
    add(C_, "cash_end", "Ending cash", e=lambda: f"={A['cash0']}", p=lambda c, pc, t: f"={X('cashC', c)}-{X('copt', c)}", bold=True)
    add(C_, "unpaid", "Unpaid maturities (balance left outstanding)", p=lambda c, pc, t: "=" + "+".join(X(f"up{i}", c) for i in trs))
    add(C_, "dflag", "Payment default? (1 = yes)", fmt="0", p=lambda c, pc, t: f"=IF(OR({X('gap', c)}>0.001,{X('unpaid', c)}>0.001),1,0)")
    add(C_, "fdef", "First default period flag", fmt="0",
        p=lambda c, pc, t: (f"=IF({X('dflag', c)}=1,1,0)" if t == 1 else f"=IF(AND({X('dflag', c)}=1,SUM({CUM('dflag', pc)})=0),1,0)"))
    add(C_, "bridge", "Check: Δ debt = draws + PIK − repayments", fmt=NUM, p=lambda c, pc, t: f"=({X('totdebt', c)}-{X('totdebt', pc)})-({X('cdraw', c)}+{X('ipik', c)}-{X('cam', c)}-{X('cmat', c)}-{X('copt', c)})")

    # ── credit metrics + covenants
    M = "metrics"
    sub(M, "m_h", "Credit metrics (selected scenario)")
    add(M, "k_td", "Total debt (face value)", e=lambda: f"={X('totdebt', BASE)}", p=lambda c, pc, t: f"={X('totdebt', c)}")
    add(M, "k_sec", "Secured debt", e=lambda: "=" + "+".join(f"{T[i]['secured']}*{X(f'en{i}', BASE)}" for i in trs), p=lambda c, pc, t: "=" + "+".join(f"{T[i]['secured']}*{X(f'en{i}', c)}" for i in trs))
    add(M, "k_nd", "Net debt", e=lambda: f"={X('k_td', BASE)}-{X('cash_end', BASE)}", p=lambda c, pc, t: f"={X('k_td', c)}-{X('cash_end', c)}")
    add(M, "k_gl", "Gross debt / EBITDA", fmt=MULT, e=lambda: f"=IF({X('ebitda', BASE)}>0,{X('k_td', BASE)}/{X('ebitda', BASE)},0)", p=lambda c, pc, t: f"=IF({X('ebitda', c)}>0,{X('k_td', c)}/{X('ebitda', c)},0)")
    add(M, "k_nl", "Net debt / EBITDA", fmt=MULT, e=lambda: f"=IF({X('ebitda', BASE)}>0,{X('k_nd', BASE)}/{X('ebitda', BASE)},0)", p=lambda c, pc, t: f"=IF({X('ebitda', c)}>0,{X('k_nd', c)}/{X('ebitda', c)},0)")
    add(M, "k_ic", "Interest coverage (EBITDA / cash interest)", fmt=MULT, e=lambda: f"=IF({X('itot', BASE)}>0,{X('ebitda', BASE)}/{X('itot', BASE)},0)", p=lambda c, pc, t: f"=IF({X('icash', c)}>0,{X('ebitda', c)}/{X('icash', c)},0)")
    add(M, "k_ec", "EBIT / interest", fmt=MULT, e=lambda: f"=IF({X('itot', BASE)}>0,{X('ebit', BASE)}/{X('itot', BASE)},0)", p=lambda c, pc, t: f"=IF({X('icash', c)}>0,{X('ebit', c)}/{X('icash', c)},0)")
    add(M, "k_fd", "FCF / debt", fmt=PCT, e=lambda: f"=IF({X('k_td', BASE)}>0,{X('fcf', BASE)}/{X('k_td', BASE)},0)", p=lambda c, pc, t: f"=IF({X('k_td', c)}>0,{X('fcf', c)}/{X('k_td', c)},0)")
    add(M, "k_ds", "Debt service coverage ((EBITDA − capex − tax) / (cash interest + amortization))", fmt=MULT,
        p=lambda c, pc, t: f"=IF({X('icash', c)}+{X('cam', c)}>0,({X('ebitda', c)}-{X('capex', c)}-{X('taxes', c)})/({X('icash', c)}+{X('cam', c)}),0)")
    liq = lambda c: f"=MAX(0,{X('cash_end', c)})+" + "+".join(f"{T[i]['isrev']}*MAX(0,{T[i]['commit']}-{X(f'en{i}', c)})" for i in trs)
    add(M, "k_lq", "Liquidity (cash + undrawn revolver)", e=lambda: liq(BASE), p=lambda c, pc, t: liq(c))
    add(M, "k_dc", "Debt / capital (debt + implied equity)", fmt=PCT,
        p=lambda c, pc, t: f"=IF({X('k_td', c)}>0,{X('k_td', c)}/({X('k_td', c)}+MAX(0,{X('ebitda', c)}*{CH('exitm', 'C')}-{X('k_nd', c)})),0)")
    add(M, "k_cd", "Cash / debt", fmt=PCT, e=lambda: f"=IF({X('k_td', BASE)}>0,MAX(0,{X('cash_end', BASE)})/{X('k_td', BASE)},0)", p=lambda c, pc, t: f"=IF({X('k_td', c)}>0,MAX(0,{X('cash_end', c)})/{X('k_td', c)},0)")
    add(M, "k_av", "Asset value after scenario decline", p=lambda c, pc, t: f"={A['assets']}*(1-{CH('decl', 'C')})")
    sub(M, "m_cov", "Covenant compliance (active covenants; tests use model-basis metrics)")
    for jj, (cj, cv) in enumerate([(k, v) for k, v in enumerate(COVS) if v.get("active", True) is not False]):
        typ = cv["type"]
        hib = typ in ("minInterestCoverage", "minLiquidity", "minEBITDA")
        fm = PCT if typ in ("maxLTV", "maxSecuredLTV") else (NUM if typ in ("minLiquidity", "minEBITDA") else MULT)
        mexpr = {
            "maxNetLeverage": lambda c: f"=IF({X('ebitda', c)}>0,{X('k_nd', c)}/{X('ebitda', c)},99)",
            "minInterestCoverage": lambda c: f"=IF({X('icash', c)}>0,{X('ebitda', c)}/{X('icash', c)},99)",
            "maxLTV": lambda c: f"=IF({X('k_av', c)}>0,{X('k_td', c)}/{X('k_av', c)},99)",
            "maxSecuredLTV": lambda c: f"=IF({X('k_av', c)}>0,{X('k_sec', c)}/{X('k_av', c)},99)",
            "minLiquidity": lambda c: f"={X('k_lq', c)}",
            "minEBITDA": lambda c: f"={X('ebitda', c)}",
        }[typ]
        sub(M, f"cvh{jj}", f"  {cv['label']}  [{cv['basis'].upper()}]")
        add(M, f"cm{jj}", "    Metric", fmt=fm, p=lambda c, pc, t, mexpr=mexpr: mexpr(c))
        add(M, f"ct{jj}", "    Covenant threshold", fmt=fm, p=lambda c, pc, t, cj=cj: f"={COV[cj]['thr'][c]}")
        add(M, f"ch{jj}", "    Headroom", fmt=fm, p=lambda c, pc, t, jj=jj, hib=hib: (f"={X(f'cm{jj}', c)}-{X(f'ct{jj}', c)}" if hib else f"={X(f'ct{jj}', c)}-{X(f'cm{jj}', c)}"))
        add(M, f"cp{jj}", "    Headroom % of threshold", fmt=PCT, p=lambda c, pc, t, jj=jj: f"=IF({X(f'ct{jj}', c)}=0,0,{X(f'ch{jj}', c)}/ABS({X(f'ct{jj}', c)}))")
        add(M, f"cb{jj}", "    BREACH? (1 = yes)", fmt="0", p=lambda c, pc, t, jj=jj: f"=IF({X(f'ch{jj}', c)}<0,1,0)")
        add(M, f"cf{jj}", "    First breach period (0 = none)", kind="scalar", fmt=YEAR, s=lambda jj=jj: f"=IFERROR(INDEX({XR('year')},MATCH(1,{XR(f'cb{jj}')},0)),0)")
        add(M, f"cn{jj}", "    Minimum headroom %", kind="scalar", fmt=PCT, s=lambda jj=jj: f"=MIN({XR(f'cp{jj}')})")
    NAC = len(ACOVS)
    assert NAC > 0, "every case needs at least one active covenant"
    add(M, "k_bc", "Covenant breaches (count, all active covenants)", fmt="0", p=lambda c, pc, t: "=" + "+".join(X(f"cb{j}", c) for j in range(NAC)))
    add(M, "k_bt", "Total breaches across projection", kind="scalar", fmt="0", s=lambda: f"=SUM({XR('k_bc')})")
    add(M, "k_mh", "Minimum covenant headroom % (all active covenants)", kind="scalar", fmt=PCT, s=lambda: "=MIN(" + ",".join(X(f"cn{j}", "C") for j in range(NAC)) + ")")

    # ── recovery (shared waterfall emitter)
    Rv = "recov"
    sub(Rv, "r_h", "Valuation event (default period, or trough-EBITDA period if no default is modelled)")
    add(Rv, "evt", "Valuation event period flag", fmt="0",
        p=lambda c, pc, t: (f"=IF({X('hasdef', 'C', True)}=1,{X('fdef', c)},IF({X('ebitda', c)}=MIN({XR('ebitda')}),1,0))" if t == 1 else
                            f"=IF({X('hasdef', 'C', True)}=1,{X('fdef', c)},IF(AND({X('ebitda', c)}=MIN({XR('ebitda')}),SUM({CUM('evt', pc)})=0),1,0))"))
    add(Rv, "hasdef", "Default modelled? (1 = yes)", kind="scalar", fmt="0", s=lambda: f"=IF(SUM({XR('fdef')})>0,1,0)")
    add(Rv, "eyear", "Valuation period", kind="scalar", fmt=YEAR, s=lambda: f"=SUMPRODUCT({XR('evt')},{XR('year')})")
    add(Rv, "eebitda", "EBITDA at valuation event", kind="scalar", s=lambda: f"=SUMPRODUCT({XR('evt')},{XR('ebitda')})")
    add(Rv, "ecash", "Cash at valuation event", kind="scalar", s=lambda: f"=MAX(0,SUMPRODUCT({XR('evt')},{XR('cash_end')}))")
    add(Rv, "gc", "Going-concern value (distressed multiple × EBITDA)", kind="scalar", s=lambda: f"=({CH('distm', 'C')}" + (f"+{cs.dadj}" if cs.dadj else "") + f")*{X('eebitda', 'C')}")
    add(Rv, "liqv", "Liquidation value (asset base × (1 − decline) × recovery)", kind="scalar", s=lambda: f"={A['assets']}*(1-{CH('decl', 'C')})*{CH('liq', 'C')}")
    add(Rv, "mval", "Model recovery value (greater of the two + cash)", kind="scalar", s=lambda: f"=MAX({X('gc', 'C')},{X('liqv', 'C')})+{X('ecash', 'C')}")
    add(Rv, "rval", "Recovery value used (override if provided)", kind="scalar", bold=True, s=lambda: f"=IF(ISNUMBER({A['override']}),{A['override']},{X('mval', 'C')})")
    add(Rv, "radm", "Less: administrative / DIP costs", kind="scalar", s=lambda: f"={X('rval', 'C')}*{A['admin']}")
    add(Rv, "rnet", "Net value distributable to creditors", kind="scalar", bold=True, s=lambda: f"={X('rval', 'C')}-{X('radm', 'C')}")

    def waterfall(pfx, sec, net_ref, claim_fn, label_claim):
        """Emit rows: claim, rank, collateral share, paid-from-collateral, deficiency, general claim/rank, senior, same-rank, general recovery, total recovery, %, loss, loss %."""
        groups = [
            ("c", label_claim, lambda i: claim_fn(i), NUM),
            ("k", "Seniority rank", lambda i: f"={T[i]['rank']}", "0"),
            ("p", "Collateral share (specific lien; 0 = all-asset / pari)", lambda i: f"={T[i]['cp']}", PCT),
            ("d", "Paid from own collateral pool", lambda i: f"=IF({X(f'{pfx}p{i}', 'C')}>0,MIN({X(f'{pfx}c{i}', 'C')},{X(f'{pfx}p{i}', 'C')}*{net_ref()}),0)", NUM),
            ("f", "Deficiency claim (joins general creditors)", lambda i: f"=IF({X(f'{pfx}p{i}', 'C')}>0,{X(f'{pfx}c{i}', 'C')}-{X(f'{pfx}d{i}', 'C')},0)", NUM),
            ("g", "General claim", lambda i: f"=IF({X(f'{pfx}p{i}', 'C')}>0,{X(f'{pfx}f{i}', 'C')},{X(f'{pfx}c{i}', 'C')})", NUM),
            ("h", "General rank", lambda i: f"=IF({X(f'{pfx}p{i}', 'C')}>0,{A['defrank']},{X(f'{pfx}k{i}', 'C')})", "0"),
            ("s", "General claims ahead", lambda i: f"=SUMPRODUCT(({XV(f'{pfx}h1', f'{pfx}h{NT}')}<{X(f'{pfx}h{i}', 'C')})*{XV(f'{pfx}g1', f'{pfx}g{NT}')})", NUM),
            ("q", "General claims of same rank (pari passu)", lambda i: f"=SUMPRODUCT(({XV(f'{pfx}h1', f'{pfx}h{NT}')}={X(f'{pfx}h{i}', 'C')})*{XV(f'{pfx}g1', f'{pfx}g{NT}')})", NUM),
            ("w", "Recovery from general pool", lambda i: f"=IF({X(f'{pfx}q{i}', 'C')}=0,0,{X(f'{pfx}g{i}', 'C')}/{X(f'{pfx}q{i}', 'C')}*MAX(0,MIN({X(f'{pfx}q{i}', 'C')},{net_ref()}-SUM({XV(f'{pfx}d1', f'{pfx}d{NT}')})-{X(f'{pfx}s{i}', 'C')})))", NUM),
            ("v", "TOTAL RECOVERY", lambda i: f"={X(f'{pfx}d{i}', 'C')}+{X(f'{pfx}w{i}', 'C')}", NUM),
            ("r", "Recovery %", lambda i: f"=IF({X(f'{pfx}c{i}', 'C')}=0,1,{X(f'{pfx}v{i}', 'C')}/{X(f'{pfx}c{i}', 'C')})", PCT),
            ("l", "Loss amount", lambda i: f"={X(f'{pfx}c{i}', 'C')}-{X(f'{pfx}v{i}', 'C')}", NUM),
            ("z", "Loss %", lambda i: f"=IF({X(f'{pfx}c{i}', 'C')}=0,0,{X(f'{pfx}l{i}', 'C')}/{X(f'{pfx}c{i}', 'C')})", PCT),
        ]
        for key, lbl, fn, f in groups:
            sub(sec, f"{pfx}g_{key}", lbl)
            for i in trs:
                add(sec, f"{pfx}{key}{i}", f"  Tranche {i}: {TR[i - 1]['name'][:48]}", kind="scalar", fmt=f, s=lambda i=i, fn=fn: fn(i), bold=(key == "v"))
        add(sec, f"{pfx}eq", "Equity (residual after all claims)", kind="scalar", bold=True,
            s=lambda: f"=MAX(0,{net_ref()}-SUM({XV(f'{pfx}d1', f'{pfx}d{NT}')})-SUM({XV(f'{pfx}g1', f'{pfx}g{NT}')}))")

    waterfall("r", Rv, lambda: X("rnet", "C", True),
              lambda i: f"=SUMPRODUCT({XR('evt')},{XR(f'en{i}')})*(1+SUMPRODUCT({XR('evt')},{XR(f'rt{i}')})*{A['accr']}/12)", "Claim at valuation event (balance + accrued interest)")
    add(Rv, "rcheck", "Check: recoveries + equity + costs − value (should be 0)", kind="scalar", s=lambda: f"=SUM({XV(f'rv1', f'rv{NT}')})+{X('req', 'C')}+{X('radm', 'C')}-{X('rval', 'C')}")

    # ── returns
    Rt = "returns"
    sub(Rt, "t_h", "Position & valuation inputs (links) — face value, purchase price, coupon, yield and recovery are distinct")
    add(Rt, "tgt", "Target tranche #", kind="scalar", fmt="0", s=lambda: f"={A['tgt']}")
    add(Rt, "face", "Face value (legal claim)", kind="scalar", s=lambda: f"={A['face']}")
    add(Rt, "price", "Purchase price / OID (% of face)", kind="scalar", fmt=PX, s=lambda: f"={A['price']}")
    add(Rt, "cost", "Cash investment (face × price × (1 + fees))", kind="scalar", s=lambda: f"={X('face', 'C')}*{X('price', 'C')}/100*(1+{A['fee']})")
    add(Rt, "hold", "Hold period (periods)", kind="scalar", fmt="0", s=lambda: f"={A['hold']}")
    add(Rt, "defidx", "Default period # (0 = no default)", kind="scalar", fmt="0", s=lambda: f"=IF({X('hasdef', 'C')}=1,SUMPRODUCT({XR('fdef')},{XR('tidx')}),0)")
    add(Rt, "share", "Our share of the tranche at the valuation event", kind="scalar", fmt=PCT,
        s=lambda: f"=IFERROR({X('face', 'C')}/CHOOSE({X('tgt', 'C')},{','.join('SUMPRODUCT(' + XR('evt') + ',' + XR(f'en{i}') + ')' for i in trs)}),0)")
    add(Rt, "recp", "Recovery proceeds to our position if default", kind="scalar", s=lambda: f"=CHOOSE({X('tgt', 'C')},{','.join(X(f'rv{i}', 'C') for i in trs)})*{X('share', 'C')}")
    add(Rt, "recpct", "Tranche recovery % at valuation event (waterfall)", kind="scalar", fmt=PCT, s=lambda: f"=CHOOSE({X('tgt', 'C')},{','.join(X(f'rr{i}', 'C') for i in trs)})")
    add(Rt, "lastc", "Last coupon period #", kind="scalar", fmt="0", s=lambda: f"=IF({X('hasdef', 'C')}=1,{X('defidx', 'C')},{X('hold', 'C')})")
    add(Rt, "xin", "Exit price assumption (no default)", kind="scalar", fmt=PX, s=lambda: f"={CH('exitpx', 'C')}")
    add(Rt, "xev", "Exit EV (exit multiple × EBITDA + cash at hold period)", kind="scalar", s=lambda: f"=INDEX({XR('ebitda')},{X('hold', 'C')})*{CH('exitm', 'C')}+MAX(0,INDEX({XR('cash_end')},{X('hold', 'C')}))")
    waterfall("x", Rt, lambda: X("xev", "C", True), lambda i: f"=INDEX({XR(f'en{i}')},{X('hold', 'C')})", "Claim at exit (balance at hold period)")
    add(Rt, "xpx", "Exit price used (lesser of assumption and valuation coverage)", kind="scalar", fmt=PX, s=lambda: f"=MIN({X('xin', 'C')},100*CHOOSE({X('tgt', 'C')},{','.join(X(f'xr{i}', 'C') for i in trs)}))")
    add(Rt, "tp", "Principal proceeds received in period #", kind="scalar", fmt="0", s=lambda: f"=IF({X('hasdef', 'C')}=1,{X('defidx', 'C')}+{A['lag']},{X('hold', 'C')})")
    sub(Rt, "t_fl", "Cash flows to the position ($M) — period # 0 … 6")
    add(Rt, "tline", "Period #", kind="flow", fmt="0", p=lambda k: "=COLUMN()-COLUMN($C$1)")

    def cpn_rate(k):
        if k == 0 or k > 5:
            return None
        return "=CHOOSE(" + X("tgt", "C", True) + "," + ",".join(X(f"rt{i}", PC[k - 1]) for i in trs) + ")"

    add(Rt, "cpn", "Cash coupon rate on target tranche", kind="flow", fmt=PCT2, p=cpn_rate)

    def cpn_f(k):
        if k == 0 or k > 5:
            return None
        return f"=IF({X('tline', col(3 + k))}<={X('lastc', 'C', True)},{X('face', 'C', True)}*{X('cpn', col(3 + k))},0)"

    add(Rt, "cf_c", "Cash interest received", kind="flow", p=cpn_f)

    def proc_f(k):
        if k == 0:
            return None
        t = X("tline", col(3 + k))
        return f"=IF(AND({X('hasdef', 'C', True)}=0,{t}={X('hold', 'C', True)}),{X('face', 'C', True)}*{X('xpx', 'C', True)}/100,0)+IF(AND({X('hasdef', 'C', True)}=1,{t}={X('tp', 'C', True)}),{X('recp', 'C', True)},0)"

    add(Rt, "cf_p", "Exit proceeds / recovery", kind="flow", p=proc_f)
    add(Rt, "cf_t", "Net cash flow", kind="flow", bold=True, p=lambda k: (f"=-{X('cost', 'C', True)}" if k == 0 else f"={X('cf_c', col(3 + k))}+{X('cf_p', col(3 + k))}"))
    add(Rt, "cint", "Cash interest received (total)", kind="scalar", s=lambda: f"=SUM({XR('cf_c', 'C', 'I')})")
    add(Rt, "xproc", "Exit / recovery proceeds (total)", kind="scalar", s=lambda: f"=SUM({XR('cf_p', 'C', 'I')})")
    add(Rt, "inflow", "Total cash received", kind="scalar", s=lambda: f"={X('cint', 'C')}+{X('xproc', 'C')}")
    add(Rt, "capgain", "Capital gain / (loss) vs purchase price (proceeds − face × price)", kind="scalar", s=lambda: f"={X('xproc', 'C')}-{X('face', 'C')}*{X('price', 'C')}/100")
    add(Rt, "profit", "Absolute profit", kind="scalar", s=lambda: f"={X('inflow', 'C')}-{X('cost', 'C')}")
    add(Rt, "moic", "MOIC", kind="scalar", fmt=MULT, bold=True, s=lambda: f"={X('inflow', 'C')}/{X('cost', 'C')}")
    add(Rt, "irr", "IRR", kind="scalar", fmt=PCT, bold=True,
        s=lambda: f"=IF({X('inflow', 'C')}<=0,-1,IFERROR(IRR({XR('cf_t', 'C', 'I')},MAX(-0.9,{X('moic', 'C')}^(1/{X('tp', 'C')})-1)),IRR({XR('cf_t', 'C', 'I')},0.1)))")
    add(Rt, "peaklev", "Peak net leverage (projection)", kind="scalar", fmt=MULT, s=lambda: f"=MAX({XR('k_nl')})")
    add(Rt, "mincovo", "Minimum interest coverage (projection)", kind="scalar", fmt=MULT, s=lambda: f"=MIN({XR('k_ic')})")
    add(Rt, "cumfcf", "Cumulative FCF (projection)", kind="scalar", s=lambda: f"=SUM({XR('fcf')})")
    return R


def write_case(cs, plan):
    LOC.clear()
    rows = build_rows(cs)
    for sec, w, r0 in plan:
        r_ = r0
        for row in rows:
            if row["sec"] == sec:
                LOC[row["name"]] = (w, r_)
                r_ += 1
    for row in rows:
        w, r_ = LOC[row["name"]]
        CUR[0] = w
        if row["kind"] == "sub":
            put(w, f"A{r_}", row["label"], "label", bold=True)
            for c in range(1, 12):
                w.cell(row=r_, column=c).fill = FILL_HDR
            continue
        put(w, f"A{r_}", row["label"], "label", bold=row["bold"])
        f = row["fmt"]
        if row["kind"] == "scalar":
            put(w, f"C{r_}", row["s"](), "calc", f, bold=row["bold"])
        elif row["kind"] == "flow":
            for k in range(7):
                v = row["p"](k)
                if v is not None:
                    put(w, f"{col(3 + k)}{r_}", v, "calc", f, bold=row["bold"])
        else:
            if cs.show_hist and row["h"]:
                for c in HC:
                    if c in OPS_HCOL.values():
                        v = row["h"](c)
                        if v:
                            put(w, f"{c}{r_}", v, "calc", f, bold=row["bold"])
            if cs.show_hist and row["name"] == "year":
                for c in reversed(HC[:-1]):
                    put(w, f"{c}{r_}", f"={col(ord(c) - 64 + 1)}{r_}-1", "calc", f)
            if row["e"] and (cs.show_hist or row["name"] in NEED_E or row["name"].startswith("en")):
                put(w, f"{BASE}{r_}", row["e"](), "calc", f, bold=row["bold"])
            if row["p"]:
                for t, c in enumerate(PC, start=1):
                    v = row["p"](c, prev(c), t)
                    if v is not None:
                        put(w, f"{c}{r_}", v, "calc", f, bold=row["bold"])
    return dict(LOC)


# ═══════════════════════════ MAIN MODEL SHEETS ═══════════════════════════
main_plan = [("ops", WS["Operating Model"], 6), ("debt", WS["Debt Schedule"], 6), ("cash", WS["Cash Flow"], 6),
             ("metrics", WS["Credit Metrics"], 6), ("recov", WS["Recovery"], 6), ("returns", WS["Returns"], 6)]
MAIN = write_case(Case(scen=A["scen"], show_hist=True), main_plan)
MAINLOC = dict(MAIN)
HIST_LABELS = {cid: next(c["label"] for c in HCOLS if c["id"] == cid) for cid in OPS_HIST}
titles = {"Operating Model": "Operating Model — selected scenario (assumptions → statements)", "Debt Schedule": "Debt Schedule — tranche roll-forward, rates, PIK, refinancing test, cash sweep",
          "Cash Flow": "Cash Flow & Liquidity — cash waterfall and default test", "Credit Metrics": "Credit Metrics, Covenants & Credit Score",
          "Recovery": "Recovery — waterfall by seniority (collateral pools, deficiency claims) at the valuation event", "Returns": "Returns — face, purchase price, coupon, yield, recovery, IRR and MOIC (selected scenario)"}
for n, ttl in titles.items():
    w = WS[n]
    w.column_dimensions["A"].width = 64
    w.column_dimensions["B"].width = 4
    for c in HC + PC:
        w.column_dimensions[c].width = 12
    put(w, "A1", ttl, "label").font = F_TITLE
    put(w, "A2", f'="{CASE["name"]} · {flag} · {CASE["termsLabel"]} · Active scenario: "&{A["scen_name"]}', "calc")
    put(w, "A4", "$M", "header")
    for hcid, hc in zip(OPS_HIST, HC[-len(OPS_HIST):]):
        put(w, f"{hc}4", HIST_LABELS[hcid], "header")
    for c, lab in zip(PC, CASE["periodLabels"]):
        put(w, f"{c}4", lab, "header")
    w.freeze_panes = "C5"
WS["Recovery"]["C4"].value = "Value"
WS["Returns"]["C4"].value = "Value / t=0"
for k, c in zip(range(1, 7), "DEFGHI"):
    WS["Returns"][f"{c}4"].value = f"t={k}"
for c in "JK":
    WS["Returns"][f"{c}4"].value = None
for c in "DEFGHIJK":
    WS["Recovery"][f"{c}4"].value = None
LOC_MAIN = dict(MAINLOC)


def MR(name, c):
    w_, r_ = MAINLOC[name]
    return f"'{w_.title}'!{c}{r_}"


def MRNG(name, c1=PC[0], c2=PC[-1]):
    w_, r_ = MAINLOC[name]
    return f"'{w_.title}'!${c1}${r_}:${c2}${r_}"


# ═══════════════════════════ CALC ENGINE ═══════════════════════════
we = WS["Calc Engine"]
we.column_dimensions["A"].width = 64
we.column_dimensions["B"].width = 4
for c in HC + PC:
    we.column_dimensions[c].width = 12
put(we, "A1", "Calc Engine — supporting tab: identical model logic run for all scenarios and sensitivity cases", "label").font = F_TITLE
put(we, "A2", "Cases 1-3 run Base / Downside / Severe simultaneously. Cases 4-63 flex EBITDA margin, revenue growth, SOFR and the distressed multiple (axes on Sensitivities). Same row logic as the detailed tabs; Scenarios › Reconciliation proves the engine ties to them.", "label")
MARGIN_AX = [-0.04, -0.02, 0.0, 0.02, 0.04]
GROW_AX = [-0.10, -0.05, 0.0, 0.05, 0.10]
SOFR_AX = [-0.01, -0.005, 0.0, 0.01, 0.02]
MULT_AX = [-2.0, -1.0, 0.0, 1.0, 2.0]
PRICE_OFF = [-8, -4, 0, 4, 8]
REC_AX = [20, 40, 60, 80, 100]
SROW = {"price": 8, "rec": 18, "margin": 28, "growth": 38, "sofr": 48, "mult": 58, "mrec": 68}
AXR = {k: [f"'Sensitivities'!$A${SROW[k] + 2 + i}" for i in range(5)] for k in SROW}
BLOCKS = []
specs = [(SCN[s - 1], s, None, None) for s in (1, 2, 3)]
for kind in ("m", "g", "s", "d"):
    nm = {"m": "EBITDA margin shift", "g": "revenue growth shift", "s": "SOFR shift", "d": "distressed-multiple shift"}[kind]
    for s in (1, 2, 3):
        for i in range(5):
            specs.append((f"{SCN[s - 1]} · {nm} point {i + 1}", s, kind, i))
top = 5
for idx, (nm, s, kind, i) in enumerate(specs):
    for c in range(1, 12):
        we.cell(row=top, column=c).fill = FILL_SEC
    put(we, f"A{top}", f"CASE {idx + 1}: {nm}", "sec")
    labels = ["Scenario index (structural input)", "Revenue growth adjustment", "EBITDA margin adjustment", "SOFR shift", "Distressed-multiple shift (x)"]
    for j, lb in enumerate(labels):
        put(we, f"A{top + 1 + j}", lb, "label")
    put(we, f"C{top + 1}", s, "input", "0")
    for j, kk in enumerate(("g", "m", "s", "d")):
        if kind == kk:
            put(we, f"C{top + 2 + j}", f"={AXR[{'g': 'growth', 'm': 'margin', 's': 'sofr', 'd': 'mult'}[kk]][i]}", "calc", PCT2 if kk != "d" else MULT)
        else:
            put(we, f"C{top + 2 + j}", 0, "input", PCT2 if kk != "d" else MULT)
    cs = Case(scen=f"$C${top + 1}", gadj=f"$C${top + 2}", madj=f"$C${top + 3}", sadj=f"$C${top + 4}", dadj=f"$C${top + 5}")
    rows = build_rows(cs)
    sizes = {}
    for rw in rows:
        sizes[rw["sec"]] = sizes.get(rw["sec"], 0) + 1
    start = top + 7
    plan = []
    for sec in ["ops", "debt", "cash", "metrics", "recov", "returns"]:
        plan.append((sec, we, start))
        start += sizes[sec] + 1
    loc = write_case(cs, plan)
    BLOCKS.append(dict(loc={k: v[1] for k, v in loc.items()}, top=top))
    top = start + 2
we.freeze_panes = "C5"
CUR[0] = None
print("engine rows:", top, "blocks:", len(BLOCKS))


def BC(k, name, c="C"):
    return f"'Calc Engine'!{c}{BLOCKS[k]['loc'][name]}"


def BRNG(k, name, c1=PC[0], c2=PC[-1]):
    r_ = BLOCKS[k]["loc"][name]
    return f"'Calc Engine'!${c1}${r_}:${c2}${r_}"


def widths(w, a=50, rest=13, n="BCDEFGHIJKL"):
    w.column_dimensions["A"].width = a
    for c in n:
        w.column_dimensions[c].width = rest


SB = {1: 0, 2: 1, 3: 2}
LTM_COL = BASE
IDX = {"m": 3, "g": 18, "s": 33, "d": 48}

# ═══════════════════════════ CREDIT SCORE (Credit Metrics) ═══════════════════════════
wc = WS["Credit Metrics"]
r0 = max(r_ for (w_, r_) in MAINLOC.values() if w_ is wc) + 3
section(wc, r0, "Credit score — transparent, formula-driven (base period; weights & thresholds on Assumptions §8)", 11)
header_row(wc, r0 + 1, ["Factor", "", "Value", "Best", "Worst", "Weight", "Points", "Score %", "Projected value (period 1, selected scenario)", "Projected points"])
wc.column_dimensions["I"].width = 20
wc.column_dimensions["J"].width = 16
PRN = f"'Assumptions'!$C${TR0}:$C${TR1}"
MTR = f"'Assumptions'!$K${TR0}:$K${TR1}"
AMR = f"'Assumptions'!$L${TR0}:$L${TR1}"
ltm_int = MR("itot", BASE)
oblig = f"(SUMPRODUCT(({MTR}<={A['base_year']}+1)*{PRN})+SUMPRODUCT({AMR}*{PRN})+{ltm_int})"
fyc = [HX[c] for c in FYCOLS]
mr_rng = f"'Historical Financials'!{fyc[0]}{ROW_H['mr']}:{fyc[-1]}{ROW_H['mr']}"
g_rng = f"'Historical Financials'!{fyc[1]}{ROW_H['g']}:{fyc[-1]}{ROW_H['g']}"
factors = [
    ("lev", "Net leverage (net debt / EBITDA)", f"={MR('k_nl', BASE)}", MULT), ("cov", "Interest coverage (EBITDA / interest)", f"={MR('k_ic', BASE)}", MULT),
    ("liq", "Liquidity ratio (liquidity / next-period obligations)", f"={MR('k_lq', BASE)}/{oblig}", MULT), ("fcf", "FCF / total debt", f"={MR('k_fd', BASE)}", PCT),
    ("mat", "Share of debt maturing within window", f"=SUMPRODUCT(({MTR}<={A['base_year']}+{A['score_win']})*{PRN})/SUM({PRN})", PCT),
    ("mst", "Margin stability (σ of annual EBITDA margin)", f"=STDEVP({mr_rng})", PCT2), ("rst", "Revenue stability (σ of annual growth)", f"=STDEVP({g_rng})", PCT2),
    ("ast", "Asset coverage (asset base / debt)", f"={A['assets']}/{MR('k_td', BASE)}", MULT), ("ind", "Industry risk factor (analyst input, 0-1)", f"={A['ind_val']}", "0.00"),
]
rr = r0 + 2
CSR0 = rr
for k, lbl, f, fm in factors:
    put(wc, f"A{rr}", lbl, "label")
    put(wc, f"C{rr}", f, "calc", fm)
    put(wc, f"D{rr}", f"={SC[k]['b']}", "calc", GEN)
    put(wc, f"E{rr}", f"={SC[k]['wr']}", "calc", GEN)
    put(wc, f"F{rr}", f"={SC[k]['w']}", "calc", "0")
    put(wc, f"H{rr}", f"=MAX(0,MIN(1,(C{rr}-E{rr})/(D{rr}-E{rr})))", "calc", PCT)
    put(wc, f"G{rr}", f"=F{rr}*H{rr}", "calc", "0.0")
    projv = {"lev": f"={MR('k_nl', PC[0])}", "cov": f"={MR('k_ic', PC[0])}", "liq": f"={MR('k_lq', PC[0])}/{oblig}", "fcf": f"={MR('k_fd', PC[0])}"}.get(k, f"=C{rr}")
    put(wc, f"I{rr}", projv, "calc", fm)
    put(wc, f"J{rr}", f"=F{rr}*MAX(0,MIN(1,(I{rr}-E{rr})/(D{rr}-E{rr})))", "calc", "0.0")
    rr += 1
put(wc, f"A{rr}", "Credit score (0-100)", "label", bold=True)
put(wc, f"F{rr}", f"=SUM(F{CSR0}:F{rr - 1})", "calc", "0", bold=True)
put(wc, f"G{rr}", f"=SUM(G{CSR0}:G{rr - 1})", "calc", "0.0", bold=True)
put(wc, f"J{rr}", f"=SUM(J{CSR0}:J{rr - 1})", "calc", "0.0", bold=True)
CS_TOTAL = f"'Credit Metrics'!$G${rr}"
CS_PROJ = f"'Credit Metrics'!$J${rr}"
rr += 1
put(wc, f"A{rr}", "Risk band", "label", bold=True)
put(wc, f"G{rr}", f'=IF(G{rr - 1}>={A["band_low"]},"Low",IF(G{rr - 1}>={A["band_mod"]},"Moderate",IF(G{rr - 1}>={A["band_elev"]},"Elevated","High")))', "calc", bold=True)
CS_BAND = f"'Credit Metrics'!$G${rr}"
put(wc, f"A{rr + 1}", "Each factor earns its weight linearly between the 'worst' threshold (0 pts) and the 'best' threshold (full pts).", "label")

# ═══════════════════════════ SCENARIOS ═══════════════════════════
wsc = WS["Scenarios"]
widths(wsc, 56, 16)
put(wsc, "A1", "Scenarios — side-by-side (all three run simultaneously on Calc Engine)", "label").font = F_TITLE
put(wsc, "A2", f'="Active scenario for the detailed tabs: "&{A["scen_name"]}', "calc")
header_row(wsc, 4, ["Assumptions (links to Assumptions tab)", "", "Base Case", "Downside", "Severe Downside", "Selected"])
rr = 5
SCN_ROWS = {}


def scen_row(label, fn, fmt, key=None, bold=False):
    global rr
    put(wsc, f"A{rr}", label, "label", bold=bold)
    for j, s in enumerate((1, 2, 3)):
        put(wsc, f"{col(3 + j)}{rr}", fn(s), "calc", fmt, bold=bold)
    put(wsc, f"F{rr}", f"=CHOOSE({A['scen']},C{rr},D{rr},E{rr})", "calc", fmt, bold=bold)
    if key:
        SCN_ROWS[key] = rr
    rr += 1


scen_row("Average revenue growth (5 periods)", lambda s: f"=AVERAGE({S[s]['g'][PC[0]]}:{S[s]['g'][PC[-1]]})", PCT)
scen_row("Average EBITDA margin (5 periods)", lambda s: f"=AVERAGE({S[s]['m'][PC[0]]}:{S[s]['m'][PC[-1]]})", PCT)
scen_row("Floating-rate shock", lambda s: f"={S[s]['bps']}", PCT2)
scen_row("Refinancing rate", lambda s: f"={S[s]['refi']}", PCT2)
scen_row("Market access: max net leverage / min coverage", lambda s: f'=TEXT({S[s]["maxlev"]},"0.0")&"x / "&TEXT({S[s]["mincov"]},"0.00")&"x"', GEN)
scen_row("Exit multiple / distressed multiple", lambda s: f'=TEXT({S[s]["exitm"]},"0.0")&"x / "&TEXT({S[s]["distm"]},"0.0")&"x"', GEN)
scen_row("Asset value decline", lambda s: f"={S[s]['decl']}", PCT)
scen_row("Scenario probability", lambda s: f"={S[s]['prob']}", PCT, key="prob")
rr += 1
header_row(wsc, rr, ["Outputs (from Calc Engine)", "", "Base Case", "Downside", "Severe Downside", "Selected"])
rr += 1
scen_row(f"{CASE['periodLabels'][-1]} revenue ($M)", lambda s: f"={BC(SB[s], 'rev', PC[-1])}", NUM)
scen_row("Trough EBITDA ($M)", lambda s: f"=MIN({BRNG(SB[s], 'ebitda')})", NUM)
scen_row("Cumulative FCF, 5 periods ($M)", lambda s: f"={BC(SB[s], 'cumfcf')}", NUM)
scen_row("Peak net debt / EBITDA", lambda s: f"={BC(SB[s], 'peaklev')}", MULT)
scen_row("Minimum EBITDA / cash interest", lambda s: f"={BC(SB[s], 'mincovo')}", MULT)
scen_row("Covenant breaches (count of tests failed)", lambda s: f"={BC(SB[s], 'k_bt')}", "0", key="cov")
scen_row("Refinancing failures (maturing tranches)", lambda s: f"={BC(SB[s], 'refifail')}", "0", key="refi")
scen_row("Payment default modelled? (1 = yes)", lambda s: f"={BC(SB[s], 'hasdef')}", "0", key="def", bold=True)
scen_row("Valuation period (default or trough)", lambda s: f"={BC(SB[s], 'eyear')}", YEAR)
scen_row("Recovery value used ($M)", lambda s: f"={BC(SB[s], 'rval')}", NUM)
scen_row("Target-tranche recovery % (valuation waterfall)", lambda s: f"={BC(SB[s], 'recpct')}", PCT, key="rec")
scen_row("Exit price used (% of face)", lambda s: f"={BC(SB[s], 'xpx')}", PX)
scen_row("IRR", lambda s: f"={BC(SB[s], 'irr')}", PCT, key="irr", bold=True)
scen_row("MOIC", lambda s: f"={BC(SB[s], 'moic')}", MULT, key="moic", bold=True)
scen_row("Absolute profit ($M)", lambda s: f"={BC(SB[s], 'profit')}", NUM)
rr += 1
# Expected-cash-flow IRR: probability-weight the three scenarios' dated cash flows (same t=0..6 timeline), then take the IRR of that stream.
EXP_ROW = rr
put(wsc, f"A{rr}", "Probability-weighted IRR (IRR of expected cash flows)", "label", bold=True)
PW_IRR = f"'Scenarios'!$C${rr}"
AVG_IRR_ROW = rr + 1
put(wsc, f"A{AVG_IRR_ROW}", "Memo: probability-weighted AVERAGE of scenario IRRs (IRR is non-linear, so this is not an IRR)", "label")
put(wsc, f"C{AVG_IRR_ROW}", f"=SUMPRODUCT(C{SCN_ROWS['prob']}:E{SCN_ROWS['prob']},C{SCN_ROWS['irr']}:E{SCN_ROWS['irr']})", "calc", PCT)
PW_AVG = f"'Scenarios'!$C${AVG_IRR_ROW}"
rr += 2
put(wsc, f"A{rr}", "Probability-weighted MOIC", "label", bold=True)
put(wsc, f"C{rr}", f"=SUMPRODUCT(C{SCN_ROWS['prob']}:E{SCN_ROWS['prob']},C{SCN_ROWS['moic']}:E{SCN_ROWS['moic']})", "calc", MULT, bold=True)
PW_MOIC = f"'Scenarios'!$C${rr}"
rr += 1
put(wsc, f"A{rr}", "Probability of payment default", "label", bold=True)
put(wsc, f"C{rr}", f"=SUMPRODUCT(C{SCN_ROWS['prob']}:E{SCN_ROWS['prob']},C{SCN_ROWS['def']}:E{SCN_ROWS['def']})", "calc", PCT, bold=True)
PW_DEF = f"'Scenarios'!$C${rr}"
rr += 2
section(wsc, rr, "Expected (probability-weighted) position cash flows by period — basis of the probability-weighted IRR", 11)
rr += 1
header_row(wsc, rr, ["", "", "t=0", "t=1", "t=2", "t=3", "t=4", "t=5", "t=6"])
rr += 1
put(wsc, f"A{rr}", "Expected net cash flow ($M)", "label")
for t in range(7):
    c_ = col(3 + t)
    terms = "+".join(f"{col(3 + si)}${SCN_ROWS['prob']}*'Calc Engine'!{c_}{BLOCKS[SB[s_]]['loc']['cf_t']}" for si, s_ in enumerate((1, 2, 3)))
    put(wsc, f"{c_}{rr}", f"={terms}", "calc", NUM)
put(wsc, f"C{EXP_ROW}", f"=IF(SUM(D{rr}:I{rr})<=0,-1,IFERROR(IRR(C{rr}:I{rr},MAX(-0.9,(SUM(D{rr}:I{rr})/-C{rr})^(1/(COLUMNS(C{rr}:I{rr})-1))-1)),IRR(C{rr}:I{rr},0.1)))", "calc", PCT, bold=True)
rr += 2
header_row(wsc, rr, ["Reconciliation: detailed tabs vs Calc Engine (selected scenario)", "", "Detailed", "Calc Engine", "Difference"])
rr += 1
TIE_ROWS = []


def tie(label, main_ref, blk_fn, fmt):
    global rr
    put(wsc, f"A{rr}", label, "label")
    put(wsc, f"C{rr}", f"={main_ref}", "calc", fmt)
    put(wsc, f"D{rr}", "=CHOOSE(" + A["scen"] + "," + ",".join(blk_fn(SB[s]) for s in (1, 2, 3)) + ")", "calc", fmt)
    put(wsc, f"E{rr}", f"=C{rr}-D{rr}", "calc", fmt)
    TIE_ROWS.append(rr)
    rr += 1


tie(f"{CASE['periodLabels'][-1]} EBITDA", MR("ebitda", PC[-1]), lambda k: BC(k, "ebitda", PC[-1]), NUM)
tie(f"{CASE['periodLabels'][-1]} total debt", MR("totdebt", PC[-1]), lambda k: BC(k, "totdebt", PC[-1]), NUM)
tie(f"{CASE['periodLabels'][-1]} ending cash", MR("cash_end", PC[-1]), lambda k: BC(k, "cash_end", PC[-1]), NUM)
tie("Cumulative FCF", MR("cumfcf", "C"), lambda k: BC(k, "cumfcf"), NUM)
tie("Recovery value used", MR("rval", "C"), lambda k: BC(k, "rval"), NUM)
tie("Covenant breaches", MR("k_bt", "C"), lambda k: BC(k, "k_bt"), "0")
tie("IRR", MR("irr", "C"), lambda k: BC(k, "irr"), PCT2)
tie("MOIC", MR("moic", "C"), lambda k: BC(k, "moic"), MULT)
TIE_RNG = f"'Scenarios'!$E${TIE_ROWS[0]}:$E${TIE_ROWS[-1]}"

# ═══════════════════════════ CAPITAL STRUCTURE ═══════════════════════════
wk = WS["Capital Structure"]
widths(wk, 54, 13, "BCDEFGHIJKLMN")
put(wk, "A1", "Capital Structure — tranches, leverage through the stack, maturity wall and refinancing requirement", "label").font = F_TITLE
put(wk, "A2", f'="{CASE["name"]} · {flag} · {CASE["termsLabel"]} · as of "&TEXT({A["asof"]},"yyyy-mm-dd")&" · $M"', "calc")
header_row(wk, 4, ["Facility", "Type", "Rank", "Secured?", "Face value", "All-in rate", "Annual interest", "Maturity date", "Cum. leverage", "% of capitalization", "Mark / price", "Mkt value"])
EBITDA_B = MR("ebitda", BASE)
R0 = 5
for i in range(1, NT + 1):
    r_ = 4 + i
    put(wk, f"A{r_}", f"={T[i]['name']}", "calc")
    put(wk, f"B{r_}", f"={T[i]['kind']}", "calc")
    put(wk, f"C{r_}", f"={T[i]['rank']}", "calc", "0")
    put(wk, f"D{r_}", f'=IF({T[i]["secured"]}=1,"Secured","Unsecured")', "calc")
    put(wk, f"E{r_}", f"={T[i]['principal']}", "calc", NUM)
    put(wk, f"F{r_}", f"={MR(f'rt{i}', PC[0])}", "calc", PCT2)
    put(wk, f"G{r_}", f"=E{r_}*F{r_}", "calc", NUM)
    put(wk, f"H{r_}", f"={T[i]['matdate']}", "calc", "yyyy-mm-dd")
    put(wk, f"I{r_}", f'=SUMIF($C${R0}:$C${R0 + NT - 1},"<="&C{r_},$E${R0}:$E${R0 + NT - 1})/{EBITDA_B}', "calc", MULT)
    put(wk, f"J{r_}", f"=E{r_}/($E${R0 + NT}+$E${R0 + NT + 4})", "calc", PCT)
    put(wk, f"K{r_}", f"={T[i]['px']}", "calc", PX)
    put(wk, f"L{r_}", f"=E{r_}*K{r_}/100", "calc", NUM)
TOT = R0 + NT
put(wk, f"A{TOT}", "Total debt", "label", bold=True)
put(wk, f"E{TOT}", f"=SUM(E{R0}:E{TOT - 1})", "calc", NUM, bold=True)
put(wk, f"G{TOT}", f"=SUM(G{R0}:G{TOT - 1})", "calc", NUM, bold=True)
put(wk, f"I{TOT}", f"=E{TOT}/{EBITDA_B}", "calc", MULT, bold=True)
put(wk, f"L{TOT}", f"=SUM(L{R0}:L{TOT - 1})", "calc", NUM, bold=True)
put(wk, f"A{TOT + 1}", "Less: cash", "label")
put(wk, f"E{TOT + 1}", f"={A['cash0']}", "calc", NUM)
put(wk, f"A{TOT + 2}", "Net debt", "label", bold=True)
put(wk, f"E{TOT + 2}", f"=E{TOT}-E{TOT + 1}", "calc", NUM, bold=True)
put(wk, f"I{TOT + 2}", f"=E{TOT + 2}/{EBITDA_B}", "calc", MULT, bold=True)
put(wk, f"A{TOT + 3}", "Enterprise value (base EBITDA × market-implied multiple — analyst assumption)", "label")
put(wk, f"E{TOT + 3}", f"={EBITDA_B}*{A['evmult']}", "calc", NUM)
put(wk, f"A{TOT + 4}", "Equity (residual: max(0, EV − net debt))", "label", bold=True)
put(wk, f"E{TOT + 4}", f"=MAX(0,E{TOT + 3}-E{TOT + 2})", "calc", NUM, bold=True)
put(wk, f"A{TOT + 5}", "Liquidity (cash + undrawn revolver)", "label")
put(wk, f"E{TOT + 5}", f"={MR('k_lq', BASE)}", "calc", NUM)
put(wk, f"A{TOT + 6}", "Asset base (collateral / recovery basis)", "label")
put(wk, f"E{TOT + 6}", f"={A['assets']}", "calc", NUM)
put(wk, f"A{TOT + 7}", "Loan-to-value through target tranche (cumulative debt ÷ asset base)", "label")
put(wk, f"E{TOT + 7}", f'=SUMIF($C${R0}:$C${TOT - 1},"<="&INDEX($C${R0}:$C${TOT - 1},{A["tgt"]}),$E${R0}:$E${TOT - 1})/E{TOT + 6}', "calc", PCT)
CAPT = TOT
MW = TOT + 11
section(wk, MW - 1, "Maturity wall (from Debt Schedule maturity flags) — selected scenario liquidity", 12)
header_row(wk, MW, ["Period", "", "Debt due", "% of debt", "Cumulative %", "Projected liquidity", "Refinancing requirement", "Liquidity ÷ maturity", "Risk", "Flag"])
for k in range(5):
    r_ = MW + 1 + k
    c = PC[k]
    put(wk, f"A{r_}", f'="{CASE["periodLabels"][k]}"&" (period ending "&{MR("year", c)}&")"', "calc")
    put(wk, f"C{r_}", f"={MR('wall', c)}", "calc", NUM)
    put(wk, f"D{r_}", f"=C{r_}/$E${TOT}", "calc", PCT)
    put(wk, f"E{r_}", f"=SUM($D${MW + 1}:D{r_})", "calc", PCT)
    prevliq_cash = f"{A['cash0']}" if k == 0 else MR("cash_end", PC[k - 1])
    prev_undrawn = (f"({MR('k_lq', BASE)}-MAX(0,{A['cash0']}))" if k == 0 else f"({MR('k_lq', PC[k - 1])}-MAX(0,{MR('cash_end', PC[k - 1])}))")
    put(wk, f"F{r_}", f"=MAX(0,{prevliq_cash})+{prev_undrawn}+MAX(0,{MR('fcf', c)})", "calc", NUM)
    put(wk, f"G{r_}", f"=MAX(0,C{r_}-F{r_})", "calc", NUM)
    put(wk, f"H{r_}", f"=IF(C{r_}>0,F{r_}/C{r_},0)", "calc", MULT)
    put(wk, f"I{r_}", f'=IF(AND(G{r_}>0,D{r_}>={A["mat_mat"]}),"High",IF(OR(G{r_}>0,D{r_}>={A["conc"]}),"Medium","Low"))', "calc")
    put(wk, f"J{r_}", f'=IF(I{r_}="High","$"&TEXT(C{r_},"#,##0")&"M maturity; only $"&TEXT(F{r_},"#,##0")&"M projected liquidity; $"&TEXT(G{r_},"#,##0")&"M refinancing requirement","–")', "calc")
MWE = MW + 5
put(wk, f"A{MWE + 1}", "Maturing within horizon / thereafter", "label", bold=True)
put(wk, f"C{MWE + 1}", f"=SUM(C{MW + 1}:C{MWE})", "calc", NUM, bold=True)
put(wk, f"D{MWE + 1}", f"=C{MWE + 1}/$E${TOT}", "calc", PCT)
put(wk, f"A{MWE + 2}", "Thereafter (beyond the 5-period horizon)", "label")
put(wk, f"C{MWE + 2}", f"=$E${TOT}-C{MWE + 1}", "calc", NUM)
put(wk, f"A{MWE + 4}", "Maturity concentration", "label", bold=True)
put(wk, f"C{MWE + 4}", f'=IF(MAX(D{MW + 1}:D{MWE})>={A["conc"]},"CONCENTRATED: "&TEXT(MAX(D{MW + 1}:D{MWE}),"0%")&" of debt in "&INDEX(A{MW + 1}:A{MWE},MATCH(MAX(D{MW + 1}:D{MWE}),D{MW + 1}:D{MWE},0)),"No single-period concentration")', "calc", bold=True)
put(wk, f"A{MWE + 5}", "Debt due within alert window", "label", bold=True)
put(wk, f"C{MWE + 5}", f"=SUMPRODUCT(({MTR}<={A['base_year']}+{A['win']})*{PRN})", "calc", NUM)
put(wk, f"D{MWE + 5}", f"=C{MWE + 5}/E{TOT}", "calc", PCT)
put(wk, f"A{MWE + 6}", "Maturity alert", "label", bold=True)
put(wk, f"C{MWE + 6}", f'=IF(D{MWE + 5}>={A["mat_mat"]},"ALERT: "&TEXT(D{MWE + 5},"0%")&" of debt ($"&TEXT(C{MWE + 5},"#,##0")&"M) due within "&{A["win"]}&" period(s); liquidity covers "&TEXT(E{TOT + 5}/C{MWE + 5},"0%"),"OK: no material maturities within window")', "calc", bold=True)
CAP_ALERT = f"'Capital Structure'!$C${MWE + 6}"
CAP_CONC = f"'Capital Structure'!$C${MWE + 4}"
section(wk, MWE + 8, "Refinancing risk engine — per tranche, selected scenario (see Debt Schedule for the period-by-period test)", 12)
header_row(wk, MWE + 9, ["Tranche", "", "Balance at maturity", "Repaid from cash", "Test", "Resolution"])
for i in range(1, NT + 1):
    r_ = MWE + 9 + i
    put(wk, f"A{r_}", f"={T[i]['name']}", "calc")
    put(wk, f"C{r_}", f"={MR(f'rfb{i}', 'C')}", "calc", NUM)
    put(wk, f"D{r_}", f"={MR(f'rfc{i}', 'C')}", "calc", NUM)
    put(wk, f"E{r_}", f"={MR(f'rfs{i}', 'C')}", "calc")
    put(wk, f"F{r_}", f"={MR(f'rfr{i}', 'C')}", "calc")

# ═══════════════════════════ SENSITIVITIES ═══════════════════════════
wss = WS["Sensitivities"]
widths(wss, 44, 14, "BCDEFGHIJ")
put(wss, "A1", "Sensitivities — position IRR / MOIC under Base, Downside and Severe", "label").font = F_TITLE
put(wss, "A2", "Axis values (blue) are inputs. Every cell is a formula: IRR over a cash-flow row, or an IRR / recovery from a full Calc Engine case. No data tables → recalculates in Excel and LibreOffice.", "label")
put(wss, "A3", f'="Position: "&TEXT({A["price"]},"0.0")&" purchase price, hold "&{A["hold"]}&" periods  |  Selected scenario: "&{A["scen_name"]}', "calc")


def sens_table(key, title, axis_label, axis_vals, axis_fmt, ret_fmt=PCT, price=False):
    base = SROW[key]
    section(wss, base, title, 8)
    header_row(wss, base + 1, [axis_label, "Offset" if price else "", "Base Case", "Downside", "Severe Downside", "Selected"])
    for i, v in enumerate(axis_vals):
        r_ = base + 2 + i
        if price:
            put(wss, f"B{r_}", v, "input", "0")
            put(wss, f"A{r_}", f"={A['price']}+B{r_}", "calc", PX)
        else:
            put(wss, f"A{r_}", v, "input", axis_fmt)
        put(wss, f"F{r_}", f"=CHOOSE({A['scen']},C{r_},D{r_},E{r_})", "calc", ret_fmt)


HELP0 = 86
hr = HELP0
section(wss, hr - 2, "Supporting cash flows for Tables 1-2 (period 0 → 6) and resulting IRR", 10)
header_row(wss, hr - 1, ["Case", "", "t=0", "t=1", "t=2", "t=3", "t=4", "t=5", "t=6", "IRR"])


def helper_rows(kind, key):
    global hr
    out = {}
    for s in (1, 2, 3):
        k = SB[s]
        for i in range(5):
            axis = f"$A${SROW[key] + 2 + i}"
            put(wss, f"A{hr}", f'="{SCN[s - 1]} · {kind} point {i + 1}"', "calc")
            for t in range(7):
                c = col(3 + t)
                cfc, cfp, cft = (f"'Calc Engine'!{c}{BLOCKS[k]['loc'][x]}" for x in ("cf_c", "cf_p", "cf_t"))
                if kind == "price":
                    f = f"=-{A['face']}*{axis}/100*(1+{A['fee']})" if t == 0 else f"={cfc}+{cfp}"
                else:
                    f = f"={cft}" if t == 0 else f"={cfc}+IF({BC(k, 'tline', c)}={BC(k, 'tp')},{A['face']}*{axis}/100,0)"
                put(wss, f"{c}{hr}", f, "calc", NUM)
            put(wss, f"J{hr}", f"=IF(SUM(D{hr}:I{hr})<=0,-1,IFERROR(IRR(C{hr}:I{hr},MAX(-0.9,(SUM(D{hr}:I{hr})/-C{hr})^(1/{A['hold']})-1)),IRR(C{hr}:I{hr},0.1)))", "calc", PCT)
            out[(s, i)] = hr
            hr += 1
    return out


sens_table("price", "Table 1 — Purchase price vs IRR", "Purchase price (% of face)", PRICE_OFF, PX, price=True)
sens_table("rec", "Table 2 — Exit / recovery value (% of face, received at exit or after default) vs IRR", "Proceeds (% of face)", REC_AX, PX)
sens_table("margin", "Table 3 — EBITDA margin shift (all periods) vs IRR — full model re-run", "EBITDA margin shift (pts)", MARGIN_AX, PCT)
sens_table("growth", "Table 4 — Revenue growth shift (all periods) vs IRR — full model re-run", "Revenue growth shift (pts)", GROW_AX, PCT)
sens_table("sofr", "Table 5 — Interest rate (SOFR) shift vs IRR — full model re-run (floating coupons and interest burden both move)", "SOFR shift (pts)", SOFR_AX, PCT2)
sens_table("mult", "Table 6 — Distressed valuation multiple shift (x) vs target-tranche recovery % (valuation waterfall)", "Multiple shift (x EBITDA)", MULT_AX, MULT, ret_fmt=PCT)
sens_table("mrec", "Table 7 — Recovery / exit value (% of face) vs MOIC", "Proceeds (% of face)", REC_AX, PX, ret_fmt=MULT)
H1 = helper_rows("price", "price")
H2 = helper_rows("rec", "rec")
for s in (1, 2, 3):
    c = col(2 + s)
    k = SB[s]
    for i in range(5):
        put(wss, f"{c}{SROW['price'] + 2 + i}", f"=J{H1[(s, i)]}", "calc", PCT)
        put(wss, f"{c}{SROW['rec'] + 2 + i}", f"=J{H2[(s, i)]}", "calc", PCT)
        put(wss, f"{c}{SROW['margin'] + 2 + i}", f"={BC(IDX['m'] + (s - 1) * 5 + i, 'irr')}", "calc", PCT)
        put(wss, f"{c}{SROW['growth'] + 2 + i}", f"={BC(IDX['g'] + (s - 1) * 5 + i, 'irr')}", "calc", PCT)
        put(wss, f"{c}{SROW['sofr'] + 2 + i}", f"={BC(IDX['s'] + (s - 1) * 5 + i, 'irr')}", "calc", PCT)
        put(wss, f"{c}{SROW['mult'] + 2 + i}", f"={BC(IDX['d'] + (s - 1) * 5 + i, 'recpct')}", "calc", PCT)
        axis = f"$A${SROW['mrec'] + 2 + i}"
        put(wss, f"{c}{SROW['mrec'] + 2 + i}", f"=(SUM('Calc Engine'!C{BLOCKS[k]['loc']['cf_c']}:I{BLOCKS[k]['loc']['cf_c']})+{A['face']}*{axis}/100)/{BC(k, 'cost')}", "calc", MULT)
for i in range(5):
    put(wss, f"A{SROW['mrec'] + 2 + i}", f"=$A${SROW['rec'] + 2 + i}", "calc", PX)
put(wss, f"A{HELP0 - 4}", "Tables 3-6 re-run the operating model, debt schedule, default test and recovery waterfall for every point (Calc Engine cases 4-63).", "label")

# ═══════════════════════════ COLLATERAL COVERAGE STRESS (specifically secured target tranche) ═══════════════════════════
COLL = {}
if CASE["tranches"][CASE["target"]["index"] - 1].get("collateralPct", 0) > 0:
    r0 = hr + 3
    section(wss, r0, "Collateral coverage stress — recovery of the target tranche from its pledged pool (asset-based floor; ignores going-concern value, cash and deficiency recovery)", 10)
    put(wss, f"A{r0 + 1}", "Recovery = MIN(100%, pool share × asset value × (1 − realization cost) × (1 − admin costs) ÷ claim). Claim = target-tranche principal at close. Pool share is an analyst assumption, not a verified allocation.", "label")
    tg_ = A["tgt"]
    inputs_ = [
        ("pool", "Pool share of asset value pledged to the target tranche (assumption)", "=CHOOSE(" + tg_ + "," + ",".join(T[i]["cp"] for i in range(1, NT + 1)) + ")", PCT),
        ("claim", "Claim: target-tranche principal at close ($M)", "=CHOOSE(" + tg_ + "," + ",".join(T[i]["principal"] for i in range(1, NT + 1)) + ")", NUM),
        ("admin", "Administrative / DIP costs", f"={A['admin']}", PCT),
        ("liq", "Liquidation recovery factor (Severe scenario)", f"={S[3]['liq']}", PCT),
        ("noi", "LTM NOI ($M)", f"={HREF('gp', BASE_COLID)}" if CASE["assetCapRate"] else "=0", NUM),
        ("cap", "Analyst cap rate (base)", f"={A['capr']}" if CASE["assetCapRate"] else "=0", PCT),
        ("assets", "Total asset base ($M)", f"={A['assets']}", NUM),
        ("other", "Non-operating asset components, book ($M)", (f"={A['assets']}-'Assumptions'!C{NOI_CELL}" if CASE["assetCapRate"] else f"={A['assets']}"), NUM),
    ]
    rr0 = r0 + 3
    for k_, lbl_, f_, fm_ in inputs_:
        put(wss, f"A{rr0}", lbl_, "label"); put(wss, f"C{rr0}", f_, "calc", fm_); COLL[k_] = f"$C${rr0}"; rr0 += 1
    rec_f = lambda pool, val, liq, cl: f"=IF({cl}<=0,1,MIN(1,{pool}*({val})*{liq}*(1-{COLL['admin']})/({cl})))"
    # Table A: cap rate x NOI change
    rr0 += 1
    COLL["A"] = rr0
    section(wss, rr0, "Table C1 — recovery % vs cap rate (rows) and NOI change (columns), pledged pool at the stated share", 8)
    header_row(wss, rr0 + 1, ["Cap rate", ""] + [""] * 6)
    for j, d_ in enumerate([0, -0.1, -0.2, -0.3, -0.4, -0.5]):
        put(wss, f"{col(3 + j)}{rr0 + 1}", d_, "input", PCT)
    for i, cap_ in enumerate([0.065, 0.075, 0.09, 0.105, 0.12, 0.14]):
        put(wss, f"A{rr0 + 2 + i}", cap_, "input", PCT)
        for j in range(6):
            cc_ = col(3 + j)
            put(wss, f"{cc_}{rr0 + 2 + i}", rec_f(COLL['pool'], f"{COLL['noi']}*(1+{cc_}${rr0 + 1})/$A{rr0 + 2 + i}+{COLL['other']}", COLL['liq'], COLL['claim']) if CASE["assetCapRate"] else "=0", "calc", PCT)
    rr0 += 9
    COLL["B"] = rr0
    section(wss, rr0, "Table C2 — recovery % vs pledged share of asset value (rows) and realization factor (columns: 100% = full value, lower = higher sale / enforcement costs)", 8)
    header_row(wss, rr0 + 1, ["Pool share", ""] + [""] * 6)
    for j, l_ in enumerate([1, 0.85, 0.7, 0.55, 0.4, 0.25]):
        put(wss, f"{col(3 + j)}{rr0 + 1}", l_, "input", PCT)
    for i, p_ in enumerate([0.1, 0.2, 0.3, 0.4, 0.6, 1]):
        put(wss, f"A{rr0 + 2 + i}", p_, "input", PCT)
        for j in range(6):
            cc_ = col(3 + j)
            put(wss, f"{cc_}{rr0 + 2 + i}", rec_f(f"$A{rr0 + 2 + i}", COLL['assets'], f"{cc_}${rr0 + 1}", COLL['claim']), "calc", PCT)
    rr0 += 9
    COLL["C"] = rr0
    section(wss, rr0, "Table C3 — recovery % vs loan balance (rows, multiple of the hypothetical claim) and asset-value decline (columns)", 8)
    header_row(wss, rr0 + 1, ["Claim multiple", ""] + [""] * 6)
    for j, d_ in enumerate([0, 0.2, 0.4, 0.6, 0.7, 0.8]):
        put(wss, f"{col(3 + j)}{rr0 + 1}", d_, "input", PCT)
    for i, m_ in enumerate([1, 1.5, 2, 3]):
        put(wss, f"A{rr0 + 2 + i}", m_, "input", MULT)
        for j in range(6):
            cc_ = col(3 + j)
            put(wss, f"{cc_}{rr0 + 2 + i}", rec_f(COLL['pool'], f"{COLL['assets']}*(1-{cc_}${rr0 + 1})", COLL['liq'], f"{COLL['claim']}*$A{rr0 + 2 + i}"), "calc", PCT)
    rr0 += 7
    COLL["D"] = rr0
    section(wss, rr0, "Break-even: the point at which recovery of the target tranche falls below 100% (Severe realization factor)", 8)
    put(wss, f"A{rr0 + 1}", "Total asset value needed for 100% recovery of the target tranche ($M)", "label")
    put(wss, f"C{rr0 + 1}", f"={COLL['claim']}/({COLL['pool']}*{COLL['liq']}*(1-{COLL['admin']}))", "calc", NUM)
    put(wss, f"A{rr0 + 2}", "Equivalent decline in total asset value from the base", "label")
    put(wss, f"C{rr0 + 2}", f"=1-C{rr0 + 1}/{COLL['assets']}", "calc", PCT)
    put(wss, f"A{rr0 + 3}", "Break-even cap rate at unchanged NOI (n/a if non-operating assets alone cover it)", "label")
    put(wss, f"C{rr0 + 3}", (f'=IF(C{rr0 + 1}>{COLL["other"]},{COLL["noi"]}/(C{rr0 + 1}-{COLL["other"]}),"n/a")' if CASE["assetCapRate"] else '="n/a"'), "calc", PCT)
    put(wss, f"A{rr0 + 4}", "Break-even NOI change at the base cap rate", "label")
    put(wss, f"C{rr0 + 4}", (f"=MAX(-1,(C{rr0 + 1}-{COLL['other']})*{COLL['cap']}/{COLL['noi']}-1)" if CASE["assetCapRate"] else '="n/a"'), "calc", PCT)

# ═══════════════════════════ RETURNS extras (selected scenario) ═══════════════════════════
wr = WS["Returns"]
rr_ = MAINLOC["cumfcf"][1] + 2
section(wr, rr_, "Yield & cross-checks (selected scenario)", 11)
rr_ += 1
tg = MR("tgt", "C")
cpn1 = ",".join(MR(f"rt{i}", PC[0]) for i in range(1, NT + 1))
put(wr, f"A{rr_}", "Current yield (year-1 cash coupon ÷ purchase price)", "label")
put(wr, f"C{rr_}", f"=CHOOSE({tg},{cpn1})/({A['price']}/100)", "calc", PCT)
rr_ += 1
matd = ",".join(T[i]["matdate"] for i in range(1, NT + 1))
put(wr, f"A{rr_}", "Yield to maturity (annual coupons to final maturity at par; Excel RATE)", "label")
put(wr, f"C{rr_}", f"=IFERROR(RATE(YEARFRAC({A['asof']},CHOOSE({tg},{matd})),CHOOSE({tg},{cpn1})*100,-{A['price']},100),0)", "calc", PCT)
YTM = f"'Returns'!$C${rr_}"
rr_ += 1
put(wr, f"A{rr_}", "Dates for XIRR (entry date, then each model-period end)", "label")
for k in range(7):
    c = col(3 + k)
    if k == 0:
        put(wr, f"{c}{rr_}", f"={A['asof']}", "calc", "yyyy-mm-dd")
    else:
        put(wr, f"{c}{rr_}", f"=EDATE({col(2 + k)}{rr_},12)", "calc", "yyyy-mm-dd")
DR = rr_
rr_ += 1
cft = MAINLOC["cf_t"][1]
put(wr, f"A{rr_}", "XIRR (date-weighted cross-check; Excel XIRR)", "label")
put(wr, f"C{rr_}", f"=IFERROR(XIRR(C{cft}:I{cft},C{DR}:I{DR}),0)", "calc", PCT)
rr_ += 2
section(wr, rr_, "Summary by scenario (from Calc Engine)", 11)
rr_ += 1
header_row(wr, rr_, ["", "", "Base Case", "Downside", "Severe Downside"])
rr_ += 1
for lbl, key, fm in [("Default modelled?", "hasdef", "0"), ("Cash investment", "cost", NUM), ("Cash interest received", "cint", NUM), ("Exit / recovery proceeds", "xproc", NUM), ("Capital gain / (loss) vs purchase price", "capgain", NUM),
                     ("Total cash received", "inflow", NUM), ("Recovery % of target tranche (valuation waterfall)", "recpct", PCT), ("Absolute profit", "profit", NUM), ("MOIC", "moic", MULT), ("IRR", "irr", PCT)]:
    put(wr, f"A{rr_}", lbl, "label")
    for j, s in enumerate((1, 2, 3)):
        put(wr, f"{col(3 + j)}{rr_}", f"={BC(SB[s], key)}", "calc", fm)
    rr_ += 1


# ── Contractual-timing cross-check: same dollar flows as the annual model, coupons re-timed to the tranche's payment frequency (quarterly grid, 24 sub-periods)
rr_ += 1
section(wr, rr_, "Contractual-timing cross-check — coupons re-timed to the payment frequency (annual model flows otherwise unchanged)", 27)
rr_ += 1
put(wr, f"A{rr_}", "Convention: settlement on a coupon date (no accrued interest); coupon = annual coupon cash ÷ payments per year, paid at the end of each sub-period; exit / recovery proceeds on the annual dates. With 1 payment per year this reproduces the annual IRR exactly.", "label")
rr_ += 1
put(wr, f"A{rr_}", "Sub-periods per annual period (grid columns ÷ annual columns)", "label")
put(wr, f"C{rr_}", "=(COLUMNS($C$1:$AA$1)-1)/(COLUMNS($C$1:$I$1)-1)", "calc", "0")
SPC = f"$C${rr_}"
rr_ += 1
put(wr, f"A{rr_}", "Last sub-period carrying a coupon (5 coupon periods)", "label")
put(wr, f"C{rr_}", f"=COLUMNS($D$1:$H$1)*{SPC}", "calc", "0")
LASTQ = f"$C${rr_}"
rr_ += 1
put(wr, f"A{rr_}", "Sub-period #", "label")
QR = rr_
for j in range(25):
    put(wr, f"{col(3 + j)}{rr_}", j, "calc", "0") if False else put(wr, f"{col(3 + j)}{rr_}", f"=COLUMN()-COLUMN($C$1)", "calc", "0")
rr_ += 1
CTR = {}
PROBS = {s_: f"'Scenarios'!${col(2 + s_)}${SCN_ROWS['prob']}" for s_ in (1, 2, 3)}
for s_ in (1, 2, 3):
    k = SB[s_]
    L_ = BLOCKS[k]["loc"]
    put(wr, f"A{rr_}", f"{SCN[s_ - 1]} · flows on contractual dates", "label")
    for j in range(25):
        c_ = col(3 + j)
        if j == 0:
            f = f"='Calc Engine'!C{L_['cf_t']}"
        else:
            q = f"{c_}${QR}"
            f = (f"=IF(AND({q}<={LASTQ},MOD({q},{SPC}/{A['payfreq']})=0),INDEX('Calc Engine'!$D${L_['cf_c']}:$H${L_['cf_c']},ROUNDUP({q}/{SPC},0))/{A['payfreq']},0)"
                 f"+IF(MOD({q},{SPC})=0,INDEX('Calc Engine'!$D${L_['cf_p']}:$I${L_['cf_p']},{q}/{SPC}),0)")
        put(wr, f"{c_}{rr_}", f, "calc", NUM)
    CTR[s_] = rr_
    rr_ += 1
put(wr, f"A{rr_}", "Contractual-timing IRR (annualised effective)", "label", bold=True)
for s_ in (1, 2, 3):
    r0 = CTR[s_]
    put(wr, f"{col(2 + s_)}{rr_}", f"=IF(SUM(D{r0}:AA{r0})<=0,-1,(1+IRR(C{r0}:AA{r0},MAX(-0.9,(SUM(D{r0}:AA{r0})/-C{r0})^(1/(COLUMNS(C{r0}:AA{r0})-1))-1)))^{SPC}-1)", "calc", PCT, bold=True)
CTR_IRR = rr_
rr_ += 1
put(wr, f"A{rr_}", "Expected (probability-weighted) flows on contractual dates", "label")
for j in range(25):
    c_ = col(3 + j)
    put(wr, f"{c_}{rr_}", "=" + "+".join(f"{PROBS[s_]}*{c_}{CTR[s_]}" for s_ in (1, 2, 3)), "calc", NUM)
CTR_EXP = rr_
rr_ += 1
put(wr, f"A{rr_}", "Probability-weighted IRR on contractual timing (IRR of expected flows)", "label", bold=True)
put(wr, f"C{rr_}", f"=IF(SUM(D{CTR_EXP}:AA{CTR_EXP})<=0,-1,(1+IRR(C{CTR_EXP}:AA{CTR_EXP},MAX(-0.9,(SUM(D{CTR_EXP}:AA{CTR_EXP})/-C{CTR_EXP})^(1/(COLUMNS(C{CTR_EXP}:AA{CTR_EXP})-1))-1)))^{SPC}-1)", "calc", PCT, bold=True)
CTR_PW = rr_
rr_ += 1
put(wr, f"A{rr_}", "(columns C, D, E = Base, Downside, Severe)", "label")
rr_ += 1

# ═══════════════════════════ INVESTMENT SUMMARY ═══════════════════════════
wi = WS["Investment Summary"]
widths(wi, 62, 18, "BCDEF")
put(wi, "A1", "Investment Summary — every figure is a live link to the model", "label").font = F_TITLE
put(wi, "A2", f'={A["company"]}&"  |  {flag}  |  {CASE["termsLabel"]}  |  Active scenario: "&{A["scen_name"]}', "calc")
srows = []


def srow(lbl, f, fm=GEN, bold=False):
    r_ = 4 + len(srows)
    srows.append(lbl)
    put(wi, f"A{r_}", lbl, "label", bold=bold)
    put(wi, f"C{r_}", f, "calc", fm, bold=bold)
    return f"'Investment Summary'!$C${r_}"


# evidence tests (mirrors src/lib/analysis.ts recommend())
EV = {}
evr0 = 4 + 24
section(wi, evr0 - 1, "Recommendation evidence (thresholds on Assumptions §3)", 6)
header_row(wi, evr0, ["Test", "", "Actual", "Required", "Result", "Core?"])
tests = [
    ("baseIrr", "Base-case IRR clears hurdle", f"='Scenarios'!C{SCN_ROWS['irr']}", f"={A['hurdle']}", ">=", PCT, 1),
    ("pwIrr", "Probability-weighted IRR clears hurdle", f"={PW_IRR}", f"={A['hurdle']}", ">=", PCT, 1),
    ("downIrr", "Downside IRR stays above floor", f"='Scenarios'!D{SCN_ROWS['irr']}", f"={A['mindown']}", ">=", PCT, 1),
    ("downRec", "Downside recovery meets minimum (valuation waterfall)", f"='Scenarios'!D{SCN_ROWS['rec']}", f"={A['minrec']}", ">=", PCT, 1),
    ("refi", "Base-case refinancing succeeds (failures = 0)", f"='Scenarios'!C{SCN_ROWS['refi']}", "=0", "<=", "0", 1),
    ("yield", "Yield to maturity meets minimum", f"=IFERROR(RATE(YEARFRAC({A['asof']},CHOOSE({A['tgt']},{matd})),{BC(0, 'cpn', 'D')}*100,-{A['price']},100),0)", f"={A['minyield']}", ">=", PCT, 0),
    ("lev", "Net leverage within maximum", f"={MR('k_nl', BASE)}", f"={A['maxlev']}", "<=", MULT, 0),
    ("cov", "Covenant headroom (base case, minimum)", f"={BC(0, 'k_mh')}", f"={A['minhead']}", ">=", PCT, 0),
    ("protect", "Principal protected in severe case (recovery % × 100 ≥ price)", f"='Scenarios'!E{SCN_ROWS['rec']}*100", f"={A['price']}", ">=", PX, 0),
    ("dd", "No unresolved high-priority diligence", f"={A['ddopen']}", "=0", "<=", "0", 0),
]
for j, (key, lbl, act, req, op, fm, core) in enumerate(tests):
    r_ = evr0 + 1 + j
    put(wi, f"A{r_}", lbl, "label")
    put(wi, f"C{r_}", act, "calc", fm)
    put(wi, f"D{r_}", req, "calc", fm)
    put(wi, f"E{r_}", f'=IF(C{r_}{op}D{r_},"PASS","FAIL")', "calc")
    put(wi, f"F{r_}", "core" if core else "", "label")
    EV[key] = r_
EVL = evr0 + len(tests)
put(wi, f"A{EVL + 1}", "Core test failures", "label", bold=True)
put(wi, f"C{EVL + 1}", f'=COUNTIF(E{evr0 + 1}:E{evr0 + 5},"FAIL")', "calc", "0", bold=True)
put(wi, f"A{EVL + 2}", "Secondary test failures", "label", bold=True)
put(wi, f"C{EVL + 2}", f'=COUNTIF(E{evr0 + 6}:E{EVL},"FAIL")', "calc", "0", bold=True)
put(wi, f"A{EVL + 3}", "DECISION (PROCEED / HOLD / PASS)", "label", bold=True)
put(wi, f"C{EVL + 3}", f'=IF(AND(C{EVL + 1}=0,C{EVL + 2}<={A["maxsec"]}),"PROCEED",IF(OR(AND(E{EV["baseIrr"]}="FAIL",E{EV["downIrr"]}="FAIL"),C{EVL + 1}>={A["passcore"]}),"PASS","HOLD"))', "calc", bold=True)
DECISION = f"'Investment Summary'!$C${EVL + 3}"

SUM_REC = srow("Investment recommendation", f"={DECISION}", bold=True)
srow("Instrument", f"=CHOOSE({A['tgt']},{','.join(T[i]['name'] for i in range(1, NT + 1))})&\" @ \"&TEXT({A['price']},\"0.0\")")
srow("Face value / purchase price / cash investment ($M)", f"=TEXT({A['face']},\"0.0\")&\" / \"&TEXT({A['price']},\"0.0\")&\" / \"&TEXT({MR('cost', 'C')},\"0.0\")")
srow("Credit score (0-100)", f"={CS_TOTAL}", "0.0", True)
srow("Risk band", f"={CS_BAND}")
srow("Base-case IRR", f"='Scenarios'!C{SCN_ROWS['irr']}", PCT, True)
srow("Downside IRR", f"='Scenarios'!D{SCN_ROWS['irr']}", PCT, True)
srow("Severe downside IRR", f"='Scenarios'!E{SCN_ROWS['irr']}", PCT, True)
srow("Base / Downside / Severe MOIC", f"=TEXT('Scenarios'!C{SCN_ROWS['moic']},\"0.00x\")&\" / \"&TEXT('Scenarios'!D{SCN_ROWS['moic']},\"0.00x\")&\" / \"&TEXT('Scenarios'!E{SCN_ROWS['moic']},\"0.00x\")")
srow("Probability-weighted IRR", f"={PW_IRR}", PCT, True)
srow("Probability-weighted MOIC", f"={PW_MOIC}", MULT)
srow("Probability of payment default", f"={PW_DEF}", PCT)
srow("Target-tranche recovery — Downside (valuation waterfall)", f"='Scenarios'!D{SCN_ROWS['rec']}", PCT)
srow("Target-tranche recovery — Severe (valuation waterfall)", f"='Scenarios'!E{SCN_ROWS['rec']}", PCT)
srow("Recovery (selected scenario, from Recovery tab)", f"={MR('recpct', 'C')}", PCT)
srow(f"Net leverage — base period ({CASE['baseLabel']})", f"={MR('k_nl', BASE)}", MULT)
srow("Interest coverage — base period", f"={MR('k_ic', BASE)}", MULT)
srow(f"Net leverage — {CASE['periodLabels'][0]} (selected scenario)", f"={MR('k_nl', PC[0])}", MULT)
srow(f"Interest coverage — {CASE['periodLabels'][0]} (selected scenario)", f"={MR('k_ic', PC[0])}", MULT)
srow(f"Liquidity — {CASE['periodLabels'][0]} (selected scenario, $M)", f"={MR('k_lq', PC[0])}", NUM)
srow("Covenant breaches (selected scenario, count of failed tests)", f"={MR('k_bt', 'C')}", "0")
srow("Maturity alert", f"={CAP_ALERT}")
srow("Maturity concentration", f"={CAP_CONC}")
assert len(srows) <= 24, len(srows)

chk0 = EVL + 6
section(wi, chk0, "Model integrity checks", 6)
header_row(wi, chk0 + 1, ["Check", "", "Value", "Status"])
chks = []


def check(lbl, valf, test, fm=NUM):
    r_ = chk0 + 2 + len(chks)
    put(wi, f"A{r_}", lbl, "label")
    put(wi, f"C{r_}", valf, "calc", fm)
    put(wi, f"D{r_}", f'=IF({test.replace("@", f"C{r_}")},"OK","ERROR")', "calc")
    chks.append(r_)


br = MRNG("bridge")
ec_ranges = ["'Operating Model'!$C$5:$K$60", "'Debt Schedule'!$C$5:$K$300", "'Cash Flow'!$C$5:$K$40", "'Credit Metrics'!$C$5:$K$120", "'Recovery'!$C$5:$K$300", "'Returns'!$C$5:$K$300",
             "'Scenarios'!$C$4:$F$60", "'Capital Structure'!$A$4:$L$60", "'Sensitivities'!$A$4:$J$200", f"'Calc Engine'!$C$5:$K${top + 10}"]
check("Scenario probabilities sum to 100%", f"={A['probsum']}", "ABS(@-1)<0.0001", PCT)
check("Credit score weights sum to 100", f"={A['wsum']}", "ABS(@-100)<0.0001", "0")
check("Debt roll-forward bridge (sum of abs. differences)", f"=SUMPRODUCT(ABS({br}))", "@<0.001")
check("Recovery waterfall: recoveries + equity + costs = value", f"={MR('rcheck', 'C')}", "ABS(@)<0.001")
check("Detailed tabs reconcile to Calc Engine (sum of abs. diffs)", f"=SUMPRODUCT(ABS({TIE_RNG}))", "@<0.001")
if any(h.get("checks") for h in [HIST]):
    ck = ROW_H["check"]
    check("Model-calculated EBITDA / NOI equals company-reported figure (sum of abs. differences)", "=" + "+".join(f"ABS('Historical Financials'!{HX[cid_]}{ck})" for cid_ in CHECK_COLS), "@<0.001", "0.000")
check("Formula errors across model tabs (count)", "=" + "+".join(f"SUMPRODUCT(--ISERROR({x}))" for x in ec_ranges), "@=0", "0")
OVERALL_R = chk0 + 2 + len(chks)
put(wi, f"A{OVERALL_R}", "OVERALL MODEL STATUS", "label", bold=True)
put(wi, f"D{OVERALL_R}", f'=IF(COUNTIF(D{chks[0]}:D{chks[-1]},"OK")=ROWS(D{chks[0]}:D{chks[-1]}),"ALL CHECKS PASS","CHECK MODEL")', "calc", bold=True)
OVERALL = f"'Investment Summary'!$D${OVERALL_R}"

# ═══════════════════════════ SOURCES ═══════════════════════════
wso = WS["Sources"]
widths(wso, 38, 14, "BCDEFGHIJKLMN")
for c, wdt in zip("ABCDEFGHIJKLMN", [34, 12, 12, 24, 12, 30, 22, 12, 12, 38, 54, 12, 30, 50]):
    wso.column_dimensions[c].width = wdt
put(wso, "A1", "Sources — which model input came from which source", "label").font = F_TITLE
put(wso, "A2", ("PUBLIC FILING datapoints: every reported historical number below is a blue input on the Historical Financials tab; the Value column here is a live LINK to that cell. Page = footer page of the cited filing where recoverable. " if CASE["dataClass"] == "public" else "DEMO data: fictional and illustrative; there are no filings behind these inputs. ") + "Derived values are formulas, never hardcodes.", "label")
header_row(wso, 4, ["Source document", "Form", "Period", "Accession", "Filed", "URL", "Retrieved", "Data type", "Status"])
rr = 5
for src in CASE["sources"]:
    vals = [src["document"], src["dataType"], src.get("period", ""), src.get("accession", ""), src["documentDate"], src.get("url", ""), src["retrievedDate"], src["dataType"], "DEMO" if src["isDemo"] else "PUBLIC FILING"]
    for j, v in enumerate(vals):
        put(wso, f"{col(1 + j)}{rr}", v, "label")
    rr += 1
rr += 1
if CASE["provenance"]:
    put(wso, f"A{rr}", "Datapoint register (each row: one reported figure or disclosure, with filing, page/section and the model cell it feeds)", "label", bold=True)
    rr += 1
    header_row(wso, rr, ["Datapoint ID", "Metric", "Period", "Value (US$M) — link to model cell", "Unit", "Filing", "Accession", "Filing date", "Page", "Section", "Source URL", "Kind", "Model cell", "Raw text in filing / note"])
    rr += 1
    cellmap = {}
    for (k, cid_), addr in INPUT_CELLS.items():
        cellmap[f"{CID}.{k}.{cid_}"] = f"'Historical Financials'!{addr}"
    val_cells = []
    for i in range(1, NT + 1):
        val_cells.append((TR[i - 1]["principal"], T[i]["principal"]))
    val_cells.append((CASE["cash"], A["cash0"]))
    for comp in (CASE["assetComponents"] or []):
        pass
    for dp in CASE["provenance"]:
        cell = cellmap.get(dp["id"])
        if cell is None and dp["value"] is not None:
            for v, a in val_cells:
                if abs(v - dp["value"]) < 1e-6:
                    cell = a
                    break
        for j, v in enumerate([dp["id"], dp["metric"], dp["period"]]):
            put(wso, f"{col(1 + j)}{rr}", v, "label")
        if cell and dp["value"] is not None:
            put(wso, f"D{rr}", f"={cell}", "calc", "#,##0.000")
        else:
            put(wso, f"D{rr}", "n/a (text disclosure)" if dp["value"] is None else "not a direct model input", "label")
        put(wso, f"E{rr}", dp["unit"] if len(dp["unit"]) < 40 else "US$M", "label")
        put(wso, f"F{rr}", dp["filing"], "label")
        put(wso, f"G{rr}", dp["accession"], "label")
        put(wso, f"H{rr}", dp["filingDate"], "label")
        put(wso, f"I{rr}", dp["page"] or "section only", "label")
        put(wso, f"J{rr}", dp["section"], "label")
        put(wso, f"K{rr}", dp["url"], "label")
        put(wso, f"L{rr}", dp["kind"], "label")
        put(wso, f"M{rr}", (cell or "").replace("'", ""), "label")
        put(wso, f"N{rr}", (dp["rawText"] if dp["value"] is None else f"as printed: {dp['rawText']} ($ thousands)") + (f" — {dp['note']}" if dp["note"] else ""), "label")
        rr += 1
    rr += 1
put(wso, f"A{rr}", "Analyst notes, derivations and data-quality caveats", "label", bold=True)
rr += 1
for n in CASE["notes"]:
    put(wso, f"A{rr}", "• " + n, "label")
    rr += 1
put(wso, f"A{rr}", "Macro: base rate (SOFR) path is an analyst assumption anchored on FRED SOFR; scenario drivers are ANALYST PROJECTIONS; purchase price, fees, hold and covenant thresholds marked hypothetical are UNDERWRITING ASSUMPTIONS.", "label")

# ═══════════════════════════ COVER ═══════════════════════════
wv = WS["Cover"]
widths(wv, 34, 16, "BCDEF")
wv.column_dimensions["B"].width = 90
put(wv, "A1", f"CreditIQ — {CASE['name']} credit underwriting model", "label").font = F_TITLE
put(wv, "A2", f"{flag}  ·  {CASE['termsLabel']}  ·  $ in millions  ·  as of {CASE['asOf']}", "label", bold=True)
if CASE["caseTitle"]:
    put(wv, "A3", CASE["caseTitle"], "label")
put(wv, "A4", "Model status", "label", bold=True)
put(wv, "B4", f"={OVERALL}", "calc", bold=True)
put(wv, "A5", "Active scenario", "label", bold=True)
put(wv, "B5", f"={A['scen_name']}", "calc", bold=True)
put(wv, "A6", "Recommendation (rule-based; see Investment Summary)", "label", bold=True)
put(wv, "B6", f"={SUM_REC}", "calc", bold=True)
put(wv, "A8", "Colour conventions", "label", bold=True)
put(wv, "A9", "Blue on pale yellow", "input")
put(wv, "B9", "Hardcoded input: sourced historical data, explicit assumption, scenario / transaction / macro input, covenant threshold, sensitivity axis, structural block parameter.", "label")
put(wv, "A10", "Black", "calc")
put(wv, "B10", "Formula or calculation. No outputs, subtotals or metrics are hardcoded anywhere in this workbook.", "label")
put(wv, "A11", "Green", "link")
wv["A11"].font = F_LINK
put(wv, "B11", "Direct link to a cell on another worksheet.", "label")
put(wv, "A12", "Grey fill", "header")
put(wv, "B12", "Labels and headers.", "label")
put(wv, "A14", "Flow of logic", "label", bold=True)
put(wv, "B14", "Assumptions + Historical → Operating Model → Debt Schedule ↔ Cash Flow → Credit Metrics & Covenants → Recovery → Returns → Sensitivities → Investment Summary", "label")
put(wv, "A15", "Data classes", "label", bold=True)
put(wv, "B15", "PUBLIC FILING = reported inputs · ANALYST PROJECTION = scenario drivers · UNDERWRITING ASSUMPTION = hypothetical purchase price / terms · DEMO = fictional", "label")
put(wv, "A17", "Tabs", "label", bold=True)
desc = {"Assumptions": "All inputs, scenario drivers, covenants, selector", "Historical Financials": "Sourced statements; derived lines and LTM calculated", "Operating Model": "Income statement and FCF, history + projection",
        "Debt Schedule": "Per-tranche roll-forward, floors, PIK, refinancing test, sweep", "Cash Flow": "Cash waterfall, funding gap, default test", "Credit Metrics": "Ratios, covenant compliance, transparent credit score",
        "Scenarios": "Base / Downside / Severe side by side + reconciliation", "Capital Structure": "Tranches, leverage through the stack, maturity wall & refinancing requirement",
        "Recovery": "Seniority waterfall with collateral pools and deficiency claims", "Returns": "Face, price, coupon, yield, recovery; IRR, XIRR, MOIC", "Sensitivities": "Seven formula-driven tables",
        "Investment Summary": "Live outputs, recommendation evidence, integrity checks", "Sources": "Datapoint register: filing, page, URL, model cell", "Calc Engine": "Supporting: 63 simultaneous model runs"}
for i, (n, d) in enumerate(desc.items()):
    c = wv[f"A{18 + i}"]
    c.value = n
    c.hyperlink = f"#'{n}'!A1"
    c.font = Font(name="Calibri", size=10, color="0563C1", underline="single")
    put(wv, f"B{18 + i}", d, "label")
put(wv, f"A{19 + len(desc)}", "Validation: docs/MODEL_VALIDATION.md · Audit: scripts/audit_model.py · Change-impact harness: scripts/model_harness.py", "label")

# ═══════════════════════════ NAMES, SAVE, RECALC, MAP ═══════════════════════════
for nm, ref in [("ActiveScenario", A["scen"]), ("HurdleIRR", A["hurdle"]), ("PurchasePrice", A["price"]), ("FaceValue", A["face"]), ("HoldPeriods", A["hold"]), ("RecoveryOverride", A["override"]), ("MinOperatingCash", A["mincash"])]:
    wb.defined_names[nm] = DefinedName(nm, attr_text=ref)
wb.calculation.fullCalcOnLoad = True
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(RAW)
outdir = os.path.join(HERE, "..", "models", f"_lo_{CID}")
os.makedirs(outdir, exist_ok=True)
subprocess.run(["soffice", "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", outdir, RAW], check=True, capture_output=True)
os.replace(os.path.join(outdir, os.path.basename(RAW)), OUT)
os.rmdir(outdir)
os.remove(RAW)

# reconciliation map: key -> address (read by scripts/reconcile.py)
mp = {}
for si, s in enumerate(SKEY):
    k = si
    a = lambda name, c="C": f"'Calc Engine'!{c}{BLOCKS[k]['loc'][name]}"
    mp.update({f"{s}.revenue.p1": a("rev", PC[0]), f"{s}.revenue.p5": a("rev", PC[4]), f"{s}.ebitda.p1": a("ebitda", PC[0]), f"{s}.ebitda.p5": a("ebitda", PC[4]), f"{s}.fcf.sum": a("cumfcf"),
               f"{s}.debt.p5": a("totdebt", PC[4]), f"{s}.cash.p5": a("cash_end", PC[4]), f"{s}.netlev.p1": a("k_nl", PC[0]), f"{s}.coverage.p1": a("k_ic", PC[0]), f"{s}.liquidity.p1": a("k_lq", PC[0]),
               f"{s}.default": a("hasdef"), f"{s}.covbreaches": a("k_bt"), f"{s}.refifail": a("refifail"), f"{s}.recoveryValue": a("rval"), f"{s}.recovery.target": a("recpct"),
               f"{s}.exitprice": a("xpx"), f"{s}.irr": a("irr"), f"{s}.moic": a("moic"), f"{s}.profit": a("profit")})
for si_, s_k in enumerate(SKEY):
    mp[f"{s_k}.irr_ctr"] = f"'Returns'!{col(3 + si_)}{CTR_IRR}"
if COLL:
    for i in range(6):
        for j in range(6):
            if CASE["assetCapRate"]:
                mp[f"coll.cap.{i}.{j}"] = f"'Sensitivities'!{col(3 + j)}{COLL['A'] + 2 + i}"
            mp[f"coll.pool.{i}.{j}"] = f"'Sensitivities'!{col(3 + j)}{COLL['B'] + 2 + i}"
    for i in range(4):
        for j in range(6):
            mp[f"coll.claim.{i}.{j}"] = f"'Sensitivities'!{col(3 + j)}{COLL['C'] + 2 + i}"
    mp["coll.be.value"], mp["coll.be.decline"] = f"'Sensitivities'!$C${COLL['D'] + 1}", f"'Sensitivities'!$C${COLL['D'] + 2}"
mp["pw.irr_ctr"] = f"'Returns'!$C${CTR_PW}"
mp["pw.irr"], mp["pw.moic"], mp["pw.default"], mp["pw.avgirr"] = PW_IRR, PW_MOIC, PW_DEF, PW_AVG
mp["decision"], mp["score.total"] = DECISION, CS_TOTAL
mp["_scoreProjectedSelected"] = CS_PROJ
mp["ltm.netlev"], mp["ltm.coverage"] = MR("k_nl", BASE), MR("k_ic", BASE)
mp["ytm"] = f"'Investment Summary'!$C${EV['yield']}"
for tk in ("price", "rec", "margin", "growth", "sofr", "mult", "mrec"):
    for si, s_ in enumerate(SKEY):
        for i in range(5):
            mp[f"sens.{tk}.{s_}.{i}"] = f"'Sensitivities'!{col(3 + si)}{SROW[tk] + 2 + i}"
mp["_defaultYearRows"] = {s: BLOCKS[i]["loc"]["eyear"] for i, s in enumerate(SKEY)}
json.dump(mp, open(MAPOUT, "w"), indent=1)
print("wrote", os.path.abspath(OUT))
