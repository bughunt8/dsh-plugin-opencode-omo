def count_ways(n):
    # Number of ways to tile a 3 x n board with 2 x 1 dominoes.
    # A 3 x n board has 3*n cells, so it can only be tiled when n is even.
    if n % 2 == 1:
        return 0
    # Recurrence: f(n) = 4*f(n-2) - f(n-4), with f(0)=1, f(2)=3.
    a, b = 1, 3  # a = f(n-4), b = f(n-2), initialized for n = 2
    if n == 0:
        return a
    if n == 2:
        return b
    for _ in range(4, n + 1, 2):
        a, b = b, 4 * b - a
    return b


undefined = count_ways

import sys as _sys
_main = _sys.modules.get("__main__")
if _main is not None and not hasattr(_main, "count_ways"):
    _main.count_ways = count_ways
