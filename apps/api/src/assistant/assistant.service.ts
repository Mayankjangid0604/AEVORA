import { BoardroomService } from '../boardroom/boardroom.service';
import { isUrgentBoardMeetingCommand } from '../boardroom/boardroom.logic';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { CeoReviewService, findCeo, parseJson } from '../ceo/ceo-review.service';
import { IdeasService } from '../ideas/ideas.service';
import { MarketingContentService } from '../marketing-content/marketing-content.service';
import { InboundMessageService } from '../sales-outreach/inbound-message.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { SimulationService } from '../simulation/simulation.service';
import { ResponseCacheService } from './response-cache.service';
import { VoiceService } from '../voice/voice.service';
import { NotificationService, NotificationPriority } from '../communication/notification.service';
import { hiringLimits } from '../ceo/ceo-hiring.service';
import { ProjectStaffingService } from '../ceo/project-staffing.service';
import { companyProfile } from '../config/company';
import { CompanyStateService, CompanyStateSnapshot } from '../management/company-state.service';
import { SalesPipelineService } from '../sales/sales-pipeline.service';
import { BriefingService } from './briefing.service';
import { ProactiveAlertService } from './proactive-alert.service';

export const ASSISTANT_INTENTS = [
  'STATUS_REPORT', 'COMMAND_CEO', 'NEW_VENTURE', 'FIND_LEADS', 'PAUSE_SIMULATION',
  'RESUME_SIMULATION', 'CHECK_REVENUE', 'WHATSAPP_MESSAGE', 'ASK_CEO',
  'GENERATE_POST', 'GENERATE_CALENDAR', 'WHATSAPP_BROADCAST', 'CHECK_INBOX', 'TEAM_REPORT', 'URGENT_BOARD_MEETING',
  'ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK',
  'COMPANY_OVERVIEW', 'LEADS_REPORT', 'SALES_PIPELINE', 'PROJECTS_REPORT', 'ALERTS_REPORT',
  'BROADCAST_DEPARTMENT', 'BROADCAST_COMPANY',
  'CHAIRMAN_BRIEFING', 'ATTENTION_REPORT', 'BUDGET_REPORT', 'FINANCIAL_AUTHORITY_REPORT', 'STRATEGY_REPORT', 'KPI_REPORT',
  'PERFORMANCE_REPORT', 'SUCCESSION_REPORT',
  'CUSTOM',
  'GENERATE_POST', 'GENERATE_CALENDAR', 'WHATSAPP_BROADCAST', 'CHECK_INBOX', 'TEAM_REPORT', 'URGENT_BOARD_MEETING', 'CUSTOM',
] as const;
export type AssistantIntentName = (typeof ASSISTANT_INTENTS)[number];

export interface ParsedIntent {
  intent: AssistantIntentName;
  target: string;
  parameters: Record<string, any>;
  reply: string;
}

// ── Unified routing types (internal, not persisted) ──────────────
export type TargetType = 'CEO' | 'LEAD' | 'EMPLOYEE' | 'DEPARTMENT' | 'SYSTEM' | 'CHAIRMAN' | 'UNKNOWN';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export interface RoutedCommand {
  intent: AssistantIntentName;
  targetType: TargetType;
  targetId: string | null;
  targetName: string | null;
  department: string | null;
  action: string;
  message: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  confidence: Confidence;
  originalRequest: string;
}
export interface AssistantResult {
  response: string;
  intent: string;
  actions: string[];
  voiceResult?: any;
  routing?: {
    targetType: TargetType;
    targetName: string | null;
    department: string | null;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
    confidence: Confidence;
    taskId: string | null;
    approvalRequired: boolean;
    status: 'executed' | 'queued' | 'approval_required' | 'clarification_needed' | 'failed';
    errorCode: string | null;
    contextUsed?: boolean;
    referencedEntity?: string | null;
  };
}
const INTENT_SYSTEM = () => `You are an intent parser for the personal AI assistant of the Chairman of ${companyProfile().name}.
Parse the Chairman's message and return JSON only. Your output is a PROPOSED interpretation — application code validates and executes it. You must NEVER execute actions.
Valid intents: ${ASSISTANT_INTENTS.join(', ')}
Valid target types: CEO, LEAD, EMPLOYEE, DEPARTMENT, SYSTEM, UNKNOWN`;

const intentPrompt = (message: string) => `Parse this message from the Chairman and return JSON:
Message: "${message}"

Return this exact JSON structure:
{
  "intent": "one of the valid intents",
  "target": "CEO | SALES | DEVELOPMENT | MARKETING | HR | PRODUCT | IT | ALL",
  "targetType": "CEO | LEAD | EMPLOYEE | DEPARTMENT | SYSTEM | UNKNOWN",
  "parameters": {
    "instruction": "if COMMAND_CEO, TELL_EMPLOYEE, or CUSTOM",
    "idea": "if NEW_VENTURE",
    "question": "if ASK_CEO or ASK_EMPLOYEE",
    "targetQuery": "if ASK_EMPLOYEE, TELL_EMPLOYEE, or CREATE_EMPLOYEE_TASK — the name or department of the target",
  "intent": "one of the valid intents above",
  "target": "CEO | SALES | DEVELOPMENT | MARKETING | ALL",
    "instruction": "if COMMAND_CEO or CUSTOM",
    "question": "if ASK_CEO",
    "phone": "if WHATSAPP_MESSAGE",
    "message": "if WHATSAPP_MESSAGE"
  },
  "reply": "a friendly 1 sentence acknowledgement in same language as input"
}

Intent guide:
- ASK_EMPLOYEE: Chairman asks a question to an employee or department lead (not the CEO)
- TELL_EMPLOYEE: Chairman gives an instruction to an employee or department lead
- CREATE_EMPLOYEE_TASK: Chairman creates a task assigned to an employee
- ASK_CEO / COMMAND_CEO: Chairman communicates with the CEO specifically
- STATUS_REPORT, CHECK_REVENUE, TEAM_REPORT: read-only company information (targetType=SYSTEM)
- COMPANY_OVERVIEW: company-wide summary (revenue, leads, projects, employees, alerts)
- LEADS_REPORT: lead counts, pipeline, qualified leads, follow-up needed
- SALES_PIPELINE: sales pipeline, active deals, opportunities, pipeline value
- PROJECTS_REPORT: active/delayed/blocked projects
- ALERTS_REPORT: what needs Chairman attention, pending approvals, alerts
- BUDGET_REPORT: status of company and department budgets, allocation, utilization and remaining budget
- FINANCIAL_AUTHORITY_REPORT: what the CEO is allowed to spend, authority limits, recent financial decisions
- STRATEGY_REPORT: strategic plan, objectives, milestones, strategic health and risks
- KPI_REPORT: company-wide performance metrics, KPI status, trends, critical metrics
- BROADCAST_DEPARTMENT: Chairman sends instruction to an entire department (targetType=DEPARTMENT)
- BROADCAST_COMPANY: Chairman sends instruction to all employees or all leads (targetType=SYSTEM)
- CHAIRMAN_BRIEFING: Chairman wants an executive briefing/summary of company state
- ATTENTION_REPORT: Chairman wants to know what needs their attention (approvals, urgent items)
- PAUSE_SIMULATION, RESUME_SIMULATION: system control commands

Return ONLY valid JSON. No explanation.`;

/** Model output → a safe intent. Anything unknown or malformed becomes CUSTOM (forwarded to the CEO). */
export function normalizeAssistantIntent(raw: any, message: string): ParsedIntent {
  const intent = ASSISTANT_INTENTS.includes(raw?.intent) ? raw.intent : 'CUSTOM';
  const parameters = raw?.parameters && typeof raw.parameters === 'object' ? raw.parameters : {};
  if ((intent === 'COMMAND_CEO' || intent === 'CUSTOM') && !String(parameters.instruction ?? '').trim()) parameters.instruction = message;
  if (intent === 'NEW_VENTURE' && !String(parameters.idea ?? '').trim()) parameters.idea = message;
  if (intent === 'ASK_CEO' && !String(parameters.question ?? '').trim()) parameters.question = message;
  return {
    intent,
    target: typeof raw?.target === 'string' ? raw.target : 'CEO',
    parameters,
    reply: typeof raw?.reply === 'string' && raw.reply.trim() ? raw.reply.trim() : 'Samajh gaya. CEO ko forward kar raha hun.',
  };
}

const fast = (intent: AssistantIntentName, parameters: Record<string, any> = {}, target = 'ALL'): ParsedIntent =>
  ({ intent, target, parameters, reply: '' });

// Side-effect commands must be the whole message, so "tell CEO not to pause outreach" can't pause the simulation.
const PAUSE_PHRASES = new Set(['pause', 'pause simulation', 'pause the simulation', 'stop simulation', 'stop the simulation', 'ruk jao', 'band karo', 'simulation band karo', 'simulation roko']);
const RESUME_PHRASES = new Set(['resume', 'resume simulation', 'resume the simulation', 'start simulation', 'start the simulation', 'chalu karo', 'shuru karo', 'simulation chalu karo', 'simulation shuru karo']);

/**
 * Keyword routing for common commands — answers without the 40–65 s phi4 intent parse.
 * Returns null when the message needs the model. Order matters: explicit CEO commands first,
 * so "tell CEO we need more money" stays a directive instead of a revenue check.
 */
