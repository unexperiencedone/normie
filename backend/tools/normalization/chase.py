from __future__ import annotations
from typing import Any
from backend.tools.fd.models import FD


def is_lossless(
    original_attrs: set[str] | frozenset[str],
    parts: list[set[str] | frozenset[str]],
    fds: list[FD],
) -> tuple[bool, list[list[str]], list[str]]:
    """Test if a decomposition R = R1 U R2 U ... U Rm is a Lossless-Join Decomposition
    using the formal Chase Algorithm.

    Returns:
      (is_lossless: bool, final_tableau: list[list[str]], attribute_order: list[str])
    """
    attr_list = sorted(list(original_attrs))
    attr_idx = {attr: idx for idx, attr in enumerate(attr_list)}
    m = len(parts)
    n = len(attr_list)

    # Initialize tableau
    # Rows: 0..m-1 corresponding to relations R1..Rm
    # Columns: 0..n-1 corresponding to attributes
    tableau: list[list[str]] = []
    for i, part in enumerate(parts):
        row: list[str] = []
        for j, attr in enumerate(attr_list):
            if attr in part:
                row.append(f"a_{j + 1}")
            else:
                row.append(f"b_{i + 1}_{j + 1}")
        tableau.append(row)

    # Iteratively apply functional dependencies
    changed = True
    while changed:
        changed = False
        for fd in fds:
            # Map LHS and RHS attributes to indices within the original attributes
            lhs_indices = [attr_idx[attr] for attr in fd.lhs if attr in attr_idx]
            rhs_indices = [attr_idx[attr] for attr in fd.rhs if attr in attr_idx]

            if not lhs_indices or not rhs_indices:
                continue

            # Group rows that have identical values for all attributes in LHS
            row_groups: dict[tuple[str, ...], list[int]] = {}
            for r in range(m):
                key = tuple(tableau[r][col] for col in lhs_indices)
                row_groups.setdefault(key, []).append(r)

            # For each group with more than 1 row, equate RHS symbols
            for group_rows in row_groups.values():
                if len(group_rows) <= 1:
                    continue

                for col in rhs_indices:
                    symbols = [tableau[r][col] for r in group_rows]
                    # If any symbol is a distinguishing 'a_k' symbol, preferred
                    a_symbol = next((s for s in symbols if s.startswith("a_")), None)
                    target = a_symbol if a_symbol is not None else min(symbols)

                    for r in group_rows:
                        if tableau[r][col] != target:
                            tableau[r][col] = target
                            changed = True

    # Check if any row contains all 'a' symbols
    lossless = False
    for r in range(m):
        if all(tableau[r][j] == f"a_{j + 1}" for j in range(n)):
            lossless = True
            break

    return lossless, tableau, attr_list
