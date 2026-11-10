# DESIGN.md

## 1. Design Principles
- **Show the theory.** ER diagrams, algebra, FDs, and plans are visible, not hidden.
- **Approve before apply.** Every irreversible step has a preview.
- **One conversation, structured outputs.** Chat drives intent; panels show artifacts.

## 2. Primary Screens

| Screen | Contents |
|---|---|
| **Projects** | List of databases, stage badge (Design, Schema, Deployed) |
| **Design Studio** | Chat on left; editable ER diagram on right; entity/attribute table |
| **Schema Review** | Tables, keys, FD editor, normal-form report, decomposition diff |
| **Roles and Access** | Role list, per-role column/row visibility matrix, access simulator |
| **Deploy** | DDL preview, version, diff, deploy button, status |
| **Query Console** | Question box; tabs for Result, Relational Algebra, SQL, Plan, Explanation |
| **Approvals** | Pending risky actions with affected-row preview |
| **Tuning** | Slow queries, recommendations, before/after benchmark |
| **Evolution** | Requirement input, ER/schema diff, migration script, rehearsal result |
| **Audit and Recovery** | Action timeline, undo, backups, restore |
| **Admin** | Tenants, quotas, health dashboards |

## 3. Key UX Flows

### Designer: create a database
Describe -> (clarifying questions) -> ER diagram -> edit/approve -> FD confirmation -> normalization report -> roles -> DDL preview -> deploy.

### End user: ask and act
Type question -> see answer + algebra/SQL -> for writes, review "will affect N rows" -> confirm.

### Designer: evolve
Type "also track prescriptions" -> diff view -> rehearsal on clone -> approve -> apply.

## 4. Module Design (core code)

### 4.1 FD and normalization module
```python
def attribute_closure(attrs: set[str], fds: list[FD]) -> set[str]: ...
def candidate_keys(attrs: set[str], fds: list[FD]) -> list[frozenset[str]]: ...
def minimal_cover(fds: list[FD]) -> list[FD]: ...
def highest_normal_form(table: Table, fds: list[FD]) -> NF: ...
def decompose_bcnf(table: Table, fds: list[FD]) -> list[Table]: ...
def decompose_3nf(table: Table, fds: list[FD]) -> list[Table]: ...
def is_lossless(original: Table, parts: list[Table], fds: list[FD]) -> bool: ...
```
Algorithms: closure by fixpoint; keys by pruning search over attribute subsets; BCNF by repeated violating-FD split; 3NF via minimal cover synthesis; lossless via chase.

### 4.2 ER to relational mapping rules
| ER construct | Mapping |
|---|---|
| Strong entity | Table, PK = key attribute |
| Weak entity | Table with owner PK + partial key as composite PK |
| 1:1 | FK on the side with total participation (or merge) |
| 1:N | FK on the N side |
| M:N | Junction table with composite PK of both keys + relationship attributes |
| Multivalued attribute | Separate table |
| Composite attribute | Flattened columns |
| ISA | Table-per-subclass (default), alternatives selectable |

### 4.3 SQL validator
Parse with sqlglot -> check statement type allow-list -> resolve all tables/columns against the role's visible schema -> reject stacked statements, comments with directives, functions on a deny-list (`pg_sleep`, `COPY`, `dblink`) -> inject `LIMIT` -> set `statement_timeout`.

### 4.4 Relational algebra generator
AST -> operators: sigma (WHERE), pi (SELECT), join (INNER JOIN), rho (aliases), gamma (GROUP BY/aggregates), union/difference/intersection, division pattern recognition for "for all" queries. Output as text and LaTeX-style string for display.

### 4.5 Index advisor
Parse plan -> detect sequential scans on large tables with selective filters -> propose candidate indexes (column order by equality then range) -> test with hypothetical indexes -> benchmark -> recommend.

## 5. Error and Empty States
Every agent error shows: what was attempted, why it failed, what the user can do. Ambiguity prompts show 2-3 selectable interpretations.

## 6. Accessibility and Responsiveness
Keyboard navigable diagrams (list view alternative), color-blind-safe palette, responsive layout down to tablet width.
