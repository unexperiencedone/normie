'use client';

import React from 'react';
import { Check, Lock, Database, ArrowRight, Shield, Sparkles, Layers, Cpu } from 'lucide-react';
import { ProjectStage } from '@/types/database';

interface StepperHeaderProps {
  currentStage: ProjectStage;
  maxUnlockedStage: number; // 1 to 5
  activeStep: number; // 1 to 4 (or 5 for live)
  onStepClick: (step: number) => void;
  projectName: string;
  tenantId: string;
  onBackToProjects?: () => void;
}

const STEPS = [
  { id: 1, stage: 'design', label: '1. Conceptual ER Design', icon: Sparkles, desc: 'Interactive Chen ER canvas & AI co-pilot' },
  { id: 2, stage: 'normalization', label: '2. Normalization & Math', icon: Layers, desc: '3NF synthesis, closure & Chase tableau' },
  { id: 3, stage: 'security', label: '3. Security & RBAC', icon: Shield, desc: 'Tenant views & AST security simulator' },
  { id: 4, stage: 'provision', label: '4. Provision & Deploy', icon: Cpu, desc: 'Atomic PostgreSQL 17 transaction' },
];

export function StepperHeader({
  currentStage,
  maxUnlockedStage,
  activeStep,
  onStepClick,
  projectName,
  tenantId,
  onBackToProjects,
}: StepperHeaderProps) {
  const isDeployed = currentStage === 'deployed';

  return (
    <header
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '10px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* Top Project Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBackToProjects && (
            <button
              id="btn-back-to-projects"
              onClick={onBackToProjects}
              className="btn-secondary"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
              }}
              title="Return to Stitch Home Dashboard"
            >
              ← All Projects
            </button>
          )}

          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--emerald-bg)',
              border: '1px solid var(--emerald-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald-light)',
            }}
          >
            <Database size={15} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '-0.01em' }}>{projectName}</span>
              <span className="badge badge-gray" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                {tenantId}
              </span>
              {isDeployed ? (
                <span className="badge badge-emerald">● Live PostgreSQL 17.5</span>
              ) : (
                <span className="badge badge-amber">Pipeline In-Progress</span>
              )}
              <span className="badge" style={{ backgroundColor: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.3)' }}>
                NVIDIA Nemotron 120B
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isDeployed && activeStep !== 5 && (
            <button
              className="btn-primary"
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={() => onStepClick(5)}
            >
              Return to Live Workspace →
            </button>
          )}
          {isDeployed && activeStep === 5 && (
            <button
              className="btn-secondary"
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={() => onStepClick(1)}
            >
              View Verification Pipeline
            </button>
          )}
        </div>
      </div>

      {/* Sequential Stepper (Strict Stepwise Progression - No Skipping Ahead) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          backgroundColor: 'var(--bg-canvas)',
          padding: '4px',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {STEPS.map((step) => {
          const isCompleted = step.id < maxUnlockedStage;
          const isActive = activeStep === step.id;
          const isUnlocked = step.id <= maxUnlockedStage;
          const StepIcon = step.icon;

          return (
            <button
              key={step.id}
              disabled={!isUnlocked}
              onClick={() => isUnlocked && onStepClick(step.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '5px',
                border: isActive
                  ? '1px solid var(--emerald-base)'
                  : isUnlocked
                  ? '1px solid var(--border-subtle)'
                  : '1px dashed var(--border-subtle)',
                backgroundColor: isActive
                  ? 'var(--bg-surface)'
                  : isUnlocked
                  ? 'transparent'
                  : 'rgba(0, 0, 0, 0.15)',
                color: isActive
                  ? 'var(--text-primary)'
                  : isUnlocked
                  ? 'var(--text-secondary)'
                  : 'var(--text-muted)',
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                justifyContent: 'flex-start',
                width: '100%',
              }}
              title={isUnlocked ? step.desc : 'Complete previous step to unlock'}
            >
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCompleted
                    ? 'var(--emerald-bg)'
                    : isActive
                    ? 'var(--emerald-base)'
                    : 'var(--bg-elevated)',
                  color: isCompleted
                    ? 'var(--emerald-light)'
                    : isActive
                    ? '#052e16'
                    : 'var(--text-muted)',
                  border: isCompleted ? '1px solid var(--emerald-border)' : 'none',
                  flexShrink: 0,
                }}
              >
                {isCompleted ? <Check size={13} /> : !isUnlocked ? <Lock size={11} /> : <StepIcon size={12} />}
              </div>

              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isActive ? 'var(--text-primary)' : isUnlocked ? 'var(--text-secondary)' : 'var(--text-muted)',
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {isCompleted ? 'Verified ✓' : isActive ? 'Active Phase' : isUnlocked ? 'Ready' : 'Locked'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </header>
  );
}
