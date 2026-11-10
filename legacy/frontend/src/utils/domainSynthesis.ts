import { ErModel, EntityNode, RelationshipEdge } from '@/types/database';

export function convertBackendErToCanvasModel(backendEr: any): ErModel {
  if (!backendEr || !Array.isArray(backendEr.entities) || backendEr.entities.length === 0) {
    return { entities: [], relationships: [] };
  }

  const cols = 2;
  const spacingX = 380;
  const spacingY = 280;

  const entities: EntityNode[] = backendEr.entities.map((e: any, idx: number) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 70 + col * spacingX;
    const y = 60 + row * spacingY;

    return {
      id: `ent_${e.name.toLowerCase()}_${idx}`,
      name: e.name,
      is_weak: Boolean(e.is_weak),
      identifying_relationship: e.identifying_relationship,
      x,
      y,
      attributes: (e.attributes || []).map((a: any, aIdx: number) => ({
        id: `attr_${e.name.toLowerCase()}_${aIdx}`,
        name: a.name,
        type: a.type || 'VARCHAR(100)',
        is_primary_key: Boolean(a.is_pk || a.is_primary_key),
        is_partial_key: Boolean(a.is_partial_key),
        is_multivalued: Boolean(a.is_multivalued),
      })),
    };
  });

  const relationships: RelationshipEdge[] = (backendEr.relationships || []).map((r: any, idx: number) => {
    const fromEnt = Array.isArray(r.entities) && r.entities.length > 0 ? r.entities[0] : '';
    const toEnt = Array.isArray(r.entities) && r.entities.length > 1 ? r.entities[1] : '';
    const partFrom = (r.participation && r.participation[fromEnt]) || 'partial';
    const partTo = (r.participation && r.participation[toEnt]) || 'total';

    return {
      id: `rel_${r.name.toLowerCase()}_${idx}`,
      name: r.name,
      from_entity: fromEnt,
      to_entity: toEnt,
      cardinality: (r.cardinality as any) || '1:N',
      is_identifying: Boolean(r.is_identifying),
      participation_from: partFrom,
      participation_to: partTo,
    };
  });

  return { entities, relationships };
}

