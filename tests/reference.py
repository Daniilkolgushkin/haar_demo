"""Independent recursive double-precision Haar reference (no production dependency)."""
import math
import random
import subprocess
import sys

def haar(x):
    if len(x) == 1:
        return x
    averages = [(a+b)/math.sqrt(2) for a,b in zip(x[::2],x[1::2])]
    details = [(a-b)/math.sqrt(2) for a,b in zip(x[::2],x[1::2])]
    return haar(averages) + details

rng = random.Random(123)
for n in [1, 2, 4, 8, 1024]:
    x = [rng.uniform(-1,1) for _ in range(n)]
    got = list(map(float, subprocess.check_output([sys.argv[1], '--transform'], input=' '.join(map(str,x)), text=True).split()))
    assert len(got) == n
    assert max(abs(a-b) for a,b in zip(got,haar(x))) < 1e-5
print('Independent Python reference: 5 dyadic vectors passed')
