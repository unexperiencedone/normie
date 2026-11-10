from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


class Attribute(BaseModel):
    name: str
    type: str = "VARCHAR(255)"
    is_pk: bool = False
    is_multivalued: bool = False
    is_composite: bool = False
    sub_attributes: list["Attribute"] = Field(default_factory=list)
    is_nullable: bool = True


class Entity(BaseModel):
    name: str
    attributes: list[Attribute] = Field(default_factory=list)
    is_weak: bool = False
    owner_entity: str | None = None
    identifying_relationship: str | None = None
    partial_keys: list[str] = Field(default_factory=list)

    def pk_attributes(self) -> list[Attribute]:
        return [a for a in self.attributes if a.is_pk]


class Relationship(BaseModel):
    name: str
    entities: list[str] = Field(default_factory=list)
    cardinality: str = "1:N"  # "1:1", "1:N", "M:N"
    participation: dict[str, str] = Field(default_factory=dict)  # "total", "partial"
    attributes: list[Attribute] = Field(default_factory=list)


class Generalization(BaseModel):
    parent_entity: str
    child_entities: list[str] = Field(default_factory=list)
    is_disjoint: bool = True
    is_total: bool = False


class ERModel(BaseModel):
    entities: list[Entity] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    generalizations: list[Generalization] = Field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ERModel":
        return cls(**data)
