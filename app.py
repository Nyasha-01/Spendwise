"""Spendwise - personal spending tracker. Flask backend, one JSON file per user."""
import calendar, json, os, re, secrets, threading, time, uuid
from datetime import date, timedelta
from functools import wraps
from flask import Flask, jsonify, request, session, render_template, abort
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data", "users")
os.makedirs(DATA, exist_ok=True)
LOCK = threading.Lock()
CURRENCIES = ["USD", "ZWG", "ZAR", "EUR", "GBP"]
DEFAULT_CATS = ["Food", "Transport", "Rent", "Airtime & Data", "Utilities", "Health",
                "Education", "Entertainment", "Clothing", "Other"]
USER_RE = re.compile(r"^[a-z0-9_]{3,20}$")
CAT_RE = re.compile(r"^[A-Za-z0-9 &'-]{1,24}$")

keyfile = os.path.join(BASE, "data", "secret.key")
if not os.path.exists(keyfile):
    with open(keyfile, "w") as f:
        f.write(secrets.token_hex(32))
app = Flask(__name__)
app.secret_key = open(keyfile).read().strip()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  MAX_CONTENT_LENGTH=100_000, PERMANENT_SESSION_LIFETIME=timedelta(days=14))

# ---------- storage ----------
def upath(u): return os.path.join(DATA, u + ".json")
def load(u):
    with open(upath(u), encoding="utf-8") as f: return json.load(f)
def save(u, d):
    tmp = upath(u) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(d, f, indent=2)
    os.replace(tmp, upath(u))

def new_user(u, pw, cur):
    cur = cur if cur in CURRENCIES else "USD"
    sec = "ZWG" if cur != "ZWG" else "USD"
    return {"username": u, "password_hash": generate_password_hash(pw), "created": date.today().isoformat(),
            "settings": {"base": cur, "second": sec, "rate": 0.04 if sec == "ZWG" else 25.0},
            "categories": list(DEFAULT_CATS), "transactions": [], "budgets": {}, "goals": [], "recurring": []}

# ---------- helpers ----------
@app.errorhandler(ValueError)
def bad(e): return jsonify(error=str(e)), 400

@app.before_request
def csrf():  # custom header can't be sent by cross-site forms
    if request.method != "GET" and request.headers.get("X-Requested-With") != "fetch": abort(403)

def body(): return request.get_json(silent=True) or {}
def num(v, lo=0.01, hi=1e9):
    try: x = round(float(v), 2)
    except (TypeError, ValueError): raise ValueError("Enter a valid amount")
    if not lo <= x <= hi: raise ValueError("Amount is out of range")
    return x
def text(v, n=80): return str(v or "").strip()[:n]
def pdate(v):
    try: return date.fromisoformat(str(v)).isoformat()
    except ValueError: raise ValueError("Enter a valid date")
def cv(d, t):
    s = d["settings"]
    return t["amount"] * s["rate"] if t["currency"] == s["second"] != s["base"] else t["amount"]
def money(d, x): return f"{d['settings']['base']} {x:,.2f}"
def uid(): return uuid.uuid4().hex[:10]

def api(fn):
    @wraps(fn)
    def w(*a, **k):
        u = session.get("u")
        if not u or not os.path.exists(upath(u)):
            session.clear(); return jsonify(error="Please sign in"), 401
        with LOCK:
            d = load(u); apply_recurring(d)
            r = fn(d, *a, **k); save(u, d)
        return r
    return w

def state(d):
    out = {k: d[k] for k in ("settings", "categories", "budgets", "goals", "recurring")}
    out["username"] = d["username"]; out["currencies"] = CURRENCIES
    out["transactions"] = sorted(d["transactions"], key=lambda t: (t["date"], t["id"]), reverse=True)[:300]
    out["summary"], out["tips"] = insights(d)
    return jsonify(out)

