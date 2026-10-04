"""Generate a large teacher-scenario pool for trace collection.

Output: JSON list of collector scenarios {"id","system","user","tools"?,"tool_results"?}
Mix (target): ~45% tool-loop single, ~15% tool-loop sequential, ~28% no-tool-visible,
~12% clarify. Distractor tools decorate EVERY scenario with random block sizes
(decorrelation lesson from run 1-6).
"""
import json
import random
import sys
from pathlib import Path

random.seed(3407)

SYSTEM = ("You are a helpful assistant with access to tools. "
          "Call tools when they help answer the request; "
          "answer directly when no tool is needed.")

# ------------------------------------------------------------------ tool pool
def fn(name, desc, props, required):
    return {"type": "function", "function": {
        "name": name, "description": desc,
        "parameters": {"type": "object", "properties": props, "required": required}}}

TOOLS = {
    "get_weather": fn("get_weather", "Get current weather for a city.",
                      {"location": {"type": "string"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, ["location"]),
    "get_current_time": fn("get_current_time", "Get current time for a timezone.",
                           {"timezone": {"type": "string"}}, ["timezone"]),
    "calculate": fn("calculate", "Evaluate an arithmetic expression.",
                    {"expression": {"type": "string"}}, ["expression"]),
    "search_web": fn("search_web", "Search the web for information.",
                     {"query": {"type": "string"}}, ["query"]),
    "create_calendar_event": fn("create_calendar_event", "Create a calendar event.",
                                {"title": {"type": "string"}, "date": {"type": "string"},
                                 "time": {"type": "string"}, "duration_minutes": {"type": "integer"}},
                                ["title", "date", "time"]),
    "send_email": fn("send_email", "Send an email.",
                     {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}},
                     ["to", "subject", "body"]),
    "convert_currency": fn("convert_currency", "Convert money between currencies.",
                           {"amount": {"type": "number"}, "from_currency": {"type": "string"},
                            "to_currency": {"type": "string"}}, ["amount", "from_currency", "to_currency"]),
    "read_file": fn("read_file", "Read a text file.", {"path": {"type": "string"}}, ["path"]),
    "write_file": fn("write_file", "Write text to a file.",
                     {"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]),
    "translate_text": fn("translate_text", "Translate text to a target language.",
                         {"text": {"type": "string"}, "target_language": {"type": "string"}},
                         ["text", "target_language"]),
}

CITIES = ["Berlin", "Tokyo", "New York", "Munich", "Sydney", "Hamburg", "Rome",
          "Oslo", "Lisbon", "Prague", "Vienna", "Amsterdam", "Copenhagen", "Helsinki"]
LANGS = ["French", "Spanish", "German", "Japanese", "Italian", "Dutch", "Polish"]
TITLES = ["Dentist appointment", "Team standup", "Project review", "Thesis meeting",
          "Birthday dinner", "Doctor visit", "1:1 with mentor", "Gym session"]
PEOPLE = ["anna@example.com", "bob@example.com", "team@example.com", "mentor@example.com"]
SUBJECTS = ["Weekly report", "Meeting notes", "Invoice attached", "Quick question", "Update"]

def distractors(needed_names, k=None):
    """Random-size decoration around the needed tools (decorrelation)."""
    k = random.randint(0, 5) if k is None else k
    others = [t for n, t in TOOLS.items() if n not in needed_names]
    combo = [TOOLS[n] for n in needed_names] + random.sample(others, min(k, len(others)))
    random.shuffle(combo)
    return combo

def rid(prefix):
    return f"{prefix}_{random.randint(1000, 9999)}"

# ------------------------------------------------------------------ generators
def gen_weather(i):
    city = CITIES[i % len(CITIES)]
    temp = random.randint(-3, 32)
    cond = random.choice(["sunny", "cloudy", "light rain", "foggy", "windy", "snow"])
    unit = random.choice(["celsius", "fahrenheit"])
    t = round(temp * 9 / 5 + 32) if unit == "fahrenheit" else temp
    return {
        "id": f"weather-{i}",
        "system": SYSTEM,
        "user": f"What's the weather like in {city} right now?" + (" In Fahrenheit." if unit == "fahrenheit" else ""),
        "tools": distractors(["get_weather"]),
        "tool_results": {"get_weather": json.dumps({"temperature": t, "condition": cond, "unit": unit})},
    }

def gen_calc(i):
    a, b = random.randint(11, 999), random.randint(12, 89)
    expr = f"{a} * {b}"
    val = a * b
    return {
        "id": f"calc-{i}",
        "system": SYSTEM,
        "user": f"What is {expr}? Use the calculator.",
        "tools": distractors(["calculate"]),
        "tool_results": {"calculate": json.dumps({"result": val})},
    }

def gen_time(i):
    tz = random.choice(["Europe/Berlin", "America/New_York", "Asia/Tokyo", "Australia/Sydney", "Europe/London"])
    hh, mm = random.randint(0, 23), random.choice([0, 15, 30, 45])
    return {
        "id": f"time-{i}",
        "system": SYSTEM,
        "user": f"What time is it in {tz.split('/')[1].replace('_', ' ')}?",
        "tools": distractors(["get_current_time"]),
        "tool_results": {"get_current_time": json.dumps(
            {"datetime": f"2026-08-24T{hh:02d}:{mm:02d}:00", "timezone": tz})},
    }

def gen_calendar(i):
    title = random.choice(TITLES)
    date = f"2026-{random.randint(9, 12):02d}-{random.randint(1, 28):02d}"
    hh, mm = random.randint(8, 18), random.choice([0, 30])
    dur = random.choice([30, 45, 60, 90])
    return {
        "id": f"calendar-{i}",
        "system": SYSTEM,
        "user": f"Schedule '{title}' on {date} at {hh:02d}:{mm:02d} for {dur} minutes.",
        "tools": distractors(["create_calendar_event"]),
        "tool_results": {"create_calendar_event": json.dumps({"status": "created", "id": rid("evt")})},
    }

def gen_email(i):
    to, subj = random.choice(PEOPLE), random.choice(SUBJECTS)
    return {
        "id": f"email-{i}",
        "system": SYSTEM,
        "user": f"Send an email to {to} with subject '{subj}' saying it's ready.",
        "tools": distractors(["send_email"]),
        "tool_results": {"send_email": json.dumps({"status": "sent", "message_id": rid("m")})},
    }

def gen_translate(i):
    lang = random.choice(LANGS)
    phrase = random.choice(["Good morning", "Thank you very much", "See you tomorrow", "How are you?"])
    return {
        "id": f"translate-{i}",
        "system": SYSTEM,
        "user": f"Translate \"{phrase}\" into {lang}.",
        "tools": distractors(["translate_text"]),
        "tool_results": {"translate_text": json.dumps({"translation": f"[{phrase} in {lang}]"})},
    }

def gen_seq(i):
    """calc -> currency chain; results computed so both hops stay consistent."""
    a, b = random.randint(21, 99), random.randint(12, 49)
    total = a * b
    rate = random.choice([1.09, 0.92, 0.85, 149.3])
    conv = round(total * rate, 2)
    src, dst = ("EUR", "USD") if rate == 1.09 else ("USD", "EUR") if rate == 0.92 else \
               ("EUR", "GBP") if rate == 0.85 else ("USD", "JPY")
    return {
        "id": f"seq-{i}",
        "system": SYSTEM,
        "user": f"Compute {a} * {b}, then tell me that result in {dst} assuming it was {src}.",
        "tools": distractors(["calculate", "convert_currency"]),
        "tool_results": {
            "calculate": json.dumps({"result": total}),
            "convert_currency": json.dumps({"converted": conv, "rate": rate}),
        },
    }

NO_TOOL_QA = [
    ("Who wrote the novel '1984'?", "'1984' was written by George Orwell."),
    ("What is the capital of Australia?", "Canberra is the capital of Australia."),
    ("Explain recursion in one sentence.", "Recursion is when a function solves a problem by calling itself on a smaller version of the same problem until it reaches a base case."),
    ("Why is the sky blue?", "Rayleigh scattering: air molecules scatter short (blue) wavelengths of sunlight more strongly than long (red) ones."),
    ("What year did the Berlin Wall fall?", "1989 — on November 9th."),
    ("How many continents are there?", "Seven."),
    ("Give me a tip against procrastination.", "Start with a two-minute version of the task — momentum beats motivation."),
    ("What does HTTP stand for?", "HyperText Transfer Protocol."),
    ("Is a tomato a fruit or vegetable?", "Botanically a fruit, culinarily a vegetable."),
    ("Summarize Romeo and Juliet in one sentence.", "Two teenagers from feuding families secretly marry; a misunderstanding kills both, ending the feud."),
    ("What's a healthy sleep habit?", "A consistent wake-up time anchors the circadian rhythm more than bedtime does."),
    ("Recommend a beginner Python book.", "'Automate the Boring Stuff with Python' — practical and free online."),
]

CLARIFY_Q = [
    "Book me a table.",
    "Send it to them.",
    "Remind me about that thing.",
    "Convert this money.",
    "Read the file.",
    "Set up my week.",
    "Translate it please.",
    "What's the temperature?",
]

def gen_no_tool(i):
    q, _a = random.choice(NO_TOOL_QA)
    # Tools sichtbar — inkl. moeglicherweise relevant aussehender — aber Antwort direkt.
    return {
        "id": f"notool-{i}",
        "system": SYSTEM,
        "user": q,
        "tools": distractors([]),
    }

def gen_clarify(i):
    q = random.choice(CLARIFY_Q)
    return {
        "id": f"clarify-{i}",
        "system": SYSTEM,
        "user": q,
        "tools": distractors([random.choice(list(TOOLS))]),
    }

def build():
    """Explizite Quotas: ~55% Tool-Loop, ~28% No-Tool-sichtbar, ~17% Clarify.
    Kleine Frage-Pools duerfen bis zu MAX_REPEAT wiederholt werden — der
    Collector dedupliziert ohnehin per Nachrichten-Fingerprint (Teacher-
    Antworten variieren), nicht per Frage."""
    MAX_REPEAT = 6
    out, counts = [], {}

    def push(gen, n):
        made, attempts = 0, 0
        while made < n and attempts < n * 20:
            attempts += 1
            s = gen(len(out) + made + 1)
            key = s["user"]
            counts[key] = counts.get(key, 0)
            if counts[key] >= MAX_REPEAT:
                continue
            counts[key] += 1
            s["id"] = f"{s['id']}-{made}"
            out.append(s)
            made += 1

    push(gen_weather, 24)
    push(gen_calc, 20)
    push(gen_time, 12)
    push(gen_calendar, 18)
    push(gen_email, 14)
    push(gen_translate, 14)
    push(gen_seq, 22)       # = 124 tool-loop
    push(gen_no_tool, 60)   # = 60 no-tool-visible
    push(gen_clarify, 32)   # = 32 clarify
    random.shuffle(out)
    return out

if __name__ == "__main__":
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("scenarios_pool.json")
    scenarios = build()
    out_path.write_text(json.dumps(scenarios, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    kinds = Counter(s["id"].rsplit("-", 2)[0] if s["id"].count("-") > 1 else s["id"] for s in scenarios)
    print(f"{len(scenarios)} Szenarien -> {out_path}")
    print("Verteilung:", dict(kinds))
