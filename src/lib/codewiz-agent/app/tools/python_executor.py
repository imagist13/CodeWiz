import io
import json
import sys
from typing import Any, Dict


# Modules that dynamic code is allowed to import
_ALLOWED_MODULES = {
    "math", "json", "random", "datetime", "re", "hashlib",
    "itertools", "collections", "string", "time", "statistics",
    "typing", "fractions", "decimal", "uuid",
}


def _safe_import(name, *args, **kwargs):
    if name.split(".")[0] in _ALLOWED_MODULES:
        return __import__(name, *args, **kwargs)
    raise ImportError(f"Module '{name}' is not allowed in sandbox")


def _get_safe_globals():
    import math
    import random
    import datetime
    import re
    import hashlib
    import itertools
    import collections
    import string
    import time
    import statistics
    import uuid

    safe_builtins = {
        "True": True, "False": False, "None": None,
        "abs": abs, "all": all, "any": any, "ascii": ascii,
        "bin": bin, "bool": bool, "bytearray": bytearray, "bytes": bytes,
        "chr": chr, "complex": complex, "dict": dict, "dir": dir,
        "divmod": divmod, "enumerate": enumerate, "filter": filter,
        "float": float, "format": format, "frozenset": frozenset,
        "hasattr": hasattr, "hash": hash, "hex": hex,
        "int": int, "isinstance": isinstance, "issubclass": issubclass,
        "iter": iter, "len": len, "list": list, "map": map,
        "max": max, "memoryview": memoryview, "min": min, "next": next,
        "object": object, "oct": oct, "ord": ord, "pow": pow,
        "range": range, "repr": repr, "reversed": reversed,
        "round": round, "set": set, "slice": slice, "sorted": sorted,
        "str": str, "sum": sum, "tuple": tuple, "type": type,
        "vars": vars, "zip": zip, "callable": callable,
        # safe import wrapper
        "__import__": _safe_import,
        # disallow dangerous builtins
        "open": None, "eval": None, "exec": None, "compile": None,
        "input": None, "exit": None, "quit": None,
    }

    return {
        "__builtins__": safe_builtins,
        "math": math,
        "json": json,
        "random": random,
        "datetime": datetime,
        "re": re,
        "hashlib": hashlib,
        "itertools": itertools,
        "collections": collections,
        "string": string,
        "time": time,
        "statistics": statistics,
        "uuid": uuid,
    }


