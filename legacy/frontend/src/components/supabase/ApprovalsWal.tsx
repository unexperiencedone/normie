'use client';

import React, { useState } from 'react';
import { ShieldAlert, Check, X, Undo2, History } from 'lucide-react';

export function ApprovalsWal() {
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [walUndone, setWalUndone] = useState<string | null>(null);

  const handleDecision = (decision: 'approved' | 'rejected') => {
    setApprovalStatus(decision);
  };

  const handleUndo = (auditId: string) => {
    setWalUndone(`Restored before-image snapshot for transaction ${auditId} from WAL.`);
    setTimeout(() => setWalUndone(null), 4000);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: '100%', overflowY: 'auto' }}>
      {/* Left: Pending Approvals */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600 }}>Human-in-the-Loop Approval Queue</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Irreversible writes (DROP, bulk DELETE, unindexed UPDATE) require human confirmation.
            </p>
          </div>
          <span className="badge badge-amber">{approvalStatus === 'pending' ? '1 Pending' : '0 Pending'}</span>
        </div>

        <div
          id="approval-item-1"
          style={{
            padding: '16px',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#f59e0b', fontSize: '13px' }}>
              High-Risk Action: Bulk Delete Inactive Records
            </span>
            <span className="badge badge-amber">Risk: High</span>
          </div>

          <pre style={{
            padding: '10px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#f43f5e',
            fontFamily: 'var(--font-mono)',
          }}>
            DELETE FROM patient WHERE created_at &lt; NOW() - INTERVAL &apos;5 years&apos;;
          </pre>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Dry-run analysis: Affects <strong>142 patient records</strong> and cascades to <strong>318 appointments</strong>.
          </div>

          {approvalStatus === 'pending' ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button className="btn-primary" onClick={() => handleDecision('approved')}>
                <Check size={14} /> Authorize & Commit
              </button>
              <button className="btn-danger" onClick={() => handleDecision('rejected')}>
                <X size={14} /> Reject & Rollback
              </button>
            </div>
          ) : (
            <div style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: approvalStatus === 'approved' ? 'var(--emerald-bg)' : 'var(--rose-bg)',
              color: approvalStatus === 'approved' ? 'var(--emerald-light)' : '#fb7185',
              fontWeight: 600,
              fontSize: '12px',
            }}>
              ACTION {approvalStatus.toUpperCase()}: Recorded in append-only WAL audit trail.
            </div>
          )}
        </div>
      </div>

      {/* Right: Append-Only WAL Audit Trail & Undo */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} color="var(--emerald-light)" />
            <h2 style={{ fontSize: '15px', fontWeight: 600 }}>WAL Audit Stream & 1-Click Undo</h2>
          </div>
          <span className="badge badge-emerald">Append-Only</span>
        </div>

        {walUndone && (
          <div style={{ padding: '10px', backgroundColor: 'var(--emerald-bg)', color: 'var(--emerald-light)', borderRadius: '6px', fontSize: '12px' }}>
            {walUndone}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          {[
            { id: 'wal_tx_88190', action: 'UPDATE', table: 'patient', user: 'admin@dbforge.io', time: '2 mins ago', rows: 1 },
            { id: 'wal_tx_88189', action: 'INSERT', table: 'appointment', user: 'doctor@dbforge.io', time: '14 mins ago', rows: 1 },
            { id: 'wal_tx_88188', action: 'UPDATE', table: 'doctor', user: 'admin@dbforge.io', time: '1 hour ago', rows: 1 },
          ].map((entry) => (
            <div key={entry.id} style={{
              padding: '12px',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-blue">{entry.action}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{entry.table}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({entry.rows} row affected)</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  By: {entry.user} &bull; {entry.time} &bull; TX: <code>{entry.id}</code>
                </div>
              </div>

              <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={() => handleUndo(entry.id)}>
                <Undo2 size={12} /> Undo
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
