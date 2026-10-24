#!/usr/bin/env python3
"""Check a translation against en.ts: same keys in the same order, the same {placeholders} in each
string, one entry per line, and for Russian the extra plural forms (.few, .many) next to each .one.

Usage: python3 scripts/check-messages.py ru   (from app/)
"""
import re, sys, pathlib

DIR = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'i18n' / 'messages'
ENTRY = re.compile(r"""^  '([^']+)': (["'])(.*)\2,\s*$""")
PH = re.compile(r"\{(\w+)\}")
EXTRA_PLURALS = {'ru': ['few', 'many']}

def entries(path):
    out, bad = [], []
    for i, line in enumerate(path.read_text().split('\n'), 1):
        if line.startswith("  '"):
            m = ENTRY.match(line)
            if m: out.append((m.group(1), m.group(3)))
            else: bad.append((i, line[:80]))
    return out, bad

def main(code):
    en, _ = entries(DIR / 'en.ts')
    tr, bad = entries(DIR / f'{code}.ts')
    problems = [f'line {i}: not a one-line entry: {l}' for i, l in bad]
    extra = EXTRA_PLURALS.get(code, [])
    want = []
    for k, v in en:
        want.append((k, v))
        if k.endswith('.one'):
            want += [(k[:-4] + '.' + f, None) for f in extra]
    have = dict(tr)
    keys_tr = [k for k, _ in tr]
    keys_want = [k for k, _ in want]
    missing = [k for k in keys_want if k not in have]
    unknown = [k for k in keys_tr if k not in set(keys_want)]
    dupes = sorted({k for k in keys_tr if keys_tr.count(k) > 1})
    problems += [f'missing: {k}' for k in missing] + [f'not in en.ts: {k}' for k in unknown] + [f'duplicate: {k}' for k in dupes]
    if not missing and not unknown and keys_tr != keys_want:
        problems.append('keys are not in the same order as en.ts')
    en_d = dict(en)
    for k, v in tr:
        ref = en_d.get(k) or en_d.get(re.sub(r'\.(few|many)$', '.other', k))
        if ref is None: continue
        if set(PH.findall(v)) != set(PH.findall(ref)):
            problems.append(f'placeholders differ in {k}: en {sorted(set(PH.findall(ref)))} vs {sorted(set(PH.findall(v)))}')
        if v.strip() == '' and ref.strip() != '':
            problems.append(f'empty: {k}')
    print(f'{code}: {len(tr)} entries, {len(problems)} problems')
    for p in problems[:200]: print(' ', p)
    return 1 if problems else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
