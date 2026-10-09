"""Translate excess ET0 (mm) into litres. All results are estimates."""
from .constants import KC_BAND, L_PER_MM_ACRE, LAKE_KC


def farmer_range(excess_mm, kc, acres=1.0):
    """[low, high] litres for `acres` of a crop: excess x Kc(+-10%) x 4047 x acres (rounded)."""
    base = excess_mm * kc * L_PER_MM_ACRE * acres
    return [int(round(base * (1 - KC_BAND))), int(round(base * (1 + KC_BAND)))]


def reference_litres_per_acre(excess_mm):
    """Reference-crop (Kc = 1) demand per acre: excess x 4047."""
    return int(round(excess_mm * L_PER_MM_ACRE))


def lake_litres(excess_mm, area_m2, kc=LAKE_KC):
    """Extra open-water evaporation: excess x 1.05 x area_m2 litres (1 mm over 1 m2 = 1 L)."""
    if area_m2 in (None, 0):
        return {"value": None, "label": "estimate", "note": "area not verified"}
    return {"value": int(round(excess_mm * kc * area_m2)), "label": "estimate"}
