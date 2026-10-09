#!/usr/bin/env python3
"""Download a filing's primary document and cache plain text in data/sec/. Usage: sec_text.py TICKER ACCESSION"""
import html, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from sec_fetch import subs, cik, UA, D

def filing_text(ticker, accession):
    s = subs(ticker); r = s["filings"]["recent"]; c = int(cik(ticker)[0])
    i = r["accessionNumber"].index(accession)
    doc = r["primaryDocument"][i]; tag = f"{ticker}_{r['form'][i]}_{r['reportDate'][i]}"
    p = os.path.join(D, tag + ".txt")
    url = f"https://www.sec.gov/Archives/edgar/data/{c}/{accession.replace('-', '')}/{doc}"
    if os.path.exists(p):
        return open(p).read(), url, tag
    time.sleep(0.3)
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read().decode("utf8", "ignore")
    open(os.path.join(D, tag + ".html"), "w").write(raw)
    raw = re.sub(r"(?is)<(script|style).*?</\1>", "", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>", "\n", raw)
    raw = re.sub(r"(?i)</t[dh]>", " | ", raw)
    t = html.unescape(re.sub(r"<[^>]+>", "", raw)); t = re.sub(r"[ \t\xa0]+", " ", t); t = re.sub(r"\n\s*\n+", "\n", t)
    open(p, "w").write(t)
    return t, url, tag

if __name__ == "__main__":
    t, u, tag = filing_text(sys.argv[1], sys.argv[2]); print(tag, len(t), u)
