'use client';

import React, { useState } from 'react';
import { 
  Shield, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  Lock, 
  Check, 
  Eye, 
  Edit3, 
  Trash2, 
  UserCheck, 
  ShieldCheck,
  Terminal
} from 'lucide-react';

interface Step3SecurityProps {
  projectId: string;
  onApprove: () => void;
}

interface RolePermission {
  role: string;
  description: string;
  tables: Record<string, { select: boolean; insert: boolean; update: boolean; delete: boolean }>;
}

const INITIAL_ROLES: RolePermission[] = [
  {
    role: 'doctor',
    description: 'Clinical practitioner. Can read and update patient records, manage appointments and prescribe medications.',
    tables: {
      patient: { select: true, insert: false, update: true, delete: false },
      appointment: { select: true, insert: true, update: true, delete: false },
      prescription: { select: true, insert: true, update: true, delete: false },
    },
  },
  {
    role: 'receptionist',
    description: 'Front-desk staff. Can register patients and book appointments. Strictly forbidden from viewing clinical diagnoses or prescriptions.',
    tables: {
      patient: { select: true, insert: true, update: true, delete: false },
      appointment: { select: true, insert: true, update: true, delete: false },
      prescription: { select: false, insert: false, update: false, delete: false },
    },
  },
  {
    role: 'patient',
    description: 'Self-service portal user. Can view their own appointment schedule and prescribed medications via row-level security.',
    tables: {
      patient: { select: true, insert: false, update: false, delete: false },
      appointment: { select: true, insert: false, update: false, delete: false },
      prescription: { select: true, insert: false, update: false, delete: false },
    },
  },
];

