export type ProjectStage = 'design' | 'normalization' | 'security' | 'provision' | 'deployed';

export interface AttributeMeta {
  id: string;
  name: string;
  type: string;
  is_primary_key?: boolean;
  is_partial_key?: boolean; // Discriminator for weak entities (dashed underline in Chen ER)
  is_multivalued?: boolean; // Double ellipse / ring in Chen ER
  is_foreign_key?: boolean;
  references?: string;
  nullable?: boolean;
}

export interface EntityNode {
  id: string;
  name: string;
  is_weak?: boolean; // Double rectangle in Chen ER
  identifying_relationship?: string;
  x: number;
  y: number;
  attributes: AttributeMeta[];
}

export interface RelationshipEdge {
  id: string;
  name: string;
  from_entity: string;
  to_entity: string;
  cardinality: '1:1' | '1:N' | 'M:N';
  is_identifying?: boolean;
  participation_from?: 'total' | 'partial'; // Total = double line, Partial = single line
  participation_to?: 'total' | 'partial';
}

export interface ErModel {
  entities: EntityNode[];
  relationships: RelationshipEdge[];
}

export interface FunctionalDependency {
  id: string;
  lhs: string[];
  rhs: string[];
}

export interface TableColumn {
  name: string;
  type: string;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
  references?: string;
  nullable?: boolean;
}

export interface TableMeta {
  name: string;
  row_count: number;
  columns: TableColumn[];
  primary_key: string[];
  foreign_keys: any[];
}

export interface RoleMeta {
  name: string;
  description: string;
  allowed_statements: string[];
  visible_tables: string[];
  masked_columns?: Record<string, string[]>; // table -> list of masked columns
}

export interface ConnectionInfo {
  tenant_id: string;
  postgres_version: string;
  host: string;
  port: number;
  database: string;
  direct_url: string;
  pooler_transaction_url: string;
  pooler_session_url: string;
  anon_public_key: string;
  service_role_key: string;
}
