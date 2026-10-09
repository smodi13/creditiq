#!/usr/bin/env python3
"""Excel ⇄ web reconciliation. Reads the recalculated workbook (values) and the web engine's outputs
(models/cases/<id>.web.json, from `npm run export:cases`) and writes data/recon/<id>.json for the in-app Reconciliation page.
Usage: python3 scripts/reconcile.py [case-id ...]   (exit code 1 if any metric fails)"""
import json, os, sys
from openpyxl import load_workbook

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TOL = {"usd": 0.05, "ratio": 0.005, "pct": 0.0005, "flag": 0.0, "price": 0.05}


SENS = {"price": "Purchase price → IRR", "rec": "Recovery / exit value → IRR", "margin": "EBITDA margin shift → IRR", "growth": "Revenue growth shift → IRR", "sofr": "SOFR shift → IRR", "mult": "Distressed multiple shift → recovery %", "mrec": "Recovery value → MOIC"}


def kind(key):
    if key.startswith("coll."):
        return "usd" if key == "coll.be.value" else "pct"
    if key.startswith("sens."):
        return "ratio" if key.split(".")[1] == "mrec" else "pct"
    if key.endswith((".revenue.p1", ".revenue.p5", ".ebitda.p1", ".ebitda.p5", ".fcf.sum", ".debt.p5", ".cash.p5", ".liquidity.p1", ".recoveryValue", ".profit")):
        return "usd"
    if key.endswith((".netlev.p1", ".coverage.p1", ".moic")) or key in ("pw.moic", "ltm.netlev", "ltm.coverage"):
        return "ratio"
    if key.endswith((".irr", ".irr_ctr", ".recovery.target")) or key in ("pw.irr", "pw.irr_ctr", "pw.avgirr", "pw.default", "ytm"):
        return "pct"
    if key.endswith(".exitprice"):
        return "price"
    if key == "score.total":
        return "price"
    return "flag"


LABEL = {"revenue.p1": "Revenue — first projected period", "revenue.p5": "Revenue — fifth projected period", "ebitda.p1": "EBITDA — first projected period", "ebitda.p5": "EBITDA — fifth projected period",
         "fcf.sum": "Cumulative free cash flow (5 periods)", "debt.p5": "Total debt — fifth period", "cash.p5": "Cash — fifth period", "netlev.p1": "Net debt / EBITDA — first period", "coverage.p1": "EBITDA / interest — first period",
         "liquidity.p1": "Liquidity — first period", "default": "Payment default modelled (1 = yes)", "covbreaches": "Covenant breaches (count)", "refifail": "Refinancing failures (count)", "recoveryValue": "Recovery value ($M)",
         "recovery.target": "Target-tranche recovery %", "exitprice": "Exit price used", "irr": "IRR", "moic": "MOIC", "profit": "Absolute profit ($M)"}
SC = {"base": "Base", "downside": "Downside", "severe": "Severe"}


def run(cid):
    web = json.load(open(os.path.join(ROOT, "models", "cases", f"{cid}.web.json")))
    mp = json.load(open(os.path.join(ROOT, "models", "cases", f"{cid}.xlsmap.json")))
    wb = load_workbook(os.path.join(ROOT, "models", f"CreditIQ_{cid.upper()}_Model.xlsx"), data_only=True)

    def val(addr):
        sh, cell = addr.split("!")
        return wb[sh.strip("'")][cell.replace("$", "")].value

    rows, bad = [], 0
    for key, addr in mp.items():
        if key.startswith("_"):
            continue
        ex, wv = val(addr), web.get(key)
        k = kind(key)
        if isinstance(ex, str) or isinstance(wv, str) or ex is None or wv is None:
            ok = ex == wv
            diff = None
        else:
            diff = float(ex) - float(wv)
            ok = abs(diff) <= TOL[k]
        # default-year check
        parts = key.split(".")
        if key.startswith("coll."):
            rows.append(dict(key=key, label=f"Collateral stress · {key[5:]}", excel=ex, web=wv, diff=None if wv is None or ex is None else float(ex) - float(wv), tol=TOL[k], kind=k, status="PASS" if ok else "FAIL"))
            bad += 0 if ok else 1
            continue
        if key.startswith("sens."):
            _, tk, sc_, ix = parts
            rows.append(dict(key=key, label=f"Sensitivity · {SENS[tk]} · {SC[sc_]} · point {int(ix) + 1}", excel=ex, web=wv, diff=None if wv is None or ex is None else float(ex) - float(wv), tol=TOL[k], kind=k, status="PASS" if ok else "FAIL"))
            bad += 0 if ok else 1
            continue
        label = (SC.get(parts[0], "") + " · " if parts[0] in SC else "") + LABEL.get(".".join(parts[1:]), key) if parts[0] in SC else {"pw.irr": "Probability-weighted IRR (IRR of expected cash flows)", "pw.avgirr": "Memo: average of scenario IRRs", "pw.irr_ctr": "Probability-weighted IRR on contractual timing", "pw.moic": "Probability-weighted MOIC", "pw.default": "Probability of default", "decision": "Recommendation (PROCEED/HOLD/PASS)", "score.total": "Credit score", "ltm.netlev": "Net leverage — base period", "ltm.coverage": "EBITDA / interest — base period", "ytm": "Yield to maturity"}.get(key, key)
        rows.append(dict(key=key, label=label, excel=ex, web=wv, diff=diff, tol=TOL[k], kind=k, status="PASS" if ok else "FAIL"))
        bad += 0 if ok else 1
    # default period
    for s, r in mp["_defaultYearRows"].items():
        ex = val(f"'Calc Engine'!C{r}")
        wv_ = web[f"{s}.defaultYear"]
        has = web[f"{s}.default"]
        exv = ex if has else 0
        ok = (exv == wv_) or (not has)
        rows.append(dict(key=f"{s}.defaultYear", label=f"{SC[s]} · Default period (0 = none)", excel=exv, web=wv_, diff=None if exv == wv_ else exv - wv_, tol=0, kind="flag", status="PASS" if ok else "FAIL"))
        bad += 0 if ok else 1
    os.makedirs(os.path.join(ROOT, "data", "recon"), exist_ok=True)
    json.dump(dict(case=cid, workbook=f"models/CreditIQ_{cid.upper()}_Model.xlsx", rows=rows, pass_count=len(rows) - bad, total=len(rows)), open(os.path.join(ROOT, "data", "recon", f"{cid}.json"), "w"), indent=1)
    print(f"{cid}: {len(rows) - bad}/{len(rows)} reconcile")
    for r in rows:
        if r["status"] == "FAIL":
            print("   FAIL", r["key"], "excel", r["excel"], "web", r["web"], "diff", r["diff"])
    return bad


if __name__ == "__main__":
    ids = sys.argv[1:] or ["brightwater", "amcx", "bdn"]
    sys.exit(1 if sum(run(i) for i in ids) else 0)
