'use client';

import React, { useState } from 'react';
import { Key, Copy, Check, ShieldCheck, Database, Terminal } from 'lucide-react';

interface SettingsConnectionProps {
  projectId: string;
}

export function SettingsConnection({ projectId }: SettingsConnectionProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const tenantName = `t_${projectId}`;
  const directUrl = `postgresql://postgres:dbforge_secure_pass@dbforge.cloud:5432/${tenantName}?sslmode=require`;
  const txPoolerUrl = `postgresql://postgres.${tenantName}:dbforge_secure_pass@aws-0-us-east-1.pooler.dbforge.cloud:6543/postgres`;
  const anonKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkYmZvcmdlIiwicm9sZSI6ImFub24iLCJleHAiOjE5MjQ5MDU2MDB9.8d172e819b`;
  const serviceRoleKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkYmZvcmdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTkyNDkwNTYwMH0.3f91048821`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      {/* 1. Database Connection Strings */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} color="var(--emerald-light)" />
            <h2 style={{ fontSize: '15px', fontWeight: 600 }}>Database Connection Strings</h2>
          </div>
          <span className="badge badge-emerald">PostgreSQL 16.2</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Direct Connection (URI)
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="text"
                readOnly
                value={directUrl}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <button className="btn-secondary" onClick={() => copyToClipboard(directUrl, 'direct')}>
                {copiedKey === 'direct' ? <Check size={14} color="var(--emerald-light)" /> : <Copy size={14} />}
                {copiedKey === 'direct' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              For standard migrations, backend services, or Prisma/Drizzle/SQLAlchemy connections.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Transaction Pooler (Port 6543)
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="text"
                readOnly
                value={txPoolerUrl}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <button className="btn-secondary" onClick={() => copyToClipboard(txPoolerUrl, 'pooler')}>
                {copiedKey === 'pooler' ? <Check size={14} color="var(--emerald-light)" /> : <Copy size={14} />}
                {copiedKey === 'pooler' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Use for serverless functions (AWS Lambda, Vercel, Cloudflare Workers) requiring high concurrency.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Project API Keys */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={16} color="var(--emerald-light)" />
            <h2 style={{ fontSize: '15px', fontWeight: 600 }}>Project API Keys (JWT Tokens)</h2>
          </div>
          <span className="badge badge-emerald">Active</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                anon (public)
              </label>
              <span className="badge badge-gray">Safe for browser clients</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="text"
                readOnly
                value={anonKey}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <button className="btn-secondary" onClick={() => copyToClipboard(anonKey, 'anon')}>
                {copiedKey === 'anon' ? <Check size={14} color="var(--emerald-light)" /> : <Copy size={14} />}
                {copiedKey === 'anon' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                service_role (secret)
              </label>
              <span className="badge badge-amber">Bypasses RLS • Keep Secret</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="password"
                readOnly
                value={serviceRoleKey}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <button className="btn-secondary" onClick={() => copyToClipboard(serviceRoleKey, 'service')}>
                {copiedKey === 'service' ? <Check size={14} color="var(--emerald-light)" /> : <Copy size={14} />}
                {copiedKey === 'service' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
