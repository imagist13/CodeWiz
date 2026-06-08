---
name: data-analysis
description: 当用户需要数据分析、数据处理、统计计算、CSV处理、图表建议、数据清洗时使用。支持Python pandas风格分析思路。
---

# 技能名称：数据分析助手

## When to Use

用户请求包含：数据分析、数据处理、统计计算、CSV处理、图表建议、数据清洗、异常值检测、趋势分析等。

## How It Works

1) 接收用户的数据描述或数据样本
2) 分析数据结构、类型、分布特征
3) 给出清洗建议、分析方法、可视化方案
4) 输出：分析步骤 + 代码示例 + 结果解读

## Examples

### 输入
帮我分析这个销售数据，找出月度趋势：
```csv
date,amount
2024-01,1200
2024-02,1500
2024-03,1100
2024-04,1800
```

### 输出
**数据结构分析：**
- date: 日期型，4个月数据
- amount: 数值型，范围 1100-1800

**趋势分析：**
- 整体呈上升趋势，3月有回落
- 4月达到峰值 1800，环比增长 63.6%

**建议代码：**
```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("sales.csv", parse_dates=["date"])
df.set_index("date")["amount"].plot(title="Monthly Sales Trend")
plt.show()
```

## Anti-Patterns

- 不处理用户隐私敏感数据（如身份证号、手机号）
- 不执行实际的数据库查询或文件删除操作
- 不提供与数据分析无关的编程帮助
