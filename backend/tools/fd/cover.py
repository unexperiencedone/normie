from __future__ import annotations
from backend.tools.fd.closure import attribute_closure
from backend.tools.fd.models import FD


def minimal_cover(fds: list[FD]) -> list[FD]:
    """Compute the minimal (canonical) cover of a set of functional dependencies.

    Steps:
      1. RHS Singleton: Decompose every FD X -> {Y1, Y2, ...} into X -> Y1, X -> Y2, ...
      2. LHS Extraneous: For each FD X -> A where |X| > 1, test each B in X.
         If A in Closure(X - {B}) under current FDs, eliminate B from LHS.
      3. Redundancy: For each FD f: X -> A in the set, test if A in Closure(X) under (Current - {f}).
         If so, f is redundant and removed.
    """
    # Step 1: Singleton RHS
    singletons: list[FD] = []
    for fd in fds:
        for attr in fd.rhs:
            if attr not in fd.lhs:  # skip trivial
                singletons.append(FD(frozenset(fd.lhs), frozenset([attr])))

    # Step 2: Remove extraneous attributes from LHS
    current_fds = list(singletons)
    changed = True
    while changed:
        changed = False
        new_fds: list[FD] = []
        for fd in current_fds:
            if len(fd.lhs) <= 1:
                new_fds.append(fd)
                continue

            lhs_list = sorted(list(fd.lhs))
            reduced_lhs = set(fd.lhs)
            for attr in lhs_list:
                if len(reduced_lhs) > 1:
                    test_lhs = reduced_lhs - {attr}
                    # Check closure under current_fds
                    if fd.rhs.issubset(attribute_closure(test_lhs, current_fds)):
                        reduced_lhs = test_lhs
                        changed = True
            new_fds.append(FD(frozenset(reduced_lhs), fd.rhs))
        current_fds = new_fds

    # Step 3: Remove redundant FDs
    i = 0
    while i < len(current_fds):
        candidate = current_fds[i]
        remaining = current_fds[:i] + current_fds[i + 1:]
        # Check if candidate's RHS is derivable from candidate's LHS using remaining FDs
        if candidate.rhs.issubset(attribute_closure(candidate.lhs, remaining)):
            current_fds.pop(i)
            # do not increment i since list shifted
        else:
            i += 1

    # Sort deterministically
    return sorted(
        current_fds,
        key=lambda f: (sorted(list(f.lhs)), sorted(list(f.rhs))),
    )
