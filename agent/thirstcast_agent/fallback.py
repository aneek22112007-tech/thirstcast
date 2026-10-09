"""Template advisory (non-LLM mode). Every number is filled from tool output; nothing is invented.
Used when MODEL_PROVIDER=none, ASK_MODE=template, or the LLM errors / times out."""
from thirstcast_core.constants import CAVEAT

from . import tools
from .lang import (CROP_NAMES_HI, DISTRICT_NAMES, DISTRICT_NAMES_HI, detect_lang, find_acres, find_crop,
                   find_district, find_intent, mentions_crisis, mentions_other_place)

SAFE_FRAMING = {
    "en": ("Bengaluru's 2024 water crisis was mainly a supply failure (poor 2023 monsoon, failing borewells, Cauvery "
           "shortfalls). ThirstCast does not claim thirstwaves caused it; it shows the demand side: how much faster the "
           "air pulls water out."),
    "hi": ("बेंगलुरु का 2024 जल संकट मुख्य रूप से आपूर्ति की कमी थी (2023 का कमज़ोर मानसून, सूखते बोरवेल, कावेरी में कमी). "
           "ThirstCast यह दावा नहीं करता कि थर्स्टवेव इसकी वजह थी; यह मांग वाला पक्ष दिखाता है."),
}
LABEL = {"en": "Template advisory (non-LLM mode)", "hi": "टेम्पलेट सलाह (नॉन-LLM मोड)"}
ASK_CAVEAT = f"Estimates only. {CAVEAT}"
STATUS_HI = {"ACTIVE": "सक्रिय थर्स्टवेव", "WATCH": "निगरानी (WATCH)", "NONE": "कोई संकेत नहीं"}


def _n(x):
    """Indian digit grouping, e.g. 1,23,456."""
    x = int(round(x))
    s = str(abs(x))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return ("-" if x < 0 else "") + s


def _crop_lines(st, lang):
    out = []
    for crop, (lo, hi) in (st.get("extra_litres_per_acre") or {}).items():
        if lang == "hi":
            out.append(f"{CROP_NAMES_HI.get(crop, crop)}: लगभग {_n(lo)}–{_n(hi)} लीटर प्रति एकड़ (अनुमान)")
        else:
            out.append(f"{crop}: about {_n(lo)}–{_n(hi)} L per acre (estimate)")
    return out


def _lake_lines(st, lang):
    out = []
    for lake, v in (st.get("extra_litres_lakes") or {}).items():
        if v and v.get("value"):
            out.append(f"{lake}: लगभग {_n(v['value'])} लीटर (अनुमान, ऊपरी सीमा)" if lang == "hi"
                       else f"{lake}: about {_n(v['value'])} L (estimate, upper bound)")
    return out


def _wave_text(st, lang):
    w = st.get("forecast_wave")
    if not w or w.get("ongoing"):
        return ""
    if lang == "hi":
        return f" पूर्वानुमान में {w['start']} से {w['end']} तक {w['days']} दिन की थर्स्टवेव दिख रही है (संभावना, निश्चित नहीं)."
    return f" The forecast shows a possible {w['days']}-day thirstwave from {w['start']} to {w['end']} (likely, not certain)."


