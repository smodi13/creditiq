#!/usr/bin/env python3
"""Fetch SEC EDGAR JSON with caching to data/sec/. Usage: sec_fetch.py facts TICKER | subs TICKER"""
import json, os, sys, time, urllib.request
UA = os.environ.get("SEC_USER_AGENT")
if not UA:
    raise SystemExit("Set SEC_USER_AGENT to \"Your Name your.email@example.com\" (SEC fair-access policy) before fetching.")
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sec")
os.makedirs(D, exist_ok=True)

def get(url, name):
    p = os.path.join(D, name)
    if os.path.exists(p):
        return json.load(open(p))
    time.sleep(0.2)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=30).read()
    open(p, "wb").write(data)
    return json.loads(data)

def cik(ticker):
    m = get("https://www.sec.gov/files/company_tickers.json", "company_tickers.json")
    for v in m.values():
        if v["ticker"].upper() == ticker.upper():
            return str(v["cik_str"]).zfill(10), v["title"]
    raise SystemExit("ticker not found")

def facts(t):
    c, _ = cik(t)
    return get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c}.json", f"facts_{t}.json")

def subs(t):
    c, _ = cik(t)
    return get(f"https://data.sec.gov/submissions/CIK{c}.json", f"subs_{t}.json")

if __name__ == "__main__":
    k, t = sys.argv[1], sys.argv[2]
    print(json.dumps((facts if k == "facts" else subs)(t))[:200])
