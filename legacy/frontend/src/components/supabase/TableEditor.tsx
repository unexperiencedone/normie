'use client';

import React, { useState } from 'react';
import { Table, Plus, Search, Filter, ArrowUpDown, Download, Key, Link2, Eye, RefreshCw, Check } from 'lucide-react';

interface TableEditorProps {
  projectId: string;
}

interface DemoColumn {
  name: string;
  type: string;
  isPk?: boolean;
  isFk?: boolean;
  isUnique?: boolean;
  references?: string;
}

interface DemoTable {
  name: string;
  count: number;
  columns: DemoColumn[];
  rows: Record<string, any>[];
}

const DEMO_TABLES: DemoTable[] = [
  {
    name: 'patient',
    count: 4,
    columns: [
      { name: 'id', type: 'INT', isPk: true },
      { name: 'ssn', type: 'VARCHAR(11)', isUnique: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'dob', type: 'DATE' },
      { name: 'phone', type: 'VARCHAR(20)' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
    rows: [
      { id: 1, ssn: '982-12-4011', name: 'Elena Rostova', dob: '1988-04-12', phone: '+1-555-0192', created_at: '2026-03-01 10:14:00' },
      { id: 2, ssn: '982-45-7732', name: 'Marcus Vance', dob: '1975-11-23', phone: '+1-555-0481', created_at: '2026-03-02 14:22:15' },
      { id: 3, ssn: '982-89-1054', name: 'Dr. Sarah Chen', dob: '1992-07-09', phone: '+1-555-0914', created_at: '2026-03-04 09:05:30' },
      { id: 4, ssn: '982-33-6621', name: 'Tariq Mansour', dob: '1984-01-30', phone: '+1-555-0723', created_at: '2026-03-05 16:40:10' },
    ],
  },
  {
    name: 'doctor',
    count: 3,
    columns: [
      { name: 'id', type: 'INT', isPk: true },
      { name: 'license_no', type: 'VARCHAR(20)', isUnique: true },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'specialty', type: 'VARCHAR(50)' },
      { name: 'department', type: 'VARCHAR(50)' },
    ],
    rows: [
      { id: 101, license_no: 'MD-449102', name: 'Dr. Gregory House', specialty: 'Diagnostic Medicine', department: 'Internal Medicine' },
      { id: 102, license_no: 'MD-881903', name: 'Dr. Allison Cameron', specialty: 'Immunology', department: 'Immunology' },
      { id: 103, license_no: 'MD-129048', name: 'Dr. Robert Chase', specialty: 'Intensive Care', department: 'Critical Care' },
    ],
  },
  {
    name: 'appointment',
    count: 3,
    columns: [
      { name: 'id', type: 'INT', isPk: true },
      { name: 'patient_id', type: 'INT', isFk: true, references: 'patient(id)' },
      { name: 'doctor_id', type: 'INT', isFk: true, references: 'doctor(id)' },
      { name: 'scheduled_at', type: 'TIMESTAMP' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'room', type: 'VARCHAR(20)' },
    ],
    rows: [
      { id: 1001, patient_id: 1, doctor_id: 101, scheduled_at: '2026-10-23 09:00:00', status: 'CONFIRMED', room: '402-A' },
      { id: 1002, patient_id: 2, doctor_id: 102, scheduled_at: '2026-10-23 10:30:00', status: 'IN_PROGRESS', room: '205-B' },
      { id: 1003, patient_id: 3, doctor_id: 101, scheduled_at: '2026-10-24 14:00:00', status: 'CONFIRMED', room: '402-A' },
    ],
  },
  {
    name: 'prescription',
    count: 2,
    columns: [
      { name: 'id', type: 'INT', isPk: true },
      { name: 'appointment_id', type: 'INT', isFk: true, references: 'appointment(id)' },
      { name: 'medication', type: 'VARCHAR(100)' },
      { name: 'dosage', type: 'VARCHAR(50)' },
      { name: 'refills', type: 'INT' },
    ],
    rows: [
      { id: 501, appointment_id: 1001, medication: 'Amoxicillin 500mg', dosage: 'TID x 7 days', refills: 1 },
      { id: 502, appointment_id: 1002, medication: 'Prednisone 20mg', dosage: 'QD x 5 days', refills: 0 },
    ],
  },
];

export function TableEditor({ projectId }: TableEditorProps) {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isInserting, setIsInserting] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [newRowName, setNewRowName] = useState('');
  const [newRowPhone, setNewRowPhone] = useState('');

  const table = DEMO_TABLES[selectedTableIndex];

  const filteredRows = table.rows.filter((row) =>
    Object.values(row).some((val) =>
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleAddRow = () => {
    if (newRowName.trim()) {
      table.rows.push({
        id: table.rows.length + 1,
        ssn: `982-99-${Math.floor(1000 + Math.random() * 9000)}`,
        name: newRowName,
        dob: '1990-01-01',
        phone: newRowPhone || '+1-555-0000',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      } as any);
      table.count = table.rows.length;
      setNewRowName('');
      setNewRowPhone('');
      setIsInserting(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Table List */}
      <div style={{
        width: '230px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            DATABASE TABLES
          </span>
          <span className="badge badge-gray">{DEMO_TABLES.length}</span>
        </div>

        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {DEMO_TABLES.map((t, idx) => {
            const isSelected = selectedTableIndex === idx;
            return (
              <button
                key={t.name}
                onClick={() => setSelectedTableIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? 'var(--bg-surface)' : 'transparent',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: isSelected ? '1px solid var(--border-default)' : '1px solid transparent',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Table size={14} color={isSelected ? 'var(--emerald-light)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: isSelected ? 600 : 400, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    {t.name}
                  </span>
                </div>
                <span className="badge badge-gray" style={{ fontSize: '11px', padding: '1px 5px' }}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Supabase Data Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Table Action Bar */}
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {table.name}
            </span>
            <span className="badge badge-emerald">{table.count} records</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search rows..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '30px', width: '200px' }}
              />
            </div>

            <button className="btn-secondary" onClick={() => setShowSchema(!showSchema)}>
              <Eye size={14} />
              {showSchema ? 'Hide Schema' : 'View Schema'}
            </button>

            <button className="btn-primary" onClick={() => setIsInserting(true)}>
              <Plus size={14} />
              Insert Row
            </button>
          </div>
        </div>

        {/* Schema Inspector Drawer (if toggled) */}
        {showSchema && (
          <div id="schema-drawer" style={{
            backgroundColor: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '14px 20px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              COLUMN SCHEMA & CONSTRAINTS:
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {table.columns.map((c) => (
                <div key={c.name} style={{
                  padding: '6px 10px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  {c.isPk && <Key size={12} color="#f59e0b" />}
                  {c.isFk && <Link2 size={12} color="#3b82f6" />}
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    {c.type}
                  </span>
                  {c.references && (
                    <span className="badge badge-blue" style={{ fontSize: '10px' }}>&rarr; {c.references}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insert Row Modal */}
        {isInserting && (
          <div style={{
            padding: '14px 20px',
            backgroundColor: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--emerald-light)' }}>+ Insert Record:</span>
            <input
              type="text"
              placeholder="Name..."
              value={newRowName}
              onChange={(e) => setNewRowName(e.target.value)}
              style={{ width: '200px' }}
            />
            <input
              type="text"
              placeholder="Phone number..."
              value={newRowPhone}
              onChange={(e) => setNewRowPhone(e.target.value)}
              style={{ width: '180px' }}
            />
            <button className="btn-primary" onClick={handleAddRow}>
              <Check size={14} /> Commit Insert
            </button>
            <button className="btn-secondary" onClick={() => setIsInserting(false)}>
              Cancel
            </button>
          </div>
        )}

        {/* Spreadsheet Data Grid */}
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-canvas)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                {table.columns.map((c) => (
                  <th
                    key={c.name}
                    style={{
                      padding: '10px 16px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {c.isPk && <Key size={13} color="#f59e0b" />}
                      {c.isFk && <Link2 size={13} color="#3b82f6" />}
                      <span>{c.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {c.type}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: any, rIdx) => (
                <tr
                  key={rIdx}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: rIdx % 2 === 0 ? 'var(--bg-canvas)' : 'rgba(255, 255, 255, 0.01)',
                  }}
                >
                  {table.columns.map((c) => (
                    <td
                      key={c.name}
                      style={{
                        padding: '10px 16px',
                        color: c.isPk ? 'var(--amber-base)' : 'var(--text-primary)',
                        fontFamily: c.isPk || c.isFk ? 'var(--font-mono)' : 'inherit',
                        borderRight: '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {String(row[c.name] ?? 'NULL')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
