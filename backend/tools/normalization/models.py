from __future__ import annotations
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any
from backend.tools.fd.models import FD


class NF(IntEnum):
    NF1 = 1
    NF2 = 2
    NF3 = 3
    BCNF = 4

    def __str__(self) -> str:
        names = {1: "1NF", 2: "2NF", 3: "3NF", 4: "BCNF"}
        return names.get(self.value, str(self.value))


@dataclass
class Violation:
    normal_form: NF
    fd: FD
    reason: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_nf": str(self.normal_form),
            "fd": self.fd.to_dict(),
            "reason": self.reason,
            "details": self.details,
        }


@dataclass
class NormalFormReport:
    highest_nf: NF
    candidate_keys: list[list[str]]
    prime_attributes: list[str]
    non_prime_attributes: list[str]
    violations: list[Violation] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "highest_nf": str(self.highest_nf),
            "candidate_keys": self.candidate_keys,
            "prime_attributes": self.prime_attributes,
            "non_prime_attributes": self.non_prime_attributes,
            "violations": [v.to_dict() for v in self.violations],
        }
