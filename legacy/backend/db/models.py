from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


# Use JSON type compatible with both SQLite (testing) and PostgreSQL
JsonType = JSON().with_variant(JSONB, "postgresql")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    db_host: Mapped[str] = mapped_column(String(255), nullable=False, default="postgres:5432")
    db_name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="free")
    rate_limit_rps: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="tenant", cascade="all, delete-orphan")
    memberships: Mapped[list["Membership"]] = relationship("Membership", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list["Membership"]] = relationship("Membership", back_populates="user", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), primary_key=True)
    platform_role: Mapped[str] = mapped_column(String(50), nullable=False)  # designer, end_user, admin
    db_role: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="memberships")
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="memberships")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_project_tenant_name"),)

    project_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="design")
    requirements_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    state_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="projects")
    schema_versions: Mapped[list["SchemaVersion"]] = relationship("SchemaVersion", back_populates="project", cascade="all, delete-orphan")
    roles: Mapped[list["Role"]] = relationship("Role", back_populates="project", cascade="all, delete-orphan")
    agent_runs: Mapped[list["AgentRun"]] = relationship("AgentRun", back_populates="project")
    approvals: Mapped[list["Approval"]] = relationship("Approval", back_populates="project")


class SchemaVersion(Base):
    __tablename__ = "schema_versions"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.project_id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    er_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    relational_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    fds_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    ddl: Mapped[str] = mapped_column(Text, nullable=False)
    migration_up: Mapped[str | None] = mapped_column(Text, nullable=True)
    migration_down: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="schema_versions")


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_role_project_name"),)

    role_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    policy_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)

    project: Mapped["Project"] = relationship("Project", back_populates="roles")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.project_id"), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.user_id"), nullable=True)
    agent: Mapped[str] = mapped_column(String(100), nullable=False)
    input_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    output_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    llm_tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project | None"] = relationship("Project", back_populates="agent_runs")
    tool_calls: Mapped[list["ToolCallRecord"]] = relationship("ToolCallRecord", back_populates="run", cascade="all, delete-orphan")


class ToolCallRecord(Base):
    __tablename__ = "tool_calls"

    call_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("agent_runs.run_id", ondelete="CASCADE"), nullable=False)
    tool: Mapped[str] = mapped_column(String(100), nullable=False)
    args_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    result_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    run: Mapped["AgentRun"] = relationship("AgentRun", back_populates="tool_calls")


class Approval(Base):
    __tablename__ = "approvals"

    approval_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.project_id"), nullable=False)
    requested_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.user_id"), nullable=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    risk: Mapped[str] = mapped_column(String(20), nullable=False)  # low, medium, high
    payload_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    preview_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")  # pending, approved, rejected, expired
    decided_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.user_id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="approvals")


class AuditLog(Base):
    __tablename__ = "audit_log"

    audit_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    sql_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    before_image: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    rows_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class Backup(Base):
    __tablename__ = "backups"

    backup_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.project_id"), nullable=False)
    location: Mapped[str] = mapped_column(String(500), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # logical, base, pitr_marker
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SlowQuery(Base):
    __tablename__ = "slow_queries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    sample_sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    calls: Mapped[int] = mapped_column(Integer, default=1)
    mean_ms: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    p95_ms: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
