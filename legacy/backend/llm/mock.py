from __future__ import annotations
import asyncio
import json
import random
from typing import Any
from pydantic import BaseModel

from backend.llm.base import LLM, LLMResult, ToolCall


class MockAdapter:
    """Deterministic Mock LLM Adapter for tests, evaluation, and high-concurrency stress testing."""

    def __init__(
        self,
        min_latency_ms: int = 0,
        max_latency_ms: int = 0,
        failure_rate: float = 0.0,
        custom_responses: dict[str, str] | None = None,
    ):
        self.min_latency_ms = min_latency_ms
        self.max_latency_ms = max_latency_ms
        self.failure_rate = failure_rate
        self.custom_responses = custom_responses or {}

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        schema: type[BaseModel] | dict[str, Any] | None = None,
    ) -> LLMResult:
        if self.max_latency_ms > 0:
            delay = random.uniform(self.min_latency_ms, self.max_latency_ms) / 1000.0
            await asyncio.sleep(delay)

        if self.failure_rate > 0.0 and random.random() < self.failure_rate:
            raise RuntimeError("MockAdapter: simulated LLM provider 503 error")

        last_user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_message = str(m.get("content", ""))
                break

        # Check custom canned responses
        for key, resp in self.custom_responses.items():
            if key.lower() in last_user_message.lower():
                return LLMResult(
                    content=resp,
                    tokens_in=len(last_user_message) // 4,
                    tokens_out=len(resp) // 4,
                    model="mock-canned",
                )

        # Query handling (check first if prompt is a question)
        if "question:" in last_user_message.lower() or "translate the user's natural language question" in last_user_message.lower():
            if "rao" in last_user_message.lower() or "appointment" in last_user_message.lower():
                sql_resp = {
                    "sql": "SELECT p.name, a.appointment_date, a.status FROM patient p JOIN appointment a ON p.patient_id = a.patient_id JOIN doctor d ON a.doctor_id = d.doctor_id WHERE d.name = 'Dr. Rao' LIMIT 1000",
                    "explanation": "Selects patient names and appointment details for Dr. Rao.",
                }
                return LLMResult(
                    content=json.dumps(sql_resp),
                    tokens_in=80,
                    tokens_out=140,
                    model="mock-clinic-query",
                )
            if "student" in last_user_message.lower() or "course" in last_user_message.lower():
                sql_resp = {
                    "sql": "SELECT s.name FROM student s JOIN enrollment e ON s.student_id = e.student_id JOIN course c ON e.course_id = c.course_id WHERE c.title = 'Databases' AND e.grade > 80 LIMIT 1000",
                    "explanation": "Selects names of students who scored above 80 in Databases.",
                }
                return LLMResult(
                    content=json.dumps(sql_resp),
                    tokens_in=80,
                    tokens_out=140,
                    model="mock-student-query",
                )
            # Generic query fallback
            sql_resp = {
                "sql": "SELECT name, status FROM patient LIMIT 1000",
                "explanation": "Selects patient records.",
            }
            return LLMResult(
                content=json.dumps(sql_resp),
                tokens_in=50,
                tokens_out=60,
                model="mock-general-query",
            )

        # Check if this is an ER Design request
        is_design_request = any("design agent" in str(m.get("content", "")).lower() for m in messages) or "requirements:" in last_user_message.lower()

        # Domain: Clinic ER model
        if "clinic" in last_user_message.lower() or "patient" in last_user_message.lower() or "doctor" in last_user_message.lower():
            clinic_er = {
                "entities": [
                    {
                        "name": "Patient",
                        "attributes": [
                            {"name": "patient_id", "type": "INT", "is_pk": True},
                            {"name": "name", "type": "VARCHAR(100)", "is_pk": False},
                            {"name": "dob", "type": "DATE", "is_pk": False},
                            {"name": "phone", "type": "VARCHAR(20)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Doctor",
                        "attributes": [
                            {"name": "doctor_id", "type": "INT", "is_pk": True},
                            {"name": "name", "type": "VARCHAR(100)", "is_pk": False},
                            {"name": "specialty", "type": "VARCHAR(100)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Appointment",
                        "attributes": [
                            {"name": "appointment_id", "type": "INT", "is_pk": True},
                            {"name": "appointment_date", "type": "TIMESTAMPTZ", "is_pk": False},
                            {"name": "status", "type": "VARCHAR(20)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Prescription",
                        "attributes": [
                            {"name": "prescription_id", "type": "INT", "is_pk": True},
                            {"name": "dosage", "type": "VARCHAR(50)", "is_pk": False},
                            {"name": "frequency", "type": "VARCHAR(50)", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "Books",
                        "entities": ["Patient", "Appointment"],
                        "cardinality": "1:N",
                        "participation": {"Patient": "partial", "Appointment": "total"},
                    },
                    {
                        "name": "Attends",
                        "entities": ["Doctor", "Appointment"],
                        "cardinality": "1:N",
                        "participation": {"Doctor": "partial", "Appointment": "total"},
                    },
                    {
                        "name": "Prescribes",
                        "entities": ["Appointment", "Prescription"],
                        "cardinality": "1:N",
                        "participation": {"Appointment": "partial", "Prescription": "total"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(clinic_er, indent=2),
                tokens_in=150,
                tokens_out=320,
                model="mock-clinic",
            )

        # Domain: E-Commerce / Inventory / Orders
        if any(w in last_user_message.lower() for w in ["ecommerce", "e-commerce", "order", "inventory", "product", "store", "shop"]):
            ecommerce_er = {
                "entities": [
                    {
                        "name": "Customer",
                        "attributes": [
                            {"name": "customer_id", "type": "UUID", "is_pk": True},
                            {"name": "email", "type": "VARCHAR(255)", "is_pk": False},
                            {"name": "full_name", "type": "VARCHAR(150)", "is_pk": False},
                            {"name": "tier", "type": "VARCHAR(20)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Order",
                        "attributes": [
                            {"name": "order_id", "type": "UUID", "is_pk": True},
                            {"name": "created_at", "type": "TIMESTAMPTZ", "is_pk": False},
                            {"name": "total_cents", "type": "BIGINT", "is_pk": False},
                            {"name": "order_status", "type": "VARCHAR(30)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Product",
                        "attributes": [
                            {"name": "product_id", "type": "UUID", "is_pk": True},
                            {"name": "sku", "type": "VARCHAR(64)", "is_pk": False},
                            {"name": "title", "type": "VARCHAR(255)", "is_pk": False},
                            {"name": "unit_price", "type": "BIGINT", "is_pk": False},
                            {"name": "stock_quantity", "type": "INT", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Payment",
                        "attributes": [
                            {"name": "payment_id", "type": "UUID", "is_pk": True},
                            {"name": "payment_provider", "type": "VARCHAR(50)", "is_pk": False},
                            {"name": "charge_id", "type": "VARCHAR(128)", "is_pk": False},
                            {"name": "amount", "type": "BIGINT", "is_pk": False},
                            {"name": "paid_at", "type": "TIMESTAMPTZ", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "Places",
                        "entities": ["Customer", "Order"],
                        "cardinality": "1:N",
                        "participation": {"Customer": "partial", "Order": "total"},
                    },
                    {
                        "name": "Contains",
                        "entities": ["Order", "Product"],
                        "cardinality": "M:N",
                        "participation": {"Order": "total", "Product": "partial"},
                    },
                    {
                        "name": "Settles",
                        "entities": ["Order", "Payment"],
                        "cardinality": "1:1",
                        "participation": {"Order": "total", "Payment": "total"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(ecommerce_er, indent=2),
                tokens_in=160,
                tokens_out=380,
                model="mock-ecommerce",
            )

        # Domain: Fintech / Banking / Ledger
        if any(w in last_user_message.lower() for w in ["fintech", "banking", "ledger", "account", "bank", "balance", "transfer"]):
            fintech_er = {
                "entities": [
                    {
                        "name": "Account",
                        "attributes": [
                            {"name": "account_id", "type": "UUID", "is_pk": True},
                            {"name": "account_number", "type": "VARCHAR(34)", "is_pk": False},
                            {"name": "currency", "type": "VARCHAR(3)", "is_pk": False},
                            {"name": "cleared_balance", "type": "NUMERIC(18,4)", "is_pk": False},
                            {"name": "is_frozen", "type": "BOOLEAN", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Transaction",
                        "attributes": [
                            {"name": "tx_id", "type": "UUID", "is_pk": True},
                            {"name": "idempotency_key", "type": "VARCHAR(64)", "is_pk": False},
                            {"name": "initiated_at", "type": "TIMESTAMPTZ", "is_pk": False},
                            {"name": "tx_state", "type": "VARCHAR(20)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Posting",
                        "attributes": [
                            {"name": "posting_id", "type": "UUID", "is_pk": True},
                            {"name": "direction", "type": "VARCHAR(6)", "is_pk": False},
                            {"name": "amount", "type": "NUMERIC(18,4)", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "Initiates",
                        "entities": ["Account", "Transaction"],
                        "cardinality": "1:N",
                        "participation": {"Account": "partial", "Transaction": "total"},
                    },
                    {
                        "name": "Entries",
                        "entities": ["Transaction", "Posting"],
                        "cardinality": "1:N",
                        "participation": {"Transaction": "total", "Posting": "total"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(fintech_er, indent=2),
                tokens_in=140,
                tokens_out=300,
                model="mock-fintech",
            )

        # Domain: SaaS / Multi-Tenant / RBAC / Organizations
        if any(w in last_user_message.lower() for w in ["saas", "tenant", "organization", "rbac", "role", "permission"]):
            saas_er = {
                "entities": [
                    {
                        "name": "Tenant",
                        "attributes": [
                            {"name": "tenant_id", "type": "UUID", "is_pk": True},
                            {"name": "slug", "type": "VARCHAR(64)", "is_pk": False},
                            {"name": "display_name", "type": "VARCHAR(128)", "is_pk": False},
                            {"name": "plan", "type": "VARCHAR(32)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "AppUser",
                        "attributes": [
                            {"name": "user_id", "type": "UUID", "is_pk": True},
                            {"name": "email", "type": "VARCHAR(255)", "is_pk": False},
                            {"name": "full_name", "type": "VARCHAR(150)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Role",
                        "attributes": [
                            {"name": "role_id", "type": "UUID", "is_pk": True},
                            {"name": "role_code", "type": "VARCHAR(50)", "is_pk": False},
                            {"name": "description", "type": "TEXT", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "BelongsTo",
                        "entities": ["AppUser", "Tenant"],
                        "cardinality": "M:N",
                        "participation": {"AppUser": "total", "Tenant": "partial"},
                    },
                    {
                        "name": "Grants",
                        "entities": ["AppUser", "Role"],
                        "cardinality": "M:N",
                        "participation": {"AppUser": "partial", "Role": "partial"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(saas_er, indent=2),
                tokens_in=140,
                tokens_out=280,
                model="mock-saas",
            )

        # Domain: Logistics / Warehouse / Shipments
        if any(w in last_user_message.lower() for w in ["logistics", "warehouse", "shipment", "driver", "vehicle", "delivery"]):
            logistics_er = {
                "entities": [
                    {
                        "name": "Warehouse",
                        "attributes": [
                            {"name": "warehouse_id", "type": "UUID", "is_pk": True},
                            {"name": "facility_code", "type": "VARCHAR(32)", "is_pk": False},
                            {"name": "city", "type": "VARCHAR(100)", "is_pk": False},
                            {"name": "capacity_sqft", "type": "INT", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Shipment",
                        "attributes": [
                            {"name": "shipment_id", "type": "UUID", "is_pk": True},
                            {"name": "tracking_number", "type": "VARCHAR(64)", "is_pk": False},
                            {"name": "dispatch_time", "type": "TIMESTAMPTZ", "is_pk": False},
                            {"name": "transit_status", "type": "VARCHAR(32)", "is_pk": False},
                        ],
                    },
                    {
                        "name": "Driver",
                        "attributes": [
                            {"name": "driver_id", "type": "UUID", "is_pk": True},
                            {"name": "license_number", "type": "VARCHAR(64)", "is_pk": False},
                            {"name": "full_name", "type": "VARCHAR(128)", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "Dispatches",
                        "entities": ["Warehouse", "Shipment"],
                        "cardinality": "1:N",
                        "participation": {"Warehouse": "partial", "Shipment": "total"},
                    },
                    {
                        "name": "AssignedTo",
                        "entities": ["Driver", "Shipment"],
                        "cardinality": "1:N",
                        "participation": {"Driver": "partial", "Shipment": "total"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(logistics_er, indent=2),
                tokens_in=150,
                tokens_out=300,
                model="mock-logistics",
            )

        # Generic ER Fallback if this was a design prompt
        if is_design_request:
            words = [w.strip(",.;:()") for w in last_user_message.split() if len(w) > 3 and w.isalpha()]
            primary_entity = words[0].capitalize() if words else "Item"
            secondary_entity = words[1].capitalize() if len(words) > 1 else "Category"
            generic_er = {
                "entities": [
                    {
                        "name": primary_entity,
                        "attributes": [
                            {"name": f"{primary_entity.lower()}_id", "type": "UUID", "is_pk": True},
                            {"name": "name", "type": "VARCHAR(128)", "is_pk": False},
                            {"name": "created_at", "type": "TIMESTAMPTZ", "is_pk": False},
                            {"name": "status", "type": "VARCHAR(32)", "is_pk": False},
                        ],
                    },
                    {
                        "name": secondary_entity,
                        "attributes": [
                            {"name": f"{secondary_entity.lower()}_id", "type": "UUID", "is_pk": True},
                            {"name": "title", "type": "VARCHAR(128)", "is_pk": False},
                            {"name": "code", "type": "VARCHAR(32)", "is_pk": False},
                        ],
                    },
                ],
                "relationships": [
                    {
                        "name": "AssociatesWith",
                        "entities": [primary_entity, secondary_entity],
                        "cardinality": "1:N",
                        "participation": {primary_entity: "partial", secondary_entity: "total"},
                    },
                ],
            }
            return LLMResult(
                content=json.dumps(generic_er, indent=2),
                tokens_in=120,
                tokens_out=220,
                model="mock-generic-er",
            )

        # Generic default response for other non-design requests
        default_resp = {
            "message": "Processed request successfully using MockAdapter",
            "received_prompt": last_user_message[:100],
        }
        return LLMResult(
            content=json.dumps(default_resp),
            tokens_in=50,
            tokens_out=50,
            model="mock-default",
        )
