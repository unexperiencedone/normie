from __future__ import annotations
from backend.tools.fd.closure import attribute_closure, candidate_keys, is_superkey
from backend.tools.fd.cover import minimal_cover
from backend.tools.fd.models import FD
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.models import NF


def decompose_3nf(table_attrs: set[str] | frozenset[str], fds: list[FD]) -> list[set[str]]:
    """Synthesize a 3NF lossless, dependency-preserving relational decomposition
    using Bernstein's 3NF Synthesis Algorithm.

    Steps:
      1. Find minimal cover G of F.
      2. For each unique LHS in G, create relation R = LHS U (all RHS attributes for that LHS).
      3. Check if at least one relation contains a candidate key of the original schema.
         If not, create a relation containing one candidate key.
      4. Eliminate any relation Ri that is a subset of another relation Rj.
    """
    attrs = set(table_attrs)
    min_cover = minimal_cover(fds)

    # Group FDs by LHS
    grouped: dict[frozenset[str], set[str]] = {}
    for fd in min_cover:
        # only consider attributes in this table
        lhs = fd.lhs.intersection(attrs)
        rhs = fd.rhs.intersection(attrs)
        if lhs and rhs:
            grouped.setdefault(lhs, set()).update(rhs)

    relations: list[set[str]] = []
    for lhs, rhs in grouped.items():
        relations.append(set(lhs).union(rhs))

    # Check candidate key inclusion
    keys = candidate_keys(attrs, fds)
    has_key = False
    for r in relations:
        if any(k.issubset(r) for k in keys):
            has_key = True
            break

    if not has_key and keys:
        relations.append(set(keys[0]))
    elif not relations:
        relations.append(set(attrs))

    # Eliminate subset relations
    pruned: list[set[str]] = []
    for i, r1 in enumerate(relations):
        is_subset = False
        for j, r2 in enumerate(relations):
            if i != j and r1 < r2:
                is_subset = True
                break
        if not is_subset and r1 not in pruned:
            pruned.append(r1)

    return sorted(pruned, key=lambda s: sorted(list(s)))


def decompose_bcnf(table_attrs: set[str] | frozenset[str], fds: list[FD]) -> list[set[str]]:
    """Decompose a relation schema into BCNF relations using recursive splitting on violating FDs.
    Guaranteed to produce a lossless-join decomposition."""
    attrs = set(table_attrs)

    def _recursive_bcnf(current_attrs: set[str]) -> list[set[str]]:
        if len(current_attrs) <= 2:
            return [current_attrs]

        # Check for BCNF violation in current_attrs
        violating_fd: FD | None = None
        for fd in fds:
            lhs_in = fd.lhs.intersection(current_attrs)
            rhs_in = (fd.rhs.intersection(current_attrs)) - lhs_in

            if lhs_in and rhs_in:
                # Check if lhs_in is a superkey of current_attrs
                closure = attribute_closure(lhs_in, fds)
                if not current_attrs.issubset(closure):
                    violating_fd = FD(lhs_in, rhs_in)
                    break

        if violating_fd is None:
            return [current_attrs]

        # Decompose using violating_fd: X -> Y
        r1 = set(violating_fd.lhs).union(violating_fd.rhs)
        r2 = set(current_attrs) - (set(violating_fd.rhs) - set(violating_fd.lhs))

        parts1 = _recursive_bcnf(r1)
        parts2 = _recursive_bcnf(r2)
        return parts1 + parts2

    raw_parts = _recursive_bcnf(attrs)

    # Eliminate subset relations
    pruned: list[set[str]] = []
    for i, r1 in enumerate(raw_parts):
        is_subset = False
        for j, r2 in enumerate(raw_parts):
            if i != j and r1 < r2:
                is_subset = True
                break
        if not is_subset and r1 not in pruned:
            pruned.append(r1)

    return sorted(pruned, key=lambda s: sorted(list(s)))
