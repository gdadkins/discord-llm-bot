/**
 * Type definitions for audit and report systems
 */

export interface AuditReportEntry {
  id: string;
  timestamp: string;
  action: string;
  path: string;
  modifiedBy?: string;
  reason?: string;
  significant: boolean;
  previousValue?: unknown;
  newValue?: unknown;
  type?: string;
  version?: string;
  revertedTo?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditReport {
  generated: string;
  entryCount: number;
  filters: unknown;
  analytics?: unknown;
  entries: AuditReportEntry[];
}