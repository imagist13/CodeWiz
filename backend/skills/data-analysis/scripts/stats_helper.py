#!/usr/bin/env python3
"""
数据分析辅助脚本：基础统计量计算
Usage: python stats_helper.py
"""
import json
import sys
from statistics import mean, median, stdev


def quick_stats(numbers: list) -> dict:
    if not numbers:
        return {"error": "Empty list"}
    return {
        "count": len(numbers),
        "mean": round(mean(numbers), 2),
        "median": round(median(numbers), 2),
        "std": round(stdev(numbers), 2) if len(numbers) > 1 else 0,
        "min": min(numbers),
        "max": max(numbers),
    }


if __name__ == "__main__":
    # 从 stdin 读取 JSON 数组
    try:
        data = json.load(sys.stdin)
        result = quick_stats(data)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
