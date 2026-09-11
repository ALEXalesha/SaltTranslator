import os
import sys
from pathlib import Path

from hypothesis import HealthCheck, settings

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

settings.register_profile("quick", max_examples=300, deadline=None)
settings.register_profile(
    "huge", max_examples=20_000, deadline=None, suppress_health_check=[HealthCheck.too_slow]
)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "quick"))
