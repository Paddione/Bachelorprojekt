"""Generate a synthetic tool-use SFT dataset for Qwen3-4B-Instruct-2507.

Output rows: {"tools": [<openai function schemas>], "messages": [<chatml>]}
Archetypes: single_call, parallel_calls, sequential_calls, no_tool_direct, clarify_decline
"""
import json
import random
from pathlib import Path

random.seed(3407)

OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

# ---------------------------------------------------------------- tools pool
def fn(name, desc, params, required):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": desc,
            "parameters": {
                "type": "object",
                "properties": params,
                "required": required,
            },
        },
    }

TOOLS = [
    fn("get_weather", "Get current weather for a city.",
       {"location": {"type": "string", "description": "City name"},
        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}},
       ["location"]),
    fn("get_current_time", "Get current time for a timezone.",
       {"timezone": {"type": "string", "description": "IANA timezone, e.g. Europe/Berlin"}},
       ["timezone"]),
    fn("calculate", "Evaluate an arithmetic expression.",
       {"expression": {"type": "string", "description": "Math expression, e.g. 12*(3+4)"}},
       ["expression"]),
    fn("search_web", "Search the web for information.",
       {"query": {"type": "string"}, "max_results": {"type": "integer", "default": 5}},
       ["query"]),
    fn("create_calendar_event", "Create a calendar event.",
       {"title": {"type": "string"}, "date": {"type": "string", "description": "YYYY-MM-DD"},
        "time": {"type": "string", "description": "HH:MM"},
        "duration_minutes": {"type": "integer"}},
       ["title", "date", "time"]),
    fn("send_email", "Send an email.",
       {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}},
       ["to", "subject", "body"]),
    fn("convert_currency", "Convert money between currencies.",
       {"amount": {"type": "number"}, "from_currency": {"type": "string"},
        "to_currency": {"type": "string"}},
       ["amount", "from_currency", "to_currency"]),
    fn("read_file", "Read a text file.",
       {"path": {"type": "string"}}, ["path"]),
    fn("write_file", "Write text to a file.",
       {"path": {"type": "string"}, "content": {"type": "string"}},
       ["path", "content"]),
    fn("translate_text", "Translate text to a target language.",
       {"text": {"type": "string"}, "target_language": {"type": "string"}},
       ["text", "target_language"]),
]
TOOL_BY_NAME = {t["function"]["name"]: t for t in TOOLS}

def pad_tools(needed):
    """Mix needed tools with random distractors — decorrelates block size from behavior."""
    k = random.randint(0, 6)
    others = [t for t in TOOLS if t["function"]["name"] not in
              {n["function"]["name"] for n in needed}]
    combo = list(needed) + random.sample(others, min(k, len(others)))
    random.shuffle(combo)
    return combo

SYSTEM = ("You are a helpful assistant with access to tools. "
          "Call tools when they help answer the request; "
          "answer directly when no tool is needed.")

# ---------------------------------------------------------------- helpers
def call_msg(name, args):
    return {"role": "assistant", "content": "",
            "tool_calls": [{"type": "function",
                            "function": {"name": name, "arguments": args}}]}

def result_msg(name, result):
    return {"role": "tool", "content": json.dumps(result, ensure_ascii=False)}

CITIES = [("Berlin", 14, "cloudy"), ("Tokyo", 27, "sunny"), ("New York", 22, "rainy"),
          ("Munich", 11, "foggy"), ("Sydney", 19, "windy"), ("Hamburg", 13, "rainy"),
          ("Rome", 29, "sunny"), ("Oslo", 6, "snow")]
TZ = ["Europe/Berlin", "America/New_York", "Asia/Tokyo", "Australia/Sydney"]
LANGS = ["French", "Spanish", "German", "Japanese", "Italian"]
CURR = [("EUR", "USD", 1.09), ("USD", "EUR", 0.92), ("EUR", "GBP", 0.85), ("USD", "JPY", 149.3)]

