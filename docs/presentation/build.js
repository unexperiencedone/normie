// Normie presentation generator (pptxgenjs, structured deck: theme + layouts + sections + placeholders)
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lu = require("react-icons/lu");
const { applyTheme } = require(process.env.SKILL_DIR + "/scripts/apply_theme.js");

const ROOT = "/home/aakshant-kumar/DATA/Projects/Own-Products/DBMS";
const SHOT = (f) => path.join(ROOT, "docs/screenshots", f);
const OUT = path.join(ROOT, "docs/Normie-presentation.pptx");

// ------------------------------------------------------------------ theme: ink + violet + lime (the product's own palette)
const THEME = {
  name: "Normie Ink",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0A0C10", // ink: dark slides, body text
    lt1: "FFFFFF",
    dk2: "4A505B", // slate: secondary text
    lt2: "F4F5F0", // paper: tinted panels
    accent1: "6D5CF5", // violet: the one sharp accent (buttons in the app)
    accent2: "4836C4", // deep violet: text-safe accent on white
    accent3: "0D6F7B", // teal: only for "foreign key"
    accent4: "4F6B0F", // lime-dark: "allowed / low risk"
    accent5: "B4470A", // tangerine: "medium risk"
    accent6: "C02626", // red: "high risk / denied"
    hlink: "4836C4",
    folHlink: "6B4FA0",
  },
};
const HEX = THEME.colors;
const MONO = "Courier New";
const W = 13.333;
const H = 7.5;
const M = 0.6; // outer margin

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "Normie: an agentic control plane for PostgreSQL";
pres.subject = "DBMS project presentation";
pres.author = "Aakshant Kumar";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------ layouts
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 1.55, w: 7, h: 0.35, fontFace: MONO, fontSize: 13, color: C.accent1, bold: true, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.0, w: 6.6, h: 1.5, fontSize: 60, bold: true, color: C.background1, margin: 0, valign: "top", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 3.65, w: 5.9, h: 1.6, fontSize: 20, color: "C9CDD3", margin: 0, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 2.55, w: 8, h: 0.4, fontFace: MONO, fontSize: 15, color: C.accent1, bold: true, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 3.0, w: W - 2 * M, h: 1.0, fontSize: 40, bold: true, color: C.background1, margin: 0, valign: "top", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 4.25, w: 9.5, h: 1.0, fontSize: 18, color: "AEB4BC", margin: 0, valign: "top" }, text: "" } },
  ],
  slideNumber: { x: W - M - 0.6, y: H - 0.5, w: 0.6, h: 0.3, fontFace: MONO, fontSize: 10, color: "8A919C", align: "right" },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 0.42, w: 9, h: 0.3, fontFace: MONO, fontSize: 11, color: C.accent2, bold: true, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.72, w: W - 2 * M, h: 0.75, fontSize: 32, bold: true, color: C.text1, margin: 0, valign: "top", align: "left" }, text: "" } },
    { text: { text: "NORMIE  /  AGENTIC DBMS PLATFORM  /  © AAKSHANT KUMAR", options: { x: M, y: H - 0.48, w: 6, h: 0.28, fontFace: MONO, fontSize: 9, color: "8A919C", margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: H - 0.5, w: 0.6, h: 0.3, fontFace: MONO, fontSize: 10, color: "8A919C", align: "right" },
});

// ------------------------------------------------------------------ helpers
const iconCache = {};
async function icon(name, color = "FFFFFF") {
  const key = name + color;
  if (iconCache[key]) return iconCache[key];
  const svg = renderToStaticMarkup(React.createElement(lu[name], { size: 256, color: "#" + color, strokeWidth: 1.75 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return (iconCache[key] = "image/png;base64," + buf.toString("base64"));
}
async function imgSize(f) {
  const m = await sharp(f).metadata();
  return { w: m.width, h: m.height };
}
/** Fit an image into a box, preserving aspect ratio; returns x,y,w,h. */
async function fit(f, x, y, w, h, align = "center") {
  const s = await imgSize(f);
  const r = Math.min(w / s.w, h / s.h);
  const iw = s.w * r;
  const ih = s.h * r;
  const ox = align === "left" ? 0 : (w - iw) / 2;
  return { x: x + ox, y: y + (h - ih) / 2, w: iw, h: ih };
}
const shadow = () => ({ type: "outer", color: "000000", opacity: 0.16, blur: 10, offset: 3, angle: 90 });

/** Ember disc with a white line icon: the deck's recurring motif. */
async function disc(slide, name, x, y, d = 0.62, fill = C.accent1, iconColor = "FFFFFF") {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: `disc-${name}` });
  const p = d * 0.25;
  slide.addImage({ data: await icon(name, iconColor), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: `icon-${name}`, altText: name.replace(/^Lu/, "") + " icon" });
}
/** Small solid square marker + text: mono "data cell" bullet. */
function marker(slide, x, y, color = C.accent1, s = 0.11) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w: s, h: s, fill: { color }, line: { color, width: 0 } });
}
function text(slide, t, o) {
  slide.addText(t, { isTextBox: true, margin: 0, valign: "top", ...o });
}
function content(section, eyebrow, title) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(eyebrow, { placeholder: "eyebrow" });
  s.addText(title, { placeholder: "title" });
  return s;
}
function sectionSlide(section, eyebrow, title, body) {
  pres.addSection({ title: section });
  const s = pres.addSlide({ masterName: "SECTION_DARK", sectionTitle: section });
  s.addText(eyebrow, { placeholder: "eyebrow" });
  s.addText(title, { placeholder: "title" });
  if (body) s.addText(body, { placeholder: "body" });
  return s;
}
function bullets(items, size = 15, color = C.text1) {
  return items.map((t, i) => ({
    text: t,
    options: { bullet: { indent: 16 }, breakLine: i < items.length - 1, paraSpaceAfter: 8, fontSize: size, color },
  }));
}
const TOP = 1.75; // content area starts below the title
const BOTTOM = H - 0.75;

const IMG = path.join(__dirname, "img");
fs.mkdirSync(IMG, { recursive: true });
const CROP = (f) => path.join(IMG, f);
async function makeCrops() {
  // element screenshot of a real pending approval card (2x device pixels)
  await sharp(SHOT("approval-card.png")).toFile(CROP("approval-card.png"));
  const er = await sharp(SHOT("er-diagram-chen.png")).metadata();
  // drop the toolbar row, then trim the empty canvas around the drawing (+ a small even border)
  const erBody = await sharp(SHOT("er-diagram-chen.png")).extract({ left: 0, top: 52, width: er.width, height: er.height - 52 }).toBuffer();
  await sharp(erBody).trim({ threshold: 12 }).extend({ top: 24, bottom: 24, left: 24, right: 24, background: "#ffffff" }).toFile(CROP("er.png"));
  for (const f of ["table-editor.png", "sql-editor-dark.png", "schema-diagram.png"])
    await sharp(SHOT(f)).extract({ left: 208, top: 44, width: 800, height: 856 }).toFile(CROP(f));
}

// ===================================================================== DBMS concepts section
// Inserted into build.js. Every SQL snippet below is what Normie actually runs (see `file`).

const SQL_KW = new Set(("CREATE TABLE DATABASE ROLE INDEX VIEW POLICY TRIGGER FUNCTION ALTER DROP GRANT REVOKE SELECT FROM WHERE " +
  "JOIN LEFT ON USING INSERT INTO VALUES UPDATE SET DELETE RETURNING BEGIN COMMIT ROLLBACK READ ONLY WITH RECURSIVE UNION " +
  "EXCEPT AS AND IN NOT NULL PRIMARY KEY REFERENCES UNIQUE CHECK DEFAULT CASCADE FOR EACH ROW EXECUTE BEFORE OR GROUP BY " +
  "ORDER DESC EXPLAIN ANALYZE LOCAL TO ALL PUBLIC CONNECT OWNER LOGIN CONFLICT DO EXCLUDED DISTINCT FILTER ENABLE LEVEL " +
  "SECURITY OVERRIDING SYSTEM VALUE PRIVILEGES SCHEMA TABLES INHERIT FALSE TRUE NOSUPERUSER NOCREATEDB CONNECTION LIMIT " +
  "PASSWORD ADD NOLOGIN FORMAT JSON VERBOSE BUFFERS").split(/\s+/));
const CODE = { bg: "0E1117", text: "DCE1E8", kw: "B3A8FF", comment: "8B94A3", str: "DDF894" };

