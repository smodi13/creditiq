#!/usr/bin/env python3
"""Real public-company datapoints (AMC Networks, Brandywine Realty Trust) with source metadata.

Every REPORTED datapoint is typed in as the raw string printed in the filing (US$ thousands unless noted),
verified against the cached filing text (value must appear within 600 chars after the label hint) and written to
data/real/<case>.datapoints.json.  Conversion to $M (÷1000) is applied here and documented in the unit field.
Run:  python3 scripts/real_cases.py        (exits 1 if any datapoint fails verification)
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SEC = os.path.join(ROOT, "data", "sec")
RETRIEVED = "2026-10-07"

DOCS = {
    "AMCX_FY25": dict(company="AMC Networks Inc. (now AMC Global Media Inc.)", form="10-K", period="2025-12-31", filed="2026-02-11", acc="0001514991-26-000011", cik=1514991, doc="amcx-20251231.htm", txt="AMCX_10K_2025-12-31.txt", page_style="F"),
    "AMCX_FY24": dict(company="AMC Networks Inc.", form="10-K", period="2024-12-31", filed="2025-02-14", acc="0001514991-25-000009", cik=1514991, doc="amcx-20241231.htm", txt="AMCX_10-K_2024-12-31.txt", page_style="F"),
    "AMCX_Q2": dict(company="AMC Global Media Inc.", form="10-Q", period="2026-06-30", filed="2026-07-30", acc="0001514991-26-000089", cik=1514991, doc="amcx-20260630.htm", txt="AMCX_10-Q_2026-06-30.txt", page_style="-"),
    "BDN_FY25": dict(company="Brandywine Realty Trust", form="10-K", period="2025-12-31", filed="2026-02-23", acc="0000790816-26-000008", cik=790816, doc="bdn-20251231.htm", txt="BDN_10K_2025-12-31.txt", page_style="F"),
    "BDN_Q2": dict(company="Brandywine Realty Trust", form="10-Q", period="2026-06-30", filed="2026-07-28", acc="0000790816-26-000029", cik=790816, doc="bdn-20260630.htm", txt="BDN_10-Q_2026-06-30.txt", page_style="N"),
}
for k, d in DOCS.items():
    d["url"] = f"https://www.sec.gov/Archives/edgar/data/{d['cik']}/{d['acc'].replace('-', '')}/{d['doc']}"

IS, BS, CF, NG = "Consolidated Statements of Income (Loss)", "Consolidated Balance Sheets", "Consolidated Statements of Cash Flows", "Non-GAAP reconciliation (MD&A)"
# (metric, label hint, doc, section, {period: raw}, [sign], note)   raw is as printed (US$ thousands); sign -1 for items shown as benefit/outflow
def S(metric, label, doc, section, vals, sign=1, note=""):
    return dict(metric=metric, label=label, doc=doc, section=section, vals=vals, sign=sign, note=note)

AMCX = [
    S("revenue", "Revenues, net", "AMCX_FY25", IS, {"FY2025": "2,311,801", "FY2024": "2,421,314", "FY2023": "2,711,877"}),
    S("direct_costs", "Technical and operating (excluding depreciation and amortization)", "AMCX_FY25", IS, {"FY2025": "1,141,393", "FY2024": "1,132,593", "FY2023": "1,327,500"}),
    S("sga", "Selling, general and administrative", "AMCX_FY25", IS, {"FY2025": "818,341", "FY2024": "781,329", "FY2023": "764,087"}),
    S("da", "Depreciation and amortization", "AMCX_FY25", IS, {"FY2025": "94,425", "FY2024": "98,015", "FY2023": "107,402"}),
    S("impairment", "Impairment and other charges", "AMCX_FY25", IS, {"FY2025": "97,784", "FY2024": "399,513", "FY2023": "96,689"}),
    S("restructuring", "Restructuring and other related charges", "AMCX_FY25", IS, {"FY2025": "26,536", "FY2024": "49,464", "FY2023": "27,787"}),
    S("interest_expense", "Interest expense", "AMCX_FY25", IS, {"FY2025": "172,353", "FY2024": "166,186", "FY2023": "152,703"}),
    S("taxes", "Income tax expense", "AMCX_FY25", IS, {"FY2025": "46,226", "FY2024": "43,490", "FY2023": "94,606"}),
    S("sbc", "Share-based compensation expenses", "AMCX_FY25", NG, {"FY2025": "25,330", "FY2024": "26,051"}, note="AOI add-back"),
    S("sbc", "Share-based compensation expenses", "AMCX_FY24", NG, {"FY2023": "25,665"}, note="AOI add-back (FY2024 10-K, consolidated column)"),
    S("cloud_amort", "Cloud computing amortization", "AMCX_FY25", NG, {"FY2025": "10,733", "FY2024": "13,452"}, note="AOI add-back"),
    S("cloud_amort", "Cloud computing amortization", "AMCX_FY24", NG, {"FY2023": "10,543"}, note="AOI add-back (FY2024 10-K)"),
    S("jv_aoi", "Majority owned equity investees AOI", "AMCX_FY25", NG, {"FY2025": "23,744", "FY2024": "15,678"}, note="AOI add-back"),
    S("jv_aoi", "Majority owned equity investees AOI", "AMCX_FY24", NG, {"FY2023": "13,606"}, note="AOI add-back (FY2024 10-K)"),
    S("aoi_reported", "Adjusted operating income", "AMCX_FY25", NG, {"FY2025": "411,874", "FY2024": "562,573"}, note="Company-reported AOI; used only to check the model's calculated EBITDA"),
    S("aoi_reported", "Adjusted operating income (loss)", "AMCX_FY24", NG, {"FY2023": "670,104"}, note="FY2024 10-K"),
    S("cfo", "Net cash provided by operating activities", "AMCX_FY25", CF, {"FY2025": "305,670", "FY2024": "375,615", "FY2023": "203,919"}),
    S("capex", "Capital expenditures", "AMCX_FY25", CF, {"FY2025": "33,303", "FY2024": "44,775", "FY2023": "35,207"}),
    S("cash_interest", "Cash interest paid", "AMCX_FY25", "Note 19 Supplemental cash flow data", {"FY2025": "156,563", "FY2024": "129,164", "FY2023": "149,535"}),
    S("cash", "Cash and cash equivalents", "AMCX_FY25", BS, {"FY2025": "502,379", "FY2024": "784,649"}),
    S("debt_total", "Total long-term debt", "AMCX_FY25", "Note 9 Long-term Debt", {"FY2025": "1,778,251"}, note="Principal at 2025-12-31 (before the 2026 exchange/refinancing); used for covenant calibration"),
    S("cash", "Cash and cash equivalents at end of year", "AMCX_FY25", CF, {"FY2023": "570,576"}),
    # H1 2026 / H1 2025 (Form 10-Q for the quarter ended 2026-06-30)
    S("revenue", "Total revenues, net", "AMCX_Q2", "Condensed Consolidated Statements of Income (Loss) / MD&A", {"H1-2026": "1,089,622", "H1-2025": "1,155,257"}),
    S("direct_costs", "Technical and operating (excluding depreciation and amortization)", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "571,961", "H1-2025": "551,222"}),
    S("sga", "Selling, general and administrative", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "426,623", "H1-2025": "419,679"}),
    S("da", "Depreciation and amortization", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "38,243", "H1-2025": "47,372"}),
    S("impairment", "Impairment and other charges", "AMCX_Q2", "n/a (none reported in H1)", {}, note="No impairment line in H1 2026 / H1 2025 statements; modelled as 0 (not disclosed ≠ estimated)"),
    S("restructuring", "Restructuring and other related charges", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "5,680", "H1-2025": "8,318"}),
    S("interest_expense", "Interest expense", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "84,012", "H1-2025": "85,852"}),
    S("taxes", "Income tax (expense) benefit", "AMCX_Q2", "MD&A results of operations", {"H1-2026": "11,413", "H1-2025": "31,027"}, note="H1-2026 is a BENEFIT (sign flipped to a negative provision); H1-2025 is an expense"),
    S("sbc", "Share-based compensation expenses", "AMCX_Q2", NG, {"H1-2026": "12,826", "H1-2025": "13,800"}, note="AOI add-back (reconciliation figure)"),
    S("cloud_amort", "Cloud computing amortization", "AMCX_Q2", NG, {"H1-2026": "4,416", "H1-2025": "5,938"}),
    S("jv_aoi", "Majority owned equity investees AOI", "AMCX_Q2", NG, {"H1-2026": "6,762", "H1-2025": "9,777"}),
    S("aoi_reported", "Adjusted operating income", "AMCX_Q2", NG, {"H1-2026": "115,042", "H1-2025": "213,871"}),
    S("cfo", "Net cash provided by operating activities", "AMCX_Q2", "Condensed Consolidated Statements of Cash Flows", {"H1-2026": "124,659", "H1-2025": "211,596"}),
    S("capex", "Capital expenditures", "AMCX_Q2", "Condensed Consolidated Statements of Cash Flows", {"H1-2026": "16,577", "H1-2025": "21,670"}),
    S("cash_interest", "Cash interest paid", "AMCX_Q2", "Note: Supplemental data", {"H1-2026": "78,984", "H1-2025": "84,394"}),
    # balance sheet 2026-06-30
    S("cash", "Cash and cash equivalents", "AMCX_Q2", BS, {"2026-06-30": "463,996"}),
    S("current_assets", "Total current assets", "AMCX_Q2", BS, {"2026-06-30": "1,262,345"}),
    S("current_liabilities", "Total current liabilities", "AMCX_Q2", BS, {"2026-06-30": "716,838"}),
    S("debt_total", "Total long-term debt", "AMCX_Q2", "Note 9 Long-term Debt", {"2026-06-30": "1,735,554"}),
    S("ar", "Accounts receivable, trade", "AMCX_Q2", BS, {"2026-06-30": "547,187"}),
    S("program_rights", "Program rights, net", "AMCX_Q2", BS, {"2026-06-30": "1,627,782"}, note="Largest asset; content library carried at amortized cost"),
    S("ppe", "Property and equipment, net", "AMCX_Q2", BS, {"2026-06-30": "110,555"}),
    S("intangibles", "Intangible assets, net", "AMCX_Q2", BS, {"2026-06-30": "169,447"}),
    S("debt_2032_secured", "10.50% Senior Secured Notes due July 2032", "AMCX_Q2", "Note 9 Long-term Debt", {"2026-06-30": "1,315,098"}),
    S("debt_2029_unsecured", "4.25% Senior Notes due February 2029", "AMCX_Q2", "Note 9 Long-term Debt", {"2026-06-30": "276,706"}),
    S("debt_2029_convert", "4.25% Convertible Senior Notes due February 2029", "AMCX_Q2", "Note 9 Long-term Debt", {"2026-06-30": "143,750"}),
]
AMCX_TEXT = [  # disclosed terms (verified as substrings)
    ("cov_net_lev_max_now", "5.75:1.00", "AMCX_FY25", "MD&A Liquidity / Note 9: maximum total net leverage ratio 5.75:1.00 through 2026-03-31"),
    ("cov_net_lev_max_after", "5.50:1.00", "AMCX_FY25", "Maximum total net leverage ratio changes to 5.50:1.00 after 2026-03-31"),
    ("cov_net_lev_reported", "4.41:1.00", "AMCX_FY25", "Total net leverage ratio at 2025-12-31 as reported by the company (credit-agreement definition)"),
    ("cov_icr_min", "1.50:1.00", "AMCX_FY25", "Minimum interest coverage after Amendment No. 5"),
    ("cov_icr_stepup", "1.75:1.00", "AMCX_FY25", "Step-up for quarters ending on/after 2028-12-31"),
    ("cov_icr_reported", "2.01:1.00", "AMCX_FY25", "Interest coverage at 2025-12-31 as reported by the company"),
    ("notes_2032_coupon", "10.500%", "AMCX_FY25", "10.50% Senior Secured Notes due July 15, 2032; first-priority lien on substantially all assets"),
    ("notes_2032_call_2028", "105.250%", "AMCX_FY25", "Call schedule: 105.250% from 2028-07-15; 102.625% in 2029; par from 2030"),
    ("notes_2032_call_2029", "102.625%", "AMCX_FY25", "Call schedule"),
    ("notes_2032_collateral", "secured on a first-priority basis by substantially all of AMC Networks’ and the Guarantors’ assets", "AMCX_FY25", "Collateral: substantially all assets"),
    ("revolver_terminated", "terminated its revolving credit facility", "AMCX_Q2", "Note 9: revolver terminated and Term Loan A repaid on 2026-05-12 → credit-agreement maintenance covenants no longer apply"),
    ("fy25_undrawn_revolver", "undrawn $175.0 million Revolving Credit Facility", "AMCX_FY25", "MD&A Liquidity: undrawn revolver at 2025-12-31"),
    ("exchange_offer", "$1,065 in aggregate principal amount of 2032 Notes", "AMCX_Q2", "Feb–Mar 2026 exchange of the 10.25% 2029 secured notes into additional 10.50% 2032 secured notes"),
]

BDN = [
    S("revenue", "Total revenue", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "484,454", "FY2024": "505,517", "FY2023": "514,651"}),
    S("prop_opex", "Property operating expenses", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "131,347", "FY2024": "129,890", "FY2023": "129,885"}),
    S("re_taxes", "Real estate taxes", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "43,602", "FY2024": "47,726", "FY2023": "49,974"}),
    S("mgmt_exp", "Third party management expenses", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "10,245", "FY2024": "9,714", "FY2023": "10,088"}),
    S("ga", "General and administrative expenses", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "42,031", "FY2024": "42,781", "FY2023": "34,862"}),
    S("da", "Depreciation and amortization", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "176,428", "FY2024": "178,168", "FY2023": "188,797"}),
    S("impairment", "Provision for impairment", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "63,392", "FY2024": "44,655", "FY2023": "131,573"}),
    S("interest_expense", "Interest expense", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "134,955", "FY2024": "116,306", "FY2023": "95,456"}, note="Excludes amortization of deferred financing costs; net of capitalized interest"),
    S("taxes", "Income tax provision", "BDN_FY25", "Consolidated Statements of Operations", {"FY2025": "112", "FY2024": "14", "FY2023": "72"}),
    S("noi_reported", "Consolidated net operating income", "BDN_FY25", "Note 18 Segment Information", {"FY2025": "299,260", "FY2024": "318,187", "FY2023": "324,704"}, note="Company-reported NOI; used only to check the model's calculated NOI"),
    S("cfo", "Net cash provided by operating activities", "BDN_FY25", CF, {"FY2025": "116,701", "FY2024": "181,125", "FY2023": "177,273"}),
    S("capex_ti", "Capital expenditures for tenant improvements", "BDN_FY25", CF, {"FY2025": "74,005", "FY2024": "72,792", "FY2023": "48,939"}),
    S("capex_redev", "Capital expenditures for redevelopments", "BDN_FY25", CF, {"FY2025": "6,168", "FY2024": "18,398", "FY2023": "59,984"}),
    S("capex_dev", "Capital expenditures for developments", "BDN_FY25", CF, {"FY2025": "33,223", "FY2024": "38,570", "FY2023": "47,537"}),
    S("leasing_costs", "Leasing costs paid", "BDN_FY25", CF, {"FY2025": "12,749", "FY2024": "10,557", "FY2023": "7,879"}),
    S("cash_interest", "Cash paid for interest, net of capitalized interest", "BDN_FY25", CF + " (supplemental)", {"FY2025": "132,043", "FY2024": "132,253", "FY2023": "107,838"}),
    S("cash", "Cash and cash equivalents, end of period", "BDN_FY25", CF + " (reconciliation)", {"FY2025": "32,284", "FY2024": "90,229", "FY2023": "58,319"}),
    S("revenue", "Total revenue", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "255,924", "H1-2025": "242,087"}),
    S("prop_opex", "Property operating expenses", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "77,094", "H1-2025": "64,891"}),
    S("re_taxes", "Real estate taxes", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "23,006", "H1-2025": "22,939"}),
    S("mgmt_exp", "Third party management expenses", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "4,433", "H1-2025": "5,117"}),
    S("ga", "General and administrative expenses", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "21,598", "H1-2025": "26,795"}),
    S("da", "Depreciation and amortization", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "96,980", "H1-2025": "88,115"}),
    S("impairment", "Provision for impairment", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "11,909", "H1-2025": "63,369"}),
    S("interest_expense", "Interest expense", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "82,820", "H1-2025": "64,190"}),
    S("taxes", "Income tax provision", "BDN_Q2", "Consolidated Statements of Operations (six months)", {"H1-2026": "24", "H1-2025": "85"}),
    S("cfo", "Net cash provided by operating activities", "BDN_Q2", CF + " (six months)", {"H1-2026": "45,821", "H1-2025": "40,704"}),
    S("capex_ti", "Capital expenditures for tenant improvements", "BDN_Q2", CF + " (six months)", {"H1-2026": "33,162", "H1-2025": "39,524"}),
    S("capex_redev", "Capital expenditures for redevelopments", "BDN_Q2", CF + " (six months)", {"H1-2026": "1,872", "H1-2025": "4,766"}),
    S("capex_dev", "Capital expenditures for developments", "BDN_Q2", CF + " (six months)", {"H1-2026": "26,632", "H1-2025": "17,656"}),
    S("leasing_costs", "Leasing costs paid", "BDN_Q2", CF + " (six months)", {"H1-2026": "9,886", "H1-2025": "6,726"}),
    S("cash_interest", "Cash paid for interest, net of capitalized interest", "BDN_Q2", CF + " (supplemental)", {"H1-2026": "81,874", "H1-2025": "58,031"}),
    S("cash", "Cash and cash equivalents", "BDN_Q2", BS, {"2026-06-30": "37,870"}),
    S("gross_properties", "Operating properties", "BDN_Q2", BS, {"2026-06-30": "3,527,129"}, note="Gross carrying value at cost, NOT market value"),
    S("held_for_sale", "Assets held for sale, net", "BDN_Q2", BS, {"2026-06-30": "232,921"}),
    S("cip", "Construction-in-progress", "BDN_Q2", BS, {"2026-06-30": "85,569"}),
    S("land", "Land held for development", "BDN_Q2", BS, {"2026-06-30": "75,134"}),
    S("jv_investment", "Investment in unconsolidated real estate ventures", "BDN_Q2", BS, {"2026-06-30": "336,851"}, note="Equity-method book value; not included in collateral or recovery value"),
    S("debt_revolver", "$600.0M Unsecured Credit Facility", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "149,000"}),
    S("debt_term_loan", "Term Loan - Swapped to fixed", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "250,000"}),
    S("debt_n2027", "$450.0M 3.95% Guaranteed Notes due 2027", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "450,000"}),
    S("debt_n2028", "$350.0M 8.30% Guaranteed Notes due 2028", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "350,000"}),
    S("debt_n2029a", "$550.0M 8.88% Guaranteed Notes due 2029", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "550,000"}),
    S("debt_n2029b", "$350.0M 4.55% Guaranteed Notes due 2029", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "350,000"}),
    S("debt_n2031", "$300.0M 6.13% Guaranteed Notes due 2031", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "300,000"}),
    S("debt_avira", "Avira Secured Term Loan", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "90,000"}),
    S("debt_cpace", "3151 Market C-PACE Loan", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "57,324"}),
    S("debt_trups", "Indenture IA (Preferred Trust I)", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "27,062"}, note="Plus Indenture IB 25,774 and Indenture II 25,774 (total $78.6M)"),
    S("debt_trups_ib", "Indenture IB (Preferred Trust I)", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "25,774"}),
    S("debt_trups_ii", "Indenture II (Preferred Trust II)", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "25,774"}),
    S("debt_total_principal_all", "Total principal payments", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "2,624,934"}, note="Secured 147,324 + unsecured 2,477,610; reconciles the tranche inputs"),
    S("debt_total_principal_all", "Total principal payments", "BDN_FY25", "Note 7 Debt Obligations", {"FY2025": "2,563,948"}),
    S("debt_total_principal", "Principal balance outstanding", "BDN_Q2", "Note 7 Debt Obligations", {"2026-06-30": "2,477,610"}, note="Unsecured principal; secured principal 147,324; total 2,624,934 per scheduled maturities table"),
]
BDN_TEXT = [
    ("cov_fccr_min", "greater than or equal to 1.5 to 1.00", "BDN_FY25", "Note 8: fixed charge coverage ratio ≥ 1.5x"),
    ("cov_leverage_max", "less than or equal to 0.60 to 1.00", "BDN_FY25", "Note 8: leverage ratio ≤ 0.60 (debt / total asset value, credit-agreement definition)"),
    ("cov_secured_max", "less than or equal to 0.40 to 1.00", "BDN_FY25", "Note 8: secured indebtedness / total asset value ≤ 0.40"),
    ("cov_unencumbered_cf", "greater than 1.75 to 1.00", "BDN_FY25", "Note 8: unencumbered cash flow / unsecured interest > 1.75x"),
    ("fy25_available_revolver", "$564.5 million of available borrowings under our unsecured credit facility", "BDN_FY25", "Liquidity: availability at 2025-12-31 (net of letters of credit)"),
    ("fy25_total_principal", "Total principal payments | 2,563,948", "BDN_FY25", "Note 8: aggregate scheduled principal payments (total principal) at 2025-12-31"),
    ("q2_available_revolver", "$425.5 million of available borrowings under our Unsecured Credit Facility, net of $25.5 million in letters of credit outstanding", "BDN_Q2", "Liquidity: availability at 2026-06-30 (600.0 commitment − 149.0 drawn − 25.5 letters of credit)"),
    ("compliance", "was in compliance with all financial covenants as of June 30, 2026", "BDN_Q2", "Note 7: company states it is in compliance at 2026-06-30"),
    ("notes_2028_stepup", "increased 25 basis points", "BDN_FY25", "8.30% 2028 notes carry rating-linked coupon step-ups after downgrades to Ba1/BB+"),
    ("revolver_extension", "extending the maturity date to December 30, 2026", "BDN_Q2", "Revolver extended to 2026-12-30; one more six-month extension to 2027-06-30"),
]

def load(doc):
    return open(os.path.join(SEC, DOCS[doc]["txt"])).read()

def page_of(text, pos, style):
    """Next solitary page-number line (table rows always contain '|', so a lone 'F-12' / '32' line is a page footer)."""
    if style == "-":
        return None  # page footers not reliably recoverable from this document; cite section only
    m = re.compile(r"^(F-\d+|\d{1,3})\s*$", re.M).search(text, pos)
    return m.group(1) if m else None

ANCHORS = {  # section -> heading regex; search starts at the LAST heading match so we cite the statement, not an MD&A mention
    IS: r"CONSOLIDATED STATEMENTS OF INCOME \(LOSS\)", BS: r"CONSOLIDATED BALANCE SHEETS", CF: r"CONSOLIDATED STATEMENTS OF CASH FLOWS",
    NG: r"reconciliation of operating income to AOI", "Note 9 Long-term Debt": r"Note 9\. Long-term Debt",
    "Consolidated Statements of Operations": r"CONSOLIDATED STATEMENTS OF OPERATIONS", "Note 18 Segment Information": r"Net operating income \(“NOI”\) is a non-GAAP",
    "Note 7 Debt Obligations": r"7\. DEBT OBLIGATIONS",
}
def anchor_pos(text, section, doc):
    key = section.split(" (")[0] if section.startswith("Consolidated Statements of Cash") else section
    rx = ANCHORS.get(section) or ANCHORS.get(key)
    if doc == "BDN_Q2":
        rx = {"Consolidated Statements of Operations (six months)": r"CONSOLIDATED STATEMENTS OF OPERATIONS", CF + " (six months)": r"CONSOLIDATED STATEMENTS OF CASH FLOWS", CF + " (supplemental)": r"CONSOLIDATED STATEMENTS OF CASH FLOWS", BS: r"CONSOLIDATED BALANCE SHEETS"}.get(section, rx)
    if doc == "BDN_FY25":
        rx = {CF + " (supplemental)": r"CONSOLIDATED STATEMENTS OF CASH FLOWS", CF + " (reconciliation)": r"CONSOLIDATED STATEMENTS OF CASH FLOWS"}.get(section, rx)
        if section == "Note 7 Debt Obligations": rx = r"8\. DEBT OBLIGATIONS"
    if doc == "AMCX_FY25" and section.startswith("Note 19"): rx = r"Non-Cash Investing and Financing Activities"
    if not rx: return 0
    ms = list(re.finditer(rx, text))
    if doc.startswith("BDN") and ms and rx.startswith("CONSOLIDATED"): return ms[0].start() if doc == "BDN_Q2" else ms[-1].start() if False else ms[0].start()
    return ms[-1].start() if ms else 0

def find(text, label, raw, start=0):
    for m in re.finditer(re.escape(label), text[start:]):
        m = type("M", (), {"start": lambda self, off=m.start() + start: off})()
        if raw in text[m.start(): m.start() + 700]:
            return m.start() + text[m.start(): m.start() + 700].index(raw)
    return None

NUM_RX = re.compile(r"\(?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)\)?")

def row_check(text, label, vals):
    """Strict check on top of the 600-char window: each raw figure must sit on a table row that starts with the label (a wrapped label may spill onto the next 3 lines),
    and when one row carries every period they must appear in the listed (newest→oldest) column order. Returns (ok, why)."""
    lines = text.split("\n")
    rows = []
    for i, l in enumerate(lines):
        if label in l:
            tail = l.split(label, 1)[1]
            joined = tail if any(c.isdigit() for c in tail.replace("(", "")[:3] + tail) and "|" in tail else tail + " " + " ".join(lines[i + 1:i + 4])
            rows.append([t.group(1) for t in NUM_RX.finditer(joined)])
    for k, v in vals.items():
        if not any(v in toks for toks in rows):
            return False, f"{k}: {v} is not on any '{label}' row"
    full = [toks for toks in rows if all(v in toks for v in vals.values())]
    if full and len(set(vals.values())) == len(vals) and len(vals) > 1:
        if not any([toks.index(v) for v in vals.values()] == sorted(toks.index(v) for v in vals.values()) for toks in full):
            return False, "periods are not in the listed column order on the row"
    return True, ""

def build(case, series, texts):
    pts, fails = [], []
    for s in series:
        text = load(s["doc"]); d = DOCS[s["doc"]]
        if s["vals"]:
            ok_, why = row_check(text, s["label"], s["vals"])
            if not ok_:
                fails.append((s["metric"], "row-check", str(s["vals"]), s["label"], s["doc"] + ": " + why))
        for period, raw in s["vals"].items():
            pos = find(text, s["label"], raw, anchor_pos(text, s["section"], s["doc"]))
            if pos is None: pos = find(text, s["label"], raw)
            if pos is None:
                fails.append((s["metric"], period, raw, s["label"], s["doc"])); continue
            val = int(raw.replace(",", "")) / 1000.0 * s["sign"]
            if s["metric"] == "taxes" and period == "H1-2026" and case == "amcx": val = -val
            pts.append(dict(id=f"{case}.{s['metric']}.{period}", company=d["company"], metric=s["metric"], value=round(val, 3), unit="US$ millions (filing reports US$ thousands; ÷1000)", period=period,
                            filing=f"Form {d['form']} for period ended {d['period']}", accession=d["acc"], filingDate=d["filed"], url=d["url"],
                            section=s["section"], page=page_of(text, pos, d["page_style"]), retrieved=RETRIEVED, kind="reported", rawText=raw, note=s["note"]))
    tx = []
    for tid, needle, doc, note in texts:
        text = load(doc); d = DOCS[doc]
        pos = text.find(needle)
        if pos < 0:
            fails.append((tid, "", needle, "", doc)); continue
        tx.append(dict(id=f"{case}.{tid}", company=d["company"], metric=tid, value=None, unit="text disclosure", period=d["period"], filing=f"Form {d['form']} for period ended {d['period']}", accession=d["acc"],
                       filingDate=d["filed"], url=d["url"], section=note, page=page_of(text, pos, d["page_style"]), retrieved=RETRIEVED, kind="reported", rawText=needle, note=note))
    return pts, tx, fails

if __name__ == "__main__":
    bad = 0
    for case, series, texts in (("amcx", AMCX, AMCX_TEXT), ("bdn", BDN, BDN_TEXT)):
        pts, tx, fails = build(case, series, texts)
        docs = {k: v for k, v in DOCS.items() if k.lower().startswith(case)}
        json.dump(dict(case=case, documents=docs, datapoints=pts, disclosures=tx), open(os.path.join(ROOT, "data", "real", f"{case}.datapoints.json"), "w"), indent=1)
        print(f"{case}: {len(pts)} numeric + {len(tx)} text datapoints verified; {len(fails)} failed")
        for f in fails:
            print("  FAIL", f); bad += 1
    sys.exit(1 if bad else 0)
