from __future__ import annotations

"""Run Hermes backend as standalone server."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import run

if __name__ == '__main__':
    run()