export function synthesizeDomainLocally(prompt: string): ErModel {
  const p = prompt.toLowerCase();

  if (p.includes('clinic') || p.includes('hospital') || p.includes('doctor') || p.includes('patient')) {
    return {
      entities: [
        {
          id: 'ent_patient',
          name: 'Patient',
          is_weak: false,
          x: 70,
          y: 60,
          attributes: [
            { id: 'attr_p1', name: 'patient_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_p2', name: 'name', type: 'VARCHAR(100)' },
            { id: 'attr_p3', name: 'dob', type: 'DATE' },
            { id: 'attr_p4', name: 'phone', type: 'VARCHAR(20)', is_multivalued: true },
          ],
        },
        {
          id: 'ent_doctor',
          name: 'Doctor',
          is_weak: false,
          x: 460,
          y: 60,
          attributes: [
            { id: 'attr_d1', name: 'doctor_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_d2', name: 'license_no', type: 'VARCHAR(20)' },
            { id: 'attr_d3', name: 'name', type: 'VARCHAR(100)' },
            { id: 'attr_d4', name: 'specialty', type: 'VARCHAR(50)' },
          ],
        },
        {
          id: 'ent_appointment',
          name: 'Appointment',
          is_weak: false,
          x: 260,
          y: 340,
          attributes: [
            { id: 'attr_a1', name: 'appointment_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_a2', name: 'scheduled_at', type: 'TIMESTAMP' },
            { id: 'attr_a3', name: 'status', type: 'VARCHAR(20)' },
          ],
        },
        {
          id: 'ent_prescription',
          name: 'Prescription',
          is_weak: true,
          identifying_relationship: 'issues',
          x: 640,
          y: 340,
          attributes: [
            { id: 'attr_pr1', name: 'medication', type: 'VARCHAR(100)', is_partial_key: true },
            { id: 'attr_pr2', name: 'dosage', type: 'VARCHAR(50)' },
            { id: 'attr_pr3', name: 'refills', type: 'INT' },
          ],
        },
      ],
      relationships: [
        {
          id: 'rel_books',
          name: 'books',
          from_entity: 'Patient',
          to_entity: 'Appointment',
          cardinality: '1:N',
          participation_from: 'partial',
          participation_to: 'total',
        },
        {
          id: 'rel_conducts',
          name: 'conducts',
          from_entity: 'Doctor',
          to_entity: 'Appointment',
          cardinality: '1:N',
          participation_from: 'partial',
          participation_to: 'total',
        },
        {
          id: 'rel_issues',
          name: 'issues',
          from_entity: 'Appointment',
          to_entity: 'Prescription',
          cardinality: '1:N',
          is_identifying: true,
          participation_from: 'partial',
          participation_to: 'total',
        },
      ],
    };
  }

  if (p.includes('order') || p.includes('ecommerce') || p.includes('product') || p.includes('inventory') || p.includes('shop')) {
    return {
      entities: [
        {
          id: 'ent_customer',
          name: 'Customer',
          is_weak: false,
          x: 70,
          y: 60,
          attributes: [
            { id: 'attr_c1', name: 'customer_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_c2', name: 'email', type: 'VARCHAR(255)' },
            { id: 'attr_c3', name: 'full_name', type: 'VARCHAR(150)' },
            { id: 'attr_c4', name: 'tier', type: 'VARCHAR(20)' },
          ],
        },
        {
          id: 'ent_order',
          name: 'Order',
          is_weak: false,
          x: 460,
          y: 60,
          attributes: [
            { id: 'attr_o1', name: 'order_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_o2', name: 'created_at', type: 'TIMESTAMPTZ' },
            { id: 'attr_o3', name: 'total_cents', type: 'BIGINT' },
            { id: 'attr_o4', name: 'order_status', type: 'VARCHAR(30)' },
          ],
        },
        {
          id: 'ent_product',
          name: 'Product',
          is_weak: false,
          x: 260,
          y: 340,
          attributes: [
            { id: 'attr_p1', name: 'product_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_p2', name: 'sku', type: 'VARCHAR(64)' },
            { id: 'attr_p3', name: 'title', type: 'VARCHAR(255)' },
            { id: 'attr_p4', name: 'stock_quantity', type: 'INT' },
          ],
        },
        {
          id: 'ent_payment',
          name: 'Payment',
          is_weak: false,
          x: 640,
          y: 340,
          attributes: [
            { id: 'attr_pay1', name: 'payment_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_pay2', name: 'charge_id', type: 'VARCHAR(128)' },
            { id: 'attr_pay3', name: 'amount', type: 'BIGINT' },
            { id: 'attr_pay4', name: 'paid_at', type: 'TIMESTAMPTZ' },
          ],
        },
      ],
      relationships: [
        {
          id: 'rel_places',
          name: 'places',
          from_entity: 'Customer',
          to_entity: 'Order',
          cardinality: '1:N',
          participation_from: 'partial',
          participation_to: 'total',
        },
        {
          id: 'rel_contains',
          name: 'contains',
          from_entity: 'Order',
          to_entity: 'Product',
          cardinality: 'M:N',
          participation_from: 'total',
          participation_to: 'partial',
        },
        {
          id: 'rel_settles',
          name: 'settles',
          from_entity: 'Order',
          to_entity: 'Payment',
          cardinality: '1:1',
          participation_from: 'total',
          participation_to: 'total',
        },
      ],
    };
  }

  if (p.includes('fintech') || p.includes('banking') || p.includes('ledger') || p.includes('account') || p.includes('transfer')) {
    return {
      entities: [
        {
          id: 'ent_account',
          name: 'Account',
          is_weak: false,
          x: 70,
          y: 60,
          attributes: [
            { id: 'attr_acc1', name: 'account_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_acc2', name: 'account_number', type: 'VARCHAR(34)' },
            { id: 'attr_acc3', name: 'currency', type: 'VARCHAR(3)' },
            { id: 'attr_acc4', name: 'cleared_balance', type: 'NUMERIC(18,4)' },
          ],
        },
        {
          id: 'ent_transaction',
          name: 'Transaction',
          is_weak: false,
          x: 460,
          y: 60,
          attributes: [
            { id: 'attr_tx1', name: 'tx_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_tx2', name: 'idempotency_key', type: 'VARCHAR(64)' },
            { id: 'attr_tx3', name: 'initiated_at', type: 'TIMESTAMPTZ' },
            { id: 'attr_tx4', name: 'tx_state', type: 'VARCHAR(20)' },
          ],
        },
        {
          id: 'ent_posting',
          name: 'Posting',
          is_weak: false,
          x: 260,
          y: 340,
          attributes: [
            { id: 'attr_post1', name: 'posting_id', type: 'UUID', is_primary_key: true },
            { id: 'attr_post2', name: 'direction', type: 'VARCHAR(6)' },
            { id: 'attr_post3', name: 'amount', type: 'NUMERIC(18,4)' },
          ],
        },
      ],
      relationships: [
        {
          id: 'rel_initiates',
          name: 'initiates',
          from_entity: 'Account',
          to_entity: 'Transaction',
          cardinality: '1:N',
          participation_from: 'partial',
          participation_to: 'total',
        },
        {
          id: 'rel_entries',
          name: 'entries',
          from_entity: 'Transaction',
          to_entity: 'Posting',
          cardinality: '1:N',
          participation_from: 'total',
          participation_to: 'total',
        },
      ],
    };
  }

  // Generic fallback parsing words from prompt
  const words = prompt
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length > 3);

  const e1 = words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() : 'EntityA';
  const e2 = words[1] ? words[1].charAt(0).toUpperCase() + words[1].slice(1).toLowerCase() : 'EntityB';
  const e3 = words[2] ? words[2].charAt(0).toUpperCase() + words[2].slice(1).toLowerCase() : 'EntityC';

  return {
    entities: [
      {
        id: `ent_${e1.toLowerCase()}`,
        name: e1,
        is_weak: false,
        x: 70,
        y: 60,
        attributes: [
          { id: `attr_${e1}_1`, name: `${e1.toLowerCase()}_id`, type: 'UUID', is_primary_key: true },
          { id: `attr_${e1}_2`, name: 'title', type: 'VARCHAR(128)' },
          { id: `attr_${e1}_3`, name: 'created_at', type: 'TIMESTAMPTZ' },
          { id: `attr_${e1}_4`, name: 'status', type: 'VARCHAR(32)' },
        ],
      },
      {
        id: `ent_${e2.toLowerCase()}`,
        name: e2,
        is_weak: false,
        x: 460,
        y: 60,
        attributes: [
          { id: `attr_${e2}_1`, name: `${e2.toLowerCase()}_id`, type: 'UUID', is_primary_key: true },
          { id: `attr_${e2}_2`, name: 'name', type: 'VARCHAR(128)' },
          { id: `attr_${e2}_3`, name: 'description', type: 'TEXT' },
        ],
      },
      {
        id: `ent_${e3.toLowerCase()}`,
        name: e3,
        is_weak: false,
        x: 260,
        y: 340,
        attributes: [
          { id: `attr_${e3}_1`, name: `${e3.toLowerCase()}_id`, type: 'UUID', is_primary_key: true },
          { id: `attr_${e3}_2`, name: 'reference_code', type: 'VARCHAR(64)' },
          { id: `attr_${e3}_3`, name: 'updated_at', type: 'TIMESTAMPTZ' },
        ],
      },
    ],
    relationships: [
      {
        id: 'rel_links_1',
        name: 'associates',
        from_entity: e1,
        to_entity: e2,
        cardinality: '1:N',
        participation_from: 'partial',
        participation_to: 'total',
      },
      {
        id: 'rel_links_2',
        name: 'includes',
        from_entity: e2,
        to_entity: e3,
        cardinality: '1:N',
        participation_from: 'partial',
        participation_to: 'partial',
      },
    ],
  };
}
