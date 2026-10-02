-- Item 5: idle-agent codebase changes go through the ManagementDecision approval queue as CODE_CHANGE proposals.
ALTER TYPE "ManagementDecisionType" ADD VALUE 'CODE_CHANGE';