def weather_conv():
    city, temp, cond = random.choice(CITIES)
    unit = random.choice(["celsius", "fahrenheit"])
    t = round(temp * 9 / 5 + 32) if unit == "fahrenheit" else temp
    return {
        "tools": pad_tools([TOOL_BY_NAME["get_weather"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"What's the weather like in {city}?"
             + (" In Fahrenheit." if unit == "fahrenheit" else "")},
            call_msg("get_weather", {"location": city, "unit": unit}),
            result_msg("get_weather", {"temperature": t, "condition": cond, "unit": unit}),
            {"role": "assistant", "content":
             f"It's currently {t}\u00b0{'F' if unit == 'fahrenheit' else 'C'} in {city} with {cond} conditions."},
        ],
    }

def time_conv():
    tz = random.choice(TZ)
    hh = random.randint(0, 23); mm = random.choice([0, 15, 30, 45])
    return {
        "tools": pad_tools([TOOL_BY_NAME["get_current_time"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"What time is it right now ({tz.split('/')[1].replace('_',' ')})?"},
            call_msg("get_current_time", {"timezone": tz}),
            result_msg("get_current_time", {"datetime": f"2026-08-24T{hh:02d}:{mm:02d}:00", "timezone": tz}),
            {"role": "assistant", "content": f"It's {hh:02d}:{mm:02d} in the {tz.split('/')[1].replace('_',' ')} timezone."},
        ],
    }

def calc_conv():
    a, b, c = random.randint(2, 40), random.randint(2, 30), random.randint(2, 12)
    expr = f"({a} + {b}) * {c}"
    val = (a + b) * c
    return {
        "tools": pad_tools([TOOL_BY_NAME["calculate"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Quick math check: what is {expr}?"},
            call_msg("calculate", {"expression": expr}),
            result_msg("calculate", {"result": val}),
            {"role": "assistant", "content": f"{expr} = {val}."},
        ],
    }

def search_conv():
    topics = [("population of Tokyo", "The population of Tokyo is about 37 million in the metro area."),
              ("height of Mount Everest", "Mount Everest is 8,849 meters tall."),
              ("inventor of the telephone", "Alexander Graham Bell patented the telephone in 1876.")]
    q, ans = random.choice(topics)
    return {
        "tools": pad_tools([TOOL_BY_NAME["search_web"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Look up: {q}."},
            call_msg("search_web", {"query": q, "max_results": 3}),
            result_msg("search_web", {"results": [{"snippet": ans}]}),
            {"role": "assistant", "content": ans},
        ],
    }

def calendar_conv():
    titles = ["Dentist appointment", "Team standup", "Project review", "Birthday dinner"]
    title = random.choice(titles)
    day = random.randint(1, 28); month = random.randint(9, 12)
    date = f"2026-{month:02d}-{day:02d}"
    hour = random.randint(8, 18); minute = random.choice([0, 30])
    dur = random.choice([30, 45, 60, 90])
    return {
        "tools": pad_tools([TOOL_BY_NAME["create_calendar_event"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Schedule '{title}' on {date} at {hour:02d}:{minute:02d} for {dur} minutes."},
            call_msg("create_calendar_event",
                     {"title": title, "date": date, "time": f"{hour:02d}:{minute:02d}",
                      "duration_minutes": dur}),
            result_msg("create_calendar_event", {"status": "created", "id": f"evt_{random.randint(1000,9999)}"}),
            {"role": "assistant", "content": f"Done \u2014 '{title}' is booked for {date} at {hour:02d}:{minute:02d} ({dur} min)."},
        ],
    }

def email_conv():
    people = ["anna@example.com", "bob@example.com", "team@example.com"]
    subj = ["Weekly report", "Meeting notes", "Invoice attached"]
    to, s = random.choice(people), random.choice(subj)
    body = f"Hi,\n\nHere are the {s.lower()}.\n\nBest"
    return {
        "tools": pad_tools([TOOL_BY_NAME["send_email"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Send an email to {to} with subject '{s}' saying the {s.lower()} is ready."},
            call_msg("send_email", {"to": to, "subject": s, "body": body}),
            result_msg("send_email", {"status": "sent", "message_id": f"m_{random.randint(10000,99999)}"}),
            {"role": "assistant", "content": f"Email sent to {to} with subject '{s}'."},
        ],
    }

def currency_conv():
    src, dst, rate = random.choice(CURR)
    amount = random.choice([50, 120, 250, 500, 1000])
    val = round(amount * rate, 2)
    return {
        "tools": pad_tools([TOOL_BY_NAME["convert_currency"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"How much is {amount} {src} in {dst}?"},
            call_msg("convert_currency", {"amount": amount, "from_currency": src, "to_currency": dst}),
            result_msg("convert_currency", {"converted": val, "rate": rate}),
            {"role": "assistant", "content": f"{amount} {src} equals about {val} {dst} (rate {rate})."},
        ],
    }

def file_conv():
    path = f"notes/idea_{random.randint(1,99)}.txt"
    content = random.choice(["Buy milk", "Call the bank", "Finish bachelor thesis chapter 3"])
    return {
        "tools": pad_tools([TOOL_BY_NAME["write_file"], TOOL_BY_NAME["read_file"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Save this note to {path}: \"{content}\""},
            call_msg("write_file", {"path": path, "content": content}),
            result_msg("write_file", {"status": "written", "bytes": len(content)}),
            {"role": "assistant", "content": f"Saved your note to {path}."},
        ],
    }

def translate_conv():
    lang = random.choice(LANGS)
    texts = [("Good morning", {"French": "Bonjour", "Spanish": "Buenos d\u00edas",
                               "German": "Guten Morgen", "Japanese": "\u304a\u306f\u3088\u3046\u3054\u3056\u3044\u307e\u3059",
                               "Italian": "Buongiorno"}),
             ("Thank you very much", {"French": "Merci beaucoup", "Spanish": "Muchas gracias",
                                      "German": "Vielen Dank", "Japanese": "\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059",
                                      "Italian": "Grazie mille"})]
    src, table = random.choice(texts)
    return {
        "tools": pad_tools([TOOL_BY_NAME["translate_text"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Translate \"{src}\" into {lang}."},
            call_msg("translate_text", {"text": src, "target_language": lang}),
            result_msg("translate_text", {"translation": table[lang]}),
            {"role": "assistant", "content": f"\"{src}\" in {lang} is: {table[lang]}"},
        ],
    }

def parallel_conv():
    c1, c2 = random.sample(CITIES, 2)
    return {
        "tools": pad_tools([TOOL_BY_NAME["get_weather"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Compare the weather in {c1[0]} and {c2[0]} right now."},
            call_msg("get_weather", {"location": c1[0], "unit": "celsius"}),
            # parallel: both calls in one turn
        ],
    }
# NOTE: proper parallel conv built below with two calls in one assistant turn
def parallel_conv_full():
    c1, c2 = random.sample(CITIES, 2)
    msgs = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"Compare the weather in {c1[0]} and {c2[0]} right now."},
        {"role": "assistant", "content": "",
         "tool_calls": [
             {"type": "function", "function": {"name": "get_weather",
                                               "arguments": {"location": c1[0], "unit": "celsius"}}},
             {"type": "function", "function": {"name": "get_weather",
                                               "arguments": {"location": c2[0], "unit": "celsius"}}},
         ]},
        result_msg("get_weather", {"temperature": c1[1], "condition": c1[2], "unit": "celsius"}),
        result_msg("get_weather", {"temperature": c2[1], "condition": c2[2], "unit": "celsius"}),
        {"role": "assistant", "content":
         f"Right now it's {c1[1]}\u00b0C and {c1[2]} in {c1[0]}, versus {c2[1]}\u00b0C and {c2[2]} in {c2[0]}."},
    ]
    return {"tools": pad_tools([TOOL_BY_NAME["get_weather"]]), "messages": msgs}

def sequential_conv():
    a, b = random.randint(3, 25), random.randint(3, 25)
    total = a * b
    eur = round(total / 1.09, 2)
    return {
        "tools": pad_tools([TOOL_BY_NAME["calculate"], TOOL_BY_NAME["convert_currency"]]),
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Compute {a} * {b}, then tell me that result in USD assuming it was EUR."},
            call_msg("calculate", {"expression": f"{a} * {b}"}),
            result_msg("calculate", {"result": total}),
            call_msg("convert_currency", {"amount": total, "from_currency": "EUR", "to_currency": "USD"}),
            result_msg("convert_currency", {"converted": round(total * 1.09, 2), "rate": 1.09}),
            {"role": "assistant", "content":
             f"{a} * {b} = {total}, which is about ${round(total * 1.09, 2)} USD."},
        ],
    }
_ = sequential_conv  # keep linters quiet; EUR->USD rate used above is illustrative

NO_TOOL = [
    ("Tell me a fun fact about octopuses.",
     "Octopuses have three hearts and blue blood \u2014 two hearts pump blood to the gills, one to the rest of the body."),
    ("What is the capital of Australia?",
     "The capital of Australia is Canberra \u2014 not Sydney or Melbourne, as commonly assumed."),
    ("How do I stay motivated while writing my thesis?",
     "Break it into small daily goals, write at the same time each day, and separate drafting from editing. Progress compounds faster than perfection."),
    ("Explain recursion in one sentence.",
     "Recursion is when a function solves a problem by calling itself on a smaller version of the same problem until it reaches a trivial base case."),
    ("What should I cook with eggs, rice and soy sauce?",
     "Fried rice! Scramble the eggs first, add cold cooked rice, splash of soy sauce, high heat, done in five minutes."),
    ("Who wrote the novel '1984'?",
     "'1984' was written by George Orwell and published in 1949."),
    ("What does HTTP stand for?",
     "HTTP stands for HyperText Transfer Protocol \u2014 the protocol browsers use to talk to web servers."),
    ("Give me a tip for better sleep.",
     "Keep a consistent wake-up time \u2014 it anchors your circadian rhythm more strongly than bedtime does."),
    ("Summarize the plot of Romeo and Juliet briefly.",
     "Two teenagers from feuding families fall in love, secretly marry, and a misunderstanding leads both to their deaths \u2014 ending the feud."),
    ("What's 15% of 200? You can do this mentally.",
     "15% of 200 is 30 \u2014 that's simple enough to do without any tools."),
    ("How many continents are there?",
     "There are seven continents: Africa, Antarctica, Asia, Australia, Europe, North America, and South America."),
    ("Recommend a book for beginners learning Python.",
     "'Automate the Boring Stuff with Python' by Al Sweigart \u2014 practical, free to read online, and project-driven."),
    ("Why is the sky blue?",
     "Rayleigh scattering: air molecules scatter shorter (blue) wavelengths of sunlight more strongly than longer (red) ones."),
    ("What's a good morning routine?",
     "Hydrate first, get sunlight within an hour of waking, avoid the phone for the first 30 minutes, then one small win like making your bed."),
    ("Translate nothing for me, just say hi!",
     "Hi there! How can I help you today?"),
    ("Is a tomato a fruit or a vegetable?",
     "Botanically a fruit (it grows from a flower and carries seeds), culinarily treated as a vegetable."),
    ("How do I reset a forgotten password safely?",
     "Use the service's official password-reset flow, check the sender domain for phishing, and store the new password in a password manager."),
    ("What year did the Berlin Wall fall?",
     "The Berlin Wall fell in 1989 \u2014 November 9th, to be exact."),
]

CLARIFY = [
    ("Book me a table.", "I'd be happy to help \u2014 could you tell me the restaurant, date, time and number of guests? (Note: I don't have a restaurant booking tool available.)"),
    ("What's the temperature?", "Which location would you like the temperature for?"),
    ("Send it to them.", "Could you give me the recipient's email address and what you'd like me to send?"),
    ("Remind me about that thing.", "Which reminder did you mean, and when should it fire?"),
    ("Convert this money.", "How much, and from which currency to which?"),
    ("Read the file.", "Which file path should I read?"),
    ("Set up my week.", "What events should I schedule? Please share titles, dates and times."),
    ("Translate it please.", "Sure \u2014 what text, and into which language?"),
]

def no_tool_conv():
    q, a = random.choice(NO_TOOL)
    # random-size block: decorrelates block size from "don't call"
    return {"tools": random.sample(TOOLS, random.randint(0, len(TOOLS))),
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": q},
                         {"role": "assistant", "content": a}]}

def clarify_conv():
    q, a = random.choice(CLARIFY)
    return {"tools": random.sample(TOOLS, random.randint(1, len(TOOLS))),
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": q},
                         {"role": "assistant", "content": a}]}

GENERATORS = [
    (weather_conv, 28), (time_conv, 14), (calc_conv, 14), (search_conv, 12),
    (calendar_conv, 16), (email_conv, 14), (currency_conv, 12),
    (file_conv, 10), (translate_conv, 10),
    (parallel_conv_full, 22), (sequential_conv, 22),
    (no_tool_conv, 120), (clarify_conv, 35),
]

def build(n_total):
    bag = []
    for gen, weight in GENERATORS:
        bag += [gen] * weight
    out = []
    seen = {}
    attempts = 0
    while len(out) < n_total and attempts < n_total * 50:
        attempts += 1
        row = random.choice(bag)()
        key = json.dumps(row["messages"], ensure_ascii=False)
        if seen.get(key, 0) >= 2:   # allow limited repeats for small template pools
            continue
        seen[key] = seen.get(key, 0) + 1
        out.append(row)
    return out

if __name__ == "__main__":
    train = build(260)
    val = build(26)
    (OUT / "tooluse_train.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in train), encoding="utf-8")
    (OUT / "tooluse_val.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in val), encoding="utf-8")
    print(f"train: {len(train)} rows -> {OUT/'tooluse_train.jsonl'}")
    print(f"val:   {len(val)} rows -> {OUT/'tooluse_val.jsonl'}")
