'use client';

import React, { useState } from 'react';
import { FlaskConical, Play, CheckCircle2, AlertOctagon, ShieldCheck } from 'lucide-react';

export function ConcurrencyLab() {
  const [lostUpdateResult, setLostUpdateResult] = useState<string | null>(null);
  const [deadlockResult, setDeadlockResult] = useState<string | null>(null);
  const [writeSkewResult, setWriteSkewResult] = useState<string | null>(null);

  const handleLostUpdatePlain = () => {
    setLostUpdateResult('ANOMALY DETECTED: 10,000 concurrent +1 increments completed with final balance: $5,842 (4,158 lost updates due to uncoordinated read-modify-write).');
  };

  const handleLostUpdateCorrect = () => {
    setLostUpdateResult('CORRECT: 10,000 concurrent increments executed via SELECT ... FOR UPDATE. Final balance: $10,000 (0 lost updates).');
  };

  const handleTriggerDeadlock = () => {
    setDeadlockResult(
      'DEADLOCK DETECTED: Transaction 1 (waiting on row B) and Transaction 2 (waiting on row A) formed a cycle in the PostgreSQL lock wait-for graph.\nEngine triggered automatic victim selection and aborted Transaction 2 with error code 40P01.'
    );
  };

  const handleWriteSkewRepeatable = () => {
    setWriteSkewResult(
      'WRITE SKEW ANOMALY: Both doctors simultaneously queried on-call count (saw 2 on call) and went off duty. Final on-call doctors: 0 (Constraint Violated under Snapshot Isolation).'
    );
  };

  const handleWriteSkewSerializable = () => {
    setWriteSkewResult(
      'SERIALIZABLE PROTECTED: PostgreSQL SSI engine tracked anti-dependency (rw-antidependency cycle) and rolled back transaction with 40001 (serialization_failure). Constraint Preserved: At least 1 doctor remains on duty.'
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', height: '100%', overflowY: 'auto' }}>
      {/* 1. Lost Update */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600 }}>1. Lost Update Anomaly</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Two concurrent transactions read the same balance and overwrite each other&apos;s writes.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn-secondary" onClick={handleLostUpdatePlain}>
            Run Plain Concurrency (Buggy)
          </button>
          <button className="btn-primary" onClick={handleLostUpdateCorrect}>
            Run FOR UPDATE (Correct)
          </button>
        </div>

        <div
          id="lost-update-result"
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: lostUpdateResult?.includes('10,000') ? 'var(--emerald-light)' : '#fb7185',
            whiteSpace: 'pre-wrap',
            minHeight: '120px',
          }}
        >
          {lostUpdateResult || 'Ready to simulate 10,000 concurrent balance updates...'}
        </div>
      </div>

      {/* 2. Deadlock Detection */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600 }}>2. Deadlock Cycle Detection</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Inverted lock ordering creates a directed cycle in PostgreSQL wait-for graph.
          </p>
        </div>

        <button className="btn-secondary" onClick={handleTriggerDeadlock}>
          Trigger Inverted Lock Order
        </button>

        <div
          id="deadlock-result"
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: deadlockResult?.includes('DEADLOCK') ? '#f59e0b' : 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            minHeight: '120px',
          }}
        >
          {deadlockResult || 'Ready to trigger conflicting row locks between Tx1 and Tx2...'}
        </div>
      </div>

      {/* 3. Write Skew & SSI */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600 }}>3. Write Skew & Serializable</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Doctor on-call invariant: At least 1 doctor must be on duty at all times.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn-secondary" onClick={handleWriteSkewRepeatable}>
            Snapshot Isolation (Violated)
          </button>
          <button className="btn-primary" onClick={handleWriteSkewSerializable}>
            Serializable (Protected)
          </button>
        </div>

        <div
          id="write-skew-result"
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: writeSkewResult?.includes('SERIALIZABLE') ? 'var(--emerald-light)' : '#fb7185',
            whiteSpace: 'pre-wrap',
            minHeight: '120px',
          }}
        >
          {writeSkewResult || 'Ready to simulate concurrent doctor shift checkout...'}
        </div>
      </div>
    </div>
  );
}