export function detectSimpleIntent(message: string): ParsedIntent | null {
  const text = message.trim();
  const msg = text.toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  // Same phrase set as the 3D office wake word and /voice/command, so every voice/typed path starts the meeting.
  if (isUrgentBoardMeetingCommand(text)) return fast('URGENT_BOARD_MEETING', {}, 'BOARDROOM');

  let m = text.match(/^(?:ask (?:the )?ceo|ceo se pucho|ceo ko pucho)\s*[:,\-]?\s*(.+)$/i);
  if (m) return fast('ASK_CEO', { question: m[1].trim() }, 'CEO');

  m = text.match(/^(?:tell (?:the )?ceo|ceo ko bolo|ceo se kaho)\s*[:,\-]?\s*(?:to |that )?(.+)$/i) || text.match(/^(?:call|instruct|direct|have|get) (?:the )?ceo\s*[:,\-]?\s*(.+)$/i);
  if (m) return fast('COMMAND_CEO', { instruction: m[1].trim() }, 'CEO');

  m = text.match(/^(?:new venture|startup idea|new idea|naya idea|idea|i have an idea)\s*[:\-]\s*(.+)$/i);
  if (m) return fast('NEW_VENTURE', { idea: m[1].trim() }, 'CEO');

  if (PAUSE_PHRASES.has(msg)) return fast('PAUSE_SIMULATION');
  if (RESUME_PHRASES.has(msg)) return fast('RESUME_SIMULATION');
  if (/^(?:find|search|get|search for)(?: new| more)? (?:leads?|clients?|business(?:es)?)$/.test(msg) || msg === 'leads dhundo') return fast('FIND_LEADS');
  if (/\b(?:kpi report|how are kpis|what are (?:the|our) kpis|kpis status|show kpis)\b/.test(msg)) return fast('KPI_REPORT', {}, 'SYSTEM');
  if (/\b(?:performance report|how is the team performing|who is underperforming|department leads doing|employees improving)\b/.test(msg)) return fast('PERFORMANCE_REPORT', {}, 'SYSTEM');
  if (/\b(?:succession report|succession risk|ready to take over|replacement recommendation|critical roles have no successor)\b/.test(msg)) return fast('SUCCESSION_REPORT', {}, 'SYSTEM');

  // PIXEL content — only drafts are created, so loose matching is fine; checked before the lookups
  // so "generate post about revenue growth" makes a post, not a revenue report.
  if (/\b(?:content calendar|weekly calendar|week ka content|generate calendar)\b/.test(msg)) return fast('GENERATE_CALENDAR', {}, 'MARKETING');
  if (/\b(?:whatsapp broadcast|broadcast message|broadcast bhejo)\b/.test(msg)) return fast('WHATSAPP_BROADCAST', {}, 'MARKETING');
  if (/\b(?:(?:generate|create) (?:an? )?(?:instagram )?post|instagram post|content banao|post banao)\b/.test(msg)) {
    const topic = text
      .replace(/^.*?\bpost\b\s*(?:about|on|for|ke baare mein)?\s*/i, '')
      .replace(/\b(?:content|post)?\s*banao\b/i, '')
      .trim();
    return fast('GENERATE_POST', { topic: topic || `${companyProfile().name} services for local businesses` }, 'MARKETING');
  }

  // ── Employee-targeted commands (before inbox/status to avoid false matches) ──
  // CREATE_EMPLOYEE_TASK: "create a task for the sales lead to...", "assign the product lead..."
  m = text.match(/^(?:create (?:a )?task (?:for )?|assign (?:(?:a )?task (?:to |for )?)?|give (?:a )?task (?:to )?)(?:the )?(.+?)(?:\s+to\s+(.+)|$)/i);
  if (m) {
    const parsed = parseEmployeeTarget(m[1], m[2]);
    if (parsed) return fast('CREATE_EMPLOYEE_TASK', { targetQuery: parsed.target, instruction: parsed.body || text }, parsed.target.toUpperCase());
  }
  // "ask the sales team to..." when clearly an instruction (has "to") — before ASK_EMPLOYEE so "ask X to Y" is a directive
  m = text.match(/^ask\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i);
  if (m && !/(^|\b)(?:ceo|everyone|everybody)\b/i.test(m[1]) && !/\b(?:all|whole|entire)\b/i.test(m[1])) {
    return fast('TELL_EMPLOYEE', { targetQuery: m[1].trim(), instruction: m[2].trim() }, m[1].trim().toUpperCase());
  }
  // TELL_EMPLOYEE: "tell the sales lead to...", "instruct the IT lead to...", "have the product lead..."
  // Must come after TELL_CEO which is already matched above.
  m = text.match(/^(?:tell|instruct|have|direct)\s+(?:the\s+)?(.+?)\s+(?:to\s+)(.+)$/i);
  if (m && !/(^|\b)(?:ceo|everyone|everybody|me|us)\b/i.test(m[1]) && !/\b(?:all|whole|entire)\b/i.test(m[1])) {
    return fast('TELL_EMPLOYEE', { targetQuery: m[1].trim(), instruction: m[2].trim() }, m[1].trim().toUpperCase());
  }
  // "have X review/do Y" → TELL_EMPLOYEE: "have product review CRM", "get product to review CRM"
  m = text.match(/^(?:have|get)\s+(?!(?:an?\s+)?(?:update|report|status)\s+from)(?:the\s+)?(.+?)\s+(?:to\s+)?(?:review|do|handle|fix|check|investigate|prepare|update|complete|finish|build|write|draft|send|create)\s+(.+)$/i);
  if (m && !/(^|\b)(?:ceo|me|us)\b/i.test(m[1])) {
    return fast('TELL_EMPLOYEE', { targetQuery: m[1].trim(), instruction: `${m[0].replace(/^(?:have|get)\s+(?:the\s+)?/i, '').trim()}` }, m[1].trim().toUpperCase());
  }
  // "what's happening with/in X?" / "how is X doing?" → ASK_EMPLOYEE about that department
  m = text.match(/^(?:what(?:'s| is) happening (?:with|in)|how is|how are|what(?:'s| is) (?:the )?(?:status|update) (?:of|on|from|with))\s+(?:the\s+)?(.+?)(?:\s+(?:team|department|lead))?\s*\??$/i);
  if (m && !/(^|\b)(?:ceo|company|we|me|us|revenue|balance|inbox|simulation)\b/i.test(m[1])) {
    return fast('ASK_EMPLOYEE', { targetQuery: m[1].trim(), question: text }, m[1].trim().toUpperCase());
  }
  // "what's the X lead working on?" → ASK_EMPLOYEE
  m = text.match(/^what(?:'s| is)\s+(?:the\s+)?(.+?)\s+(?:lead|head|manager)\s+(?:working on|doing|up to)\s*\??$/i);
  if (m) {
    return fast('ASK_EMPLOYEE', { targetQuery: `${m[1].trim()} lead`, question: text }, m[1].trim().toUpperCase());
  }
  // ASK_EMPLOYEE: "ask the sales lead why...", "get an update from the HR lead", "find out from..."
  // Must come after ASK_CEO and "ask X to Y" which are already matched above.
  m = text.match(/^(?:ask|get (?:an? )?(?:update|report|status) from|find out from|check with)\s+(?:the\s+)?(.+?)(?:\s+(?:why|what|how|when|where|about|for|if|whether|regarding)\s+(.+)|$)/i);
  if (m && !/(^|\b)(?:ceo|me|us)\b/i.test(m[1]) && !/\b(?:all|whole|entire|everyone|everybody)\b/i.test(m[1])) {
    return fast('ASK_EMPLOYEE', { targetQuery: m[1].trim(), question: m[2]?.trim() || text }, m[1].trim().toUpperCase());
  }
  // "get me an update from X" / "get an X update" → ASK_EMPLOYEE
  m = text.match(/^get (?:me )?(?:an? )?(.+?)(?:\s+update|\s+report)\s*$/i);
  if (m && !/(^|\b)(?:ceo|me|us|status|revenue|team)\b/i.test(m[1])) {
    const target = m[1].replace(/^(?:from\s+(?:the\s+)?)/i, '').trim();
    if (target) return fast('ASK_EMPLOYEE', { targetQuery: target, question: text }, target.toUpperCase());
  }
  // Inbox check: only reads Gmail and classifies lead replies.
  if (/\b(?:check (?:inbox|emails?|mail)|email dekho|mail dekho|koi reply|any repl(?:y|ies)|new emails?)\b/.test(msg)) return fast('CHECK_INBOX', {}, 'INBOX');
  // ── Broadcast / company-wide commands ──
  // "tell the whole sales team...", "tell all of sales...", "notify the sales department..."
  m = text.match(/^(?:tell|notify|inform|message|instruct)\s+(?:the\s+)?(?:whole|entire|all(?: of)?)\s+(?:the\s+)?(.+?)(?:\s+(?:team|department|dept))?\s+(?:to\s+|that\s+)(.+)$/i);
  if (m) {
    const dept = m[1].trim();
    return fast('BROADCAST_DEPARTMENT', { department: dept, instruction: m[2].trim() }, dept.toUpperCase());
  }
  // "ask all department leads for/about..."
  m = text.match(/^(?:ask|tell|notify)\s+(?:all\s+)?(?:department\s+)?leads?\s+(?:to\s+|for\s+|about\s+)(.+)$/i);
  if (m) return fast('BROADCAST_COMPANY', { instruction: m[1].trim(), scope: 'LEADS' }, 'ALL');
  // "tell the company...", "tell everyone..."
  m = text.match(/^(?:tell|notify|inform|message)\s+(?:the\s+)?(?:company|everyone|all employees?|the whole team|everybody)\s+(?:to\s+|that\s+|about\s+)(.+)$/i);
  if (m) return fast('BROADCAST_COMPANY', { instruction: m[1].trim(), scope: 'ALL' }, 'ALL');
  // ── Chairman briefing & attention ──
  // CHAIRMAN_BRIEFING: "brief me", "give me my briefing", "executive summary", "what's happening in the company"
  if (/\b(?:brief me|brief(?:ing)|executive (?:summary|briefing)|give me (?:my |today'?s? )?(?:briefing|summary)|(?:daily|morning) briefing|what do i need to know)\b/.test(msg)
    || /^give me (?:today'?s? )?executive summary/.test(msg)) return fast('CHAIRMAN_BRIEFING', {}, 'CHAIRMAN');
  // ATTENTION_REPORT: "what needs my attention", "anything urgent", "what requires my approval"
  if (/\b(?:(?:what )?needs? (?:my )?attention|anything urgent|kuch urgent|(?:what )?requires? (?:my )?approval|approvals? pending|what should i (?:look at|focus on)|pending approvals?)\b/.test(msg)) return fast('ATTENTION_REPORT', {}, 'CHAIRMAN');
  // ── Company information retrieval (before loose lookups) ──
  // Company overview: "company overview", "how is the company doing", "what's happening in the company"
  if (/\b(?:company overview|company summary|company status|company report)\b/.test(msg)
    || /^(?:how is|how's) the company/.test(msg)
    || /^what(?:'s| is) happening (?:in|with) the company/.test(msg)
    || /^give me (?:a |the )?(?:company )?overview/.test(msg)
    || msg === 'how are we doing' || msg.includes('kya haal')) return fast('COMPANY_OVERVIEW', {}, 'SYSTEM');
  // Leads report: "how many leads", "lead pipeline", "show leads"
  if (/\b(?:(?:how many|show(?: me)?|list|count) (?:the |today'?s? )?leads?|lead(?:s)? (?:pipeline|report|status|count|summary)|qualified leads?|leads? (?:need|needing) follow.?up)\b/.test(msg)
    || /\b(?:kitne leads?|leads? dikhao)\b/.test(msg)) return fast('LEADS_REPORT', {}, 'SYSTEM');
  // Sales pipeline: "sales pipeline", "active deals", "open deals", "opportunities"
  if (/\b(?:sales pipeline|pipeline (?:report|status|value|summary)|active deals?|open deals?|active opportunities|open opportunities|deal(?:s)? (?:report|status)|pipeline dikhao)\b/.test(msg)) return fast('SALES_PIPELINE', {}, 'SYSTEM');
  // Projects: "active projects", "what projects", "show projects", "what are we building"
  if (/\b(?:active projects?|(?:show|list)(?: me)? (?:the )?projects?|project(?:s)? (?:report|status|summary)|delayed projects?|what (?:are we|projects))\b/.test(msg)
    || /^what (?:are we|projects are)/.test(msg)) return fast('PROJECTS_REPORT', {}, 'SYSTEM');
  // Strategy report: "strategy", "strategic plan", "company strategy"
  if (/\b(?:strategy|strategic plan|strategic health|objectives|milestones|company strategy)\b/.test(msg)) return fast('STRATEGY_REPORT', {}, 'SYSTEM');
  // Alerts: explicit alert queries (attention/approval routed to ATTENTION_REPORT above)
  if (/\b(?:(?:my )?alerts?|unresolved (?:issues?|alerts?)|active alerts?|show alerts?)\b/.test(msg)) return fast('ALERTS_REPORT', {}, 'SYSTEM');
  // Read-only lookups: loose matching is safe, the worst case is an extra report.
  // Team before status so "team report" lists people instead of the business overview.
  if (/\b(?:team|staff|employees?|workforce|headcount|who works|hired|hiring|openings?|vacanc(?:y|ies)|missing roles?|open roles?|kaun kaam|kitne log|kaun kaun)\b/.test(msg)) return fast('TEAM_REPORT');
  if (/\b(?:revenue|money|balance|earnings?|income|paisa|paise|rupees?|(?:how much (?:did we|have we) (?:make|earn))|(?:today'?s? revenue)|(?:pending payments?)|(?:payment(?:s)? (?:status|pending)))\b/.test(msg)) {
    const period = /\btoday\b/.test(msg) ? 'today' : /\b(?:this )?week\b/.test(msg) ? 'week' : /\b(?:this )?month\b/.test(msg) ? 'month' : undefined;
    return fast('CHECK_REVENUE', { period }, 'SYSTEM');
  }
  if (/\b(?:status|report|overview)\b/.test(msg)) return fast('STATUS_REPORT');
  if (/\b(?:revenue|money|balance|earnings?|income|paisa|paise|rupees?)\b/.test(msg)) return fast('CHECK_REVENUE');
  if (/\b(?:status|report|overview)\b/.test(msg) || msg === 'how are we doing' || msg.includes('kya haal')) return fast('STATUS_REPORT');

  return null;
}

/** Parse a target + optional body from a create-task regex capture. */
function parseEmployeeTarget(raw: string, body?: string): { target: string; body: string } | null {
  const t = raw.replace(/\s*(?:a task|task)\s*/i, '').trim();
  if (!t) return null;
  return { target: t, body: body?.trim() || '' };
}

// ── HIGH-RISK keywords: instructions containing these must go through approval ──
const HIGH_RISK_KEYWORDS = /\b(?:hire|fire|terminat|spend|approv(?:e|al)|pay(?:ment|roll)|delet|remov|destroy|shutdown|shut down|suspend|drop|budget|salary|bonus|promot)\b/i;
const MEDIUM_RISK_KEYWORDS = /\b(?:transfer|reassign|restructur|reorganiz|priorit|escalat|overrid|cancel|halt|block)\b/i;

export function classifyRisk(intent: AssistantIntentName, text: string): RiskLevel {
  // System control commands are always HIGH
  if (intent === 'PAUSE_SIMULATION' || intent === 'RESUME_SIMULATION') return 'HIGH';
  // Read-only intents are always LOW
  if (['STATUS_REPORT', 'CHECK_REVENUE', 'TEAM_REPORT', 'CHECK_INBOX', 'COMPANY_OVERVIEW', 'LEADS_REPORT', 'SALES_PIPELINE', 'PROJECTS_REPORT', 'ALERTS_REPORT', 'CHAIRMAN_BRIEFING', 'ATTENTION_REPORT', 'STRATEGY_REPORT'].includes(intent)) return 'LOW';
  // Keyword-based risk escalation for any command carrying an instruction/question
  if (HIGH_RISK_KEYWORDS.test(text)) return 'HIGH';
  if (MEDIUM_RISK_KEYWORDS.test(text)) return 'MEDIUM';
  // CEO commands default MEDIUM (they create ManagementDecisions)
  if (intent === 'COMMAND_CEO' || intent === 'NEW_VENTURE') return 'MEDIUM';
  // Employee actions default LOW unless keywords escalated above
  if (['ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK'].includes(intent)) return 'LOW';
  if (intent === 'BROADCAST_DEPARTMENT') return 'MEDIUM';
  if (intent === 'BROADCAST_COMPANY') return 'HIGH';
  return 'LOW';
}

export function deriveTargetType(intent: AssistantIntentName, target: string): TargetType {
  if (intent === 'ASK_CEO' || intent === 'COMMAND_CEO' || intent === 'NEW_VENTURE') return 'CEO';
  if (['ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK'].includes(intent)) {
    if (/lead|head|manager|chief|director/i.test(target)) return 'LEAD';
    return 'EMPLOYEE';
  }
  if (intent === 'BROADCAST_DEPARTMENT') return 'DEPARTMENT';
  if (intent === 'BROADCAST_COMPANY') return 'SYSTEM';
  if (['STATUS_REPORT', 'CHECK_REVENUE', 'TEAM_REPORT', 'CHECK_INBOX', 'FIND_LEADS',
       'PAUSE_SIMULATION', 'RESUME_SIMULATION', 'GENERATE_POST', 'GENERATE_CALENDAR',
       'WHATSAPP_BROADCAST', 'WHATSAPP_MESSAGE', 'URGENT_BOARD_MEETING',
       'COMPANY_OVERVIEW', 'LEADS_REPORT', 'SALES_PIPELINE', 'PROJECTS_REPORT', 'ALERTS_REPORT',
       'CHAIRMAN_BRIEFING', 'ATTENTION_REPORT', 'STRATEGY_REPORT'].includes(intent)) return 'SYSTEM';
  return 'UNKNOWN';
}

/** Ambiguous-target check: returns a clarification string or null if target is clear. */
function checkAmbiguousTarget(intent: AssistantIntentName, parameters: Record<string, any>): string | null {
  if (!['ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK'].includes(intent)) return null;
  const q = String(parameters.targetQuery || '').trim().toLowerCase();
  if (!q) return null;
  // Vague pronouns that don't identify anyone
  if (/^(?:the team|them|they|everyone|somebody|someone|the guys|the people|all)$/.test(q)) {
    return `I can do that, but which team or employee should I send this to? Please specify a name or department.`;
  }
  return null;
}

/** Core functions a web/automation agency needs to earn money, and how to recognise someone covering each. */
export const CORE_FUNCTIONS: { label: string; match: RegExp }[] = [
  { label: 'Sales', match: /sales|business development|account exec/i },
  { label: 'Marketing', match: /market|content|social|seo|brand/i },
  { label: 'Development', match: /develop|engineer|programmer|designer|web|software/i },
  { label: 'Project delivery', match: /project|delivery|operations/i },
  { label: 'Finance', match: /financ|accountant|accounts|billing|bookkeep/i },
];

export function formatTeamReport(
  team: { name: string; role: string; department: string }[],
  recentHires: { name?: string; role?: string; reason?: string }[],
  maxHeadcount: number,
  overview?: { openProjects: number; sharedAssignments: number; busy: number; idle: number; projectNeeds: Record<string, number>; rooms: { room: string; chairs: number; used: number; free: number; reported: boolean }[] },
) {
  if (!team.length) return 'Nobody works here yet. Run seed-employees to add the CEO, then start the simulation — the CEO will begin hiring.';
  const byDept = new Map<string, string[]>();
  for (const e of team) byDept.set(e.department, [...(byDept.get(e.department) ?? []), `${e.name} (${e.role})`]);
  const lines = [...byDept.entries()].map(([d, people]) => `- ${d}: ${people.join(', ')}`);
  const missing = CORE_FUNCTIONS.filter((f) => !team.some((e) => f.match.test(`${e.role} ${e.department}`))).map((f) => f.label);
  const hires = recentHires.filter((h) => h?.name).map((h) => `- ${h.name} as ${h.role}${h.reason ? ` — ${h.reason}` : ''}`);
  return [
    `Team: ${team.length}/${maxHeadcount} people`,
    ...lines,
    hires.length ? `Hired by the CEO this week:\n${hires.join('\n')}` : 'No CEO hires this week yet.',
    missing.length ? `Open roles (nobody covers these yet): ${missing.join(', ')}` : 'All core functions are covered.',
    ...(overview ? seatLines(overview) : []),
  ].join('\n');
}

function seatLines(o: NonNullable<Parameters<typeof formatTeamReport>[3]>) {
  const needs = Object.entries(o.projectNeeds).map(([r, n]) => `${n} ${r}`).join(', ');
  const lines = [`Client projects open: ${o.openProjects}${needs ? ` (need ${needs})` : ''} — ${o.busy} people busy, ${o.idle} idle${o.sharedAssignments ? `, ${o.sharedAssignments} assignments shared` : ''}`];
  if (o.rooms.length) lines.push('Office chairs:');
  for (const r of o.rooms) lines.push(`- ${r.room}: ${r.used}/${r.chairs} chairs${r.free === 0 ? (o.sharedAssignments ? '  ⚠️ FULL — people are sharing work, add desks or a floor' : '  (full)') : ''}${r.reported ? '' : ' (default — open the 3D office once to count real chairs)'}`);
  return lines;
}

const rupees = (paise: number) => `Rs${Math.round(paise / 100).toLocaleString('en-IN')}`;

// ── Conversation context & entity tracking ──────────────────
export interface EntityRef {
  type: 'employee' | 'department' | 'task' | 'project';
  id: string;
  name: string;
  department?: string;
}
export interface ConversationContext {
  recentMessages: { role: 'chairman' | 'assistant'; content: string; intent?: string; target?: string }[];
  lastEntities: EntityRef[];
  lastTaskId: string | null;
}
const PRONOUN_RE = /^(?:they|them|he|she|him|her|the same (?:person|employee|lead)|that (?:person|employee|lead))$/i;
const TASK_REF_RE = /\b(?:that task|this task|the task|that|this|it|the same task|its status|the status)\b/i;
const PROJECT_REF_RE = /\b(?:that project|this project|the project|the same project)\b/i;
const FOLLOWUP_RE = /\b(?:what did (?:they|he|she|them) say|any (?:update|response|reply)|did (?:they|he|she) respond|what(?:'s| is) the (?:status|update))\b/i;
export function resolveReferences(message: string, ctx: ConversationContext): { resolved: string; entity: EntityRef | null; isFollowUp: boolean } {
  const text = message.trim();
  const lower = text.toLowerCase();
  let entity: EntityRef | null = null;
  let resolved = text;
  const isFollowUp = FOLLOWUP_RE.test(lower);
  const lastEmployee = ctx.lastEntities.find(e => e.type === 'employee');
  const lastTask = ctx.lastEntities.find(e => e.type === 'task');
  const lastProject = ctx.lastEntities.find(e => e.type === 'project');
  const lastDept = ctx.lastEntities.find(e => e.type === 'department');
  if (isFollowUp && lastEmployee) {
    entity = lastEmployee;
    resolved = text.replace(/\b(?:they|them|he|she|him|her)\b/gi, lastEmployee.name);
  } else if (TASK_REF_RE.test(lower) && lastTask) {
    entity = lastTask;
    resolved = text.replace(TASK_REF_RE, `the task "${lastTask.name}"`);
  } else if (PROJECT_REF_RE.test(lower) && lastProject) {
    entity = lastProject;
    resolved = text.replace(PROJECT_REF_RE, `the project "${lastProject.name}"`);
  } else if (PRONOUN_RE.test(lower.replace(/[.!?]+$/, '').trim()) && lastEmployee) {
    entity = lastEmployee;
  } else {
    // Check for pronoun inside a longer sentence
    const pronounMatch = lower.match(/\b(they|them|him|her|he|she)\b/);
    if (pronounMatch && lastEmployee) {
      entity = lastEmployee;
      resolved = text.replace(new RegExp(`\\b${pronounMatch[1]}\\b`, 'i'), lastEmployee.name);
    }
  }
  return { resolved, entity, isFollowUp };
}
function buildConversationPrompt(ctx: ConversationContext): string {
  if (!ctx.recentMessages.length) return '';
  const lines = ctx.recentMessages.slice(-10).map(m =>
    `${m.role === 'chairman' ? 'Chairman' : 'Assistant'}: ${m.content.substring(0, 200)}${m.target ? ` [target: ${m.target}]` : ''}`
  );
  let prompt = `\nRecent conversation:\n${lines.join('\n')}\n`;
  if (ctx.lastEntities.length) {
    prompt += `\nReferenced entities: ${ctx.lastEntities.map(e => `${e.type}=${e.name}${e.department ? ` (${e.department})` : ''}`).join(', ')}\n`;
  }
  return prompt;
}
@Injectable()
export class AssistantService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantService.name);
  private timer: NodeJS.Timeout;
  private readonly gateway = new ModelGateway();
  private readonly entityCache = new Map<string, EntityRef[]>();
  private readonly lastTaskCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly ceoReview: CeoReviewService,
    private readonly ideas: IdeasService,
    private readonly marketingContent: MarketingContentService,
    private readonly inbox: InboundMessageService,
    private readonly leadGen: LeadGenService,
    private readonly simulation: SimulationService,
    private readonly cache: ResponseCacheService,
    private readonly voice: VoiceService,
    private readonly staffing: ProjectStaffingService,
    private readonly boardroom: BoardroomService,
    private readonly notifications: NotificationService,
    private readonly companyState: CompanyStateService,
    private readonly salesPipeline: SalesPipelineService,
    private readonly briefing: BriefingService,
    private readonly alerts: ProactiveAlertService,
  ) {}
  onModuleInit() {
    // Run every 5 minutes
    this.timer = setInterval(() => this.runScheduledTasks(), 5 * 60 * 1000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async runScheduledTasks() {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    for (const c of companies) {
      await this.deliverDailyBriefing(c.id).catch(e => this.logger.error(`Failed briefing for ${c.id}: ${e.message}`));
      await this.alerts.evaluate(c.id).catch(e => this.logger.error(`Failed alerts for ${c.id}: ${e.message}`));
    }
  }
  async deliverDailyBriefing(companyId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const key = `DAILY_BRIEFING:${today}`;
    const delivered = await this.prisma.companyEvent.findFirst({ where: { companyId, type: key } });
    if (delivered) return 'already_delivered';
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { chairmanId: true } });
    if (!company) return 'no_company';
    const b = await this.briefing.generateBriefing(companyId);
    const text = this.briefing.formatBriefingResponse(b);
    await this.prisma.assistantMessage.create({
      data: { companyId, from: 'SYSTEM', to: 'CHAIRMAN', content: text, status: 'DONE', intent: { intent: 'CHAIRMAN_BRIEFING' } as any }
    });
    this.realtime.broadcastToUser(company.chairmanId, 'assistant.reply', { response: text, intent: 'CHAIRMAN_BRIEFING', actions: [] });
    await this.prisma.companyEvent.create({ data: { companyId, type: key, payload: { generatedAt: b.generatedAt } } });
    return 'delivered';
  }
  private async getConversationContext(companyId: string): Promise<ConversationContext> {
    const recent = await this.prisma.assistantMessage.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { from: true, content: true, intent: true, createdAt: true },
    });
    const recentMessages = recent.reverse().map(m => ({
      role: (m.from === 'CHAIRMAN' ? 'chairman' : 'assistant') as 'chairman' | 'assistant',
      content: m.content,
      intent: (m.intent as any)?.intent,
      target: (m.intent as any)?.target || (m.intent as any)?.parameters?.targetQuery,
    }));
    return {
      recentMessages,
      lastEntities: this.entityCache.get(companyId) ?? [],
      lastTaskId: this.lastTaskCache.get(companyId) ?? null,
    };
  }
  private updateEntityCache(companyId: string, entities: EntityRef[]) {
    if (!entities.length) return;
    const existing = this.entityCache.get(companyId) ?? [];
    // Keep last 5, newest first, deduplicated by type+id
    const merged = [...entities, ...existing];
    const seen = new Set<string>();
    const deduped = merged.filter(e => { const k = `${e.type}:${e.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
    this.entityCache.set(companyId, deduped.slice(0, 5));
  }
  async processMessage(message: string, companyId: string): Promise<AssistantResult> {
    this.logger.log(`Assistant received: "${message.substring(0, 80)}"`);
    const incoming = await this.prisma.assistantMessage.create({
      data: { companyId, from: 'CHAIRMAN', to: 'ASSISTANT', content: message, status: 'PROCESSING' },
    });
    // Stage 0: Load conversation context and resolve references
    const ctx = await this.getConversationContext(companyId);
    const { resolved, entity: refEntity, isFollowUp } = resolveReferences(message, ctx);
    const effectiveMessage = resolved !== message ? resolved : message;
    if (resolved !== message) this.logger.log(`Reference resolved: "${message}" → "${resolved}"`);
    // Keyword routing first, then a cached phi4 parse, and only then phi4 itself (40-65 s on CPU).
    let intent = detectSimpleIntent(effectiveMessage);
    let source = 'keyword';
    if (!intent) {
      const cacheKey = effectiveMessage.toLowerCase().substring(0, 200);
      intent = this.cache.get<ParsedIntent>('PARSED_INTENT', companyId, cacheKey) ?? null;
      source = 'cache';
      if (!intent) {
        this.logger.log('Calling phi4 for intent parsing...');
        intent = await this.parseIntent(effectiveMessage, ctx);
        intent = await this.parseIntent(message);
        source = 'phi4';
        this.cache.set('PARSED_INTENT', companyId, intent, cacheKey);
      }
    }
    // If reference resolution found a specific entity, inject it into the intent parameters
    if (refEntity && refEntity.type === 'employee' && ['ASK_EMPLOYEE', 'TELL_EMPLOYEE', 'CREATE_EMPLOYEE_TASK'].includes(intent.intent)) {
      if (!intent.parameters.targetQuery) intent.parameters.targetQuery = refEntity.name;
      if (!intent.target) intent.target = refEntity.department?.toUpperCase() || refEntity.name.toUpperCase();
    }
    // Stage C+D: Derive routing metadata
    const confidence: Confidence = source === 'keyword' ? 'HIGH' : source === 'cache' ? 'HIGH' : 'MEDIUM';
    const riskLevel = classifyRisk(intent.intent, message);
    const targetType = deriveTargetType(intent.intent, intent.parameters.targetQuery || intent.target || '');
    const requiresApproval = riskLevel === 'HIGH' && !['STATUS_REPORT', 'CHECK_REVENUE', 'TEAM_REPORT', 'CHECK_INBOX', 'PAUSE_SIMULATION', 'RESUME_SIMULATION', 'URGENT_BOARD_MEETING', 'COMPANY_OVERVIEW', 'LEADS_REPORT', 'SALES_PIPELINE', 'PROJECTS_REPORT', 'ALERTS_REPORT', 'CHAIRMAN_BRIEFING', 'ATTENTION_REPORT', 'BUDGET_REPORT', 'STRATEGY_REPORT'].includes(intent.intent);
    this.logger.log(`Intent: ${intent.intent} → target: ${intent.target} (via ${source}) risk=${riskLevel} confidence=${confidence}`);
    // Stage D.5: Ambiguity check — bail before execution if target is vague
    const ambiguity = checkAmbiguousTarget(intent.intent, intent.parameters);
    if (ambiguity) {
      const clarResp = ambiguity;
      await this.prisma.assistantMessage.update({ where: { id: incoming.id }, data: { intent: intent as any, result: { actions: ['clarification_needed'] }, status: 'DONE' } });
      await this.prisma.assistantMessage.create({ data: { companyId, from: 'ASSISTANT', to: 'CHAIRMAN', content: clarResp, intent: intent as any, result: { actions: ['clarification_needed'] }, status: 'DONE' } });
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
      this.realtime.broadcastToUser(company.chairmanId, 'assistant.reply', { response: clarResp, intent: intent.intent, actions: ['clarification_needed'] });
      return {
        response: clarResp, intent: intent.intent, actions: ['clarification_needed'],
        routing: { targetType: 'UNKNOWN', targetName: null, department: null, riskLevel, requiresApproval: false, confidence: 'LOW', taskId: null, approvalRequired: false, status: 'clarification_needed', errorCode: null },
      };
    }
    this.logger.log(`Intent: ${intent.intent} → target: ${intent.target} (via ${source})`);

    const actions: string[] = [];
    let response = intent.reply;
    let failed = false;
    let routingTaskId: string | null = null;
    let routingStatus: 'executed' | 'queued' | 'approval_required' | 'clarification_needed' | 'failed' = 'executed';
    let routingTargetName: string | null = null;
    let routingDepartment: string | null = null;
    try {
      switch (intent.intent) {
        case 'URGENT_BOARD_MEETING': {
          const m = await this.boardroom.urgentNow(companyId);
          actions.push('urgent_board_meeting_started');
          response = `Urgent board meeting called. ${m.participants.length} ${m.participants.length === 1 ? 'person is' : 'people are'} heading to the Boardroom — you lead it.`;
          break;
        }
        case 'STATUS_REPORT':
          response = await this.cached('STATUS_REPORT', companyId, '', '30s', () => this.getStatusReport(companyId));
          actions.push('status_report_generated');
          break;
        case 'COMMAND_CEO':
          await this.commandCeo(companyId, intent, message, incoming.id);
          actions.push('ceo_directive_sent');
          response = `Directive sent to ARIA (CEO): "${intent.parameters.instruction}"`;
          break;
        case 'NEW_VENTURE': {
          // Submitted as an idea: the CEO evaluates it before any team is formed.
          const text = String(intent.parameters.idea);
          const title = text.length > 60 ? `${text.slice(0, 57)}...` : text;
          await this.ideas.submitIdea(companyId, title, text, 'CHAIRMAN');
          actions.push('idea_submitted');
          response = `Idea submitted: "${title}". CEO (ARIA) is evaluating it now. Check /ideas for the result in about a minute.`;
          break;
        }
        case 'FIND_LEADS':
          // Lead search calls Google Places and can take minutes — don't hold the chat open for it.
          // Throttled to once per 5 min: each run spends Google Places quota.
          if (this.cache.get('FIND_LEADS', companyId)) {
            response = 'A lead search already started in the last 5 minutes. New businesses will appear in Sales shortly.';
            actions.push('lead_gen_throttled');
            break;
          }
          this.cache.set('FIND_LEADS', companyId, true);
          this.leadGen.runForCompany(companyId, 'ASSISTANT').catch((e) => this.logger.error(`[${companyId}] assistant lead-gen failed: ${e.message}`));
          actions.push('lead_gen_triggered');
          response = 'Lead search started. New businesses will appear in Sales in a few minutes.';
          break;
        case 'PAUSE_SIMULATION':
          await this.simulation.pause(companyId);
          this.cache.invalidateAll(companyId);
          actions.push('simulation_paused');
          response = 'Simulation paused. All agents stopped.';
          break;
        case 'RESUME_SIMULATION':
          await this.simulation.resume(companyId);
          this.cache.invalidateAll(companyId);
          actions.push('simulation_resumed');
          response = 'Simulation resumed. All agents are working.';
          break;
        case 'TEAM_REPORT':
          response = await this.getTeamReport(companyId);
          actions.push('Team report generated');
          break;
        case 'CHECK_REVENUE': {
          const revPeriod = intent.parameters.period as string | undefined;
          response = await this.cached('CHECK_REVENUE', companyId, revPeriod || '', '30s', () => this.getRevenueReport(companyId, revPeriod));
          actions.push('revenue_checked');
          break;
        }
        case 'COMPANY_OVERVIEW':
          response = await this.cached('COMPANY_OVERVIEW', companyId, '', '30s', () => this.getCompanyOverview(companyId));
          actions.push('company_overview_generated');
          break;
        case 'LEADS_REPORT':
          response = await this.cached('LEADS_REPORT', companyId, '', '30s', () => this.getLeadsReport(companyId));
          actions.push('leads_report_generated');
          break;
        case 'SALES_PIPELINE':
          response = await this.cached('SALES_PIPELINE', companyId, '', '30s', () => this.getSalesPipelineReport(companyId));
          actions.push('sales_pipeline_generated');
          break;
        case 'PROJECTS_REPORT':
          response = await this.cached('PROJECTS_REPORT', companyId, '', '30s', () => this.getProjectsReport(companyId));
          actions.push('projects_report_generated');
          break;
        case 'ALERTS_REPORT':
          response = await this.cached('ALERTS_REPORT', companyId, '', '30s', () => this.getAlertsReport(companyId));
          actions.push('alerts_report_generated');
          break;
        case 'BUDGET_REPORT':
          response = await this.cached('BUDGET_REPORT', companyId, '', '30s', () => this.getBudgetReport(companyId));
          actions.push('budget_report_generated');
          break;
        case 'FINANCIAL_AUTHORITY_REPORT':
          response = await this.cached('FINANCIAL_AUTHORITY_REPORT', companyId, '', '30s', () => this.getFinancialAuthorityReport(companyId));
          actions.push('financial_authority_report_generated');
          break;
        case 'STRATEGY_REPORT':
          response = await this.cached('STRATEGY_REPORT', companyId, '', '30s', () => this.getStrategyReport(companyId));
          actions.push('strategy_report_generated');
          break;
        case 'KPI_REPORT':
          response = await this.cached('KPI_REPORT', companyId, '', '30s', () => this.getKpiReport(companyId));
          actions.push('kpi_report_generated');
          break;
        case 'PERFORMANCE_REPORT':
          response = await this.cached('PERFORMANCE_REPORT', companyId, '', '30s', () => this.getPerformanceReport(companyId));
          actions.push('performance_report_generated');
          break;
        case 'SUCCESSION_REPORT':
          response = await this.cached('SUCCESSION_REPORT', companyId, '', '30s', () => this.getSuccessionReport(companyId));
          actions.push('succession_report_generated');
          break;
        case 'CHAIRMAN_BRIEFING': {
          const briefingData = await this.briefing.generateBriefing(companyId);
          response = this.briefing.formatBriefingResponse(briefingData);
          actions.push('chairman_briefing_generated');
          break;
        }
        case 'ATTENTION_REPORT': {
          const attentionData = await this.briefing.generateBriefing(companyId);
          response = this.briefing.formatAttentionResponse(attentionData);
          actions.push('attention_report_generated');
          break;
        }
        case 'CHECK_REVENUE':
          response = await this.cached('CHECK_REVENUE', companyId, '', '30s', () => this.getRevenueReport(companyId));
        case 'WHATSAPP_MESSAGE':
          await this.prisma.pcTask.create({
            data: { companyId, taskType: 'WHATSAPP', instruction: JSON.stringify({ phone: intent.parameters.phone, message: intent.parameters.message }) },
          });
          actions.push('whatsapp_queued');
          response = `WhatsApp message queued for ${intent.parameters.phone ?? 'the contact'}. Check the PC Tasks panel.`;
          break;
        case 'ASK_CEO':
          response = await this.cached('ASK_CEO', companyId, String(intent.parameters.question).toLowerCase().substring(0, 200), '2 min',
            async () => (await this.ceoReview.answerChairman(companyId, intent!.parameters.question)).answer);
          actions.push('ceo_queried');
          break;
        case 'GENERATE_POST': {
          const post = await this.marketingContent.generatePost(companyId, 'SERVICE_SHOWCASE', intent.parameters.topic || `${companyProfile().name} services`);
          actions.push('post_generated');
          response = `Instagram post generated!

${post.caption}

Hashtags: ${post.hashtags.slice(0, 5).join(' ')}

Check /marketing for the full post.`;
          break;
        }
        case 'GENERATE_CALENDAR': {
          const calendar = await this.marketingContent.generateWeeklyCalendar(companyId);
          const n = Array.isArray(calendar.posts) ? calendar.posts.length : 0;
          actions.push('calendar_generated');
          response = `Weekly content calendar ready. Theme: "${calendar.theme}". ${n} posts drafted. Check /marketing to see them.`;
          break;
        }
        case 'WHATSAPP_BROADCAST': {
          const message = await this.marketingContent.generateWhatsAppBroadcast('local business', 'free website demo');
          actions.push('broadcast_generated');
          response = `WhatsApp broadcast message:

${message}

Copy this and send from WhatsApp Web.`;
          break;
        }
        case 'CHECK_INBOX': {
          const r = await this.inbox.checkInbox(companyId);
          actions.push('inbox_checked');
          if (r.skipped) response = `Inbox not checked: ${r.skipped}. Enable IMAP in Gmail and set INBOX_ENABLED=true in .env.`;
          else if (r.newMessages === 0) response = `Inbox checked (${r.checked} emails in the last 7 days). No new replies from leads.`;
          else response = `Found ${r.newMessages} new repl${r.newMessages > 1 ? 'ies' : 'y'} from leads — classified. Check /inbox to see them.`;
          break;
        }
        case 'ASK_EMPLOYEE': {
          const askResult = await this.handleAskEmployee(companyId, intent, message, incoming.id);
          actions.push(...askResult.actions);
          response = askResult.response;
          routingTaskId = askResult.taskId ?? null;
          routingTargetName = askResult.targetName ?? null;
          routingDepartment = askResult.department ?? null;
          routingStatus = askResult.taskId ? 'queued' : 'failed';
          break;
        }
        case 'TELL_EMPLOYEE': {
          const tellResult = await this.handleTellEmployee(companyId, intent, message, incoming.id);
          actions.push(...tellResult.actions);
          response = tellResult.response;
          routingTaskId = tellResult.taskId ?? null;
          routingTargetName = tellResult.targetName ?? null;
          routingDepartment = tellResult.department ?? null;
          routingStatus = tellResult.approvalRouted ? 'approval_required' : tellResult.taskId ? 'queued' : 'failed';
          break;
        }
        case 'CREATE_EMPLOYEE_TASK': {
          const taskResult = await this.handleCreateEmployeeTask(companyId, intent, message, incoming.id);
          actions.push(...taskResult.actions);
          response = taskResult.response;
          routingTaskId = taskResult.taskId ?? null;
          routingTargetName = taskResult.targetName ?? null;
          routingDepartment = taskResult.department ?? null;
          routingStatus = taskResult.taskId ? 'queued' : 'failed';
          break;
        }
        case 'BROADCAST_DEPARTMENT': {
          const bdResult = await this.handleBroadcastDepartment(companyId, intent, message);
          actions.push(...bdResult.actions);
          response = bdResult.response;
          routingDepartment = bdResult.department || null;
          routingStatus = bdResult.targetCount > 0 ? 'executed' : 'failed';
          break;
        }
        case 'BROADCAST_COMPANY': {
          const bcResult = await this.handleBroadcastCompany(companyId, intent, message);
          actions.push(...bcResult.actions);
          response = bcResult.response;
          routingStatus = bcResult.targetCount > 0 ? 'executed' : 'failed';
          break;
        }
        case 'CUSTOM':
        default:
          await this.commandCeo(companyId, intent, message, incoming.id);
          actions.push('forwarded_to_ceo');
          response = 'Message forwarded to ARIA (CEO). She will handle it in the next review cycle.';
          break;
      }
    } catch (err) {
      failed = true;
      this.logger.error(`Action ${intent.intent} failed: ${err.message}`);
      response = `I understood you want to ${intent.intent.toLowerCase().replace(/_/g, ' ')}, but something went wrong: ${err.message}`;
      actions.push('action_failed');
    }

    // Stage F: Update entity cache for future reference resolution
    const newEntities: EntityRef[] = [];
    if (routingTargetName) {
      newEntities.push({ type: 'employee', id: routingTargetName, name: routingTargetName, department: routingDepartment ?? undefined });
    }
    if (routingDepartment && !routingTargetName) {
      newEntities.push({ type: 'department', id: routingDepartment, name: routingDepartment });
    }
    if (routingTaskId) {
      this.lastTaskCache.set(companyId, routingTaskId);
      newEntities.push({ type: 'task', id: routingTaskId, name: intent.parameters.instruction || intent.parameters.question || message.substring(0, 50) });
    }
    if (refEntity) newEntities.push(refEntity);
    this.updateEntityCache(companyId, newEntities);

    await this.prisma.assistantMessage.update({
      where: { id: incoming.id },
      data: { intent: intent as any, result: { actions }, status: failed ? 'FAILED' : 'DONE' },
    });
    await this.prisma.assistantMessage.create({
      data: { companyId, from: 'ASSISTANT', to: 'CHAIRMAN', content: response, intent: intent as any, result: { actions }, status: 'DONE' },
    });

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    
    // Resolve voice for the actual speaker
    let speakerId = 'system:assistant';
    try {
      if (intent.intent === 'ASK_CEO' || intent.target === 'CEO') {
        const ceo = await findCeo(this.prisma, companyId);
        if (ceo) speakerId = ceo.id;
      } else if (intent.target && intent.target !== 'ALL' && intent.target !== 'INBOX') {
        const emp = await this.prisma.employee.findFirst({
          where: { 
            companyId, 
            status: 'ACTIVE',
            department: { name: { contains: intent.target, mode: 'insensitive' } }
          }
        });
        if (emp) speakerId = emp.id;
      }
    } catch (e) {
      this.logger.warn(`Failed to resolve speaker for target ${intent.target}: ${e.message}`);
    }

    let voiceResult = undefined;
    try {
      voiceResult = await this.voice.generateSpeech(speakerId, response);
    } catch (err) {
      this.logger.error(`Voice generation failed: ${err.message}`);
    }

    if (failed) routingStatus = 'failed';
    const routing: AssistantResult['routing'] = {
      targetType,
      targetName: routingTargetName,
      department: routingDepartment,
      riskLevel,
      requiresApproval,
      confidence,
      taskId: routingTaskId,
      approvalRequired: requiresApproval,
      status: routingStatus,
      errorCode: failed ? 'ACTION_FAILED' : null,
      contextUsed: resolved !== message || isFollowUp,
      referencedEntity: refEntity?.name ?? null,
    };
    this.realtime.broadcastToUser(company.chairmanId, 'assistant.reply', { response, intent: intent.intent, actions, voiceResult, routing });
    return { response, intent: intent.intent, actions, voiceResult, routing };
    this.realtime.broadcastToUser(company.chairmanId, 'assistant.reply', { response, intent: intent.intent, actions, voiceResult });
    return { response, intent: intent.intent, actions, voiceResult };
  }

  /** Cache-or-compute; a cached reply says so, since it can be up to one TTL old. */
  private async cached(intent: string, companyId: string, extra: string, age: string, compute: () => Promise<string>): Promise<string> {
    const hit = this.cache.get<string>(intent, companyId, extra);
    if (hit !== undefined) return `${hit}
(cached — refreshes every ${age})`;
    const fresh = await compute();
    this.cache.set(intent, companyId, fresh, extra);
    return fresh;
  }

  async parseIntent(message: string, ctx?: ConversationContext): Promise<ParsedIntent> {
    try {
      const contextSection = ctx ? buildConversationPrompt(ctx) : '';
      const prompt = contextSection ? `${contextSection}\n${intentPrompt(message)}` : intentPrompt(message);
      const raw = await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, prompt, INTENT_SYSTEM(), { json: true });
      return normalizeAssistantIntent(parseJson(raw), message);
    } catch (e) {
      this.logger.warn(`Intent parsing failed, using CUSTOM: ${e.message}`);
      return normalizeAssistantIntent(null, message);
    }
  }

  private async getStatusReport(companyId: string): Promise<string> {
    const [survival, account, leads, projects, employees] = await Promise.all([
      this.prisma.survivalConfig.findUnique({ where: { companyId } }),
      this.prisma.realMoneyAccount.findUnique({ where: { companyId } }),
      this.prisma.salesLead.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.clientProject.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
    ]);
    const l = Object.fromEntries(leads.map((g) => [g.status, g._count])) as Record<string, number>;
    const p = Object.fromEntries(projects.map((g) => [g.status, g._count])) as Record<string, number>;
    return `${companyProfile().name} Status Report:
Balance: ${rupees(account?.balance ?? 0)} | Survival: ${survival?.currentStatus ?? 'UNKNOWN'}
Employees: ${employees} active
Leads: ${l.NEW ?? 0} new, ${l.CONTACTED ?? 0} contacted, ${l.QUALIFIED ?? 0} qualified, ${l.CONVERTED ?? 0} converted
Projects: ${p.BUILDING ?? 0} building, ${p.SAMPLE_SENT ?? 0} sample sent, ${p.PAID ?? 0} paid`;
  }

  /** Who works here (by department), who the CEO hired recently, and which core revenue functions nobody covers yet. */
  private async getTeamReport(companyId: string): Promise<string> {
    const { maxHeadcount } = hiringLimits();
    const [team, hires] = await Promise.all([
      this.prisma.employee.findMany({
        where: { companyId, status: 'ACTIVE' },
        select: { name: true, role: { select: { title: true } }, department: { select: { name: true } } },
        orderBy: { hireDate: 'asc' },
      }),
      this.prisma.companyEvent.findMany({
        where: { companyId, type: 'EMPLOYEE_HIRED', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const overview = await this.staffing.overview(companyId);
    return formatTeamReport(
      team.map((e) => ({ name: e.name, role: e.role?.title ?? '?', department: e.department?.name ?? 'General' })),
      hires.map((h) => h.payload as any),
      maxHeadcount,
      overview,
    );
  }

  private async getBudgetReport(companyId: string): Promise<string> {
    const budgets = await this.prisma.companyBudget.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: { departmentBudgets: { include: { department: true } } },
    });
    if (budgets.length === 0) return 'There are no active company budgets right now.';
    let report = 'Budget Report:\n';
    for (const b of budgets) {
      const util = b.totalAmount > 0 ? ((b.spentAmount + b.committedAmount) / b.totalAmount) * 100 : 0;
      report += `Company Budget: ${b.name}
Total: $${b.totalAmount.toLocaleString()} | Allocated: $${b.allocatedAmount.toLocaleString()}
Spent + Reserved: $${(b.spentAmount + b.committedAmount).toLocaleString()} (${util.toFixed(1)}%)
Remaining: $${(b.totalAmount - b.spentAmount - b.committedAmount).toLocaleString()}
Department Allocations:\n`;
      for (const db of b.departmentBudgets) {
        const dUtil = db.allocatedAmount > 0 ? ((db.spentAmount + db.committedAmount) / db.allocatedAmount) * 100 : 0;
        report += `- ${db.department?.name || 'Unknown'}: Spent+Reserved $${(db.spentAmount + db.committedAmount).toLocaleString()} / Allocated $${db.allocatedAmount.toLocaleString()} (${dUtil.toFixed(1)}%)\n`;
      }
    }
    return report;
  }
  private async getFinancialAuthorityReport(companyId: string): Promise<string> {
    const ceo = await findCeo(this.prisma, companyId);
    if (!ceo) return 'No active CEO found.';
    const authority = await this.prisma.ceoFinancialAuthority.findFirst({
      where: { companyId, ceoEmployeeId: ceo.id, authorityStatus: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });
    if (!authority) return `The CEO (${ceo.name}) currently has NO active financial authority.`;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [dailyDecisions, monthlyDecisions] = await Promise.all([
      this.prisma.ceoFinancialDecision.findMany({
        where: { authorityId: authority.id, decision: 'AUTHORIZED', createdAt: { gte: todayStart } }
      }),
      this.prisma.ceoFinancialDecision.findMany({
        where: { authorityId: authority.id, decision: 'AUTHORIZED', createdAt: { gte: monthStart } }
      })
    ]);
    const dailyUsed = dailyDecisions.reduce((sum, d) => sum + d.amount, 0);
    const monthlyUsed = monthlyDecisions.reduce((sum, d) => sum + d.amount, 0);
    let report = `### CEO Financial Authority Status for ${ceo.name}\n\n`;
    report += `- **Status**: ACTIVE\n`;
    report += `- **Single Transaction Limit**: ₹${authority.singleTransactionLimit.toLocaleString()}\n`;
    report += `- **Daily Limit**: ₹${authority.dailyLimit.toLocaleString()} (Used: ₹${dailyUsed.toLocaleString()}, Remaining: ₹${(authority.dailyLimit - dailyUsed).toLocaleString()})\n`;
    report += `- **Monthly Limit**: ₹${authority.monthlyLimit.toLocaleString()} (Used: ₹${monthlyUsed.toLocaleString()}, Remaining: ₹${(authority.monthlyLimit - monthlyUsed).toLocaleString()})\n`;
    report += `- **Chairman Approval Required Above**: ${authority.requiresChairmanApprovalAbove ? '₹' + authority.requiresChairmanApprovalAbove.toLocaleString() : 'Not configured'}\n\n`;
    report += `**Allowed Operations**:\n${authority.allowedOperations.join(', ')}\n`;
    return report;
  }
  private async getStrategyReport(companyId: string): Promise<string> {
    const s = await this.companyState.collectState(companyId);
    const sp = s.strategicPlanning;
    if (sp.planStatus === 'NONE' || !sp.activePlan) {
      return 'There is no active strategic plan. The CEO has not formulated a strategy yet.';
    }
    const lines = [
      `### Strategic Plan: ${sp.activePlan.name}`,
      `**Status**: ${sp.planStatus}`,
      `**Period**: ${sp.planningPeriod}`,
      `**Health**: ${sp.strategicHealth}`,
      '',
      `**Objectives Progress**: ${sp.objectiveProgress}% across ${sp.objectives.length} objectives.`,
      `**Active Initiatives**: ${sp.activeInitiatives}`,
      `**Strategic Risks**: ${sp.strategicRisks} (Critical: ${sp.criticalRisks})`,
      ''
    ];
    if (sp.healthReasons.length > 0) {
      lines.push('**Health Indicators**:');
      sp.healthReasons.forEach(r => lines.push(`- ${r}`));
    }
    if (sp.pendingStrategicDecisions > 0) {
      lines.push(`\n**Attention**: There are ${sp.pendingStrategicDecisions} strategic proposals awaiting Chairman approval.`);
    }
    return lines.join('\n');
  }
  private async getKpiReport(companyId: string): Promise<string> {
    const s = await this.companyState.collectState(companyId);
    const kpis = s.kpis;
    if (!kpis || kpis.total === 0) {
      return 'No KPIs have been defined for the company yet.';
    }
    const lines = [
      `### Company KPI Report`,
      `**Total KPIs**: ${kpis.total}`,
      `**Company-wide**: ${kpis.companyWide}`,
      `**Health Overview**:`,
      `- On Track / Exceeded: ${kpis.onTrack}`,
      `- At Risk: ${kpis.atRisk}`,
      `- Off Track: ${kpis.offTrack}`,
      `- Critical: ${kpis.critical}`,
      '',
      `**Trend Overview**:`,
      `- Improving: ${kpis.improving}`,
      `- Declining: ${kpis.declining}`,
      ''
    ];
    if (kpis.topRisks && kpis.topRisks.length > 0) {
      lines.push('**Top Risks (Critical/Off Track)**:');
      kpis.topRisks.forEach((k: any) => {
        lines.push(`- **${k.name}** [${k.status}]: ${k.currentValue} ${k.unit} (Target: ${k.target})`);
      });
    }
    return lines.join('\n');
  }
  private async getRevenueReport(companyId: string, period?: string): Promise<string> {
    const now = new Date();
    let dateFilter: Date | undefined;
    let periodLabel = 'all time';
    if (period === 'today') { dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate()); periodLabel = 'today'; }
    else if (period === 'week') { dateFilter = new Date(now.getTime() - 7 * 86_400_000); periodLabel = 'this week'; }
    else if (period === 'month') { dateFilter = new Date(now.getFullYear(), now.getMonth(), 1); periodLabel = 'this month'; }
    const account = await this.prisma.realMoneyAccount.findUnique({
      where: { companyId },
      include: { transactions: { where: { referenceType: 'CLIENT_PAYMENT', ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}) }, orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    const payments = account?.transactions ?? [];
    const total = payments.reduce((s, t) => s + t.amount, 0);
    const lines = [`Revenue Report (${periodLabel}):`];
    lines.push(`Current balance: ${rupees(account?.balance ?? 0)}`);
    lines.push(`${payments.length} payment${payments.length !== 1 ? 's' : ''} totaling: ${rupees(total)}`);
    if (payments.length) lines.push(`Recent: ${payments.slice(0, 5).map((t) => rupees(t.amount)).join(', ')}`);
    else lines.push('No payments recorded for this period.');
    return lines.join('\n');
  }
  // ── Company information retrieval handlers ─────────────────
  private async getCompanyOverview(companyId: string): Promise<string> {
    const s = await this.companyState.collectState(companyId);
    const name = companyProfile().name;
    const lines = [`${name} — Company Overview`];
    lines.push(`Status: ${s.lifecycle.status} | Production: ${s.lifecycle.productionState}`);
    if (s.finance.totalRevenue || s.finance.acBalance) lines.push(`Revenue: ${rupees(s.finance.totalRevenue)} | AC Balance: ${rupees(s.finance.acBalance)} | Open Invoices: ${s.finance.openInvoices}`);
    lines.push(`Employees: ${s.workforce.activeEmployees} active across ${s.workforce.departments} departments`);
    lines.push(`Leads: ${s.sales.totalLeads} | Open Opportunities: ${s.sales.openOpportunities} | Won: ${s.sales.closedWon}`);
    lines.push(`Projects: ${s.projects.active} active, ${s.projects.completed} completed, ${s.projects.blocked} blocked`);
    lines.push(`Tasks: ${s.tasks.inProgress} in progress, ${s.tasks.blocked} blocked`);
    if (s.marketing.activeCampaigns || s.marketing.scheduledContent) lines.push(`Marketing: ${s.marketing.activeCampaigns} campaigns, ${s.marketing.scheduledContent} scheduled`);
    if (s.finance.budgets && s.finance.budgets.length > 0) {
       const active = s.finance.budgets.length;
       const b = s.finance.budgets[0];
       const util = b.totalAmount > 0 ? ((b.spentAmount + b.committedAmount) / b.totalAmount) * 100 : 0;
       lines.push(`Budgets: ${active} active company budgets. Primary budget utilization: ${util.toFixed(1)}%`);
    }
    if (s.strategicPlanning && s.strategicPlanning.activePlan) {
       lines.push(`Strategy: ${s.strategicPlanning.activePlan.name} [Health: ${s.strategicPlanning.strategicHealth}, Progress: ${s.strategicPlanning.objectiveProgress}%]`);
    }
    const pendingApprovals = await this.prisma.chairmanCommand.count({ where: { companyId, status: 'AWAITING_APPROVAL' } }).catch(() => 0);
    const pendingDecisions = await this.prisma.managementDecision.count({ where: { companyId, status: 'PROPOSED' } }).catch(() => 0);
    const autonomousDecisions = await this.prisma.ceoAutonomousDecision.count({ where: { companyId, requiresApproval: true, approvalStatus: 'PENDING' } }).catch(() => 0);
    if (pendingApprovals || pendingDecisions || autonomousDecisions) lines.push(`Attention: ${pendingApprovals} commands awaiting approval, ${pendingDecisions} pending decisions, ${autonomousDecisions} autonomous CEO decisions pending`);
    return lines.join('\n');
  }
  private async getLeadsReport(companyId: string): Promise<string> {
    const leads = await this.prisma.salesLead.groupBy({ by: ['status'], where: { companyId }, _count: true }).catch(() => [] as any[]);
    const byStatus = Object.fromEntries(leads.map((g: any) => [g.status, g._count])) as Record<string, number>;
    const total = (leads as any[]).reduce((s: number, g: any) => s + g._count, 0);
    if (total === 0) return 'No leads currently recorded in the system.';
    const lines = [`Leads Report — ${total} total`];
    for (const [status, count] of Object.entries(byStatus)) lines.push(`  ${status}: ${count}`);
    return lines.join('\n');
  }
  private async getSalesPipelineReport(companyId: string): Promise<string> {
    try {
      const metrics = await this.salesPipeline.getPipelineMetrics(companyId);
      const lines = [`Sales Pipeline — ${metrics.totalOpportunities} opportunities`];
      lines.push(`Total estimated value: ${rupees(metrics.totalEstimatedValue)}`);
      lines.push(`Weighted pipeline: ${rupees(metrics.weightedPipelineValue)}`);
      if (metrics.byStage) {
        const stages = Object.entries(metrics.byStage).filter(([, v]) => v > 0);
        if (stages.length) lines.push(`By stage: ${stages.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
      lines.push(`Won: ${metrics.wonCount} | Lost: ${metrics.lostCount}`);
      if (metrics.staleOpportunities) lines.push(`Stale (>14 days): ${metrics.staleOpportunities}`);
      return lines.join('\n');
    } catch {
      const oppCount = await this.prisma.opportunity.count({ where: { companyId } }).catch(() => 0);
      if (oppCount === 0) return 'No active deals or opportunities currently in the pipeline.';
      return `Sales pipeline has ${oppCount} opportunities. Detailed metrics unavailable.`;
    }
  }
  private async getProjectsReport(companyId: string): Promise<string> {
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      select: { name: true, status: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }).catch(() => []);
    if (projects.length === 0) return 'No projects currently recorded.';
    const active = projects.filter((p: any) => ['ACTIVE', 'IN_PROGRESS'].includes(p.status));
    const blocked = projects.filter((p: any) => p.status === 'BLOCKED');
    const lines = [`Projects Report — ${projects.length} total`];
    if (active.length) {
      lines.push(`Active (${active.length}):`);
      active.slice(0, 10).forEach((p: any) => lines.push(`  • ${p.name}${p.client?.name ? ` (${p.client.name})` : ''}`));
    }
    if (blocked.length) {
      lines.push(`Blocked (${blocked.length}):`);
      blocked.slice(0, 5).forEach((p: any) => lines.push(`  • ${p.name}`));
    }
    return lines.join('\n');
  }
  private async getAlertsReport(companyId: string): Promise<string> {
    const [approvals, decisions, alerts, autonomous] = await Promise.all([
      this.prisma.chairmanCommand.findMany({ where: { companyId, status: 'AWAITING_APPROVAL' }, select: { naturalLanguage: true, riskLevel: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []),
      this.prisma.managementDecision.findMany({ where: { companyId, status: 'PROPOSED' }, select: { title: true, type: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []),
      this.prisma.operationalAlert.findMany({ where: { companyId, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } }, select: { category: true, severity: true, title: true }, orderBy: { severity: 'desc' }, take: 10 }).catch(() => []),
      this.prisma.ceoAutonomousDecision.findMany({ where: { companyId, requiresApproval: true, approvalStatus: 'PENDING' }, select: { triggerType: true, proposedAction: true, riskLevel: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []),
    ]);
    if (!approvals.length && !decisions.length && !alerts.length && !autonomous.length) return 'Nothing currently needs your attention. All clear.';
    const lines = ['Items Needing Your Attention'];
    if (approvals.length) {
      lines.push(`\nPending Approvals (${approvals.length}):`);
      approvals.forEach((a: any) => lines.push(`  • [${a.riskLevel}] ${a.naturalLanguage?.slice(0, 60)}`));
    }
    if (autonomous.length) {
      lines.push(`\nAutonomous CEO Decisions Awaiting Approval (${autonomous.length}):`);
      autonomous.forEach((a: any) => lines.push(`  • [${a.riskLevel}] ${a.triggerType}: ${a.proposedAction?.slice(0, 60)}`));
    }
    if (decisions.length) {
      lines.push(`\nPending Decisions (${decisions.length}):`);
      decisions.forEach((d: any) => lines.push(`  • [${d.type}] ${d.title?.slice(0, 60)}`));
    }
    if (alerts.length) {
      lines.push(`\nActive Alerts (${alerts.length}):`);
      alerts.forEach((a: any) => lines.push(`  • [${a.severity}] ${a.title?.slice(0, 60)}`));
    }
    return lines.join('\n');
  }
  // ── Broadcast handlers ─────────────────────────────────────
  private async handleBroadcastDepartment(companyId: string, intent: ParsedIntent, message: string): Promise<{ response: string; actions: string[]; targetCount: number; department: string }> {
    const dept = String(intent.parameters.department || '').trim();
    const instruction = String(intent.parameters.instruction || message);
    if (!dept) return { response: 'Which department should I send this to?', actions: ['clarification_needed'], targetCount: 0, department: '' };
    const department = await this.prisma.department.findFirst({ where: { companyId, name: { contains: dept, mode: 'insensitive' } } });
    if (!department) return { response: `I couldn't find a department matching "${dept}".`, actions: ['department_not_found'], targetCount: 0, department: dept };
    const employees = await this.prisma.employee.findMany({ where: { companyId, departmentId: department.id, status: 'ACTIVE' }, select: { id: true, name: true } });
    if (!employees.length) return { response: `No active employees in ${department.name}.`, actions: ['no_employees'], targetCount: 0, department: department.name };
    const tasks = await Promise.all(employees.map(e =>
      this.prisma.task.create({ data: { companyId, assignedEmployeeId: e.id, createdBy: 'CHAIRMAN', title: `Chairman directive: ${instruction.slice(0, 80)}`, description: instruction, priority: 'HIGH', status: 'BACKLOG' } })
    ));
    await Promise.all(employees.map(e =>
      this.notifications.createNotification(companyId, e.id, 'TASK_ASSIGNED', 'Chairman Directive', instruction.slice(0, 200), NotificationPriority.HIGH, 'TASK', tasks[0]?.id)
    ));
    return {
      response: `Instruction sent to ${employees.length} employees in ${department.name}: ${employees.map(e => e.name).join(', ')}`,
      actions: ['broadcast_department_sent'],
      targetCount: employees.length,
      department: department.name,
    };
  }
  private async handleBroadcastCompany(companyId: string, intent: ParsedIntent, message: string): Promise<{ response: string; actions: string[]; targetCount: number }> {
    const instruction = String(intent.parameters.instruction || message);
    const scope = String(intent.parameters.scope || 'ALL');
    let employees: { id: string; name: string }[];
    if (scope === 'LEADS') {
      // Find department leads (highest-level employee per department)
      const depts = await this.prisma.department.findMany({ where: { companyId }, select: { id: true, name: true } });
      const leads: { id: string; name: string }[] = [];
      for (const d of depts) {
        const lead = await this.prisma.employee.findFirst({ where: { companyId, departmentId: d.id, status: 'ACTIVE' }, orderBy: { role: { accessLevel: 'desc' } }, select: { id: true, name: true } });
        if (lead) leads.push(lead);
      }
      employees = leads;
    } else {
      employees = await this.prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, select: { id: true, name: true } });
    }
    if (!employees.length) return { response: 'No active employees found.', actions: ['no_employees'], targetCount: 0 };
    await Promise.all(employees.map(e =>
      this.prisma.task.create({ data: { companyId, assignedEmployeeId: e.id, createdBy: 'CHAIRMAN', title: `Chairman directive: ${instruction.slice(0, 80)}`, description: instruction, priority: 'HIGH', status: 'BACKLOG' } })
    ));
    await Promise.all(employees.map(e =>
      this.notifications.createNotification(companyId, e.id, 'TASK_ASSIGNED', 'Chairman Company Directive', instruction.slice(0, 200), NotificationPriority.HIGH, 'TASK', null as any)
    ));
    return {
      response: `Instruction sent to ${employees.length} ${scope === 'LEADS' ? 'department leads' : 'employees'}: ${employees.map(e => e.name).slice(0, 10).join(', ')}${employees.length > 10 ? ` and ${employees.length - 10} more` : ''}`,
      actions: ['broadcast_company_sent'],
      targetCount: employees.length,
    };
  }

  /** Same shape as voice directives (source CHAIRMAN_VOICE) so the CEO review picks it up as an unread directive. */
  private async commandCeo(companyId: string, intent: ParsedIntent, message: string, assistantMessageId: string) {
    const ceo = await findCeo(this.prisma, companyId);
    if (!ceo) throw new Error('No active CEO found');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    await this.prisma.managementDecision.create({
      data: {
        companyId,
        type: 'GENERAL',
        title: `Chairman directive via Assistant: ${message.slice(0, 80)}`,
        description: intent.parameters.instruction ?? message,
        proposerId: ceo.id, // proposer must be an Employee; the Chairman is recorded as approver
        targetEmployeeId: ceo.id,
        payload: { source: 'CHAIRMAN_VOICE', via: 'ASSISTANT', assistantMessageId, intent: intent.intent, parameters: intent.parameters, transcript: message },
        status: 'APPROVED',
        approvedBy: company.chairmanId,
        approvedAt: new Date(),
      },
    });
  }

  getRecentMessages(companyId: string, limit = 20) {
    return this.prisma.assistantMessage.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: limit });
  }

  getPendingPcTasks(companyId: string) {
    return this.prisma.pcTask.findMany({ where: { companyId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  }

  // ── Employee resolver ────────────────────────────────────────

  /**
   * Resolve an employee from a natural-language target query like "Sales Lead", "HR Lead", "John".
   * Returns the employee or a user-friendly error string.
   */
  async resolveEmployee(companyId: string, query: string): Promise<{ employee: any } | { error: string }> {
    const q = query.trim();
    if (!q) return { error: 'No employee or department specified.' };

    // Normalise "sales lead" → department "sales", lead role
    const leadMatch = q.match(/^(.+?)[\s-]?(?:lead|head|manager|chief|director)$/i);
    const deptName = leadMatch ? leadMatch[1].trim() : null;

    const activeWhere = { companyId, status: 'ACTIVE' as const };

    // 1. Department lead resolution
    if (deptName) {
      const dept = await this.prisma.department.findFirst({
        where: { companyId, status: 'ACTIVE', name: { contains: deptName, mode: 'insensitive' as const } },
      });
      if (!dept) return { error: `No active department matching "${deptName}" found.` };
      // Find the highest-level employee in this department
      const lead = await this.prisma.employee.findFirst({
        where: { ...activeWhere, departmentId: dept.id },
        orderBy: [{ role: { level: 'desc' } }, { hireDate: 'asc' }],
        include: { role: true, department: true },
      });
      if (!lead) return { error: `No active employees in the ${dept.name} department.` };
      return { employee: lead };
    }

    // 2. Direct department name (no "lead" suffix) — e.g. "tell HR to..."
    const deptDirect = await this.prisma.department.findFirst({
      where: { companyId, status: 'ACTIVE', name: { contains: q, mode: 'insensitive' as const } },
    });
    if (deptDirect) {
      const lead = await this.prisma.employee.findFirst({
        where: { ...activeWhere, departmentId: deptDirect.id },
        orderBy: [{ role: { level: 'desc' } }, { hireDate: 'asc' }],
        include: { role: true, department: true },
      });
      if (!lead) return { error: `No active employees in the ${deptDirect.name} department.` };
      return { employee: lead };
    }

    // 3. Name-based lookup
    const byName = await this.prisma.employee.findMany({
      where: { ...activeWhere, name: { contains: q, mode: 'insensitive' as const } },
      include: { role: true, department: true },
    });
    if (byName.length === 1) return { employee: byName[0] };
    if (byName.length > 1) return { error: `Multiple employees match "${q}": ${byName.map(e => e.name).join(', ')}. Please be more specific.` };

    return { error: `No active employee or department matching "${q}" found.` };
  }

  // ── Employee communication handlers ──────────────────────────

  private async handleAskEmployee(companyId: string, intent: ParsedIntent, message: string, assistantMessageId: string) {
    const actions: string[] = [];
    const targetQuery = String(intent.parameters.targetQuery || '').trim();
    const question = String(intent.parameters.question || message).trim();

    const resolved = await this.resolveEmployee(companyId, targetQuery);
    if ('error' in resolved) {
      actions.push('employee_not_found');
      return { response: resolved.error, actions };
    }

    const emp = resolved.employee;

    // Store the outgoing message
    await this.prisma.assistantMessage.create({
      data: { companyId, from: 'CHAIRMAN', to: `EMPLOYEE:${emp.id}`, content: question, intent: intent as any, result: { assistantMessageId }, status: 'PENDING' },
    });

    // Create a task for the employee so the simulation engine processes it
    const task = await this.prisma.task.create({
      data: {
        companyId,
        assignedEmployeeId: emp.id,
        createdBy: 'CHAIRMAN_ASSISTANT',
        title: `Chairman question: ${question.slice(0, 80)}`,
        description: `The Chairman asked via the AI Assistant:\n\n"${question}"\n\nPlease respond.`,
        priority: 'HIGH',
        status: 'BACKLOG',
      },
    });

    // Notify the employee
    await this.notifications.createNotification(
      companyId, emp.id, 'CHAIRMAN_QUESTION',
      'Question from the Chairman',
      question,
      'HIGH' as any, 'Task', task.id,
    );

    actions.push('employee_question_sent', `task_created:${task.id}`);
    return {
      response: `Sent your question to ${emp.name} (${emp.role?.title ?? 'Employee'}, ${emp.department?.name ?? 'General'}). Task #${task.id.slice(0, 8)} created. I'll return the response when the employee processes it.`,
      actions, taskId: task.id, targetName: emp.name as string, department: (emp.department?.name ?? null) as string | null,
    };
  }

  private async handleTellEmployee(companyId: string, intent: ParsedIntent, message: string, assistantMessageId: string) {
    const actions: string[] = [];
    const targetQuery = String(intent.parameters.targetQuery || '').trim();
    const instruction = String(intent.parameters.instruction || message).trim();

    // Safety check: high-risk instructions must go through approval
    if (HIGH_RISK_KEYWORDS.test(instruction)) {
      await this.commandCeo(companyId, intent, message, assistantMessageId);
      actions.push('high_risk_routed_to_approval');
      return {
        response: `This instruction contains a potentially sensitive action. It has been routed through the CEO for approval: "${instruction.slice(0, 80)}"`,
        actions, taskId: null as string | null, targetName: targetQuery, department: null as string | null, approvalRouted: true,
      };
    }

    const resolved = await this.resolveEmployee(companyId, targetQuery);
    if ('error' in resolved) {
      actions.push('employee_not_found');
      return { response: resolved.error, actions, taskId: null as string | null, targetName: null as string | null, department: null as string | null, approvalRouted: false };
    }

    const emp = resolved.employee;

    await this.prisma.assistantMessage.create({
      data: { companyId, from: 'CHAIRMAN', to: `EMPLOYEE:${emp.id}`, content: instruction, intent: intent as any, result: { assistantMessageId }, status: 'PENDING' },
    });

    const task = await this.prisma.task.create({
      data: {
        companyId,
        assignedEmployeeId: emp.id,
        createdBy: 'CHAIRMAN_ASSISTANT',
        title: `Chairman directive: ${instruction.slice(0, 80)}`,
        description: `The Chairman instructed via the AI Assistant:\n\n"${instruction}"`,
        priority: 'HIGH',
        status: 'BACKLOG',
      },
    });

    await this.notifications.createNotification(
      companyId, emp.id, 'CHAIRMAN_DIRECTIVE',
      'Directive from the Chairman',
      instruction,
      'HIGH' as any, 'Task', task.id,
    );

    actions.push('employee_instruction_sent', `task_created:${task.id}`);
    return {
      response: `Instruction sent to ${emp.name} (${emp.role?.title ?? 'Employee'}, ${emp.department?.name ?? 'General'}) and task created. Status: queued.`,
      actions, taskId: task.id, targetName: emp.name as string, department: (emp.department?.name ?? null) as string | null, approvalRouted: false,
    };
  }

  private async handleCreateEmployeeTask(companyId: string, intent: ParsedIntent, message: string, assistantMessageId: string) {
    const actions: string[] = [];
    const targetQuery = String(intent.parameters.targetQuery || '').trim();
    const instruction = String(intent.parameters.instruction || message).trim();

    const resolved = await this.resolveEmployee(companyId, targetQuery);
    if ('error' in resolved) {
      actions.push('employee_not_found');
      return { response: resolved.error, actions, taskId: null as string | null, targetName: null as string | null, department: null as string | null };
    }

    const emp = resolved.employee;

    const task = await this.prisma.task.create({
      data: {
        companyId,
        assignedEmployeeId: emp.id,
        createdBy: 'CHAIRMAN_ASSISTANT',
        title: instruction.slice(0, 120) || 'Chairman-assigned task',
        description: `Created by the Chairman via the AI Assistant:\n\n"${message}"`,
        priority: 'NORMAL',
        status: 'BACKLOG',
      },
    });

    await this.notifications.createNotification(
      companyId, emp.id, 'CHAIRMAN_TASK',
      'New task from the Chairman',
      instruction,
      'NORMAL' as any, 'Task', task.id,
    );

    actions.push('employee_task_created', `task_id:${task.id}`);
    return {
      response: `Task created for ${emp.name} (${emp.role?.title ?? 'Employee'}, ${emp.department?.name ?? 'General'}): "${instruction.slice(0, 80)}". Task ID: ${task.id.slice(0, 8)}`,
      actions, taskId: task.id, targetName: emp.name as string, department: (emp.department?.name ?? null) as string | null,
    };
  }

  private async getPerformanceReport(companyId: string) {
    const recentEvals = await this.prisma.performanceEvaluation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { employee: true }
    });

    if (recentEvals.length === 0) return "No performance evaluations exist yet.";

    const exceptional = recentEvals.filter(e => e.status === 'EXCEPTIONAL');
    const underperforming = recentEvals.filter(e => e.status === 'UNDERPERFORMING' || e.status === 'CRITICAL');

    let txt = "Here is the current Performance Report:\n\n";
    txt += `Total recent evaluations: ${recentEvals.length}\n`;
    if (exceptional.length > 0) {
      txt += `\n**Top Performers:**\n` + exceptional.map(e => `- ${e.employee.name} (Score: ${e.overallScore})`).join('\n');
    }
    if (underperforming.length > 0) {
      txt += `\n**Underperforming/At Risk:**\n` + underperforming.map(e => `- ${e.employee.name} (Status: ${e.status}, Score: ${e.overallScore})`).join('\n');
    }
    return txt;
  }

  private async getSuccessionReport(companyId: string) {
    const plans = await this.prisma.successionPlan.findMany({
      where: { companyId },
      include: { candidates: { include: { employee: true } } }
    });

    if (plans.length === 0) return "No succession plans exist yet.";

    const criticalPlans = plans.filter(p => p.riskLevel === 'CRITICAL' || p.riskLevel === 'HIGH');
    let txt = "Here is the current Succession & Replacement Report:\n\n";
    txt += `Total Succession Plans: ${plans.length}\n`;
    txt += `High/Critical Risk Roles: ${criticalPlans.length}\n\n`;

    for (const plan of plans) {
      txt += `**Role:** ${plan.roleId} (Risk: ${plan.riskLevel})\n`;
      txt += `Holder: ${plan.currentHolderId ? 'Yes' : 'VACANT'}\n`;
      const ready = plan.candidates.filter(c => c.readiness === 'READY');
      if (ready.length > 0) {
        txt += `Ready Successors: ${ready.map(r => r.employee.name).join(', ')}\n`;
      } else {
        txt += `No ready successors.\n`;
      }
      txt += '\n';
    }
    return txt;
  }

}