/** Graphite code panel with light syntax highlighting (keywords, strings, comments). */
function codePanel(slide, x, y, w, h, sql, file) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: CODE.bg }, line: { color: CODE.bg, width: 0 }, objectName: "code-panel" });
  const lines = sql.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const runs = [];
  lines.forEach((line, li) => {
    const last = li === lines.length - 1;
    const ci = line.indexOf("--");
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const comment = ci >= 0 ? line.slice(ci) : "";
    const tokens = code.split(/('[^']*'|\b[A-Za-z_]+\b)/).filter((t) => t !== "");
    if (!tokens.length && !comment) runs.push({ text: " ", options: { color: CODE.text, breakLine: !last } });
    tokens.forEach((t, ti) => {
      const color = t.startsWith("'") ? CODE.str : SQL_KW.has(t) ? CODE.kw : CODE.text;
      runs.push({ text: t, options: { color, bold: SQL_KW.has(t), breakLine: !last && !comment && ti === tokens.length - 1 } });
    });
    if (comment) runs.push({ text: comment, options: { color: CODE.comment, italic: true, breakLine: !last } });
  });
  slide.addText(runs, { isTextBox: true, x: x + 0.22, y: y + 0.2, w: w - 0.44, h: h - 0.62, fontFace: MONO, fontSize: 11, valign: "top", margin: 0, paraSpaceAfter: 0 });
  text(slide, file, { x: x + 0.22, y: y + h - 0.36, w: w - 0.44, h: 0.24, fontFace: MONO, fontSize: 9.5, color: CODE.comment });
}

const CONCEPTS = [
  {
    eyebrow: "02 / CONCEPT 1 OF 10", title: "Integrity constraints are the control plane's rules",
    syllabus: "Relational model · keys · integrity constraints · SQL DDL",
    where: "The control plane that stores users, projects, approvals and the audit log is itself a relational schema. Its rules live in PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK constraints, not in Python.",
    without: "Two projects could share one database name, an approval could hold an invalid status, and deleting a user would leave orphaned projects.",
    file: "backend/core/control_schema.sql",
    sql: `
CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  db_name    TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'provisioning' CHECK (status
             IN ('provisioning','ready','failed','deleted'))
);
-- a name is unique per owner, but reusable after deletion
CREATE UNIQUE INDEX projects_owner_name_live
  ON projects (owner_id, name) WHERE status <> 'deleted';

CREATE TABLE approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  risk        TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  status      TEXT NOT NULL DEFAULT 'pending'
);`,
  },
  {
    eyebrow: "02 / CONCEPT 2 OF 10", title: "Authorisation creates each project's database",
    syllabus: "Database security · authorisation · roles · GRANT / REVOKE (DCL)",
    where: "“Create a database with secure credentials” is literally DCL: one database per project, three login roles, and default privileges so every future table is already protected.",
    without: "A single leaked password would expose every project, and the copilot's queries could modify or drop data.",
    file: "backend/tenancy/provision.py",
    sql: `
CREATE ROLE t_cd19_ro LOGIN NOSUPERUSER NOCREATEDB
  CONNECTION LIMIT 20 PASSWORD '<32 random characters>';
CREATE DATABASE t_cd19 OWNER t_cd19_owner;
REVOKE ALL ON DATABASE t_cd19 FROM PUBLIC;
GRANT CONNECT ON DATABASE t_cd19 TO t_cd19_rw, t_cd19_ro;

-- every future table: ro may read, rw may change rows
ALTER DEFAULT PRIVILEGES FOR ROLE t_cd19_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO t_cd19_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE t_cd19_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO t_cd19_rw;

ALTER ROLE t_cd19_ro SET default_transaction_read_only = on;
ALTER ROLE t_cd19_ro SET statement_timeout = '5000ms';`,
  },
  {
    eyebrow: "02 / CONCEPT 3 OF 10", title: "Views and row-level security implement business roles",
    syllabus: "Views · 3-schema architecture (external schema) · fine-grained authorisation",
    where: "“Receptionists must not see diagnoses” becomes a PostgreSQL role, column GRANTs, a per-role view, and an optional row filter. The access simulator asks PostgreSQL, not Python.",
    without: "Access rules would be if-statements in application code, bypassed by anyone holding a connection string.",
    file: "backend/services/security.py  ·  executor.simulate_access",
    sql: `
CREATE ROLE t_cd19_r_receptionist NOLOGIN;
GRANT t_cd19_r_receptionist TO t_cd19_ro WITH INHERIT FALSE, SET TRUE;

GRANT SELECT (patient_id, name) ON patient TO t_cd19_r_receptionist;
CREATE VIEW patient_for_receptionist WITH (security_invoker = true)
  AS SELECT patient_id, name FROM patient;   -- external schema

ALTER TABLE appointment ENABLE ROW LEVEL SECURITY;
CREATE POLICY dbforge_dr_rao ON appointment FOR ALL TO t_cd19_r_dr_rao
  USING (doctor_id = 3) WITH CHECK (doctor_id = 3);

BEGIN;  SET LOCAL ROLE t_cd19_r_receptionist;
SELECT diagnosis FROM patient;   -- ERROR: permission denied
ROLLBACK;`,
  },
  {
    eyebrow: "02 / CONCEPT 4 OF 10", title: "Transactions make a safe preview possible",
    syllabus: "Transactions · ACID · COMMIT / ROLLBACK (TCL)",
    where: "Atomicity lets Normie execute a change for real and then undo it: that dry run is the preview on every approval card. Approved migrations commit all-or-nothing; reads are READ ONLY transactions.",
    without: "There would be no honest preview: the only way to learn what a DROP or UPDATE does would be to run it.",
    file: "backend/services/executor.py",
    sql: `
-- dry run: execute for real, measure, then undo (Atomicity)
BEGIN;
  CREATE TABLE doctor  (doctor_id  serial PRIMARY KEY, name text);
  CREATE TABLE patient (patient_id serial PRIMARY KEY, name text);
  -- introspect the would-be schema, count rows each statement hits
ROLLBACK;

-- every read: a read-only transaction with a cursor and a row cap
BEGIN READ ONLY;
  SELECT name, specialty FROM doctor ORDER BY name;
COMMIT;

-- approved migration: every statement or none (Durability on COMMIT)
BEGIN;  <up script>;  COMMIT;
-- drift check: more rows than approved at commit time -> ROLLBACK`,
  },
  {
    eyebrow: "02 / CONCEPT 5 OF 10", title: "Concurrency control stops double execution",
    syllabus: "Concurrency control · locking · MVCC · lock waits and timeouts",
    where: "Two clicks on Approve, or a write racing its own dry run, must not execute twice or touch rows nobody reviewed. Row locks and bounded lock waits handle it; reads see a consistent MVCC snapshot.",
    without: "An approved migration could run twice, an update could be lost, and a stuck session could hold locks indefinitely.",
    file: "backend/services/approvals.py  ·  executor.py  ·  provision.py",
    sql: `
-- claim an approval exactly once (row-level lock)
BEGIN;
SELECT * FROM approvals WHERE approval_id = $1 FOR UPDATE;
UPDATE approvals SET status = 'approved' WHERE approval_id = $1;
COMMIT;

-- lock the rows being changed while their before-image is read
SELECT to_jsonb(d) FROM doctor d
 WHERE specialty = 'cardio' FOR UPDATE;

-- bounded waiting, per role
ALTER ROLE t_cd19_rw SET lock_timeout = '3s';
ALTER ROLE t_cd19_rw SET idle_in_transaction_session_timeout = '30s';`,
  },
  {
    eyebrow: "02 / CONCEPT 6 OF 10", title: "Logging and recovery give every write an undo",
    syllabus: "Recovery · logs · undo / redo · backups · triggers",
    where: "An append-only audit log protected by a trigger, before-images captured inside the same transaction, typed undo from the log, and pg_dump before every high-risk change.",
    without: "No history, no undo: a DELETE without WHERE would be permanent.",
    file: "control_schema.sql  ·  executor.py  ·  backups.py",
    sql: `
-- the log may only grow: enforced by the database itself
CREATE TRIGGER audit_log_guard_trg
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();  -- RAISE EXCEPTION

-- before-image, captured by the same statement
DELETE FROM patient WHERE patient_id = 7 RETURNING to_jsonb(patient);

-- undo: rebuild typed rows from the logged JSON
INSERT INTO patient (patient_id, name, diagnosis)
  OVERRIDING SYSTEM VALUE
SELECT r.patient_id, r.name, r.diagnosis
FROM jsonb_populate_recordset(NULL::patient, $1::jsonb) AS r;

-- sequences are not transactional: rewind them after a dry run
SELECT setval('doctor_doctor_id_seq', 5, true);`,
  },
  {
    eyebrow: "02 / CONCEPT 7 OF 10", title: "The optimiser proves an index before it is built",
    syllabus: "Query processing · cost-based optimisation · B+-tree indexing",
    where: "The SQL editor shows real plans. The tuning tool measures a query, builds a candidate B-tree inside a transaction, re-measures, and rolls back: a what-if on the real data.",
    without: "Index advice would be guesswork, and the copilot could not prove a speed-up.",
    file: "backend/services/executor.py  ·  benchmark_index",
    sql: `
EXPLAIN (FORMAT JSON, VERBOSE, ANALYZE, BUFFERS)
  SELECT * FROM event WHERE kind = 42;   -- Seq Scan: 60 000 rows

-- what-if: build a B-tree, re-measure, leave no trace
BEGIN;
  EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM event WHERE kind = 42;
  CREATE INDEX event_kind_idx ON event (kind);
  ANALYZE event;                         -- refresh statistics
  EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM event WHERE kind = 42;
ROLLBACK;                       -- Index Scan; speed-up measured`,
  },
  {
    eyebrow: "02 / CONCEPT 8 OF 10", title: "The system catalog drives every diagram",
    syllabus: "Data dictionary · ER model · ER to relational mapping · recursive queries",
    where: "Diagrams, the table editor and the copilot's schema context are read from PostgreSQL's catalog. The ER diagram reverse-maps foreign keys to relationships; a recursive query finds every table a DELETE cascades into.",
    without: "Diagrams would be drawings that drift from the real database, and cascading deletes would surprise users.",
    file: "backend/services/introspect.py  ·  executor.CASCADE_SQL",
    sql: `
-- keys and relationships, straight from the data dictionary
SELECT con.conname, con.contype::text, fc.relname AS ref_table,
       pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c       ON c.oid = con.conrelid
LEFT JOIN pg_class fc ON fc.oid = con.confrelid;

-- which tables does DELETE FROM patient reach via ON DELETE CASCADE?
WITH RECURSIVE dep(relid, action, depth) AS (
  SELECT conrelid, confdeltype::text, 1 FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'patient'::regclass
  UNION
  SELECT c.conrelid, c.confdeltype::text, d.depth + 1
  FROM pg_constraint c JOIN dep d ON c.confrelid = d.relid
  WHERE d.action = 'c' AND d.depth < 8)
SELECT relid::regclass FROM dep;`,
  },
  {
    eyebrow: "02 / CONCEPT 9 OF 10", title: "Functional dependencies are tested on real data",
    syllabus: "Functional dependencies · closure · candidate keys · 1NF to BCNF · lossless join",
    where: "The normalisation lab reads declared FDs from keys, discovers FDs that hold in the data, finds the normal form, generates the decomposition, and verifies it is lossless with a join.",
    without: "Normalisation would stay a paper exercise, disconnected from the tables the project actually stores.",
    file: "backend/services/normalization.py",
    sql: `
-- does student_id -> student_name hold in the data?
SELECT count(*) FILTER (WHERE d0 > 1) AS violations
FROM (SELECT student_id, count(DISTINCT student_name) AS d0
      FROM enrollment GROUP BY student_id) g;        -- 0 => holds

-- BCNF part, keyed by its candidate key
CREATE TABLE enrollment_student_id AS
  SELECT DISTINCT student_id, student_name, student_email
  FROM enrollment;
ALTER TABLE enrollment_student_id ADD PRIMARY KEY (student_id);

-- lossless? join the parts back and compare with the original
SELECT e.student_id, e.course_id, s.student_name, s.student_email,
       c.course_title, c.instructor, e.grade
FROM enrollment_course_id_student_id e
JOIN enrollment_student_id s USING (student_id)
JOIN enrollment_course_id  c USING (course_id)
EXCEPT SELECT * FROM enrollment;                      -- 0 rows`,
  },
  {
    eyebrow: "02 / CONCEPT 10 OF 10", title: "SQL and relational algebra run the application",
    syllabus: "SQL DML · joins · aggregates · subqueries · relational algebra",
    where: "The platform's own screens are SQL queries, and every SELECT a user runs is translated into relational algebra from its syntax tree:  π name (σ grade > 80 (student ⋈ enrollment)).",
    without: "No dashboard, no slow-query list, no algebra view: the app would have nothing to show.",
    file: "routes_projects.py  ·  executor.slow_queries  ·  security.py",
    sql: `
-- correlated subquery: pending approvals per project (project list)
SELECT p.name,
       (SELECT count(*) FROM approvals a
         WHERE a.project_id = p.project_id
           AND a.status = 'pending') AS pending
FROM projects p WHERE p.owner_id = $1;

-- aggregation: slowest queries, computed from the audit log
SELECT sql_text, count(*) AS calls, avg(duration_ms) AS mean_ms
FROM audit_log WHERE action = 'query' AND ok
GROUP BY sql_text ORDER BY mean_ms DESC LIMIT 20;

-- upsert: create or replace a business role
INSERT INTO business_roles (project_id, name, db_role, policy)
VALUES ($1, $2, $3, $4)
ON CONFLICT (project_id, name) DO UPDATE SET policy = EXCLUDED.policy;`,
  },
];