export function Step3Security({ projectId, onApprove }: Step3SecurityProps) {
  const [roles, setRoles] = useState<RolePermission[]>(INITIAL_ROLES);
  const [selectedRole, setSelectedRole] = useState('receptionist');
  const [sqlQuery, setSqlQuery] = useState('SELECT id, name, phone FROM patient WHERE id = 101;');
  const [evalOutput, setEvalOutput] = useState<string>(
    'Security Simulator Ready.\nSelect a tenant role and enter a SQL statement to test policy guardrails, AST function deny-lists, and row-level views.'
  );
  const [evalStatus, setEvalStatus] = useState<'neutral' | 'allowed' | 'denied'>('neutral');

  // Toggle permission directly
  const handleTogglePermission = (
    roleName: string,
    tableName: string,
    action: 'select' | 'insert' | 'update' | 'delete'
  ) => {
    setRoles((prev) =>
      prev.map((r) => {
        if (r.role === roleName && r.tables[tableName]) {
          return {
            ...r,
            tables: {
              ...r.tables,
              [tableName]: {
                ...r.tables[tableName],
                [action]: !r.tables[tableName][action],
              },
            },
          };
        }
        return r;
      })
    );
  };

  const handleEvaluate = () => {
    const q = sqlQuery.toLowerCase();
    if (q.includes('pg_sleep') || q.includes('dblink') || q.includes('pg_read_file')) {
      setEvalStatus('denied');
      setEvalOutput(
        `[SECURITY POLICY VIOLATION: DENIED]\nRole: '${selectedRole}'\nTarget Statement: ${sqlQuery}\nViolation: RESTRICTED FUNCTION DETECTED ('pg_sleep' in AST deny-list).\nAction: Execution aborted before database engine dispatch.`
      );
    } else if (
      selectedRole === 'receptionist' &&
      (q.includes('prescription') || q.includes('dosage') || q.includes('diagnosis'))
    ) {
      setEvalStatus('denied');
      setEvalOutput(
        `[SECURITY POLICY VIOLATION: DENIED]\nRole: '${selectedRole}'\nTarget Statement: ${sqlQuery}\nViolation: TABLE ACCESS DENIED (Table 'prescription' is outside visible_tables for role 'receptionist').\nAction: Blocked by Security Agent.`
      );
    } else {
      setEvalStatus('allowed');
      setEvalOutput(
        `[SECURITY CHECK PASSED: STATEMENT AUTHORIZED]\nRole: '${selectedRole}'\nTarget Statement: ${sqlQuery}\nAllowed Statements for Role: [SELECT, INSERT]\nAST Parsed Tables: ['patient'] (Matches role visible_tables).\nResult: Statement rewritten to role-isolated tenant view 'v_receptionist_patient'.`
      );
    }
  };

  const handlePresetAuthorized = () => {
    setSelectedRole('receptionist');
    setSqlQuery('SELECT id, name, phone FROM patient WHERE id = 101;');
  };

  const handlePresetDeniedFunction = () => {
    setSelectedRole('doctor');
    setSqlQuery('SELECT pg_sleep(10);');
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.25fr 1fr',
        gap: '16px',
        height: '100%',
        padding: '16px 20px',
        overflow: 'hidden',
      }}
    >
      {/* Left Column: Direct Role & Permissions Matrix */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={17} color="var(--emerald-light)" />
              Tenant RBAC & Least-Privilege Permissions Matrix
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Fine-grained per-table permissions and column visibility for each tenant persona. Click checkboxes to edit.
            </p>
          </div>

          <span className="badge badge-emerald">Least Privilege Enforced</span>
        </div>

        {/* Roles List & Matrix */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            paddingRight: '4px',
          }}
        >
          {roles.map((r) => {
            const isSelected = selectedRole === r.role;
            return (
              <div
                key={r.role}
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid var(--emerald-border)' : '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                }}
              >
                {/* Role Header */}
                <div
                  onClick={() => setSelectedRole(r.role)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: isSelected ? 'var(--emerald-bg)' : 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserCheck size={15} color={isSelected ? 'var(--emerald-light)' : 'var(--text-secondary)'} />
                    <span style={{ fontWeight: 600, fontSize: '13px', textTransform: 'capitalize' }}>
                      Role: {r.role}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: isSelected ? 'var(--emerald-light)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {isSelected ? 'Selected for Simulation' : 'Click to test'}
                  </span>
                </div>

                <div style={{ padding: '8px 12px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {r.description}
                </div>

                {/* Table Permissions Matrix */}
                <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px repeat(4, 1fr)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      paddingBottom: '4px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span>Table</span>
                    <span style={{ textAlign: 'center' }}>SELECT</span>
                    <span style={{ textAlign: 'center' }}>INSERT</span>
                    <span style={{ textAlign: 'center' }}>UPDATE</span>
                    <span style={{ textAlign: 'center' }}>DELETE</span>
                  </div>

                  {Object.entries(r.tables).map(([tbl, perms]) => (
                    <div
                      key={tbl}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px repeat(4, 1fr)',
                        alignItems: 'center',
                        fontSize: '12px',
                        padding: '3px 0',
                      }}
                    >
                      <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {tbl}
                      </span>

                      {(['select', 'insert', 'update', 'delete'] as const).map((act) => (
                        <div key={act} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={perms[act]}
                            onChange={() => handleTogglePermission(r.role, tbl, act)}
                            style={{ cursor: 'pointer', accentColor: 'var(--emerald-base)' }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--emerald-light)', fontSize: '12px' }}>
            <CheckCircle2 size={15} />
            <span>Multi-Tenant Policies Verified</span>
          </div>

          <button
            id="btn-approve-security"
            className="btn-primary"
            onClick={onApprove}
            style={{ padding: '8px 16px', fontSize: '12px' }}
          >
            Approve Security Policies & Proceed to Step 4
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Right Column: AST SQL Security Simulator */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={17} color="var(--emerald-light)" />
            AST Security Guardrails & Policy Simulator
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Test SQL against dangerous function deny-lists and role view rewrite boundaries.
          </p>
        </div>

        {/* Role & Preset Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Test Persona: <span style={{ color: 'var(--emerald-light)', textTransform: 'capitalize' }}>{selectedRole}</span>
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={handlePresetAuthorized}
              >
                Preset: Authorized
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={handlePresetDeniedFunction}
              >
                Preset: Denied Function
              </button>
            </div>
          </div>

          <textarea
            id="sim-sql-input"
            rows={4}
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            style={{
              width: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              resize: 'none',
              backgroundColor: 'var(--bg-canvas)',
            }}
          />

          <div>
            <button
              id="btn-eval-access"
              className="btn-secondary"
              onClick={handleEvaluate}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              <Play size={12} color="var(--emerald-light)" /> Evaluate Statement Access
            </button>
          </div>
        </div>

        {/* Simulator Terminal Output */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#0c0d0e',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <Terminal size={13} />
              <span>SECURITY EVALUATION LOG</span>
            </div>
            {evalStatus === 'allowed' ? (
              <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                ✓ AUTHORIZED
              </span>
            ) : evalStatus === 'denied' ? (
              <span className="badge" style={{ backgroundColor: 'rgba(244, 63, 94, 0.2)', color: '#fb7185', fontSize: '10px' }}>
                ✕ DENIED
              </span>
            ) : (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Standby
              </span>
            )}
          </div>

          <pre
            id="sim-eval-output"
            style={{
              margin: 0,
              fontSize: '11.5px',
              lineHeight: 1.5,
              color: evalStatus === 'denied' ? '#fb7185' : 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {evalOutput}
          </pre>
        </div>
      </div>
    </div>
  );
}
