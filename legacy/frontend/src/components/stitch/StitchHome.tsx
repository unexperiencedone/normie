'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Sparkles, 
  ArrowUp, 
  BookOpen, 
  Database, 
  Layers, 
  Cpu, 
  ChevronLeft, 
  ChevronRight, 
  Mic, 
  Users, 
  Grid, 
  ArrowRight,
  Clock,
  Check,
  Activity,
  Trash2,
  FileCode,
  Shield,
  RefreshCw
} from 'lucide-react';

interface StitchHomeProps {
  onOpenProject: (projectId: string, initialPrompt?: string, isBlank?: boolean) => void;
}

interface ProjectItem {
  id: string;
  name: string;
  date: string;
  engine: string;
  stage: string;
  accent: string;
  tablesCount?: number;
}

const PRESET_BLUEPRINTS: ProjectItem[] = [
  { 
    id: 'clinic_db', 
    name: 'Clinic Management System', 
    date: 'Active Blueprint', 
    engine: 'PostgreSQL 17.5', 
    stage: 'Chen ER · Weak Entity', 
    accent: '#10b981',
    tablesCount: 4 
  },
  { 
    id: 'ecommerce_db', 
    name: 'High-Throughput E-Commerce', 
    date: 'Verified', 
    engine: 'PostgreSQL 17.5', 
    stage: '3NF · Lossless Join', 
    accent: '#3b82f6',
    tablesCount: 4 
  },
  { 
    id: 'fintech_db', 
    name: 'Fintech ACID Ledger', 
    date: 'Deployed', 
    engine: 'PostgreSQL 17.5', 
    stage: 'SSI Serializable', 
    accent: '#f59e0b',
    tablesCount: 3 
  },
  { 
    id: 'saas_db', 
    name: 'Multi-Tenant SaaS RBAC', 
    date: 'Protected', 
    engine: 'PostgreSQL 17.5', 
    stage: 'Row-Level Security', 
    accent: '#8b5cf6',
    tablesCount: 3 
  },
];

const INSPIRATION_TEMPLATES = [
  {
    id: 'clinic_db',
    title: 'Healthcare EHR & Prescriptions',
    subtitle: 'Chen ER weak entities, identifying relationships, and doctor/patient RBAC.',
    badge: 'PostgreSQL 17.5',
    tag: 'Chen ER Notation',
    color: '#10b981',
  },
  {
    id: 'ecommerce_db',
    title: 'High-Throughput E-Commerce',
    subtitle: 'Customers, orders, line items, 3NF synthesis with Chase lossless join proof.',
    badge: '3NF Synthesis',
    tag: 'Lossless Join',
    color: '#3b82f6',
  },
  {
    id: 'fintech_db',
    title: 'Fintech Banking & Double-Entry',
    subtitle: 'SSI serializable transaction engine, row-lock coordination, and WAL audit log.',
    badge: 'ACID Concurrency',
    tag: 'Serializable SSI',
    color: '#f59e0b',
  },
  {
    id: 'saas_db',
    title: 'Multi-Tenant Enterprise SaaS',
    subtitle: 'Dynamic view rewrite boundaries, AST function deny-lists, and role matrices.',
    badge: 'Least-Privilege',
    tag: 'RBAC Views',
    color: '#8b5cf6',
  },
];

const SUGGESTIONS = [
  'Hospital clinic with patients, doctors, appointments, and prescriptions with dosage',
  'E-Commerce storefront with customers, orders, inventory items, and payment transactions',
  'Fintech banking ledger with double-entry balance invariants and audit trails',
  'Multi-tenant SaaS with organizations, users, roles, and row-level security policies',
  'Multi-warehouse logistics tracking with shipments, drivers, and delivery routes',
];