async function conceptsSection() {
  sectionSlide("DBMS concepts", "02 / BUILT ON DBMS CONCEPTS", "Without DBMS theory, it cannot be built",
    "Every layer of Normie is a database concept applied. Remove one and a feature stops working.")
    .addNotes("This section answers how Normie is built, and why it depends on the DBMS syllabus. Each of the next slides shows one concept, where it is used, what would break without it, and the real SQL the project runs.");

  // ---------------------------------------------------------- build order
  {
    const s = content("DBMS concepts", "02 / HOW IT WAS BUILT", "Built layer by layer, each layer a DBMS concept");
    const layers = [
      ["Control plane", "DDL · keys · constraints", "users, projects, approvals, audit"],
      ["Tenancy", "DCL · roles · GRANT", "a database and 3 roles per project"],
      ["Executor", "TCL · ACID · locking", "dry runs, read-only reads, commits"],
      ["Policy and algebra", "SQL parsing · algebra", "classify statements, σ π ⋈ γ"],
      ["Theory tools", "FDs · NF · ER mapping", "closure, keys, decomposition"],
      ["Copilot and UI", "catalog · optimiser", "tools over the live database"],
    ];
    const n = layers.length;
    const gap = 0.22;
    const cw = (W - 2 * M - gap * (n - 1)) / n;
    const y = TOP + 0.55;
    layers.forEach(([name, concept, what], i) => {
      const x = M + i * (cw + gap);
      text(s, String(i + 1).padStart(2, "0"), { x, y, w: cw, h: 0.5, fontFace: MONO, fontSize: 26, bold: true, color: C.accent1 });
      s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.7, w: cw, h: 3.3, fill: { color: i % 2 ? C.background1 : C.background2 }, line: { color: "E1E3E7", width: 0.75 } });
      text(s, name, { x: x + 0.15, y: y + 0.88, w: cw - 0.3, h: 0.6, fontSize: 16, bold: true, fontFace: THEME.headFontFace, color: C.text1 });
      text(s, concept, { x: x + 0.15, y: y + 1.55, w: cw - 0.3, h: 0.7, fontFace: MONO, fontSize: 11, bold: true, color: C.accent2 });
      text(s, what, { x: x + 0.15, y: y + 2.4, w: cw - 0.3, h: 1.4, fontSize: 13, color: C.text2 });
      if (i < n - 1) s.addShape(pres.shapes.LINE, { x: x + cw, y: y + 2.0, w: gap, h: 0.001, line: { color: C.text2, width: 1.25, endArrowType: "triangle" } });
    });
    text(s, "Each layer only works because the one beneath it enforces a database guarantee.", { x: M, y: y + 4.3, w: W - 2 * M, h: 0.4, fontSize: 14, italic: true, color: C.text2 });
    s.addNotes("The build order: first the control plane schema, then per-project databases and roles, then the executor that uses transactions, then the SQL policy and relational algebra, then the DBMS theory tools, and finally the copilot and UI on top. Every layer is a syllabus topic in action.");
  }

  // ---------------------------------------------------------- one slide per concept
  for (let i = 0; i < CONCEPTS.length; i++) {
    const c = CONCEPTS[i];
    const s = content("DBMS concepts", c.eyebrow, c.title);
    const codeLeft = i % 2 === 1; // alternate sides so the series does not feel like one template
    const tw = 4.75;
    const cw = W - 2 * M - tw - 0.45;
    const tx = codeLeft ? M + cw + 0.45 : M;
    const cx = codeLeft ? M : M + tw + 0.45;
    const y = TOP + 0.05;
    const label = (t, yy) => text(s, t, { x: tx, y: yy, w: tw, h: 0.26, fontFace: MONO, fontSize: 10.5, bold: true, color: C.accent2 });
    label("SYLLABUS", y);
    text(s, c.syllabus, { x: tx, y: y + 0.3, w: tw, h: 0.65, fontSize: 14, bold: true, color: C.text1 });
    label("WHERE IN DBFORGE", y + 1.1);
    text(s, c.where, { x: tx, y: y + 1.4, w: tw, h: 1.75, fontSize: 13.5, color: C.text1 });
    s.addShape(pres.shapes.RECTANGLE, { x: tx, y: y + 3.3, w: tw, h: 1.55, fill: { color: C.background2 }, line: { color: C.background2, width: 0 } });
    text(s, "WITHOUT IT", { x: tx + 0.2, y: y + 3.45, w: tw - 0.4, h: 0.26, fontFace: MONO, fontSize: 10.5, bold: true, color: C.accent6 });
    text(s, c.without, { x: tx + 0.2, y: y + 3.75, w: tw - 0.4, h: 1.0, fontSize: 13, color: C.text1 });
    codePanel(s, cx, y, cw, 4.85, c.sql, c.file);
    s.addNotes(`${c.title}. Syllabus: ${c.syllabus}. ${c.where} Without it: ${c.without} The SQL on the slide is taken from ${c.file}.`);
  }

  // ---------------------------------------------------------- SQL command index
  {
    const s = content("DBMS concepts", "02 / SQL COMMAND INDEX", "The SQL that builds and runs Normie");
    const groups = [
      ["DDL", "Define the schemas", ["CREATE DATABASE", "CREATE TABLE", "CREATE TABLE AS", "ALTER TABLE", "CREATE INDEX", "CREATE UNIQUE INDEX … WHERE", "CREATE VIEW", "CREATE FUNCTION", "CREATE TRIGGER", "CREATE POLICY", "COMMENT ON", "DROP DATABASE"]],
      ["DCL", "Create the security model", ["CREATE ROLE", "ALTER ROLE … SET", "GRANT", "GRANT (columns)", "GRANT role TO role", "REVOKE", "ALTER DEFAULT PRIVILEGES", "SET LOCAL ROLE", "ENABLE ROW LEVEL SECURITY"]],
      ["DML", "Power every screen and undo", ["SELECT … JOIN", "GROUP BY / FILTER", "correlated subquery", "WITH RECURSIVE", "EXCEPT", "INSERT … RETURNING", "INSERT … ON CONFLICT", "UPDATE … FROM", "DELETE … RETURNING", "jsonb_populate_recordset"]],
      ["TCL", "Make dry runs and approvals safe", ["BEGIN", "BEGIN READ ONLY", "COMMIT", "ROLLBACK", "SELECT … FOR UPDATE", "SET LOCAL statement_timeout", "lock_timeout", "idle_in_transaction_session_timeout"]],
      ["OPTIMISER", "Plans, statistics, recovery tools", ["EXPLAIN (FORMAT JSON)", "EXPLAIN ANALYZE, BUFFERS", "ANALYZE", "setval", "pg_catalog queries", "pg_total_relation_size", "pg_relation_size", "pg_dump -Fc", "pg_restore --clean"]],
    ];
    const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } });
    const rows = [[hdr("Category"), hdr("Purpose in Normie"), hdr("Commands Normie executes")]];
    for (const [k, sub, cmds] of groups) {
      rows.push([
        { text: k, options: { fontFace: MONO, bold: true, color: C.accent2, fontSize: 12.5 } },
        { text: sub, options: { color: C.text2 } },
        // non-breaking spaces inside a command: lines may only break between commands
        { text: cmds.map((c) => c.replace(/ /g, "\u00A0")).join("   ·   "), options: { fontFace: MONO, fontSize: 11.5, color: C.text1 } },
      ]);
    }
    s.addTable(rows, { x: M, y: TOP + 0.05, w: W - 2 * M, colW: [1.75, 2.05, 8.33], fontSize: 13, color: C.text1,
      border: { type: "solid", color: "E1E3E7", pt: 0.75 }, rowH: [0.42, 0.92, 0.92, 0.92, 0.92, 0.92], valign: "middle", margin: [0.06, 0.12, 0.06, 0.12] });
    s.addNotes("Every command on this slide is executed by Normie in normal operation. DDL defines the control plane and tenant schemas, DCL creates the per-project security model, DML powers the screens and undo, TCL makes dry runs and approvals safe, and the optimiser commands power the tuning tools.");
  }
}

