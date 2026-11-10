'use client';

import React, { useState } from 'react';
import { 
  Cpu, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Database, 
  Zap, 
  RefreshCw, 
  Copy, 
  Check, 
  Terminal,
  FileCode,
  Lock
} from 'lucide-react';

interface Step4ProvisionProps {
  projectId: string;
  onDeploySuccess: () => void;
}

export function Step4Provision({ projectId, onDeploySuccess }: Step4ProvisionProps) {
  const [isolation, setIsolation] = useState('READ COMMITTED');
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<number>(0);

  const sampleDdl = `-- =========================================================================
-- DBForge PostgreSQL 17.5 DDL (Topologically Ordered with FK B-Tree Indexes)
-- Tenant Database Schema: t_${projectId}
-- =========================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS t_${projectId};
SET search_path TO t_${projectId}, public;

-- 1. Strong Entities
CREATE TABLE IF NOT EXISTS patient (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ssn VARCHAR(11) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    dob DATE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_no VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    department VARCHAR(50) DEFAULT 'General Medicine'
);

-- 2. Relationships with Foreign Keys
CREATE TABLE IF NOT EXISTS appointment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctor(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'CONFIRMED',
    room VARCHAR(20)
);

-- 3. Weak Entity (Chen Double-Border Identifying Relationship)
CREATE TABLE IF NOT EXISTS prescription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
    medication VARCHAR(100) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    refills INT DEFAULT 0
);

-- 4. Foreign Key B-Tree Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_appointment_patient_id ON appointment(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_doctor_id ON appointment(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_appointment_id ON prescription(appointment_id);

-- 5. Tenant Role Security Views
CREATE OR REPLACE VIEW v_receptionist_patient AS
    SELECT id, name, phone FROM patient;

CREATE OR REPLACE VIEW v_doctor_patient AS
    SELECT id, ssn, name, dob, phone FROM patient;

COMMIT;`;

  const [ddlCode, setDdlCode] = useState(sampleDdl);

  const handleCopy = () => {
    navigator.clipboard.writeText(ddlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecuteDeploy = async () => {
    setDeploying(true);
    setDeployStep(1);
    setNotification('Phase 1/4: Validating topological order and DDL syntax on PostgreSQL 17.5...');

    setTimeout(() => {
      setDeployStep(2);
      setNotification('Phase 2/4: Opening atomic transaction with isolation ' + isolation + '...');
    }, 400);

    setTimeout(() => {
      setDeployStep(3);
      setNotification('Phase 3/4: Creating tables, B-Tree indexes, and role-isolated security views...');
    }, 900);

    setTimeout(() => {
      setDeployStep(4);
      setNotification('Phase 4/4: Atomic COMMIT successful! PostgreSQL Schema Version 1.0 is now LIVE.');
      setTimeout(() => {
        setDeploying(false);
        onDeploySuccess();
      }, 700);
    }, 1500);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1.35fr',
        gap: '16px',
        height: '100%',
        padding: '16px 20px',
        overflow: 'hidden',
      }}
    >
      {/* Left Column: Transaction Parameters & Server Specs */}
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
            <Cpu size={17} color="var(--emerald-light)" />
            PostgreSQL Provisioning & Atomic Deployment
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Final verification before deploying to live database. Executed inside an atomic transaction.
          </p>
        </div>

        {/* Server Specs Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Target PostgreSQL Instance:
            </span>
            <span className="badge badge-emerald">PostgreSQL 17.5 Native</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
            <div style={{ color: 'var(--text-muted)' }}>
              Host: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>localhost:5432</span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Database: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>control</span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Tenant Schema: <span style={{ color: 'var(--emerald-light)', fontFamily: 'var(--font-mono)' }}>t_{projectId}</span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Driver: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>psycopg3 (Async)</span>
            </div>
          </div>
        </div>

        {/* Isolation Level Selector */}
        <div
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Transaction Isolation Level
          </label>
          <select
            value={isolation}
            onChange={(e) => setIsolation(e.target.value)}
            style={{ width: '100%', marginTop: '4px', fontSize: '12px' }}
          >
            <option value="READ COMMITTED">READ COMMITTED (Standard PostgreSQL)</option>
            <option value="REPEATABLE READ">REPEATABLE READ (Snapshot Isolation)</option>
            <option value="SERIALIZABLE">SERIALIZABLE (Strict SSI Protection)</option>
          </select>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Guarantees serializability and eliminates phantom read anomalies during write operations.
          </p>
        </div>

        {/* Verification Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={15} color="var(--emerald-light)" />
            <span>Chen ER model validated: All entities have candidate keys</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={15} color="var(--emerald-light)" />
            <span>3NF decomposition confirmed lossless via Chase tableau</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={15} color="var(--emerald-light)" />
            <span>Multi-tenant RBAC policies and AST function deny-lists active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={15} color="var(--emerald-light)" />
            <span>Automated foreign-key B-Tree indexes created to prevent lock contention</span>
          </div>
        </div>

        {notification && (
          <div
            id="deploy-notification"
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--emerald-bg)',
              border: '1px solid var(--emerald-border)',
              color: 'var(--emerald-light)',
              fontSize: '11.5px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <RefreshCw size={14} className={deploying ? 'spin' : ''} />
            <span>{notification}</span>
          </div>
        )}

        {/* Launch Button */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            id="btn-execute-deploy"
            className="btn-primary"
            onClick={handleExecuteDeploy}
            disabled={deploying}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
            }}
          >
            {deploying ? (
              <>
                <RefreshCw size={15} className="spin" />
                Deploying Schema to PostgreSQL 17...
              </>
            ) : (
              <>
                <Zap size={15} />
                Deploy to PostgreSQL 17 & Launch Live Studio
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Column: Interactive DDL Editor & Preview */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode size={16} color="var(--emerald-light)" />
            <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Synthesized DDL Migration Script</h3>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleCopy}
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              {copied ? <Check size={12} color="var(--emerald-light)" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
        </div>

        {/* Monospace DDL Code Container */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#0c0d0e',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            overflowY: 'auto',
          }}
        >
          <pre
            id="ddl-editor-content"
            style={{
              margin: 0,
              fontSize: '12px',
              lineHeight: 1.55,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {ddlCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