def apply_recurring(d):
    today = date.today(); cur = today.strftime("%Y-%m")
    for r in d["recurring"]:
        y, m = map(int, r["last"].split("-"))
        while True:
            m += 1
            if m > 12: y, m = y + 1, 1
            ym = f"{y:04d}-{m:02d}"
            if ym > cur: break
            dt = date(y, m, min(r["day"], 28))
            if dt > today: break
            d["transactions"].append({"id": uid(), "type": r["type"], "amount": r["amount"], "currency": r["currency"],
                                      "category": r["category"], "date": dt.isoformat(), "note": r["note"] or "Recurring"})
            r["last"] = ym

def insights(d):
    today = date.today(); cur = today.strftime("%Y-%m")
    months, y, m = [], today.year, today.month
    for _ in range(6):
        months.append(f"{y:04d}-{m:02d}"); m -= 1
        if m == 0: y, m = y - 1, 12
    months.reverse()
    inc = dict.fromkeys(months, 0.0); exp = dict.fromkeys(months, 0.0); cats = {k: {} for k in months}
    small = {}; income_now = sum(cv(d, t) for t in d["transactions"] if t["type"] == "income" and t["date"][:7] == cur)
    thr = max(5, 0.01 * income_now)
    for t in d["transactions"]:
        k = t["date"][:7]
        if k not in inc: continue
        a = cv(d, t)
        if t["type"] == "income": inc[k] += a
        else:
            exp[k] += a; cats[k][t["category"]] = cats[k].get(t["category"], 0) + a
            if k == cur and a <= thr: small.setdefault(t["category"], []).append(a)
    prev = months[-4:-1]
    avg3 = {c: sum(cats[p].get(c, 0) for p in prev) / 3 for p in prev for c in cats[p]}
    income, expense = inc[cur], exp[cur]
    tips = []
    def tip(l, t, go="budgets"): tips.append({"level": l, "text": t, "go": go})
    for c, b in d["budgets"].items():
        s = cats[cur].get(c, 0)
        if s > b: tip("warn", f"{c} is over budget by {money(d, s - b)} ({money(d, s)} of {money(d, b)}).")
        elif s >= 0.8 * b: tip("warn", f"{c} has used {s / b:.0%} of its budget. {money(d, b - s)} left.")
    for c, s in cats[cur].items():
        a = avg3.get(c, 0)
        if a > 0 and s > 1.3 * a and s - a >= thr:
            tip("warn", f"You've spent {s / a - 1:.0%} more on {c} than your 3-month average.")
    days = calendar.monthrange(today.year, today.month)[1]
    if today.day >= 7 and income > 0 and expense / today.day * days > income:
        tip("warn", f"At this pace you'll spend about {money(d, expense / today.day * days)} this month, more than the {money(d, income)} you've earned.")
    if income > 0:
        rate = (income - expense) / income
        if rate < 0: tip("warn", "You've spent more than you earned this month.", "transactions")
        elif rate < 0.1: tip("info", f"You're saving {rate:.0%} of your income. Aim for 10-20% if you can.", "goals")
        elif rate >= 0.2: tip("good", f"You're saving {rate:.0%} of your income this month. Well done.", "goals")
    if expense > 0:
        c, s = max(cats[cur].items(), key=lambda kv: kv[1])
        if s / expense > 0.4: tip("info", f"{c} is {s / expense:.0%} of your spending, so it's the best place to look for savings.")
    for c, v in small.items():
        if len(v) >= 6: tip("info", f"{len(v)} small purchases on {c} add up to {money(d, sum(v))} this month.")
    rec = sum(cv(d, r) for r in d["recurring"] if r["type"] == "expense")
    if income > 0 and rec > 0.5 * income:
        tip("info", f"Recurring bills take {rec / income:.0%} of your income. Review them for anything you can drop.", "recurring")
    for g in d["goals"]:
        left = g["target"] - g["saved"]
        if left <= 0 or not g.get("deadline"): continue
        dl = date.fromisoformat(g["deadline"]); ml = (dl.year - today.year) * 12 + dl.month - today.month
        if ml < 1 and dl < today: tip("warn", f"Goal \"{g['name']}\" is past its deadline with {money(d, left)} to go.", "goals")
        else: tip("info", f"To reach \"{g['name']}\" on time, save about {money(d, left / max(ml, 1))} a month.", "goals")
    if not d["budgets"]: tip("info", "Set monthly budgets to get a warning before you overspend.")
    if not tips: tip("good", "You're on track this month.")
    r2 = lambda x: round(x, 2)
    left = income - expense; left_days = days - today.day + 1; proj = expense / today.day * days
    if income <= 0: headline = "Add your income to see how this month is going."
    elif proj > income: headline = f"At this pace you'll overspend by {money(d, proj - income)} before the month ends."
    elif left < 0: headline = f"You're {money(d, -left)} over your income this month."
    else: headline = f"You're on track. About {money(d, left / left_days)} a day is safe to spend."
    score = None
    if income > 0:
        s = min(max(left / income, 0), 0.3) / 0.3 * 40
        bs = [cats[cur].get(c, 0) <= b for c, b in d["budgets"].items()]
        s += 30 * sum(bs) / len(bs) if bs else 15
        pe = [exp[k] for k in months[-4:-1] if exp[k] > 0]
        s += 20 * min(max((1.5 - proj / (sum(pe) / len(pe))) / 0.5, 0), 1) if pe else 10
        s += 10 if any(g["saved"] > 0 for g in d["goals"]) else 0
        score = round(s)
    mv = sorted(({"cat": c, "diff": r2(cats[cur].get(c, 0) - avg3.get(c, 0))} for c in set(cats[cur]) | set(avg3)), key=lambda x: -abs(x["diff"]))
    extra = {"headline": headline, "score": score, "projected": r2(proj), "days_left": left_days,
             "safe_per_day": r2(max(left, 0) / left_days), "prev_expense": r2(exp[months[-2]]),
             "movers": [x for x in mv if abs(x["diff"]) >= thr][:3]}
    return {"month": cur, "income": r2(income), "expense": r2(expense), **extra,
            "by_cat": {c: r2(v) for c, v in cats[cur].items()}, "avg3": {c: r2(v) for c, v in avg3.items()},
            "trend": [{"month": k, "income": r2(inc[k]), "expense": r2(exp[k])} for k in months]}, tips

