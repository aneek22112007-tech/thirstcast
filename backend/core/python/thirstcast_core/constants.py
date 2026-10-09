"""Constants and labels used everywhere (one place, so UI/API/agent stay consistent)."""

# 1 mm of water over 1 acre (4,046.86 m2) is about 4,047 litres; 1 mm over 1 m2 = 1 L.
L_PER_MM_ACRE = 4047
# Open-water coefficient for lakes / reservoirs (source plan: ~1.05).
LAKE_KC = 1.05
# Kc uncertainty band for farmer ranges.
KC_BAND = 0.10
# Thirstwave = run of at least this many consecutive flagged days.
MIN_RUN = 3
FORECAST_DAYS = 7

CAVEAT = "District-centroid estimate (~10 km grid)"
CUM_EXCESS_DEFINITION = "Sum of daily ET0 above the local day-of-year p90 threshold"
DISTRICT_IDS = ("Bengaluru_Urban", "Kolar", "Mandya")
