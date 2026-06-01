"""Patch Python files to add future annotations for 3.9 compatibility."""
import os
import re

root = os.path.dirname(os.path.abspath(__file__))

for dirpath, _, filenames in os.walk(root):
    for fname in filenames:
        if not fname.endswith('.py'):
            continue
        fpath = os.path.join(dirpath, fname)
        with open(fpath, encoding='utf-8') as f:
            content = f.read()
        if 'from __future__ import annotations' in content:
            continue
        # Check if file starts with a comment
        lines = content.split('\n')
        if lines and lines[0].startswith('#!'):
            # Shebang line
            new_content = lines[0] + '\nfrom __future__ import annotations\n\n' + '\n'.join(lines[1:])
        elif lines and lines[0].startswith('#'):
            new_content = 'from __future__ import annotations\n\n' + content
        else:
            new_content = 'from __future__ import annotations\n\n' + content

        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'patched: {os.path.relpath(fpath, root)}')
