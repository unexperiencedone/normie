from __future__ import annotations
import itertools
from backend.tools.fd.models import FD


def attribute_closure(attrs: set[str] | frozenset[str], fds: list[FD]) -> set[str]:
    """Compute the attribute closure of a given attribute set under functional dependencies F.
    Fixpoint algorithm: repeatedly add RHS of any FD whose LHS is subset of current closure."""
    closure = set(attrs)
    changed = True
    while changed:
        changed = False
        for fd in fds:
            if fd.lhs.issubset(closure) and not fd.rhs.issubset(closure):
                closure.update(fd.rhs)
                changed = True
    return closure


def is_superkey(attrs: set[str] | frozenset[str], table_attrs: set[str] | frozenset[str], fds: list[FD]) -> bool:
    """Check if attrs is a superkey for the table (closure contains all table_attrs)."""
    closure = attribute_closure(attrs, fds)
    return set(table_attrs).issubset(closure)


def candidate_keys(table_attrs: set[str] | frozenset[str], fds: list[FD]) -> list[frozenset[str]]:
    """Compute all minimal candidate keys for a given table schema and functional dependencies.
    Optimized algorithm:
      - Attributes that appear only on LHS or not in any FD must belong to every candidate key.
      - Attributes that appear only on RHS can never belong to any minimal candidate key.
      - Attributes that appear on both LHS and RHS (or neither) are searched systematically.
    """
    all_attrs = set(table_attrs)
    if not all_attrs:
        return []

    lhs_attrs: set[str] = set()
    rhs_attrs: set[str] = set()
    for fd in fds:
        lhs_attrs.update(fd.lhs.intersection(all_attrs))
        rhs_attrs.update(fd.rhs.intersection(all_attrs))

    # Essential attributes: must be in every key
    # (Attributes never appearing on RHS must be in all candidate keys)
    essential = all_attrs - rhs_attrs
    # Attributes that appear on both sides or middle attributes
    middle = (lhs_attrs.intersection(rhs_attrs)).intersection(all_attrs)

    # Check if essential attributes already form a candidate key
    if is_superkey(essential, all_attrs, fds):
        return [frozenset(essential)]

    keys: list[frozenset[str]] = []
    found_key_sizes: set[int] = set()

    # Search combinations of middle attributes added to essential
    middle_list = sorted(list(middle))
    for r in range(1, len(middle_list) + 1):
        # If we have keys of smaller size, we still might have keys of size r,
        # but we must prune supersets of existing keys
        for combo in itertools.combinations(middle_list, r):
            candidate = essential.union(combo)
            candidate_frozen = frozenset(candidate)

            # Pruning: if candidate is a superset of any already found key, skip
            if any(k.issubset(candidate_frozen) for k in keys):
                continue

            if is_superkey(candidate_frozen, all_attrs, fds):
                keys.append(candidate_frozen)

    # If no key found through middle (e.g., no FDs or empty middle), all_attrs is the only key
    if not keys:
        if is_superkey(essential, all_attrs, fds):
            keys.append(frozenset(essential))
        else:
            keys.append(frozenset(all_attrs))

    # Filter to only minimal keys (no proper subset is also in keys)
    minimal_keys: list[frozenset[str]] = []
    for k in keys:
        if not any(other < k for other in keys):
            if k not in minimal_keys:
                minimal_keys.append(k)

    return sorted(minimal_keys, key=lambda s: (len(s), sorted(list(s))))
