from __future__ import annotations
from backend.tools.fd.closure import candidate_keys, is_superkey
from backend.tools.fd.models import FD
from backend.tools.normalization.models import NF, NormalFormReport, Violation


def check_normal_form(table_attrs: set[str] | frozenset[str], fds: list[FD]) -> NormalFormReport:
    """Analyze a relational table schema and identify its highest normal form (1NF to BCNF),
    along with candidate keys, prime/non-prime attributes, and detailed violations."""
    attrs = set(table_attrs)
    keys = candidate_keys(attrs, fds)
    candidate_keys_list = [sorted(list(k)) for k in keys]

    prime_attrs: set[str] = set()
    for k in keys:
        prime_attrs.update(k)
    non_prime_attrs = attrs - prime_attrs

    violations: list[Violation] = []

    # Filter FDs to those relevant to this table
    table_fds = [
        fd for fd in fds
        if fd.lhs.issubset(attrs) and fd.rhs.intersection(attrs) - fd.lhs
    ]

    is_2nf = True
    is_3nf = True
    is_bcnf = True

    for fd in table_fds:
        effective_rhs = fd.rhs.intersection(attrs) - fd.lhs
        if not effective_rhs:
            continue

        lhs_is_superkey = is_superkey(fd.lhs, attrs, fds)

        # 1. Check BCNF: LHS must be a superkey
        if not lhs_is_superkey:
            is_bcnf = False
            violations.append(
                Violation(
                    normal_form=NF.BCNF,
                    fd=fd,
                    reason=f"LHS {sorted(list(fd.lhs))} is not a superkey for the table.",
                    details={"lhs_is_superkey": False},
                )
            )

            # 2. Check 3NF: Either LHS is superkey OR every attribute in RHS - LHS is prime
            rhs_all_prime = effective_rhs.issubset(prime_attrs)
            if not rhs_all_prime:
                is_3nf = False
                non_prime_violators = effective_rhs - prime_attrs
                violations.append(
                    Violation(
                        normal_form=NF.NF3,
                        fd=fd,
                        reason=f"LHS {sorted(list(fd.lhs))} is not a superkey and RHS contains non-prime attributes {sorted(list(non_prime_violators))}.",
                        details={"non_prime_violators": sorted(list(non_prime_violators))},
                    )
                )

                # 3. Check 2NF: No non-prime attribute should depend on a proper subset of ANY candidate key
                for k in keys:
                    if fd.lhs < k:  # proper subset of candidate key
                        if not effective_rhs.issubset(prime_attrs):
                            is_2nf = False
                            partial_dependents = effective_rhs - prime_attrs
                            violations.append(
                                Violation(
                                    normal_form=NF.NF2,
                                    fd=fd,
                                    reason=f"Partial dependency: non-prime attributes {sorted(list(partial_dependents))} depend on proper subset {sorted(list(fd.lhs))} of candidate key {sorted(list(k))}.",
                                    details={
                                        "key": sorted(list(k)),
                                        "partial_lhs": sorted(list(fd.lhs)),
                                        "partial_dependents": sorted(list(partial_dependents)),
                                    },
                                )
                            )

    if is_bcnf:
        highest = NF.BCNF
    elif is_3nf:
        highest = NF.NF3
    elif is_2nf:
        highest = NF.NF2
    else:
        highest = NF.NF1

    return NormalFormReport(
        highest_nf=highest,
        candidate_keys=candidate_keys_list,
        prime_attributes=sorted(list(prime_attrs)),
        non_prime_attributes=sorted(list(non_prime_attrs)),
        violations=violations,
    )
