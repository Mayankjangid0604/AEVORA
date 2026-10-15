export type AutomationCategory = 'LEAD_GENERATION' | 'MARKETING' | 'SALES' | 'OPERATIONS' | 'FINANCE';

export type AutomationStatus =
  | 'REGISTERED'     // Definition validated, stored in repository
  | 'CONFIGURED'     // Required credentials and env variables present
  | 'DEPLOYED'       // Successfully uploaded to target n8n instance
  | 'ACTIVE'         // Verified and available for scheduled/manual runs
  | 'DISABLED'       // Explicitly disabled or missing credentials
  | 'ERROR';          // Workflow definition or connection error

export interface CredentialRequirement {
  name: string;
  envVar?: string;
  description: string;
  configured: boolean;
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  default?: any;
  description: string;
  enum?: string[];
}

export interface AutomationDefinition {
  id: string;
  number: number;
  name: string;
  description: string;
  category: AutomationCategory;
  version: string;
  workflowFile: string;
  status: AutomationStatus;
  tags: string[];
  requiredCredentials: Record<string, CredentialRequirement>;
  inputParameters: Record<string, ParameterDefinition>;
  metadata: {
    nodeCount?: number;
    triggers?: string[];
    gmapsEndpoint?: string;
    lastValidatedAt?: string;
    validationErrors?: string[];
  };
}

export interface LeadFindingInput {
  category: string;
  location: string;
  radiusMeters?: number;
  maxResults?: number;
  variant?: string;
}

export interface RawGooglePlaceRecord {
  id?: string;
  place_id?: string;
  displayName?: { text: string } | string;
  name?: string;
  business_name?: string;
  formattedAddress?: string;
  address?: string;
  nationalPhoneNumber?: string;
  phone?: string;
  websiteUri?: string;
  website?: string;
  rating?: number | string;
  userRatingCount?: number;
  reviews?: number | string;
  location?: { latitude?: number; longitude?: number; lat?: number; lon?: number; lng?: number };
  editorialSummary?: { text: string } | string;
  description?: string;
  types?: string[] | string;
  primaryType?: string;
  primaryTypeDisplayName?: { text: string } | string;
  reviews_link?: string;
  photos_link?: string;
  [key: string]: any;
}

export interface NormalizedLead {
  googlePlaceId: string;
  businessName: string;
  organizationName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  googleMapsUri: string | null;
  industry: string;
  geography: string;
  qualityScore: number;
  reviewCount: number;
  rating: number | null;
  source: string;
  notes: string | null;
  metadata: {
    lat?: number;
    lng?: number;
    scoreFactors?: Record<string, number>;
    rawPlaceId?: string;
    editorialSummary?: string | null;
    ingestedAt: string;
    automationId: string;
  };
}

export interface IngestionResult {
  totalProcessed: number;
  created: number;
  duplicates: number;
  invalid: Array<{ index: number; reason: string }>;
  leadIds: string[];
}