export function StitchHome({ onOpenProject }: StitchHomeProps) {
  const [activeTab, setActiveTab] = useState<'my' | 'blueprints'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'oltp' | 'olap'>('oltp');
  const [backendProjects, setBackendProjects] = useState<ProjectItem[]>(PRESET_BLUEPRINTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch real projects from the backend API on load
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/v1/projects');
        const data = await res.json();
        if (data.ok && Array.isArray(data.data)) {
          const mapped: ProjectItem[] = data.data.map((p: any, idx: number) => ({
            id: p.project_id,
            name: p.requirements_text ? (p.requirements_text.length > 30 ? p.requirements_text.slice(0, 30) + '...' : p.requirements_text) : `Architecture ${p.project_id.slice(0, 8)}`,
            date: 'Today',
            engine: 'PostgreSQL 17.5',
            stage: p.stage || 'Design',
            accent: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'][idx % 4],
            tablesCount: p.tables_count || 3,
          }));
          const hasClinic = mapped.some((p) => p.name.includes('Clinic Management System') || p.id === 'clinic_db');
          setBackendProjects(hasClinic ? mapped : [PRESET_BLUEPRINTS[0], ...mapped]);
        }
      } catch (err) {
        setBackendProjects(PRESET_BLUEPRINTS);
      }
    };

    fetchProjects();
  }, []);

  const displayedProjects = activeTab === 'my' 
    ? (backendProjects.length > 0 ? backendProjects : PRESET_BLUEPRINTS)
    : PRESET_BLUEPRINTS;

  const filteredProjects = displayedProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      // If prompt empty, start a blank project
      onOpenProject(`proj_${Date.now()}`, undefined, true);
      return;
    }

    setIsSubmitting(true);
    const newProjectId = `proj_${Date.now()}`;
    // Pass the prompt to studio with isBlank = false so it triggers live agent synthesis
    onOpenProject(newProjectId, prompt.trim(), false);
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setPrompt(suggestionText);
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0c0d0e',
        color: '#f8fafc',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Left Sidebar */}
      <aside
        style={{
          width: '290px',
          backgroundColor: '#111317',
          borderRight: '1px solid #1f242d',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          height: '100%',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1a1e26',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: 'var(--emerald-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={15} />
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
              DBForge Studio
            </span>
          </div>

          <div
            style={{
              fontSize: '10.5px',
              color: 'var(--emerald-light)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '2px 7px',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            v2.4 LTS
          </div>
        </div>

        {/* Tab Toggle: My Projects vs Blueprints */}
        <div style={{ padding: '12px 16px 8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              backgroundColor: '#16181d',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #232730',
            }}
          >
            <button
              onClick={() => setActiveTab('my')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: activeTab === 'my' ? 600 : 500,
                backgroundColor: activeTab === 'my' ? '#262b34' : 'transparent',
                color: activeTab === 'my' ? '#ffffff' : '#94a3b8',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Grid size={13} />
              My Projects
            </button>
            <button
              onClick={() => setActiveTab('blueprints')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: activeTab === 'blueprints' ? 600 : 500,
                backgroundColor: activeTab === 'blueprints' ? '#262b34' : 'transparent',
                color: activeTab === 'blueprints' ? '#ffffff' : '#94a3b8',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Layers size={13} />
              Blueprints
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '4px 16px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#16181d',
              border: '1px solid #232730',
              borderRadius: '8px',
              padding: '6px 12px',
            }}
          >
            <Search size={14} color="#64748b" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter architectures..."
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '12px',
                width: '100%',
                outline: 'none',
                padding: 0,
              }}
            />
          </div>
        </div>

        {/* Action: Blank Project */}
        <div style={{ padding: '0 16px 10px' }}>
          <button
            onClick={() => onOpenProject(`blank_${Date.now()}`, undefined, true)}
            className="btn-secondary"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              borderRadius: '8px',
              borderColor: '#2d3340',
              backgroundColor: '#16181d',
              color: '#e2e8f0',
            }}
          >
            <Plus size={14} />
            <span>+ New Blank Architecture</span>
          </button>
        </div>

        {/* Projects List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#64748b',
              padding: '4px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {activeTab === 'my' ? 'Active Workspaces' : 'Production Blueprints'}
          </div>

          {filteredProjects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => onOpenProject(proj.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#16181d')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#121418',
                  border: `1px solid ${proj.accent}33`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: proj.accent,
                }}
              >
                <Database size={15} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {proj.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '2px',
                  }}
                >
                  <span>{proj.stage}</span>
                  <span>•</span>
                  <span>{proj.tablesCount || 3} tables</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main
        style={{
          flex: 1,
          height: '100%',
          overflowY: 'auto',
          backgroundColor: '#0c0d0e',
          backgroundImage: 'radial-gradient(#20242e 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Top Header */}
        <header
          style={{
            padding: '16px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(31, 36, 45, 0.4)',
          }}
        >
          {/* Active Engine & Cluster Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#94a3b8',
                backgroundColor: 'rgba(22, 24, 29, 0.7)',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid #232730',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--emerald-light)' }} />
              <span>PostgreSQL 17.5 Native (localhost:5432)</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#94a3b8',
                backgroundColor: 'rgba(22, 24, 29, 0.7)',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid #232730',
              }}
            >
              <Cpu size={12} color="var(--emerald-light)" />
              <span>AWS Bedrock Nemotron</span>
            </div>
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', fontSize: '12.5px', cursor: 'pointer' }}>
              <BookOpen size={15} />
              <span>Docs</span>
            </div>

            <button
              id="btn-blank-project"
              onClick={() => onOpenProject(`blank_${Date.now()}`, undefined, true)}
              className="btn-secondary"
              style={{
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '12px',
                backgroundColor: 'rgba(22, 24, 29, 0.8)',
                borderColor: '#2d3340',
                color: '#e2e8f0',
              }}
            >
              <Plus size={13} />
              Blank project
            </button>

            {/* Profile Avatar */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#1e2229',
                border: '2px solid #2d3340',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '12.5px',
                color: 'var(--emerald-light)',
              }}
              title="Architect Role"
            >
              DB
            </div>
          </div>
        </header>

        {/* Center Container: Title + Chat Bar + Suggestions */}
        <div
          style={{
            maxWidth: '860px',
            width: '100%',
            margin: '28px auto 0',
            padding: '0 32px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Hero Welcome Heading */}
          <h1
            style={{
              fontSize: '40px',
              fontWeight: 600,
              color: '#ffffff',
              letterSpacing: '-0.03em',
              marginBottom: '10px',
            }}
          >
            Architect & Deploy Databases
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: '#94a3b8',
              lineHeight: 1.5,
              marginBottom: '26px',
            }}
          >
            Describe your domain requirements. Our agentic pipeline discovers entities, keys, and relationships, verifies 3NF/BCNF normal forms, and generates PostgreSQL instances.
          </p>

          {/* Large Central Prompt / Chat Bar Container */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: '#16181d',
              border: '1px solid #262b34',
              borderRadius: '16px',
              padding: '18px 20px 14px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {/* Input Textarea (retaining id stitch-prompt-input for test compatibility) */}
            <textarea
              id="stitch-prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What relational database shall we design? (e.g. Healthcare clinic with patients, doctors, appointments, and prescriptions)"
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '15px',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            {/* Bottom Controls Bar inside Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid #1f232b',
              }}
            >
              {/* Left Controls: Plus + Engine Mode Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#1e2229',
                    border: '1px solid #2d3340',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Import DDL / Schema"
                >
                  <Plus size={16} />
                </button>

                {/* Pill Selectors */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: '#1e2229',
                    border: '1px solid #2d3340',
                    borderRadius: '20px',
                    padding: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setMode('oltp')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: 'none',
                      backgroundColor: mode === 'oltp' ? '#2e3440' : 'transparent',
                      color: mode === 'oltp' ? '#ffffff' : '#94a3b8',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <Database size={13} color="var(--emerald-light)" />
                    Relational (PostgreSQL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('olap')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: 'none',
                      backgroundColor: mode === 'olap' ? '#2e3440' : 'transparent',
                      color: mode === 'olap' ? '#ffffff' : '#94a3b8',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <Layers size={13} />
                    Analytics (OLAP)
                  </button>
                </div>
              </div>

              {/* Right Controls: Model Pill, Mic, Submit Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    backgroundColor: '#1e2229',
                    border: '1px solid #2d3340',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  title="NVIDIA Nemotron 120B on Amazon Bedrock"
                >
                  <Sparkles size={14} color="var(--emerald-light)" />
                  <span>Nemotron 120B</span>
                </div>

                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                  title="Voice input"
                >
                  <Mic size={16} />
                </button>

                {/* Round Submit Arrow Button */}
                <button
                  id="btn-stitch-submit"
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--emerald-base)',
                    border: 'none',
                    color: '#052e16',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Synthesize Architecture"
                >
                  {isSubmitting ? <Activity size={16} className="spin" /> : <ArrowUp size={16} />}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Suggestion Pills */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: '16px',
            }}
          >
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  backgroundColor: '#16181d',
                  border: '1px solid #232730',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  maxWidth: '320px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--emerald-border)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#232730')}
              >
                {s}
              </button>
            ))}
          </div>

          {/* "Production Blueprints" Carousel Section */}
          <div style={{ marginTop: '48px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>
                  Need inspiration?
                </h3>
                <p style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>
                  Select a pre-verified relational architecture with formal normal-form proofs.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#16181d',
                    border: '1px solid #232730',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#16181d',
                    border: '1px solid #232730',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Inspiration Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '14px',
              }}
            >
              {INSPIRATION_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => onOpenProject(tpl.id)}
                  style={{
                    backgroundColor: '#16181d',
                    borderRadius: '12px',
                    border: '1px solid #232730',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = tpl.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#232730';
                  }}
                >
                  {/* Visual Preview Header */}
                  <div
                    style={{
                      height: '110px',
                      backgroundColor: '#111317',
                      backgroundImage: 'radial-gradient(#262a34 1px, transparent 1px)',
                      backgroundSize: '16px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: '1px solid #1f232b',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#1c2027',
                        border: `1px solid ${tpl.color}55`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: tpl.color,
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <Database size={13} />
                      <span>{tpl.badge}</span>
                    </div>

                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        backgroundColor: '#1f242d',
                        color: '#94a3b8',
                      }}
                    >
                      {tpl.tag}
                    </span>
                  </div>

                  {/* Card Content */}
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      {tpl.title}
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.45 }}>
                      {tpl.subtitle}
                    </p>

                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: '8px',
                        fontSize: '11px',
                        color: 'var(--emerald-light)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 500,
                      }}
                    >
                      <span>Architect project</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
