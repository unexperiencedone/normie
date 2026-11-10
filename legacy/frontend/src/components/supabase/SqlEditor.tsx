'use client';

import React, { useState } from 'react';
import { Terminal, Play, Sparkles, Clock, CheckCircle2, ChevronRight } from 'lucide-react';

interface SqlEditorProps {
  projectId: string;
}

export function SqlEditor({ projectId }: SqlEditorProps) {
  const [nlQuestion, setNlQuestion] = useState('Show all patients and their scheduled appointments with doctor details');
  const [sql, setSql] = useState(
    'SELECT p.id, p.name AS patient_name, d.name AS doctor_name, a.scheduled_at, a.status\nFROM patient p\nJOIN appointment a ON p.id = a.patient_id\nJOIN doctor d ON d.id = a.doctor_id\nWHERE a.status = \'CONFIRMED\'\nLIMIT 1000;'
  );
  const [algebraUnicode, setAlgebraUnicode] = useState(
    'π_{p.id, p.name, d.name, a.scheduled_at, a.status}(σ_{a.status = \'CONFIRMED\'}((patient ⋈ appointment) ⋈ doctor))'
  );
  const [algebraLatex, setAlgebraLatex] = useState(
    '\\pi_{p.id, p.name, d.name, a.scheduled_at, a.status}(\\sigma_{a.status = \'CONFIRMED\'}((patient \\bowtie appointment) \\bowtie doctor))'
  );
  const [activeSubTab, setActiveSubTab] = useState<'results' | 'algebra' | 'sql' | 'plan'>('results');
  const [executing, setExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState('1.4ms');

  const sampleRows = [
    { id: 1, patient_name: 'Elena Rostova', doctor_name: 'Dr. Gregory House', scheduled_at: '2026-10-23 09:00:00', status: 'CONFIRMED' },
    { id: 3, patient_name: 'Dr. Sarah Chen', doctor_name: 'Dr. Gregory House', scheduled_at: '2026-10-24 14:00:00', status: 'CONFIRMED' },
  ];

  const handleRunQuery = async () => {
    setExecuting(true);
    setTimeout(() => {
      setExecuting(false);
      setExecutionTime(`${(Math.random() * 2 + 0.8).toFixed(1)}ms`);
    }, 300);
  };

  const handleNlSynthesize = async () => {
    setExecuting(true);
    setTimeout(() => {
      setExecuting(false);
      setSql(
        'SELECT p.id, p.name, a.scheduled_at\nFROM patient p\nJOIN appointment a ON p.id = a.patient_id\nWHERE a.scheduled_at >= NOW()\nLIMIT 1000;'
      );
      setAlgebraUnicode('π_{p.id, p.name, a.scheduled_at}(σ_{a.scheduled_at ≥ NOW()}(patient ⋈ appointment))');
      setAlgebraLatex('\\pi_{p.id, p.name, a.scheduled_at}(\\sigma_{a.scheduled_at \\ge NOW()}(patient \\bowtie appointment))');
    }, 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top: Natural Language Agent Prompt & Run Actions */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="var(--emerald-light)" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Agentic NL-to-SQL Query Studio</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            id="nl-query-input"
            type="text"
            value={nlQuestion}
            onChange={(e) => setNlQuestion(e.target.value)}
            placeholder="Ask anything about your database in natural language..."
            style={{ flex: 1 }}
          />
          <button className="btn-secondary" onClick={handleNlSynthesize} disabled={executing}>
            <Sparkles size={14} color="var(--emerald-light)" />
            Synthesize SQL & Algebra
          </button>
          <button id="btn-run-sql" className="btn-primary" onClick={handleRunQuery} disabled={executing}>
            <Play size={14} />
            Execute SQL
          </button>
        </div>
      </div>

      {/* SQL Editor Area */}
      <div style={{
        backgroundColor: 'var(--bg-canvas)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            SQL STATEMENT (AST VALIDATED &bull; SAFETY LIMIT 1000 INJECTED)
          </span>
          <span className="badge badge-emerald">PostgreSQL 17.5 Engine</span>
        </div>
        <textarea
          id="sql-code-editor"
          rows={4}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
        />
      </div>

      {/* Output Sub-Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '8px',
      }}>
        <button
          className="nav-item"
          onClick={() => setActiveSubTab('results')}
          style={{
            borderBottom: activeSubTab === 'results' ? '2px solid var(--emerald-base)' : 'none',
            color: activeSubTab === 'results' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderRadius: 0,
            padding: '10px 14px',
            background: 'transparent',
          }}
        >
          Results Grid ({sampleRows.length})
        </button>
        <button
          id="qtab-btn-algebra"
          className="nav-item"
          onClick={() => setActiveSubTab('algebra')}
          style={{
            borderBottom: activeSubTab === 'algebra' ? '2px solid var(--emerald-base)' : 'none',
            color: activeSubTab === 'algebra' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderRadius: 0,
            padding: '10px 14px',
            background: 'transparent',
          }}
        >
          Relational Algebra (π, σ, ⋈)
        </button>
        <button
          id="qtab-btn-sql"
          className="nav-item"
          onClick={() => setActiveSubTab('sql')}
          style={{
            borderBottom: activeSubTab === 'sql' ? '2px solid var(--emerald-base)' : 'none',
            color: activeSubTab === 'sql' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderRadius: 0,
            padding: '10px 14px',
            background: 'transparent',
          }}
        >
          Raw SQL
        </button>
        <button
          id="qtab-btn-plan"
          className="nav-item"
          onClick={() => setActiveSubTab('plan')}
          style={{
            borderBottom: activeSubTab === 'plan' ? '2px solid var(--emerald-base)' : 'none',
            color: activeSubTab === 'plan' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderRadius: 0,
            padding: '10px 14px',
            background: 'transparent',
          }}
        >
          EXPLAIN Query Plan
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <Clock size={12} />
          <span>Execution time: {executionTime}</span>
        </div>
      </div>

      {/* Sub-Tab Viewport */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', backgroundColor: 'var(--bg-canvas)' }}>
        {activeSubTab === 'results' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                <th style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>id</th>
                <th style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>patient_name</th>
                <th style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>doctor_name</th>
                <th style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>scheduled_at</th>
                <th style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>status</th>
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', color: 'var(--amber-base)' }}>{r.id}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{r.patient_name}</td>
                  <td style={{ padding: '8px 14px' }}>{r.doctor_name}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{r.scheduled_at}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <span className="badge badge-emerald">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSubTab === 'algebra' && (
          <div id="relational-algebra-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="card">
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                RELATIONAL ALGEBRA EXPRESSION (UNICODE):
              </span>
              <div
                id="algebra-math-render"
                style={{
                  marginTop: '8px',
                  padding: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '15px',
                  color: 'var(--emerald-light)',
                  lineHeight: '1.6',
                }}
              >
                {algebraUnicode}
              </div>
            </div>

            <div className="card">
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                LATEX FORMULA:
              </span>
              <div style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}>
                <code>{algebraLatex}</code>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'sql' && (
          <pre
            id="query-sql-render"
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: '#38bdf8',
              fontSize: '13px',
              lineHeight: '1.6',
            }}
          >
            {sql}
          </pre>
        )}

        {activeSubTab === 'plan' && (
          <div className="card">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              POSTGRESQL 16 EXECUTION PLAN (EXPLAIN ANALYZE):
            </span>
            <pre
              id="query-plan-render"
              style={{
                marginTop: '8px',
                padding: '16px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: '1.6',
              }}
            >
{`Hash Join  (cost=21.45..45.12 rows=24 width=128) (actual time=0.084..0.112 rows=2 loops=1)
  Hash Cond: (a.doctor_id = d.id)
  ->  Hash Join  (cost=10.25..31.40 rows=24 width=96) (actual time=0.052..0.073 rows=2 loops=1)
        Hash Cond: (a.patient_id = p.id)
        ->  Seq Scan on appointment a  (cost=0.00..18.50 rows=24 width=48) (actual time=0.015..0.022 rows=2 loops=1)
              Filter: ((status)::text = 'CONFIRMED'::text)
        ->  Hash  (cost=8.50..8.50 rows=140 width=48) (actual time=0.024..0.024 rows=4 loops=1)
              ->  Seq Scan on patient p  (cost=0.00..8.50 rows=140 width=48)
  ->  Hash  (cost=10.40..10.40 rows=64 width=32) (actual time=0.018..0.018 rows=3 loops=1)
        ->  Seq Scan on doctor d  (cost=0.00..10.40 rows=64 width=32)
Planning Time: 0.182 ms
Execution Time: 0.145 ms`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