def status_answer(st, lang):
    d = st["district"]
    name = DISTRICT_NAMES_HI[d] if lang == "hi" else DISTRICT_NAMES[d]
    ex = float(st.get("excess_mm_7d") or 0)
    s = st["status"]
    if lang == "hi":
        if s == "ACTIVE":
            head = f"{name} में अभी थर्स्टवेव चल रही है (लगातार {st['day_in_wave']}वां दिन): हवा सामान्य से कहीं ज़्यादा पानी खींच रही है."
        elif s == "WATCH":
            head = f"{name}: अगले 7 दिनों में कुछ दिन वाष्पीकरण की मांग अपने स्थानीय 90वें प्रतिशतक से ऊपर रहने का अनुमान है (WATCH)."
        else:
            head = f"{name}: अगले 7 दिनों में थर्स्टवेव का कोई संकेत नहीं है."
        body = head + _wave_text(st, lang) + f" 7 दिन का अतिरिक्त ET0: {ex:.1f} मिमी (स्थानीय p90 सीमा से ऊपर का कुल योग)."
        lines = _crop_lines(st, lang) + _lake_lines(st, lang)
        if lines and ex > 0:
            body += " अतिरिक्त पानी: " + "; ".join(lines) + "."
    else:
        if s == "ACTIVE":
            head = f"{name} is in a thirstwave now (day {st['day_in_wave']}): the air is pulling water out much faster than usual."
        elif s == "WATCH":
            head = f"{name} is on WATCH: some of the next 7 days are forecast to have evaporative demand above the local 90th percentile."
        else:
            head = f"{name}: no thirstwave signal in the next 7 days."
        body = head + _wave_text(st, lang) + (f" Excess ET0 over the 7 days: {ex:.1f} mm (sum of daily ET0 above the local "
                                              f"day-of-year p90).")
        lines = _crop_lines(st, lang) + _lake_lines(st, lang)
        if lines and ex > 0:
            body += " Extra water: " + "; ".join(lines) + "."
    if st.get("bias_note"):
        body += (" नोट: पूर्वानुमान में बड़ा बायस सुधार किया गया है." if lang == "hi" else " Note: " + st["bias_note"])
    return body


def water_gap_answer(g, lang):
    d = g["district"]
    lo, hi = g["extra_litres_range"]
    if hi == 0:
        if lang == "hi":
            return (f"{DISTRICT_NAMES_HI[d]} में अगले 7 दिनों में ET0 अपनी स्थानीय p90 सीमा से ऊपर जाने का अनुमान नहीं है, इसलिए "
                    f"{CROP_NAMES_HI.get(g['crop'], g['crop'])} के लिए सामान्य से अतिरिक्त पानी का कोई अनुमान नहीं है (अतिरिक्त ET0 0 मिमी).")
        return (f"In {DISTRICT_NAMES[d]}, ET0 is not forecast to go above its local p90 in the next 7 days, so no extra water "
                f"beyond normal needs is estimated for {g['crop']} (excess ET0 0 mm).")
    if lang == "hi":
        return (f"{DISTRICT_NAMES_HI[d]} में {g['acres']:g} एकड़ {CROP_NAMES_HI.get(g['crop'], g['crop'])} को अगले 7 दिनों में "
                f"सामान्य से लगभग {_n(lo)}–{_n(hi)} लीटर अतिरिक्त पानी चाहिए हो सकता है (अनुमान; अतिरिक्त ET0 {g['excess_mm_7d']:.1f} मिमी, "
                f"Kc {g['kc']} ±10%).")
    return (f"{g['acres']:g} acre(s) of {g['crop']} in {DISTRICT_NAMES[d]} may need about {_n(lo)}–{_n(hi)} litres of extra "
            f"water over the next 7 days (estimate; excess ET0 {g['excess_mm_7d']:.1f} mm, Kc {g['kc']} ±10%).")


def heat_answer(h, lang):
    d = h["district"]
    t, x, b = h["thirst_only_days"], h["heat_only_days"], h["both_days"]
    if lang == "hi":
        return (f"{DISTRICT_NAMES_HI[d]}, अगले 7 दिन: {b} दिन गर्मी और प्यास दोनों अपने p90 से ऊपर, {t} दिन सिर्फ़ प्यास (ET0) "
                f"और {x} दिन सिर्फ़ गर्मी (Tmax) ऊपर रहने का अनुमान है. प्यास वाले दिनों में तापमान अलर्ट अकेले पूरी तस्वीर नहीं दिखाते.")
    return (f"{DISTRICT_NAMES[d]}, next 7 days: {b} day(s) are forecast to be both hot and thirsty (above their own p90), "
            f"{t} thirsty only (ET0) and {x} hot only (Tmax). On thirst-only days a temperature alert alone would not show the "
            f"extra water demand.")


