'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Key, 
  Link2, 
  Plus, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Sparkles, 
  HelpCircle, 
  Check, 
  Layers, 
  AlertCircle,
  Database,
  ArrowRight,
  Shield,
  Circle,
  CornerDownRight,
  Disc,
  X
} from 'lucide-react';
import { EntityNode, AttributeMeta, RelationshipEdge, ErModel } from '@/types/database';

interface ErCanvasProps {
  model: ErModel;
  onChange: (newModel: ErModel) => void;
  onApprove: () => void;
  onOpenAiDrawer: () => void;
}

const COMMON_DATA_TYPES = [
  'UUID',
  'VARCHAR(100)',
  'VARCHAR(255)',
  'TEXT',
  'INT',
  'BIGINT',
  'DECIMAL(10,2)',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
];

export function ErCanvas({ model, onChange, onApprove, onOpenAiDrawer }: ErCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 40 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging entity node
  const [draggingEntityId, setDraggingEntityId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selection & UI modals
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showAddRelModal, setShowAddRelModal] = useState(false);

  // Relationship creation form state
  const [relFrom, setRelFrom] = useState('');
  const [relTo, setRelTo] = useState('');
  const [relName, setRelName] = useState('connects');
  const [relCard, setRelCard] = useState<'1:1' | '1:N' | 'M:N'>('1:N');

  // Handle Pan canvas
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // Only pan if clicking on canvas background directly
    if ((e.target as HTMLElement).classList.contains('canvas-background')) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    } else if (draggingEntityId) {
      const newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      const newY = (e.clientY - pan.y) / zoom - dragOffset.y;

      onChange({
        ...model,
        entities: model.entities.map((ent) =>
          ent.id === draggingEntityId
            ? { ...ent, x: Math.round(newX), y: Math.round(newY) }
            : ent
        ),
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingEntityId(null);
  };

  // Zoom via wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    let newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    newZoom = Math.min(Math.max(newZoom, 0.45), 1.8);
    setZoom(newZoom);
  };

  // Node drag start
  const handleStartDragEntity = (e: React.MouseEvent, ent: EntityNode) => {
    e.stopPropagation();
    setDraggingEntityId(ent.id);
    setSelectedEntityId(ent.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - ent.x,
      y: (e.clientY - pan.y) / zoom - ent.y,
    });
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 1.8));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.45));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 60, y: 40 });
  };

  // Auto-arrange nodes in a clean DAG/grid
  const handleAutoArrange = () => {
    const spacingX = 340;
    const spacingY = 280;
    const cols = 2;

    const arranged = model.entities.map((ent, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        ...ent,
        x: 60 + col * spacingX,
        y: 60 + row * spacingY,
      };
    });

    onChange({
      ...model,
      entities: arranged,
    });
  };

  // Direct editing helpers
  const handleAddEntity = () => {
    const newId = `entity_${Date.now()}`;
    const newName = `NewEntity_${model.entities.length + 1}`;
    const newEnt: EntityNode = {
      id: newId,
      name: newName,
      is_weak: false,
      x: 100 + (model.entities.length % 3) * 60,
      y: 100 + (model.entities.length % 3) * 60,
      attributes: [
        {
          id: `attr_${Date.now()}_1`,
          name: `${newName.toLowerCase()}_id`,
          type: 'UUID',
          is_primary_key: true,
        },
        {
          id: `attr_${Date.now()}_2`,
          name: 'name',
          type: 'VARCHAR(100)',
        },
      ],
    };

    onChange({
      ...model,
      entities: [...model.entities, newEnt],
    });
    setSelectedEntityId(newId);
  };

  const handleDeleteEntity = (entId: string) => {
    const entityToDelete = model.entities.find((e) => e.id === entId);
    if (!entityToDelete) return;

    onChange({
      entities: model.entities.filter((e) => e.id !== entId),
      relationships: model.relationships.filter(
        (r) => r.from_entity !== entityToDelete.name && r.to_entity !== entityToDelete.name
      ),
    });
    if (selectedEntityId === entId) setSelectedEntityId(null);
  };

  const handleToggleWeakEntity = (entId: string) => {
    onChange({
      ...model,
      entities: model.entities.map((ent) => {
        if (ent.id === entId) {
          const willBeWeak = !ent.is_weak;
          return {
            ...ent,
            is_weak: willBeWeak,
            // If becoming weak, convert first PK to partial key (Chen ER textbook standard)
            attributes: ent.attributes.map((attr, idx) => {
              if (willBeWeak && attr.is_primary_key) {
                return { ...attr, is_primary_key: false, is_partial_key: true };
              }
              if (!willBeWeak && attr.is_partial_key) {
                return { ...attr, is_primary_key: true, is_partial_key: false };
              }
              return attr;
            }),
          };
        }
        return ent;
      }),
    });
  };

  const handleUpdateEntityName = (entId: string, newName: string) => {
    const oldEnt = model.entities.find((e) => e.id === entId);
    if (!oldEnt) return;
    const oldName = oldEnt.name;

    onChange({
      entities: model.entities.map((e) => (e.id === entId ? { ...e, name: newName } : e)),
      relationships: model.relationships.map((r) => ({
        ...r,
        from_entity: r.from_entity === oldName ? newName : r.from_entity,
        to_entity: r.to_entity === oldName ? newName : r.to_entity,
      })),
    });
  };

  const handleAddAttribute = (entId: string) => {
    onChange({
      ...model,
      entities: model.entities.map((ent) => {
        if (ent.id === entId) {
          const newAttr: AttributeMeta = {
            id: `attr_${Date.now()}`,
            name: `field_${ent.attributes.length + 1}`,
            type: 'VARCHAR(100)',
          };
          return {
            ...ent,
            attributes: [...ent.attributes, newAttr],
          };
        }
        return ent;
      }),
    });
  };

  const handleUpdateAttribute = (
    entId: string,
    attrId: string,
    field: keyof AttributeMeta,
    value: any
  ) => {
    onChange({
      ...model,
      entities: model.entities.map((ent) => {
        if (ent.id === entId) {
          return {
            ...ent,
            attributes: ent.attributes.map((attr) => {
              if (attr.id === attrId) {
                return { ...attr, [field]: value };
              }
              return attr;
            }),
          };
        }
        return ent;
      }),
    });
  };

  const handleDeleteAttribute = (entId: string, attrId: string) => {
    onChange({
      ...model,
      entities: model.entities.map((ent) => {
        if (ent.id === entId) {
          return {
            ...ent,
            attributes: ent.attributes.filter((attr) => attr.id !== attrId),
          };
        }
        return ent;
      }),
    });
  };

  // Toggle Cardinality on connector badge click
  const handleCycleCardinality = (relId: string) => {
    const cycleMap: Record<string, '1:1' | '1:N' | 'M:N'> = {
      '1:1': '1:N',
      '1:N': 'M:N',
      'M:N': '1:1',
    };
    onChange({
      ...model,
      relationships: model.relationships.map((r) =>
        r.id === relId ? { ...r, cardinality: cycleMap[r.cardinality] || '1:N' } : r
      ),
    });
  };

  const handleCreateRelationship = () => {
    if (!relFrom || !relTo || relFrom === relTo) return;
    const newRel: RelationshipEdge = {
      id: `rel_${Date.now()}`,
      name: relName || 'relates_to',
      from_entity: relFrom,
      to_entity: relTo,
      cardinality: relCard,
      participation_from: 'partial',
      participation_to: 'partial',
    };
    onChange({
      ...model,
      relationships: [...model.relationships, newRel],
    });
    setShowAddRelModal(false);
  };

  const handleDeleteRelationship = (relId: string) => {
    onChange({
      ...model,
      relationships: model.relationships.filter((r) => r.id !== relId),
    });
  };

  // Helper to calculate SVG bezier path between two entities
  const getConnectorPoints = (r: RelationshipEdge) => {
    const fromEnt = model.entities.find((e) => e.name === r.from_entity);
    const toEnt = model.entities.find((e) => e.name === r.to_entity);
    if (!fromEnt || !toEnt) return null;

    const width = 270;
    const heightFrom = 60 + fromEnt.attributes.length * 36;
    const heightTo = 60 + toEnt.attributes.length * 36;

    const centerFrom = { x: fromEnt.x + width / 2, y: fromEnt.y + heightFrom / 2 };
    const centerTo = { x: toEnt.x + width / 2, y: toEnt.y + heightTo / 2 };

    let start = { x: fromEnt.x + width, y: fromEnt.y + 40 };
    let end = { x: toEnt.x, y: toEnt.y + 40 };

    if (centerFrom.x > centerTo.x) {
      start = { x: fromEnt.x, y: fromEnt.y + 40 };
      end = { x: toEnt.x + width, y: toEnt.y + 40 };
    }

    const dx = Math.abs(end.x - start.x) * 0.55;
    const cp1 = { x: start.x + (centerFrom.x <= centerTo.x ? dx : -dx), y: start.y };
    const cp2 = { x: end.x + (centerFrom.x <= centerTo.x ? -dx : dx), y: end.y };
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    const pathData = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

    return { pathData, mid, start, end, isIdentifying: r.is_identifying || toEnt.is_weak };
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container canvas-background"
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0d0e',
        backgroundImage: 'radial-gradient(#262a34 1.2px, transparent 1.2px)',
        backgroundSize: '24px 24px',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: isPanning ? 'grabbing' : 'default',
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 20,
          right: 20,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        {/* Left actions: Add Entity, Add Relationship, Auto Arrange */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          <button
            id="btn-add-entity"
            className="btn-secondary"
            onClick={handleAddEntity}
            style={{
              padding: '7px 13px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <Plus size={15} color="var(--emerald-light)" />
            Add Entity
          </button>

          <button
            id="btn-add-relationship"
            className="btn-secondary"
            onClick={() => {
              if (model.entities.length >= 2) {
                setRelFrom(model.entities[0].name);
                setRelTo(model.entities[1].name);
                setShowAddRelModal(true);
              }
            }}
            style={{
              padding: '7px 13px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <Link2 size={15} color="#60a5fa" />
            Add Relationship
          </button>

          <button
            className="btn-secondary"
            onClick={handleAutoArrange}
            title="Auto-organize entities into a clean layout"
            style={{
              padding: '7px 13px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <Layers size={14} />
            Auto-Layout
          </button>

          <button
            className="btn-secondary"
            onClick={() => setShowLegend((prev) => !prev)}
            style={{
              padding: '7px 11px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
            title="Chen ER Visual Notation Guide"
          >
            <HelpCircle size={14} color="var(--text-muted)" />
            Chen ER Legend
          </button>
        </div>

        {/* Right actions: AI Assistant Drawer Toggle & Step 2 Approve Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
          <button
            className="btn-secondary"
            onClick={onOpenAiDrawer}
            style={{
              padding: '7px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderColor: 'var(--emerald-border)',
              color: 'var(--emerald-light)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <Sparkles size={15} />
            AI Co-Pilot (Nemotron)
          </button>

          <button
            id="btn-approve-er"
            className="btn-primary"
            onClick={onApprove}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            Approve ER Model & Proceed to Step 2
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Floating Bottom-Left Zoom & Info Controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'var(--bg-surface)',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid var(--border-default)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={handleZoomOut}
          className="btn-secondary"
          style={{ padding: '5px', borderRadius: '4px', border: 'none' }}
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>
        <span
          style={{
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            minWidth: '42px',
            textAlign: 'center',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="btn-secondary"
          style={{ padding: '5px', borderRadius: '4px', border: 'none' }}
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />
        <button
          onClick={handleResetZoom}
          className="btn-secondary"
          style={{ padding: '5px', borderRadius: '4px', border: 'none' }}
          title="Reset View"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Transformable Canvas Layer */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '5000px',
          height: '5000px',
        }}
      >
        {/* SVG Connectors Layer */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          <defs>
            {/* Gradient for standard relationships */}
            <linearGradient id="relGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            {/* Amber gradient for weak identifying relationships */}
            <linearGradient id="weakRelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>

          {model.relationships.map((rel) => {
            const conn = getConnectorPoints(rel);
            if (!conn) return null;

            const isWeak = conn.isIdentifying;
            const strokeColor = isWeak ? 'url(#weakRelGrad)' : 'url(#relGrad)';

            return (
              <g key={rel.id}>
                {/* Total Participation: Double line (Chen ER textbook standard) */}
                {rel.participation_to === 'total' && (
                  <path
                    d={conn.pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={5}
                    strokeOpacity={0.4}
                  />
                )}

                {/* Main connector curve */}
                <path
                  d={conn.pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isWeak ? 2.5 : 2}
                  strokeDasharray={isWeak ? '6,3' : 'none'}
                />

                {/* Start & End anchor dots */}
                <circle cx={conn.start.x} cy={conn.start.y} r={4} fill={isWeak ? '#f59e0b' : '#10b981'} />
                <circle cx={conn.end.x} cy={conn.end.y} r={4} fill={isWeak ? '#f59e0b' : '#10b981'} />

                {/* Interactive Cardinality & Relationship Badge */}
                <foreignObject
                  x={conn.mid.x - 55}
                  y={conn.mid.y - 18}
                  width={110}
                  height={36}
                  style={{ pointerEvents: 'auto' }}
                >
                  <div
                    onClick={() => handleCycleCardinality(rel.id)}
                    title={`Relationship: ${rel.name} (Click to toggle cardinality)`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      backgroundColor: isWeak ? 'rgba(30, 20, 10, 0.95)' : 'rgba(17, 24, 39, 0.95)',
                      border: isWeak ? '1.5px solid #f59e0b' : '1px solid var(--emerald-border)',
                      borderRadius: '16px',
                      color: isWeak ? '#fbbf24' : 'var(--emerald-light)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1.0)')}
                  >
                    <span>{rel.name}</span>
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '10px',
                        backgroundColor: isWeak ? 'rgba(245, 158, 11, 0.25)' : 'var(--emerald-bg)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                      }}
                    >
                      {rel.cardinality}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* Entity Cards Layer */}
        {model.entities.map((ent) => {
          const isSelected = selectedEntityId === ent.id;
          const isWeak = !!ent.is_weak;

          return (
            <div
              key={ent.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEntityId(ent.id);
              }}
              style={{
                position: 'absolute',
                left: ent.x,
                top: ent.y,
                width: 270,
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '8px',
                // Chen ER Rule: Weak entities have distinctive DOUBLE BORDER!
                border: isWeak
                  ? '4px double #f59e0b'
                  : isSelected
                  ? '1px solid var(--emerald-base)'
                  : '1px solid var(--border-default)',
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(16, 185, 129, 0.25), 0 8px 24px rgba(0,0,0,0.5)'
                  : isWeak
                  ? '0 8px 24px rgba(245, 158, 11, 0.15)'
                  : '0 8px 20px rgba(0,0,0,0.4)',
                cursor: 'default',
                zIndex: isSelected ? 30 : 20,
              }}
            >
              {/* Entity Header (Draggable Handle) */}
              <div
                onMouseDown={(e) => handleStartDragEntity(e, ent)}
                style={{
                  padding: '10px 12px',
                  backgroundColor: isWeak ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-elevated)',
                  borderBottom: isWeak ? '2px double #f59e0b' : '1px solid var(--border-subtle)',
                  borderTopLeftRadius: '6px',
                  borderTopRightRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'grab',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <Database size={15} color={isWeak ? '#f59e0b' : 'var(--emerald-light)'} />
                  <input
                    type="text"
                    value={ent.name}
                    onChange={(e) => handleUpdateEntityName(ent.id, e.target.value)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      width: '100%',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.backgroundColor = 'var(--bg-canvas)')}
                    onBlur={(e) => (e.target.style.backgroundColor = 'transparent')}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {/* Toggle Weak / Strong Entity */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleWeakEntity(ent.id);
                    }}
                    className="badge"
                    style={{
                      border: isWeak ? '1px solid #f59e0b' : '1px solid var(--border-default)',
                      backgroundColor: isWeak ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-surface)',
                      color: isWeak ? '#fbbf24' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      padding: '2px 6px',
                    }}
                    title={isWeak ? 'Chen Weak Entity (Double Border)' : 'Click to make Weak Entity'}
                  >
                    {isWeak ? 'Weak Entity' : 'Strong'}
                  </button>

                  {/* Delete Entity */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEntity(ent.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      padding: '2px',
                      cursor: 'pointer',
                    }}
                    title="Delete Entity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Attributes List */}
              <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {ent.attributes.map((attr) => (
                  <div
                    key={attr.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      fontSize: '12px',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Attribute Name & Key Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                      {/* Key Indicators (Chen ER Rules) */}
                      {attr.is_primary_key && (
                        <span title="Primary Key (Solid Underline in Chen ER)">
                          <Key size={13} color="#fbbf24" />
                        </span>
                      )}
                      {attr.is_partial_key && (
                        <span title="Partial Key / Discriminator (Dashed Underline in Chen ER)">
                          <Disc size={13} color="#f59e0b" />
                        </span>
                      )}
                      {attr.is_foreign_key && (
                        <span title="Foreign Key Reference">
                          <Link2 size={12} color="#60a5fa" />
                        </span>
                      )}
                      {attr.is_multivalued && (
                        <span title="Multivalued Attribute (Double Ellipse in Chen ER)">
                          <Circle size={12} color="#a855f7" />
                        </span>
                      )}

                      {/* Attribute Name Input */}
                      <input
                        type="text"
                        value={attr.name}
                        onChange={(e) => handleUpdateAttribute(ent.id, attr.id, 'name', e.target.value)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: attr.is_primary_key
                            ? '#fbbf24'
                            : attr.is_partial_key
                            ? '#fcd34d'
                            : 'var(--text-primary)',
                          // TEXTBOOK CHEN ER RULES:
                          // Primary Key = SOLID UNDERLINE
                          // Partial Key / Discriminator = DASHED UNDERLINE
                          textDecoration: attr.is_primary_key ? 'underline' : 'none',
                          textUnderlineOffset: '3px',
                          borderBottom: attr.is_partial_key ? '1.5px dashed #f59e0b' : 'none',
                          fontWeight: attr.is_primary_key || attr.is_partial_key ? 600 : 400,
                          fontSize: '12px',
                          width: '100%',
                          padding: '1px 2px',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Attribute Type Selector & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <select
                        value={attr.type}
                        onChange={(e) => handleUpdateAttribute(ent.id, attr.id, 'type', e.target.value)}
                        style={{
                          backgroundColor: 'var(--bg-canvas)',
                          color: 'var(--text-secondary)',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                        }}
                      >
                        {COMMON_DATA_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      {/* Quick toggle PK */}
                      <button
                        onClick={() =>
                          handleUpdateAttribute(ent.id, attr.id, 'is_primary_key', !attr.is_primary_key)
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          color: attr.is_primary_key ? '#fbbf24' : 'var(--text-muted)',
                          padding: '2px',
                          cursor: 'pointer',
                        }}
                        title="Toggle Primary Key (🔑)"
                      >
                        <Key size={12} />
                      </button>

                      {/* Delete Attribute */}
                      <button
                        onClick={() => handleDeleteAttribute(ent.id, attr.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: '2px',
                          cursor: 'pointer',
                        }}
                        title="Remove Attribute"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Attribute Row Button */}
                <button
                  onClick={() => handleAddAttribute(ent.id)}
                  style={{
                    marginTop: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'transparent',
                    border: '1px dashed var(--border-default)',
                    borderRadius: '4px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Plus size={12} />
                  Add Attribute
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chen ER Legend Modal */}
      {showLegend && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            left: 20,
            width: 380,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '16px',
            zIndex: 50,
            boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HelpCircle size={16} color="var(--emerald-light)" />
              Chen ER Formal Notation Standard
            </h4>
            <button
              onClick={() => setShowLegend(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '22px', border: '1px solid var(--emerald-base)', borderRadius: '3px' }} />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Strong Entity:</strong> Regular entity with independent existence and primary key.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '22px', border: '3px double #f59e0b', borderRadius: '3px' }} />
              <div>
                <strong style={{ color: '#fbbf24' }}>Weak Entity:</strong> Double border. Existence dependent on owner entity.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ textDecoration: 'underline', fontWeight: 600, color: '#fbbf24', minWidth: '40px' }}>id</div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Primary Key:</strong> Solid underline on attribute name.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ borderBottom: '2px dashed #f59e0b', fontWeight: 600, color: '#fcd34d', minWidth: '40px' }}>disc</div>
              <div>
                <strong style={{ color: '#fbbf24' }}>Partial Key (Discriminator):</strong> Dashed underline. Used in weak entities.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px double #a855f7' }} />
              <div>
                <strong style={{ color: '#c084fc' }}>Multivalued:</strong> Double ellipse ring. Holds multiple values.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '4px', backgroundColor: 'var(--emerald-light)' }} />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Total Participation:</strong> Double line connection (every instance participates).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Relationship Modal */}
      {showAddRelModal && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            left: 200,
            width: 320,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '16px',
            zIndex: 50,
            boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600 }}>Create New Relationship</h4>
            <button
              onClick={() => setShowAddRelModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>From Entity</label>
              <select
                value={relFrom}
                onChange={(e) => setRelFrom(e.target.value)}
                style={{ width: '100%', marginTop: '3px' }}
              >
                {model.entities.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>To Entity</label>
              <select
                value={relTo}
                onChange={(e) => setRelTo(e.target.value)}
                style={{ width: '100%', marginTop: '3px' }}
              >
                {model.entities.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Relationship Name</label>
              <input
                type="text"
                value={relName}
                onChange={(e) => setRelName(e.target.value)}
                placeholder="e.g. books, contains, issues"
                style={{ width: '100%', marginTop: '3px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cardinality</label>
              <select
                value={relCard}
                onChange={(e) => setRelCard(e.target.value as any)}
                style={{ width: '100%', marginTop: '3px' }}
              >
                <option value="1:1">1:1 (One to One)</option>
                <option value="1:N">1:N (One to Many)</option>
                <option value="M:N">M:N (Many to Many)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button className="btn-secondary" onClick={() => setShowAddRelModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateRelationship}>
                Connect Entities
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
