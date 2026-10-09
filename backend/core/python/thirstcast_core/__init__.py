"""thirstcast_core: pure-Python thirstwave logic shared by the data scripts, the Lambdas
and the agent. No boto3 / AWS imports anywhere in this package."""
from .constants import CAVEAT, L_PER_MM_ACRE, LAKE_KC  # noqa: F401

__version__ = "1.0.0"
