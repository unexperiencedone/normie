'use client';

import React, { useState, useEffect } from 'react';
import { StepperHeader } from '@/components/StepperHeader';
import { Step1Design } from '@/components/steps/Step1Design';
import { Step2Normalization } from '@/components/steps/Step2Normalization';
import { Step3Security } from '@/components/steps/Step3Security';
import { Step4Provision } from '@/components/steps/Step4Provision';
import { LiveWorkspace } from '@/components/supabase/LiveWorkspace';
import { StitchHome } from '@/components/stitch/StitchHome';
import { ProjectStage, ErModel } from '@/types/database';
import { synthesizeDomainLocally } from '@/utils/domainSynthesis';

export default function Home() {
  const [viewMode, setViewMode] = useState<'home' | 'studio'>('home');
  const [projectId, setProjectId] = useState('clinic_db');
  const [projectName, setProjectName] = useState('Clinic Management System');
  const [tenantId, setTenantId] = useState('t_clinic_db');
  const [initialUserPrompt, setInitialUserPrompt] = useState<string | undefined>(undefined);
  const [initialModel, setInitialModel] = useState<ErModel | undefined>(() => synthesizeDomainLocally('clinic'));
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);

  // Check URL parameters for direct studio navigation (?studio=1 or ?project=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('studio') === '1' || params.get('project')) {
        setInitialModel(synthesizeDomainLocally('clinic'));
        setViewMode('studio');
      }
    }
  }, []);

  // Strict Stepwise Lifecycle Progression
  // Stage 1: Design -> Stage 2: Normalization -> Stage 3: Security -> Stage 4: Provision -> Stage 5: Deployed (Live)
  const [currentStage, setCurrentStage] = useState<ProjectStage>('design');
  const [maxUnlockedStage, setMaxUnlockedStage] = useState<number>(1);
  const [activeStep, setActiveStep] = useState<number>(1);

  // Opening or creating a project from Home Dashboard
  const handleOpenProject = (selectedProjectId: string, userPrompt?: string, isBlank?: boolean) => {
    setProjectId(selectedProjectId);
    setInitialUserPrompt(userPrompt);
    setCurrentStage('design');
    setMaxUnlockedStage(1);
    setActiveStep(1);

    if (isBlank) {
      setProjectName('Untitled Architecture');
      setTenantId(`t_${selectedProjectId}`);
      setInitialModel({ entities: [], relationships: [] });
      setIsSynthesizing(false);
    } else if (userPrompt) {
      const cleanName = userPrompt.length > 36 ? userPrompt.slice(0, 36) + '...' : userPrompt;
      setProjectName(cleanName);
      setTenantId(`t_${selectedProjectId}`);
      setInitialModel({ entities: [], relationships: [] });
      setIsSynthesizing(true);
    } else if (selectedProjectId === 'clinic_db') {
      setProjectName('Clinic Management System');
      setTenantId('t_clinic_db');
      setInitialModel(synthesizeDomainLocally('clinic'));
      setIsSynthesizing(false);
    } else if (selectedProjectId === 'ecommerce_db') {
      setProjectName('High-Throughput E-Commerce');
      setTenantId('t_ecommerce_db');
      setInitialModel(synthesizeDomainLocally('ecommerce'));
      setIsSynthesizing(false);
    } else if (selectedProjectId === 'fintech_db') {
      setProjectName('Fintech Banking Ledger');
      setTenantId('t_fintech_db');
      setInitialModel(synthesizeDomainLocally('fintech'));
      setIsSynthesizing(false);
    } else {
      setProjectName('Enterprise Architecture');
      setTenantId(`t_${selectedProjectId}`);
      setInitialModel(undefined);
      setIsSynthesizing(false);
    }

    setViewMode('studio');
  };

  // Transitions (Cannot skip ahead - must be completed in order)
  const handleApproveDesign = () => {
    setCurrentStage('normalization');
    setMaxUnlockedStage((prev) => Math.max(prev, 2));
    setActiveStep(2);
  };

  const handleConfirmNormalization = () => {
    setCurrentStage('security');
    setMaxUnlockedStage((prev) => Math.max(prev, 3));
    setActiveStep(3);
  };

  const handleApproveSecurity = () => {
    setCurrentStage('provision');
    setMaxUnlockedStage((prev) => Math.max(prev, 4));
    setActiveStep(4);
  };

  const handleDeploySuccess = () => {
    setCurrentStage('deployed');
    setMaxUnlockedStage(5);
    setActiveStep(5);
  };

  const handleStepClick = (step: number) => {
    // Only allow navigating to unlocked steps
    if (step <= maxUnlockedStage) {
      setActiveStep(step);
    }
  };

  // If in Home mode, render the DBForge Studio Portal with central chat bar
  if (viewMode === 'home') {
    return <StitchHome onOpenProject={handleOpenProject} />;
  }

  // Otherwise, render the DBForge Visual Studio Pipeline & Live Workspace
  return (
    <div className="app-container">
      <main className="main-content">
        {/* Stepper Header (Enforces Sequential Progression) */}
        <StepperHeader
          currentStage={currentStage}
          maxUnlockedStage={maxUnlockedStage}
          activeStep={activeStep}
          onStepClick={handleStepClick}
          projectName={projectName}
          tenantId={tenantId}
          onBackToProjects={() => setViewMode('home')}
        />

        {/* Viewport for Active Step / Live Workspace (Zero-Scroll Outer Shell) */}
        <section
          aria-label="Active Stage Viewport"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeStep === 1 && (
            <Step1Design
              projectId={projectId}
              projectName={projectName}
              initialModel={initialModel}
              initialUserPrompt={initialUserPrompt}
              isSynthesizing={isSynthesizing}
              onApprove={handleApproveDesign}
            />
          )}

          {activeStep === 2 && (
            <Step2Normalization projectId={projectId} onConfirm={handleConfirmNormalization} />
          )}

          {activeStep === 3 && (
            <Step3Security projectId={projectId} onApprove={handleApproveSecurity} />
          )}

          {activeStep === 4 && (
            <Step4Provision projectId={projectId} onDeploySuccess={handleDeploySuccess} />
          )}

          {activeStep === 5 && (
            <LiveWorkspace projectId={projectId} />
          )}
        </section>
      </main>
    </div>
  );
}
