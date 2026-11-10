'use client';

import React, { useState } from 'react';
import { Table, Terminal, Shield, History, FlaskConical, Settings, Cpu, Database } from 'lucide-react';
import { TableEditor } from './TableEditor';
import { SqlEditor } from './SqlEditor';
import { ApprovalsWal } from './ApprovalsWal';
import { ConcurrencyLab } from './ConcurrencyLab';
import { SettingsConnection } from './SettingsConnection';

interface LiveWorkspaceProps {
  projectId: string;
}

export function LiveWorkspace({ projectId }: LiveWorkspaceProps) {
  const [activeView, setActiveView] = useState<'tables' | 'sql' | 'approvals' | 'concurrency' | 'settings'>('tables');

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Left Supabase Navigation Rail */}
      <aside style={{
        width: '64px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setActiveView('tables')}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activeView === 'tables' ? 'var(--emerald-bg)' : 'transparent',
            color: activeView === 'tables' ? 'var(--emerald-light)' : 'var(--text-muted)',
            border: activeView === 'tables' ? '1px solid var(--emerald-border)' : '1px solid transparent',
          }}
          title="Table Editor"
        >
          <Table size={20} />
        </button>

        <button
          id="live-tab-sql"
          onClick={() => setActiveView('sql')}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activeView === 'sql' ? 'var(--emerald-bg)' : 'transparent',
            color: activeView === 'sql' ? 'var(--emerald-light)' : 'var(--text-muted)',
            border: activeView === 'sql' ? '1px solid var(--emerald-border)' : '1px solid transparent',
          }}
          title="SQL & Relational Algebra Studio"
        >
          <Terminal size={20} />
        </button>

        <button
          onClick={() => setActiveView('approvals')}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activeView === 'approvals' ? 'var(--emerald-bg)' : 'transparent',
            color: activeView === 'approvals' ? 'var(--emerald-light)' : 'var(--text-muted)',
            border: activeView === 'approvals' ? '1px solid var(--emerald-border)' : '1px solid transparent',
            position: 'relative',
          }}
          title="Transactions & Approvals"
        >
          <History size={20} />
        </button>

        <button
          onClick={() => setActiveView('concurrency')}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activeView === 'concurrency' ? 'var(--emerald-bg)' : 'transparent',
            color: activeView === 'concurrency' ? 'var(--emerald-light)' : 'var(--text-muted)',
            border: activeView === 'concurrency' ? '1px solid var(--emerald-border)' : '1px solid transparent',
          }}
          title="Concurrency Lab"
        >
          <FlaskConical size={20} />
        </button>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => setActiveView('settings')}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: activeView === 'settings' ? 'var(--emerald-bg)' : 'transparent',
              color: activeView === 'settings' ? 'var(--emerald-light)' : 'var(--text-muted)',
              border: activeView === 'settings' ? '1px solid var(--emerald-border)' : '1px solid transparent',
            }}
            title="Database Connection & Keys"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeView === 'tables' && <TableEditor projectId={projectId} />}
        {activeView === 'sql' && <SqlEditor projectId={projectId} />}
        {activeView === 'approvals' && <div style={{ padding: '24px', height: '100%' }}><ApprovalsWal /></div>}
        {activeView === 'concurrency' && <div style={{ padding: '24px', height: '100%' }}><ConcurrencyLab /></div>}
        {activeView === 'settings' && <div style={{ padding: '24px', height: '100%' }}><SettingsConnection projectId={projectId} /></div>}
      </main>
    </div>
  );
}
