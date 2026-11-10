from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field
from backend.tools.fd.models import FD


class Column(BaseModel):
    name: str
    type: str = "VARCHAR(255)"
    is_pk: bool = False
    is_fk: bool = False
    fk_ref_table: str | None = None
    fk_ref_col: str | None = None
    is_nullable: bool = True
    is_unique: bool = False


class ForeignKeyDef(BaseModel):
    columns: list[str]
    ref_table: str
    ref_columns: list[str]
    on_delete: str = "CASCADE"


class Table(BaseModel):
    name: str
    columns: list[Column] = Field(default_factory=list)
    primary_key: list[str] = Field(default_factory=list)
    foreign_keys: list[ForeignKeyDef] = Field(default_factory=list)
    check_constraints: list[str] = Field(default_factory=list)

    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]


class RelationalSchema(BaseModel):
    tables: list[Table] = Field(default_factory=list)
    fds: list[dict[str, Any]] = Field(default_factory=list)
