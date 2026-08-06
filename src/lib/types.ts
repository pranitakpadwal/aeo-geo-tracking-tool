export interface ScanInput {
  brand: string;
  domain?: string;
  industry: string;
  competitors: string[];
  customPrompts: string[];
}

export interface ScanRecord {
  id: string;
  brand: string;
  domain: string | null;
  industry: string;
  competitors: string[];
  status: "pending" | "running" | "complete" | "error";
  error: string | null;
  siteAudit: SiteAudit | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PromptResult {
  promptId: number;
  prompt: string;
  source: "generated" | "custom";
  responseText: string;
  brandMentioned: boolean;
  brandPosition: number | null; // 0..1, how early the brand appears (0 = first sentence)
  competitorsMentioned: Record<string, boolean>;
}

export interface ScanDetail extends ScanRecord {
  results: PromptResult[];
}

export interface SiteAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SiteAudit {
  domain: string;
  score: number; // 0-100
  checks: SiteAuditCheck[];
}