def lakes_answer(st, lang):
    lines = _lake_lines(st, lang)
    name = DISTRICT_NAMES_HI[st["district"]] if lang == "hi" else DISTRICT_NAMES[st["district"]]
    if not lines:
        return (f"{name} के लिए झील/जलाशय का सत्यापित अनुमान उपलब्ध नहीं है." if lang == "hi"
                else f"No verified lake or reservoir estimate is available for {name}.")
    ex = float(st.get("excess_mm_7d") or 0)
    if lang == "hi":
        return f"{name}, अगले 7 दिनों में अतिरिक्त वाष्पीकरण ({ex:.1f} मिमी अतिरिक्त ET0 पर): " + "; ".join(lines) + "."
    return f"{name}, extra evaporation over the next 7 days (from {ex:.1f} mm excess ET0): " + "; ".join(lines) + "."


def unknown_district(lang):
    return ("ThirstCast अभी सिर्फ़ तीन ज़िले कवर करता है: बेंगलुरु अर्बन, कोलार और मंड्या. कृपया इनमें से एक ज़िला पूछें."
            if lang == "hi" else
            "ThirstCast currently covers three districts only: Bengaluru Urban, Kolar and Mandya. Please ask about one of them.")


def general_help(lang):
    if lang == "hi":
        return ("थर्स्टवेव का मतलब है लगातार 3 या ज़्यादा दिन जब हवा की पानी खींचने की क्षमता (ET0) अपने स्थानीय 90वें प्रतिशतक से ऊपर हो. "
                "ThirstCast बेंगलुरु अर्बन, कोलार और मंड्या के लिए अगले 7 दिनों का अनुमान देता है. किसी ज़िले के बारे में पूछें, "
                "जैसे: \"क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?\"")
    return ("A thirstwave is 3 or more consecutive days when evaporative demand (ET0) is above its local 90th percentile. "
            "ThirstCast gives a 7-day outlook for Bengaluru Urban, Kolar and Mandya. Ask about one of them, for example: "
            "\"Will Mandya face a thirstwave this week?\"")


def no_data(district, lang):
    name = DISTRICT_NAMES_HI.get(district, district) if lang == "hi" else DISTRICT_NAMES.get(district, district)
    return (f"{name} के लिए अभी पूर्वानुमान डेटा उपलब्ध नहीं है (डिटेक्टर अभी नहीं चला). कृपया बाद में फिर पूछें."
            if lang == "hi" else
            f"No forecast data is available for {name} yet (the detector has not run). Please try again later.")


def answer(question, district=None, repo=None, lang=None):
    """Return the /ask response dict in template mode."""
    if repo is not None:
        tools.set_repo(repo)
    lang = lang or detect_lang(question)
    used = []
    token = tools.TOOLS_USED.set(used)
    try:
        did = district if district in DISTRICT_NAMES else find_district(question)
        if did is None:
            text = unknown_district(lang) if (district or mentions_other_place(question)) else general_help(lang)
            return _resp(text, lang, used, None)
        intent = find_intent(question)
        st = tools.status_data(did)
        if "error" in st:
            return _resp(no_data(did, lang), lang, used, did)
        full = tools._repo.get_status(did)
        if intent == "water_gap":
            crop = find_crop(question) or ((full.get("extra_litres_per_acre") or {}) and next(iter(full["extra_litres_per_acre"]))) or "paddy"
            g = tools.water_gap_data(did, crop, find_acres(question))
            text = water_gap_answer(g, lang) if "error" not in g else status_answer(full, lang)
        elif intent == "heat":
            text = heat_answer(tools.heat_compare_data(did), lang)
        elif intent == "lakes":
            text = lakes_answer(full, lang)
        else:
            tools.forecast_data(did)
            text = status_answer(full, lang)
        if mentions_crisis(question):
            text = (SAFE_FRAMING[lang] + " " + text)
        return _resp(text, lang, used, did)
    finally:
        tools.TOOLS_USED.reset(token)


def _resp(text, lang, used, district):
    return {"answer": f"{text}\n\n[{LABEL[lang]}]", "lang": lang, "mode": "template", "tools_used": list(used),
            "district": district, "caveat": ASK_CAVEAT}
