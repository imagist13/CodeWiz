#!/usr/bin/env python3
"""
代码审查辅助脚本：基础 lint 检查
Usage: python lint_checker.py <file_path>
"""
import sys
import ast


def check_syntax(file_path: str) -> list:
    issues = []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            source = f.read()
        ast.parse(source)
    except SyntaxError as e:
        issues.append(f"SyntaxError at line {e.lineno}: {e.msg}")
    except Exception as e:
        issues.append(f"Read error: {e}")
    return issues


def check_naming(source: str) -> list:
    issues = []
    lines = source.split("\n")
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("def ") and "_" not in stripped[4:stripped.find("(")].strip():
            func_name = stripped[4:stripped.find("(")].strip()
            if len(func_name) < 4:
                issues.append(f"Line {i}: Function '{func_name}' name too short or lacks underscores")
    return issues


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python lint_checker.py <file_path>")
        sys.exit(1)

    path = sys.argv[1]
    all_issues = check_syntax(path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
        all_issues.extend(check_naming(src))
    except Exception as e:
        all_issues.append(str(e))

    if all_issues:
        print("Issues found:")
        for issue in all_issues:
            print(f"  - {issue}")
    else:
        print("No basic issues found.")