// ---------------------------------------------------------- syllabus coverage (all 25 units, honest status)
const SYLLABUS = [
  ["1", "DBMS basics, 3-schema architecture", "Control plane vs project databases; per-role views as external schemas", "built"],
  ["2", "ER model: entities, attributes, keys", "Chen ER diagram from the live schema; design_from_er", "built"],
  ["3", "Cardinality, participation, weak entities, ISA", "1/N/M, total participation, weak entity + identifying relationship", "built"],
  ["4", "ER to relational mapping", "Textbook rules in tools/mapping; reverse mapping for the diagram", "built"],
  ["5", "Relational model, keys, integrity constraints", "PK, FK, UNIQUE, CHECK, NOT NULL in every schema", "built"],
  ["6", "Relational algebra", "σ π ⋈ γ generated from each SELECT's syntax tree", "built"],
  ["7", "Relational calculus (TRC / DRC)", "Calculus view of a query", "planned"],
  ["8", "SQL: DDL, DML, joins, subqueries, views", "Every screen, migration and undo is SQL", "built"],
  ["9", "Functional dependencies, closure, cover", "Declared + data-observed FDs; closure and minimal cover", "built"],
  ["10", "Candidate keys, prime attributes", "Computed for every analysed table", "built"],
  ["11", "Normalisation 1NF to BCNF", "Normal form per table; generated 3NF/BCNF migrations", "built"],
  ["12", "Lossless join, dependency preservation", "Chase tableau; join-back EXCEPT check on real data", "built"],
  ["13", "Indexing, B+-trees", "FK indexes in generated DDL; what-if index benchmark", "built"],
];
const SYLLABUS2 = [
  ["14", "File organisation, storage", "Table and index sizes from pg_total_relation_size", "partly"],
  ["15", "Query processing and optimisation", "EXPLAIN ANALYZE plans; measured before/after", "built"],
  ["16", "Transactions, ACID", "Rolled-back dry runs; atomic migrations; drift check", "built"],
  ["17", "Schedules, serializability", "Two-session precedence-graph lab", "planned"],
  ["18", "Concurrency control: 2PL, MVCC", "SELECT … FOR UPDATE claims; READ ONLY snapshots", "built"],
  ["19", "Deadlocks", "lock_timeout bounds waits; detection demo still to add", "partly"],
  ["20", "Isolation levels and anomalies", "READ ONLY reads; anomaly lab still to add", "partly"],
  ["21", "Recovery: log, undo, backups", "Append-only audit log, before-image undo, pg_dump / pg_restore", "built"],
  ["22", "Security: authorisation, GRANT / REVOKE", "Database + 3 roles per project; business roles; RLS", "built"],
  ["23", "Triggers, stored procedures", "PL/pgSQL function + trigger guard the audit log", "built"],
  ["24", "Distributed DB, replication", "Read replicas and tenant placement", "planned"],
  ["25", "NoSQL, CAP (overview)", "JSONB documents for chat history and policies", "partly"],
];
function syllabusTable(title, rows, eyebrow) {
  const s = content("Verification", eyebrow, title);
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } });
  const status = (st) => ({
    text: st === "built" ? "BUILT ON" : st === "partly" ? "PARTLY" : "PLANNED",
    options: { bold: true, fontFace: MONO, fontSize: 10.5, color: st === "built" ? C.accent4 : st === "partly" ? C.accent5 : C.text2 },
  });
  const data = [[hdr("#"), hdr("Syllabus topic"), hdr("How Normie uses it"), hdr("Status")],
    ...rows.map(([n, t, how, st]) => [{ text: n, options: { fontFace: MONO, color: C.text2 } }, { text: t, options: { bold: true } }, how, status(st)])];
  s.addTable(data, { x: M, y: TOP - 0.05, w: W - 2 * M, colW: [0.5, 4.1, 6.13, 1.4], fontSize: 12, color: C.text1,
    border: { type: "solid", color: "E1E3E7", pt: 0.75 }, rowH: 0.36, valign: "middle", margin: [0.03, 0.1, 0.03, 0.1] });
  return s;
}
function syllabusCoverage() {
  syllabusTable("Syllabus coverage, units 1 to 13", SYLLABUS, "06 / SYLLABUS 1 OF 2")
    .addNotes("Units 1 to 13 of SYLLABUS_MAPPING.md. 'Built on' means Normie depends on the concept to work, not just that it can demonstrate it. Relational calculus is the one gap here.");
  syllabusTable("Syllabus coverage, units 14 to 25", SYLLABUS2, "06 / SYLLABUS 2 OF 2")
    .addNotes("Units 14 to 25. The planned items, a serializability lab, deadlock and isolation-anomaly demos and replication, are listed as next steps. Partly means the concept is used but not yet shown as a dedicated demo.");
}

