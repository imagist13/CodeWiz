---
name: code-review
description: 当用户需要代码审查、code review、找bug、优化代码、代码质量分析时使用。支持Python/JS/Java，能输出审查报告和修复方案。
---

# 技能名称：代码审查专家

## When to Use

用户请求包含：代码审查、code review、找bug、优化代码、代码质量分析、重构建议等。

## How It Works

1) 接收用户代码 + 语言说明
2) 检查语法错误、安全漏洞、性能瓶颈、可读性问题
3) 输出：问题清单 + 严重等级（Critical/Warning/Info）+ 修复建议
4) 可选：直接给出修改后的代码

## Examples

### 输入
帮我审查这段 Python 代码：
```python
def calc(a,b): return a/b
```

### 输出
**问题清单：**
- [Critical] 除零错误：未处理 `b == 0` 的情况
- [Warning] 无类型检查：参数 `a`, `b` 未声明类型
- [Info] 命名不规范：函数名 `calc` 过于简略

**修复建议：**
```python
from typing import Union

def divide(a: Union[int, float], b: Union[int, float]) -> float:
    if b == 0:
        raise ValueError("Divisor cannot be zero")
    return a / b
```

## Anti-Patterns

- 不做架构设计评审，只做代码级审查
- 不审查非编程内容（文案、需求文档、配置说明）
- 不提供与代码无关的通用建议