# ---------- auth ----------
FAILS = {}
@app.get("/")
def index(): return render_template("app.html" if session.get("u") else "auth.html")

@app.post("/api/register")
def register():
    j = body(); u = text(j.get("username"), 30).lower(); p = str(j.get("password", ""))
    if not USER_RE.match(u): raise ValueError("Username must be 3-20 letters, numbers or underscores")
    if not 8 <= len(p) <= 128: raise ValueError("Password must be 8-128 characters")
    with LOCK:
        if os.path.exists(upath(u)): raise ValueError("That username is taken")
        save(u, new_user(u, p, j.get("currency")))
    session.clear(); session["u"] = u; session.permanent = True
    return jsonify(ok=True)

@app.post("/api/login")
def login():
    j = body(); u = text(j.get("username"), 30).lower(); p = str(j.get("password", ""))
    key = f"{request.remote_addr}|{u}"; n, t = FAILS.get(key, (0, 0))
    if n >= 5 and time.time() - t < 300: return jsonify(error="Too many attempts. Try again in 5 minutes."), 429
    ok = USER_RE.match(u) and os.path.exists(upath(u))
    h = load(u)["password_hash"] if ok else generate_password_hash("x")
    if not (check_password_hash(h, p) and ok):
        FAILS[key] = (n + 1, time.time()); return jsonify(error="Wrong username or password"), 401
    FAILS.pop(key, None); session.clear(); session["u"] = u; session.permanent = True
    return jsonify(ok=True)

@app.post("/api/logout")
def logout(): session.clear(); return jsonify(ok=True)

# ---------- data ----------
@app.get("/api/data")
@api
def get_data(d): return state(d)

