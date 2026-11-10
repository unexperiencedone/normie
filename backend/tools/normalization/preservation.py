from __future__ import annotations
from backend.tools.fd.closure import attribute_closure
from backend.tools.fd.models import FD


def preserves_dependencies(
    original_attrs: set[str] | frozenset[str],
    parts: list[set[str] | frozenset[str]],
    fds: list[FD],
) -> tuple[bool, list[FD]]:
    """Test whether a decomposition preserves all functional dependencies in F.

    For each FD X -> Y in F:
      Z = X
      repeat until Z changes no more:
        for each Ri in decomposition:
          Z = Z U (Closure(Z intersect Ri, F) intersect Ri)
      if Y is subset of Z, X -> Y is preserved.

    Returns:
      (is_preserved: bool, unpreserved_fds: list[FD])
    """
    unpreserved: list[FD] = []

    for fd in fds:
        z = set(fd.lhs)
        changed = True
        while changed:
            changed = False
            for part in parts:
                intersect = z.intersection(part)
                if intersect:
                    closure_part = attribute_closure(intersect, fds).intersection(part)
                    if not closure_part.issubset(z):
                        z.update(closure_part)
                        changed = True

        if not fd.rhs.issubset(z):
            unpreserved.append(fd)

    return len(unpreserved) == 0, unpreserved
