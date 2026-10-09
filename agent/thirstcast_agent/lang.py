"""Language, district, crop and number detection for questions (English + Hindi)."""
import re

DEVANAGARI = re.compile(r"[\u0900-\u097F]")

DISTRICT_ALIASES = {
    "Bengaluru_Urban": ["bengaluru urban", "bengaluru", "bangalore urban", "bangalore", "blr",
                        "बेंगलुरु", "बेंगलूरु", "बेंगलोर", "बैंगलोर", "बंगलौर", "बेंगलुरू", "ಬೆಂಗಳೂರು",
                        "bellandur", "varthur", "बेलंदूर", "वरथुर"],
    "Kolar": ["kolar", "कोलार", "ಕೋಲಾರ"],
    "Mandya": ["mandya", "मंड्या", "मांड्या", "मंडया", "ಮಂಡ್ಯ", "krs", "krishna raja sagara", "kaveri", "cauvery"],
}
DISTRICT_NAMES = {"Bengaluru_Urban": "Bengaluru Urban", "Kolar": "Kolar", "Mandya": "Mandya"}
DISTRICT_NAMES_HI = {"Bengaluru_Urban": "बेंगलुरु अर्बन", "Kolar": "कोलार", "Mandya": "मंड्या"}

CROP_ALIASES = {
    "paddy": ["paddy", "rice", "धान", "चावल"],
    "sugarcane": ["sugarcane", "sugar cane", "cane", "गन्ना", "गन्ने"],
    "tomato": ["tomato", "tomatoes", "टमाटर"],
    "ragi": ["ragi", "finger millet", "millet", "रागी", "मड़ुआ", "मंडुआ"],
}
CROP_NAMES_HI = {"paddy": "धान", "sugarcane": "गन्ना", "tomato": "टमाटर", "ragi": "रागी"}

# words that suggest which tool/intent the user wants
INTENTS = {  # checked in this order
    "lakes": ["lake", "lakes", "reservoir", "krs", "bellandur", "varthur", "झील", "जलाशय", "बांध"],
    "water_gap": ["acre", "acres", "litre", "liter", "litres", "liters", "how much water", "extra water",
                  "irrigat", "एकड़", "एकड", "लीटर", "कितना पानी", "अतिरिक्त पानी", "सिंचाई"],
    "heat": ["hot", "heat", "temperature", "tmax", "garmi", "गर्मी", "गरम", "तापमान", "लू"],
}

DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def detect_lang(text):
    return "hi" if DEVANAGARI.search(text or "") else "en"


def _norm(text):
    return (text or "").lower().translate(DEV_DIGITS)


def find_district(text):
    t = _norm(text)
    best = None
    for did, aliases in DISTRICT_ALIASES.items():
        for a in aliases:
            i = t.find(a.lower())
            if i >= 0 and (best is None or i < best[0]):
                best = (i, did)
    return best[1] if best else None


def mentions_other_place(text):
    """True if the question names a place that looks like a district we do not cover (very rough)."""
    t = _norm(text)
    others = ["mysuru", "mysore", "tumkur", "tumakuru", "hassan", "delhi", "mumbai", "chennai", "pune", "hyderabad",
              "मैसूर", "दिल्ली", "मुंबई", "चेन्नई", "पुणे", "हैदराबाद", "तुमकुर"]
    return any(o in t for o in others)


def find_crop(text):
    t = _norm(text)
    for crop, aliases in CROP_ALIASES.items():
        if any(a in t for a in aliases):
            return crop
    return None


def find_acres(text, default=1.0):
    t = _norm(text)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:acre|acres|एकड़|एकड)", t)
    if m:
        return float(m.group(1))
    return default


CRISIS_WORDS = ["crisis", "cause", "caused", "shortage", "संकट", "कारण", "किल्लत"]


def mentions_crisis(text):
    t = _norm(text)
    return any(w in t for w in CRISIS_WORDS)


def find_intent(text):
    t = _norm(text)
    for name, words in INTENTS.items():
        if any(w in t for w in words):
            return name
    return "status"