@app.post("/api/tx")
@api
def add_tx(d):
    j = body(); typ = j.get("type")
    if typ not in ("income", "expense"): raise ValueError("Choose income or expense")
    cur = j.get("currency")
    if cur not in (d["settings"]["base"], d["settings"]["second"]): raise ValueError("Choose a currency")
    cat = "Income" if typ == "income" else j.get("category")
    if typ == "expense" and cat not in d["categories"]: raise ValueError("Choose a category")
    d["transactions"].append({"id": uid(), "type": typ, "amount": num(j.get("amount")), "currency": cur,
                              "category": cat, "date": pdate(j.get("date")), "note": text(j.get("note"))})
    return state(d)

@app.delete("/api/tx/<tid>")
@api
def del_tx(d, tid):
    d["transactions"] = [t for t in d["transactions"] if t["id"] != tid]; return state(d)

@app.put("/api/budgets")
@api
def set_budgets(d):
    for c, v in body().items():
        if c not in d["categories"]: continue
        if str(v).strip() in ("", "0"): d["budgets"].pop(c, None)
        else: d["budgets"][c] = num(v)
    return state(d)

@app.post("/api/goals")
@api
def add_goal(d):
    j = body(); name = text(j.get("name"), 40)
    if not name: raise ValueError("Give your goal a name")
    dl = pdate(j["deadline"]) if j.get("deadline") else ""
    d["goals"].append({"id": uid(), "name": name, "target": num(j.get("target")), "saved": 0, "deadline": dl})
    return state(d)

@app.post("/api/goals/<gid>/add")
@api
def fund_goal(d, gid):
    a = num(body().get("amount"))
    for g in d["goals"]:
        if g["id"] == gid: g["saved"] = round(g["saved"] + a, 2)
    return state(d)

@app.delete("/api/goals/<gid>")
@api
def del_goal(d, gid):
    d["goals"] = [g for g in d["goals"] if g["id"] != gid]; return state(d)

@app.post("/api/recurring")
@api
def add_rec(d):
    j = body(); typ = j.get("type")
    if typ not in ("income", "expense"): raise ValueError("Choose income or expense")
    if j.get("currency") not in (d["settings"]["base"], d["settings"]["second"]): raise ValueError("Choose a currency")
    cat = "Income" if typ == "income" else j.get("category")
    if typ == "expense" and cat not in d["categories"]: raise ValueError("Choose a category")
    day = int(num(j.get("day"), 1, 31)); t = date.today()
    py, pm = (t.year, t.month - 1) if t.month > 1 else (t.year - 1, 12)
    d["recurring"].append({"id": uid(), "type": typ, "amount": num(j.get("amount")), "currency": j["currency"],
                           "category": cat, "note": text(j.get("note")), "day": day, "last": f"{py:04d}-{pm:02d}"})
    apply_recurring(d); return state(d)

@app.delete("/api/recurring/<rid>")
@api
def del_rec(d, rid):
    d["recurring"] = [r for r in d["recurring"] if r["id"] != rid]; return state(d)

@app.put("/api/settings")
@api
def set_settings(d):
    j = body(); b, s = j.get("base"), j.get("second")
    if b not in CURRENCIES or s not in CURRENCIES: raise ValueError("Choose valid currencies")
    d["settings"] = {"base": b, "second": s, "rate": num(j.get("rate"), 0.0001, 1e7)}; return state(d)

@app.post("/api/categories")
@api
def add_cat(d):
    n = text(body().get("name"), 24)
    if not CAT_RE.match(n): raise ValueError("Category names use letters, numbers, spaces, & ' or -")
    if n.lower() in (c.lower() for c in d["categories"]): raise ValueError("That category already exists")
    d["categories"].append(n); return state(d)

@app.delete("/api/categories/<name>")
@api
def del_cat(d, name):
    if len(d["categories"]) <= 1: raise ValueError("Keep at least one category")
    d["categories"] = [c for c in d["categories"] if c != name]; d["budgets"].pop(name, None); return state(d)

if __name__ == "__main__":
    app.run(debug=False, port=5000)
