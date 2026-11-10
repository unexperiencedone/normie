from __future__ import annotations
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FD:
    lhs: frozenset[str]
    rhs: frozenset[str]

    def __post_init__(self):
        if not isinstance(self.lhs, frozenset):
            object.__setattr__(self, "lhs", frozenset(self.lhs))
        if not isinstance(self.rhs, frozenset):
            object.__setattr__(self, "rhs", frozenset(self.rhs))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FD":
        lhs = data.get("lhs", [])
        rhs = data.get("rhs", [])
        return cls(frozenset(lhs), frozenset(rhs))

    def to_dict(self) -> dict[str, list[str]]:
        return {"lhs": sorted(list(self.lhs)), "rhs": sorted(list(self.rhs))}

    def __str__(self) -> str:
        lhs_str = ", ".join(sorted(self.lhs))
        rhs_str = ", ".join(sorted(self.rhs))
        return f"{{{lhs_str}}} -> {{{rhs_str}}}"

    def is_trivial(self) -> bool:
        return self.rhs.issubset(self.lhs)