(async () => {
  await makeCrops();
  // =============================================================== 1. title
  pres.addSection({ title: "Introduction" });
  {
    const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
    s.addText("DBMS PROJECT  /  2026", { placeholder: "eyebrow" });
    s.addText("Normie", { placeholder: "title" });
    s.addText("An agentic control plane that designs, builds, secures and operates real PostgreSQL databases.", { placeholder: "body" });
    text(s, "PostgreSQL 18  ·  FastAPI  ·  PydanticAI  ·  Next.js 16", { x: M, y: 5.6, w: 6, h: 0.35, fontFace: MONO, fontSize: 12, color: "8A919C" });
    const b = await fit(CROP("er.png"), 7.15, 1.0, 5.6, 5.5);
    s.addShape(pres.shapes.RECTANGLE, { x: b.x - 0.08, y: b.y - 0.08, w: b.w + 0.16, h: b.h + 0.16, fill: { color: C.background1 }, line: { color: "232A35", width: 0.75 }, shadow: shadow() });
    s.addImage({ path: CROP("er.png"), ...b, altText: "Chen-notation ER diagram generated by Normie from a live database" });
    s.addNotes("Normie turns a plain-English description into a real, normalised, secured PostgreSQL database and then keeps operating it with an AI copilot. The picture on the right is not a drawing: it was generated by Normie from the live database of a demo project.");
  }

  // =============================================================== 2. what it does
  {
    const s = content("Introduction", "00 / OVERVIEW", "What Normie does");
    const items = [
      ["LuDatabase", "Creates real databases on demand", "Each project is an isolated PostgreSQL database with owner, read-write and read-only roles and encrypted credentials."],
      ["LuBot", "Chats with your database", "A copilot designs schemas from a description, writes SQL, seeds data, tunes queries and explains plans, using real tools."],
      ["LuShieldCheck", "Never runs risky changes alone", "Every change is dry-run for real, risk-scored, and waits for a human approval. PostgreSQL roles enforce it."],
      ["LuUndo2", "Remembers and undoes", "Append-only audit log, before-image undo for writes, numbered migrations, and one-click logical backups."],
    ];
    const colW = (W - 2 * M - 0.5) / 2;
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (colW + 0.5);
      const y = TOP + 0.35 + Math.floor(i / 2) * 2.25;
      await disc(s, items[i][0], x, y, 0.72);
      text(s, items[i][1], { x: x + 1.0, y: y - 0.02, w: colW - 1.0, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace, color: C.text1 });
      text(s, items[i][2], { x: x + 1.0, y: y + 0.5, w: colW - 1.1, h: 1.3, fontSize: 15, color: C.text2 });
    }
    s.addNotes("Four capabilities. The key idea for a DBMS course: the AI never has the final say. Deterministic code and PostgreSQL itself decide what is correct and what is allowed.");
  }

  // =============================================================== 3. before / after
  {
    const s = content("Introduction", "00 / WHY A REBUILD", "From a mock-up to a working system");
    const colW = (W - 2 * M - 0.4) / 2;
    const y = TOP + 0.2;
    const h = 3.75;
    s.addShape(pres.shapes.RECTANGLE, { x: M, y, w: colW, h, fill: { color: C.background2 }, line: { color: C.background2, width: 0 } });
    s.addShape(pres.shapes.RECTANGLE, { x: M + colW + 0.4, y, w: colW, h, fill: { color: C.background1 }, line: { color: "E1E3E7", width: 0.75 }, shadow: shadow() });
    text(s, "BEFORE  /  V1", { x: M + 0.4, y: y + 0.35, w: colW - 0.8, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: C.text2 });
    text(s, "AFTER  /  V2", { x: M + colW + 0.8, y: y + 0.35, w: colW - 0.8, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: C.accent2 });
    text(s, bullets([
      "“Deploy” only incremented a counter: no database existed",
      "Projects, users and approvals lived in Python dictionaries",
      "Query results and plans were hard-coded strings",
      "UI buttons used timers to fake work",
      "Placeholder JWT secret; any @load.test e-mail could log in",
    ], 15, C.text2), { x: M + 0.4, y: y + 0.85, w: colW - 0.8, h: h - 1.1 });
    text(s, bullets([
      "Every project is a real PostgreSQL database with three roles",
      "Persistent control plane: users, encrypted credentials, audit",
      "Real execution, real EXPLAIN ANALYZE, real dry runs",
      "Copilot acts through typed tools against the live database",
      "argon2, httpOnly JWT, CSRF guard, cross-tenant isolation tested",
    ], 15), { x: M + colW + 0.8, y: y + 0.85, w: colW - 0.8, h: h - 1.1 });
    s.addNotes("The first version looked like a product but did not do the work. The theory tools, closure, normal forms and ER mapping, were sound and were kept. Everything around them was rebuilt so that every screen talks to a real database.");
  }

  // =============================================================== 4. section: architecture
  sectionSlide("Architecture", "01 / ARCHITECTURE", "How the pieces fit", "A control plane that holds metadata, and one isolated PostgreSQL database per project.")
    .addNotes("Two kinds of database: the control plane, which knows about users, projects, approvals and the audit log, and the tenant databases, which hold each project's real data.");

  // =============================================================== 5. architecture diagram
  {
    const s = content("Architecture", "01 / ARCHITECTURE", "Request path: from a sentence to a committed change");
    const box = (x, y, w, h, title, sub, fill = C.background1, tcolor = C.text1, line = "D5D8DD") => {
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 1 }, objectName: `box-${title}` });
      text(s, title, { x: x + 0.15, y: y + 0.14, w: w - 0.3, h: 0.35, fontSize: 15, bold: true, color: tcolor, fontFace: THEME.headFontFace });
      text(s, sub, { x: x + 0.15, y: y + 0.5, w: w - 0.3, h: h - 0.6, fontSize: 11.5, color: tcolor === C.text1 ? C.text2 : "C9CDD3", fontFace: MONO });
    };
    const arrow = (x1, y1, x2, y2, label) => {
      s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, flipV: y2 < y1, line: { color: C.text2, width: 1.5, endArrowType: "triangle" } });
      if (label) text(s, label, { x: Math.min(x1, x2), y: Math.min(y1, y2) - 0.3, w: Math.max(1.4, Math.abs(x2 - x1)), h: 0.25, fontSize: 10, fontFace: MONO, color: C.text2, align: "center" });
    };
    const y1 = 2.15;
    box(M, y1, 2.3, 1.25, "Browser", "Next.js UI\nhttpOnly session");
    box(3.35, y1, 2.4, 1.25, "FastAPI", "auth, CSRF guard\nownership checks");
    box(6.25, y1, 2.75, 1.25, "Copilot agent", "PydanticAI + Nemotron\n6 specialist toolsets", HEX.dk1, C.background1, HEX.dk1);
    box(9.5, y1, 3.23, 1.25, "Deterministic tools", "closure, normal forms,\nER mapping, algebra");
    arrow(M + 2.3, y1 + 0.62, 3.35, y1 + 0.62);
    arrow(5.75, y1 + 0.62, 6.25, y1 + 0.62);
    arrow(9.0, y1 + 0.62, 9.5, y1 + 0.62);
    const y2 = 4.15;
    box(3.35, y2, 2.4, 1.3, "Approval gate", "dry run in a\nrolled-back txn\nrisk score", C.background2);
    box(6.25, y2, 2.75, 1.3, "Executor", "role-scoped pools\nbefore-images\ndrift check", C.background2);
    arrow(4.55, y1 + 1.25, 4.55, y2, "");
    arrow(7.6, y1 + 1.25, 7.6, y2, "");
    arrow(5.75, y2 + 0.65, 6.25, y2 + 0.65);
    // tenant DB with three roles
    s.addShape(pres.shapes.RECTANGLE, { x: 9.5, y: y2 - 0.1, w: 3.23, h: 2.35, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.5 } });
    text(s, "Project database", { x: 9.68, y: y2 + 0.03, w: 2.9, h: 0.35, fontSize: 15, bold: true, fontFace: THEME.headFontFace, color: C.text1 });
    const roles = [["_ro", "every read, the copilot's queries"], ["_rw", "approved data changes"], ["_owner", "approved migrations only"]];
    roles.forEach(([r, d], i) => {
      marker(s, 9.7, y2 + 0.6 + i * 0.5, C.accent1);
      text(s, r, { x: 9.9, y: y2 + 0.5 + i * 0.5, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: C.accent2 });
      text(s, d, { x: 10.75, y: y2 + 0.52 + i * 0.5, w: 1.95, h: 0.45, fontSize: 11, color: C.text2 });
    });
    arrow(9.0, y2 + 0.65, 9.5, y2 + 0.65);
    box(M, y2, 2.3, 1.3, "Control plane", "users, projects,\nencrypted creds,\naudit, chats", C.background2);
    arrow(3.35, y2 + 0.65, M + 2.3, y2 + 0.65);
    text(s, "Reads run as _ro inside READ ONLY transactions. DDL runs as _owner only after a human approves it.", { x: M, y: 6.15, w: 8.6, h: 0.5, fontSize: 13, italic: true, color: C.text2 });
    s.addNotes("Follow the arrows: the browser talks only to the API. The copilot never connects to the database directly; it calls tools. Any change goes to the approval gate, which dry-runs it, and the executor runs approved work with the least-privileged role that can do it.");
  }

  // =============================================================== 6. tenancy + credentials
  {
    const s = content("Architecture", "01 / ISOLATION", "One database per project, three least-privilege roles");
    const rows = [
      [{ text: "Role", options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } }, { text: "Can do", options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } }, { text: "Used for", options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } }],
      [{ text: "t_…_owner", options: { fontFace: MONO, bold: true, color: C.accent2 } }, "Owns the schema; DDL", "Applying approved migrations"],
      [{ text: "t_…_rw", options: { fontFace: MONO, bold: true, color: C.accent2 } }, "SELECT, INSERT, UPDATE, DELETE", "Approved data changes, apps"],
      [{ text: "t_…_ro", options: { fontFace: MONO, bold: true, color: C.accent2 } }, "SELECT; forced READ ONLY", "Every read, copilot, BI tools"],
    ];
    s.addTable(rows, { x: M, y: TOP + 0.2, w: 7.4, colW: [1.7, 2.9, 2.8], fontSize: 14, color: C.text1, border: { type: "solid", color: "E1E3E7", pt: 0.75 }, rowH: 0.62, valign: "middle", margin: [0.05, 0.12, 0.05, 0.12] });
    const px = 8.55;
    const facts = [
      ["LuKeyRound", "Random 32-character passwords", "Encrypted at rest with Fernet (AES + HMAC); decrypted only on reveal."],
      ["LuLock", "Cross-tenant CONNECT revoked", "A project's credentials cannot even open another database. Tested."],
      ["LuHistory", "Every reveal and rotation audited", "Rotation refreshes connection pools without downtime."],
    ];
    for (let i = 0; i < facts.length; i++) {
      const y = TOP + 0.2 + i * 1.5;
      await disc(s, facts[i][0], px, y, 0.56);
      text(s, facts[i][1], { x: px + 0.8, y: y - 0.02, w: W - M - px - 0.8, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
      text(s, facts[i][2], { x: px + 0.8, y: y + 0.38, w: W - M - px - 0.8, h: 0.9, fontSize: 13, color: C.text2 });
    }
    text(s, "Identifiers come from a random hex prefix, never from user input, so provisioning has nothing to inject into.", { x: M, y: TOP + 3.0, w: 7.4, h: 0.8, fontSize: 14, italic: true, color: C.text2 });
    s.addNotes("This answers 'create the database on the go with secure credentials'. Click New project and Normie creates a real database and three login roles in about a second. The Connect page shows connection strings; the password only appears when you reveal it, and that reveal is logged.");
  }

  await conceptsSection();

  // =============================================================== 7. section: safety
  sectionSlide("Safety model", "03 / SAFETY MODEL", "Nothing risky runs without a human", "Policy in code, enforcement in PostgreSQL, and an approval for every change that matters.")
    .addNotes("This is the most important idea in the project: how an AI can be trusted with a real database.");

  // =============================================================== 8. two layers
  {
    const s = content("Safety model", "03 / DEFENCE IN DEPTH", "Two independent layers decide what may run");
    const colW = (W - 2 * M - 0.9) / 2;
    const y = TOP + 0.25;
    const card = async (x, ic, k, title, items) => {
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: colW, h: 3.55, fill: { color: C.background1 }, line: { color: "E1E3E7", width: 0.75 }, shadow: shadow() });
      await disc(s, ic, x + 0.35, y + 0.35, 0.62);
      text(s, k, { x: x + 1.15, y: y + 0.36, w: colW - 1.4, h: 0.3, fontFace: MONO, fontSize: 11, bold: true, color: C.accent2 });
      text(s, title, { x: x + 1.15, y: y + 0.66, w: colW - 1.4, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace, color: C.text1 });
      text(s, bullets(items, 14.5), { x: x + 0.4, y: y + 1.35, w: colW - 0.8, h: 2.9 });
    };
    await card(M, "LuFileCode2", "LAYER 1  /  DBFORGE POLICY", "sqlglot syntax tree", [
      "Every statement parsed and classified: read, write, DDL",
      "Blocks system catalogs, pg_sleep, dblink, COPY, CREATE ROLE",
      "Catches writes hidden inside a SELECT (data-modifying CTEs)",
      "Stacked statements only where a migration expects them",
    ]);
    await card(M + colW + 0.9, "LuDatabase", "LAYER 2  /  POSTGRESQL", "Roles and transactions", [
      "Reads physically run as _ro in READ ONLY transactions",
      "_rw cannot CREATE or DROP; the server refuses",
      "Business roles enforced with GRANTs and row-level security",
      "Even if layer 1 were fooled, PostgreSQL still says no",
    ]);
    await disc(s, "LuArrowRight", M + colW + 0.14, y + 1.47, 0.62, C.text1);
    s.addNotes("Layer one is Normie's own policy, built on a real SQL parser. Layer two is the database: the copilot's queries run as a read-only role, so a destructive statement fails inside PostgreSQL regardless of what the parser concluded. Both layers are covered by tests.");
  }

  // =============================================================== 9. approval gate
  {
    const s = content("Safety model", "03 / THE APPROVAL GATE", "Every change is rehearsed before anyone approves it");
    const steps = [
      ["Dry run for real", "Execute inside a transaction, then ROLLBACK. DDL is transactional in PostgreSQL."],
      ["Measure the impact", "Rows touched, before-images, schema diff, cascaded deletes."],
      ["Score the risk", "Low auto-commits; medium and high wait for a person."],
      ["Commit with a drift check", "Rolled back if it now touches more rows than approved."],
      ["Audit and undo", "Append-only log; reverse statement for reversible writes."],
    ];
    const x = M;
    steps.forEach(([t, d], i) => {
      const y = TOP + 0.1 + i * 0.97;
      text(s, String(i + 1).padStart(2, "0"), { x, y, w: 0.6, h: 0.45, fontFace: MONO, fontSize: 22, bold: true, color: C.accent1 });
      text(s, t, { x: x + 0.75, y: y + 0.02, w: 4.9, h: 0.35, fontSize: 16, bold: true, color: C.text1 });
      text(s, d, { x: x + 0.75, y: y + 0.38, w: 4.9, h: 0.55, fontSize: 12.5, color: C.text2 });
    });
    const b = await fit(CROP("approval-card.png"), 6.55, TOP + 0.05, W - M - 6.55, 4.45);
    s.addShape(pres.shapes.RECTANGLE, { x: b.x - 0.05, y: b.y - 0.05, w: b.w + 0.1, h: b.h + 0.1, fill: { color: C.background1 }, line: { color: "D5D8DD", width: 0.75 }, shadow: shadow() });
    s.addImage({ path: CROP("approval-card.png"), ...b, altText: "Approval card in Normie showing a schema diff, the SQL, a rollback script and the dry-run result" });
    text(s, "Real card: the copilot's 4-table clinic schema, dry-run in 79 ms, not yet applied.", { x: b.x, y: b.y + b.h + 0.12, w: b.w, h: 0.4, fontSize: 11, italic: true, color: C.text2 });
    s.addNotes("Walk through the five steps. Point at the screenshot: create table appointment, doctor, patient, prescription; the exact SQL; the rollback script; 'Dry run OK in 79 ms. Nothing has changed yet.'");
  }

  // =============================================================== 10. risk table
  {
    const s = content("Safety model", "03 / RISK POLICY", "Risk is measured by the dry run, not guessed");
    const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } });
    const tag = (t, c) => ({ text: t, options: { bold: true, color: c, fontFace: MONO } });
    s.addTable([
      [hdr("Risk"), hdr("Examples"), hdr("What happens")],
      [tag("LOW", C.accent4), "INSERT; UPDATE or DELETE touching at most 1 row", "Auto-commit (optional), still undoable"],
      [tag("MEDIUM", C.accent5), "2 to 100 rows; CREATE TABLE / INDEX / VIEW; ALTER ADD", "Approval card with preview"],
      [tag("HIGH", C.accent6), "No WHERE; over 100 rows; DROP; TRUNCATE; ALTER DROP", "Red approval + automatic pg_dump backup"],
    ], { x: M, y: TOP + 0.15, w: W - 2 * M, colW: [1.6, 6.2, 4.33], fontSize: 14, color: C.text1, border: { type: "solid", color: "E1E3E7", pt: 0.75 }, rowH: 0.6, valign: "middle", margin: [0.05, 0.12, 0.05, 0.12] });
    const y = TOP + 3.0;
    const colW = (W - 2 * M - 0.5) / 2;
    const notes = [
      ["LuNetwork", "Cascades are counted", "A DELETE that cascades through ON DELETE CASCADE reports every affected table, counts towards risk, and is not offered as reversible."],
      ["LuHash", "Sequences are rewound", "Rolled-back inserts still consume serial ids. Each dry run snapshots sequences and rewinds them with a compare-and-set."],
    ];
    for (let i = 0; i < 2; i++) {
      const x = M + i * (colW + 0.5);
      await disc(s, notes[i][0], x, y, 0.56);
      text(s, notes[i][1], { x: x + 0.8, y: y - 0.02, w: colW - 0.8, h: 0.35, fontSize: 16, bold: true, color: C.text1 });
      text(s, notes[i][2], { x: x + 0.8, y: y + 0.38, w: colW - 0.9, h: 1.2, fontSize: 13, color: C.text2 });
    }
    s.addNotes("The risk depends on what the dry run actually touched. The two notes at the bottom are subtle PostgreSQL behaviours we found while testing: cascades silently change other tables, and sequences are not transactional.");
  }

  // =============================================================== 11. section: copilot
  sectionSlide("The copilot", "04 / THE COPILOT", "Deterministic where correctness matters", "The language model proposes. Code and PostgreSQL decide.")
    .addNotes("Principle one from the agent specification.");

  // =============================================================== 12. toolsets
  {
    const s = content("The copilot", "04 / AGENT DESIGN", "One orchestrator, six specialist toolsets");
    const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: HEX.dk1 } } });
    const mono = (t) => ({ text: t, options: { fontFace: MONO, fontSize: 12, color: C.accent2 } });
    s.addTable([
      [hdr("Specialist"), hdr("Tools"), hdr("Who decides")],
      ["Design / Schema", mono("design_from_er, analyze_normalization"), "ER validator, textbook mapping, FD algorithms"],
      ["Query", mono("get_schema, run_query, explain_query"), "Read-only role; algebra from the syntax tree"],
      ["Transaction", mono("propose_change"), "Approval gate and the human"],
      ["Security", mono("create_business_role, test_access"), "PostgreSQL GRANTs and row-level security"],
      ["Tuning", mono("slow_queries, benchmark_index"), "EXPLAIN ANALYZE before and after, rolled back"],
      ["Recovery", mono("recent_activity, request_undo, create_backup"), "Captured before-images, pg_dump"],
    ], { x: M, y: TOP + 0.1, w: 8.3, colW: [1.9, 3.3, 3.1], fontSize: 13, color: C.text1, border: { type: "solid", color: "E1E3E7", pt: 0.75 }, rowH: 0.56, valign: "middle", margin: [0.05, 0.1, 0.05, 0.1] });
    const px = 9.35;
    const facts = [
      ["LuBrainCircuit", "Live context each turn", "Current schema and the status of recent approvals; never credentials."],
      ["LuShieldCheck", "Data is data", "Sees at most 30 rows; told to treat values as data, not instructions."],
      ["LuWorkflow", "Survives disconnects", "Runs as a detached task; the transcript is always saved."],
    ];
    for (let i = 0; i < 3; i++) {
      const y = TOP + 0.15 + i * 1.45;
      await disc(s, facts[i][0], px, y, 0.52);
      text(s, facts[i][1], { x: px + 0.72, y: y - 0.02, w: W - M - px - 0.72, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
      text(s, facts[i][2], { x: px + 0.72, y: y + 0.36, w: W - M - px - 0.72, h: 0.95, fontSize: 12.5, color: C.text2 });
    }
    s.addNotes("The specialists from AGENTS.md are implemented as toolsets in one agent, so the conversation keeps its context. The right-hand column of the table is the point: each specialist's output is checked by something deterministic.");
  }

  // =============================================================== 13. section: ER + product
  sectionSlide("ER diagram & product", "05 / ER DIAGRAM & PRODUCT", "Standard notation, live data", "The ER diagram is reverse-engineered from the running database, in Chen notation.")
    .addNotes("Now the parts you can see.");

  // =============================================================== 14. ER diagram
  {
    const s = content("ER diagram & product", "05 / ER DIAGRAM", "Chen ER diagram, derived from the live schema");
    const b = await fit(CROP("er.png"), M, TOP, 8.25, 4.95, "left");
    s.addShape(pres.shapes.RECTANGLE, { x: b.x - 0.05, y: b.y - 0.05, w: b.w + 0.1, h: b.h + 0.1, fill: { color: C.background1 }, line: { color: "D5D8DD", width: 0.75 } });
    s.addImage({ path: CROP("er.png"), ...b, altText: "Chen ER diagram of the company demo: employee, department, project, dependent" });
    const px = 9.25;
    text(s, "REVERSE MAPPING RULES", { x: px, y: TOP, w: W - M - px, h: 0.3, fontFace: MONO, fontSize: 11, bold: true, color: C.accent2 });
    const rules = [
      ["Foreign key", "1:N relationship (diamond)"],
      ["Junction table", "M:N; extra columns become relationship attributes"],
      ["Composite PK holding an FK", "Weak entity, identifying relationship"],
      ["NOT NULL foreign key", "Total participation (double line)"],
      ["Unique foreign key", "1:1 relationship"],
    ];
    rules.forEach(([a, bb], i) => {
      const y = TOP + 0.45 + i * 0.86;
      marker(s, px, y + 0.1);
      text(s, a, { x: px + 0.25, y, w: W - M - px - 0.25, h: 0.3, fontSize: 14, bold: true, color: C.text1 });
      text(s, bb, { x: px + 0.25, y: y + 0.32, w: W - M - px - 0.25, h: 0.5, fontSize: 12.5, color: C.text2 });
    });
    s.addNotes("Rectangles are entities, ellipses attributes, underlined ones primary keys, dashed ones foreign keys, diamonds relationships with 1 and N. DEPENDENT is a weak entity in a double rectangle, linked by the identifying relationship dependent_of. works_on is a many-to-many relationship carrying the hours attribute. None of this was drawn by hand.");
  }

  // =============================================================== 15. ER layout maths
  {
    const s = content("ER diagram & product", "05 / LAYOUT", "Readable without scrolling, even for large schemas");
    const blocks = [
      ["Entities first", "dagre places entity clusters; the gap between ranks is one diamond width, so a diamond fits between its two entities.", "rank gap ≥ max diamond width + 16"],
      ["Diamonds on the midpoint", "Parallel relationships between the same pair fan out along the normal of the line.", "offset_k = (k − (m−1)/2) · (h + 26)"],
      ["Attributes in the gaps", "Each gap between relationship lines holds as many ellipses as fit; if not, the orbit grows.", "cap = ⌊span / minSep⌋ + 1"],
      ["Fit and focus", "The direction with the larger fitted scale wins; big schemas focus on one entity and its neighbours.", "scale = min(W / w, H / h)"],
    ];
    const colW = (W - 2 * M - 0.5) / 2;
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (colW + 0.5);
      const y = TOP + 0.2 + Math.floor(i / 2) * 2.4;
      text(s, String(i + 1).padStart(2, "0"), { x, y, w: 0.6, h: 0.4, fontFace: MONO, fontSize: 20, bold: true, color: C.accent1 });
      text(s, blocks[i][0], { x: x + 0.7, y: y + 0.02, w: colW - 0.7, h: 0.35, fontSize: 17, bold: true, color: C.text1 });
      text(s, blocks[i][1], { x: x + 0.7, y: y + 0.42, w: colW - 0.8, h: 0.85, fontSize: 13, color: C.text2 });
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.7, y: y + 1.32, w: colW - 0.9, h: 0.5, fill: { color: C.background2 }, line: { color: C.background2, width: 0 } });
      text(s, blocks[i][2], { x: x + 0.85, y: y + 1.32, w: colW - 1.2, h: 0.5, fontFace: MONO, fontSize: 13, color: C.text1, valign: "middle" });
    }
    s.addNotes("The layout is computed, not hand-placed. Minimum separation between two ellipses on an orbit of radius R is two times arcsine of width over two R. Gaps too small for that get no attributes, which is why attributes never sit on a relationship line.");
  }

  // =============================================================== 16. product tour
  {
    const s = content("ER diagram & product", "05 / PRODUCT TOUR", "A Supabase-style workspace around the copilot");
    const shots = [
      ["table-editor.png", "TABLE EDITOR"],
      ["sql-editor-dark.png", "SQL EDITOR"],
      ["schema-diagram.png", "TABLE DIAGRAM"],
    ];
    const subs = ["Inline edits go through the approval gate", "Results, relational algebra, real plans", "Physical schema from pg_catalog"];
    const gw = (W - 2 * M - 0.8) / 3;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (gw + 0.4);
      const b = await fit(CROP(shots[i][0]), x, TOP, gw, 4.15);
      s.addShape(pres.shapes.RECTANGLE, { x: b.x - 0.04, y: b.y - 0.04, w: b.w + 0.08, h: b.h + 0.08, fill: { color: C.background1 }, line: { color: "D5D8DD", width: 0.75 }, shadow: shadow() });
      s.addImage({ path: CROP(shots[i][0]), ...b, altText: shots[i][1] + " screen" });
      text(s, shots[i][1], { x: b.x, y: TOP + 4.3, w: b.w, h: 0.28, fontFace: MONO, fontSize: 11, bold: true, color: C.accent2 });
      text(s, subs[i], { x: b.x, y: TOP + 4.6, w: b.w, h: 0.35, fontSize: 13, color: C.text2 });
    }
    s.addNotes("Every screen is backed by live data. Edits in the table editor go through the same approval gate as the copilot's changes. The SQL editor shows the relational algebra computed from the syntax tree, and real EXPLAIN ANALYZE plans.");
  }

  // =============================================================== 17. responsive
  {
    const s = content("ER diagram & product", "05 / RESPONSIVE LAYOUT", "Responsive by construction, not by breakpoints");
    const rules = [
      ["Copilot docks only if content keeps 640 px", "dock = vw − sidebar − panel ≥ 640"],
      ["Panel width follows the viewport", "panel = clamp(0.30 · vw, 340, 760)"],
      ["Card grids reflow continuously", "cols = ⌊(W + gap) / (X + gap)⌋"],
      ["Fixed sets never leave an orphan", "4 items → 1, 2 or 4 columns only"],
      ["Spacing scales with the container", "clamp(1rem, 0.5rem + 2.5cqi, 2rem)"],
    ];
    rules.forEach(([a, f], i) => {
      const y = TOP + 0.1 + i * 0.97;
      marker(s, M, y + 0.12);
      text(s, a, { x: M + 0.28, y, w: 7.2, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
      text(s, f, { x: M + 0.28, y: y + 0.4, w: 7.2, h: 0.35, fontFace: MONO, fontSize: 13, color: C.accent2 });
    });
    const p1 = await fit(SHOT("mobile-approvals.png"), 8.3, TOP, 2.05, 4.95);
    const p2 = await fit(SHOT("mobile-connect.png"), 10.65, TOP, 2.05, 4.95);
    for (const [f, b] of [["mobile-approvals.png", p1], ["mobile-connect.png", p2]]) {
      s.addShape(pres.shapes.RECTANGLE, { x: b.x - 0.05, y: b.y - 0.05, w: b.w + 0.1, h: b.h + 0.1, fill: { color: C.background1 }, line: { color: "D5D8DD", width: 0.75 }, shadow: shadow() });
      s.addImage({ path: SHOT(f), ...b, altText: "Normie on a 390 px phone screen" });
    }
    s.addNotes("Layouts react to the width a component actually gets, using container queries, because opening the copilot changes the space available. The two phone screenshots are real renders at 390 pixels.");
  }

  // =============================================================== 18. section: verification
  sectionSlide("Verification", "06 / VERIFICATION", "Proven against a real PostgreSQL", "Integration tests create throwaway project databases, attack them, and drop them.")
    .addNotes("Claims are only as good as their tests.");

  // =============================================================== 19. stats
  {
    const s = content("Verification", "06 / EVIDENCE", "What the test suite proves");
    const stats = [["37", "automated tests, all passing"], ["3", "least-privilege roles per database"], ["0", "rows changed by any dry run"], ["100%", "of executed statements audited"]];
    const sw = (W - 2 * M - 0.9) / 4;
    stats.forEach(([n, l], i) => {
      const x = M + i * (sw + 0.3);
      text(s, n, { x, y: TOP + 0.05, w: sw, h: 1.0, fontSize: 60, bold: true, fontFace: THEME.headFontFace, color: C.accent1 });
      text(s, l, { x, y: TOP + 1.1, w: sw, h: 0.6, fontSize: 14, color: C.text2 });
    });
    const left = [
      "Migrations need approval; the dry run leaves nothing behind",
      "Reads are physically read-only, even via a CTE",
      "Multi-row updates need approval; undo restores them",
      "DELETE without WHERE is high risk and reversible",
      "Rejected approvals change nothing",
    ];
    const right = [
      "Business roles and row-level security enforced by PostgreSQL",
      "Index benchmarks are what-if only: nothing persists",
      "Backup and restore round-trip; the audit log is tamper-proof",
      "CSRF, authentication and cross-user isolation hold",
      "Table-editor SQL injection is inert",
    ];
    const colW = (W - 2 * M - 0.5) / 2;
    text(s, bullets(left, 14), { x: M, y: TOP + 2.05, w: colW, h: 3.0 });
    text(s, bullets(right, 14), { x: M + colW + 0.5, y: TOP + 2.05, w: colW, h: 3.0 });
    s.addNotes("Run 'uv run pytest -q' to show all 37 passing. Each line corresponds to one or more tests in tests/integration.");
  }

  // =============================================================== 20. bugs found
  {
    const s = content("Verification", "06 / ENGINEERING", "Four real bugs found by running the real thing");
    const bugs = [
      ["LuHash", "Dry runs consumed serial ids", "A seed that referenced doctor_id = 1 failed after its own dry run.", "Snapshot sequences, rewind with compare-and-set"],
      ["LuNetwork", "Cascades were invisible", "Deleting a patient silently deleted appointments.", "Walk FK graph, count rows, mark not reversible"],
      ["LuWifiOff", "Long model pauses killed the stream", "The proxy closed idle requests after 30 seconds.", "Detached runs, keepalives, client reconnect"],
      ["LuMessageSquare", "A prompt could be sent twice", "Development mode ran the hand-off effect twice.", "Synchronous in-flight guard"],
    ];
    bugs.forEach(([ic, t, why, fix], i) => {
      const y = TOP + 0.1 + i * 1.22;
      // icon disc drawn async below
      text(s, t, { x: M + 0.85, y, w: 4.3, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
      text(s, why, { x: M + 0.85, y: y + 0.38, w: 4.3, h: 0.7, fontSize: 12.5, color: C.text2 });
      text(s, "FIX", { x: 6.2, y: y + 0.05, w: 0.6, h: 0.3, fontFace: MONO, fontSize: 11, bold: true, color: C.accent2 });
      text(s, fix, { x: 6.85, y: y + 0.02, w: W - M - 6.85, h: 0.7, fontSize: 14, color: C.text1 });
    });
    for (let i = 0; i < bugs.length; i++) await disc(s, bugs[i][0], M, TOP + 0.1 + i * 1.22, 0.56);
    s.addNotes("These were found by driving the real product in a browser against a real database, not by reading code. Each one now has a regression test or a guard.");
  }

  syllabusCoverage();

  // =============================================================== 22. limitations
  {
    const s = content("Verification", "06 / HONEST LIMITS", "Limitations and next steps");
    const colW = (W - 2 * M - 0.5) / 2;
    await disc(s, "LuTriangleAlert", M, TOP + 0.02, 0.5);
    await disc(s, "LuGitBranch", M + colW + 0.5, TOP + 0.02, 0.5);
    text(s, "TODAY", { x: M + 0.7, y: TOP + 0.13, w: colW, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: C.accent2 });
    text(s, bullets([
      "Nemotron Ultra is accurate but slow: long seeds take 2 to 3 minutes",
      "Specialists are toolsets in one agent, not separate model calls",
      "Rate limiting is in-process (single server)",
      "Undo covers single-table writes with a primary key",
    ], 15), { x: M, y: TOP + 0.85, w: colW, h: 3.8 });
    text(s, "NEXT", { x: M + colW + 1.2, y: TOP + 0.13, w: colW, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: C.accent2 });
    text(s, bullets([
      "Concurrency lab: lost update, deadlock, isolation levels",
      "Schema-evolution view with ER and table diffs",
      "Redis-backed limits and queue for multiple replicas",
      "Faster model option per task (switch with one setting)",
    ], 15), { x: M + colW + 0.5, y: TOP + 0.85, w: colW, h: 3.8 });
    s.addNotes("Be upfront about limits. The model can be swapped by changing AGENT_MODEL in the environment file.");
  }

  // =============================================================== 23. closing / demo
  pres.addSection({ title: "Close" });
  {
    const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Close" });
    s.addText("LIVE DEMO  /  FIVE MINUTES", { placeholder: "eyebrow" });
    s.addText("See it run", { placeholder: "title" });
    s.addText("Describe a clinic, approve the schema, query it, break it, undo it, and lock it down by role.", { placeholder: "body" });
    const steps = ["New project from a description", "Approve the copilot's schema", "Seed data, then query with algebra and plan", "DELETE without WHERE, then undo", "Receptionist role denied by PostgreSQL"];
    steps.forEach((t, i) => {
      const y = 1.6 + i * 0.95;
      text(s, String(i + 1).padStart(2, "0"), { x: 7.6, y, w: 0.7, h: 0.5, fontFace: MONO, fontSize: 22, bold: true, color: C.accent1 });
      text(s, t, { x: 8.45, y: y + 0.04, w: 4.3, h: 0.6, fontSize: 17, color: C.background1 });
    });
    s.addNotes("Follow docs/HOW_IT_WORKS.md section 9 for the exact demo script. Start the stack with ./scripts/dev.sh and open http://localhost:3000.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
