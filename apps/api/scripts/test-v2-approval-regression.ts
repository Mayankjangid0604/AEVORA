import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContractService } from '../src/crm/contract.service';
import { ProjectService } from '../src/project/project.service';
import { ProposalService } from '../src/proposal/proposal.service';

const prisma = new PrismaClient();

async function runTest() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const contractService = app.get(ContractService);
  const projectService = app.get(ProjectService);
  const proposalService = app.get(ProposalService);

  const company = await prisma.company.findFirst({ where: { employees: { some: {} } } });
  const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });

  const clientId = 'test-approval-client-' + Date.now();
  await prisma.client.create({ data: { id: clientId, companyId: company.id, name: 'Test Client', status: 'LEAD' } });
  
  await prisma.company.update({ where: { id: company.id }, data: { productionState: 'ACTIVE' } });
  
  await prisma.productionAllowlist.upsert({
    where: { clientId },
    update: {},
    create: { clientId, companyId: company.id }
  });
  
  await prisma.productionCapability.upsert({ where: { companyId_capability_environment: { companyId: company.id, capability: 'COMMIT_CONTRACT', environment: 'PRODUCTION' } }, update: { isEnabled: true }, create: { companyId: company.id, capability: 'COMMIT_CONTRACT', environment: 'PRODUCTION', isEnabled: true } });
  await prisma.productionCapability.upsert({ where: { companyId_capability_environment: { companyId: company.id, capability: 'CREATE_PROJECT', environment: 'PRODUCTION' } }, update: { isEnabled: true }, create: { companyId: company.id, capability: 'CREATE_PROJECT', environment: 'PRODUCTION', isEnabled: true } });
  await prisma.productionCapability.upsert({ where: { companyId_capability_environment: { companyId: company.id, capability: 'APPROVE_PROPOSAL', environment: 'PRODUCTION' } }, update: { isEnabled: true }, create: { companyId: company.id, capability: 'APPROVE_PROPOSAL', environment: 'PRODUCTION', isEnabled: true } });

  const opp = await prisma.opportunity.create({ data: { companyId: company.id, clientId, title: 'Approval Test', estimatedValue: 1000, currency: 'USD', status: 'DISCOVERED' } });
  const proposal = await prisma.proposal.create({ data: { opportunityId: opp.id, status: 'ACCEPTED', scope: 'Scope', deliverables: 'deliv', proposedPrice: 1000, version: 1 } });
  
  const { hashMaterialParams } = require('../src/approval/parameter-binding.util');
  const contractHashInput = { title: 'T', content: 'C', commercialTerms: {}, parties: [], effectiveDate: null };
  const contentHash = hashMaterialParams(contractHashInput);
  const contract = await prisma.contract.create({ data: { companyId: company.id, clientId, opportunityId: opp.id, title: 'T', content: 'C', commercialTerms: {}, parties: [], version: 1, status: 'DRAFT', contentHash } });

  console.log('Testing Contract targetId mismatch...');
  const badContractReq = await prisma.approvalRequest.create({ data: { companyId: company.id, requesterId: actor.id, status: 'APPROVED', action: 'COMMIT_CONTRACT', environment: 'PRODUCTION', targetId: 'wrong-id', proposedParams: { contractId: contract.id, contractVersion: contract.version, contentHash, clientId } } });
  
  let rejected = false;
  try { await contractService.commitContract(company.id, actor.id, contract.id, badContractReq.id); } 
  catch (e: any) { console.log("ACTUAL ERROR:", e); rejected = e.message.includes('targetId mismatch'); }
  if (!rejected) throw new Error('Failed to reject bad targetId for contract');
  console.log('PASS: Contract targetId mismatch rejected');
  
  console.log('Testing Contract correct targetId...');
  const goodContractReq = await prisma.approvalRequest.create({ data: { companyId: company.id, requesterId: actor.id, status: 'APPROVED', action: 'COMMIT_CONTRACT', environment: 'PRODUCTION', targetId: contract.id, proposedParams: { contractId: contract.id, contractVersion: contract.version, contentHash, clientId } } });
  await contractService.commitContract(company.id, actor.id, contract.id, goodContractReq.id);
  console.log('PASS: Contract correct targetId accepted');

  console.log('Testing Project targetId mismatch...');
  const badProjReq = await prisma.approvalRequest.create({ data: { companyId: company.id, requesterId: actor.id, status: 'APPROVED', action: 'CREATE_PROJECT', environment: 'PRODUCTION', targetId: 'wrong-id', proposedParams: {} } });
  rejected = false;
  try { await projectService.createProjectFromProposal(company.id, proposal.id, actor.id, badProjReq.id); }
  catch (e: any) { rejected = e.message.includes('targetId mismatch'); }
  if (!rejected) throw new Error('Failed to reject bad targetId for project');
  console.log('PASS: Project targetId mismatch rejected');
  
  console.log('Testing Project correct targetId (and reuse rejection)...');
  const goodProjReq = await prisma.approvalRequest.create({ data: { companyId: company.id, requesterId: actor.id, status: 'APPROVED', action: 'CREATE_PROJECT', environment: 'PRODUCTION', targetId: proposal.id, proposedParams: {} } });
  
  await prisma.proposalApproval.create({ data: { proposalId: proposal.id, actorId: actor.id, decision: 'APPROVE' } });

  await projectService.createProjectFromProposal(company.id, proposal.id, actor.id, goodProjReq.id);
  console.log('PASS: Project correct targetId accepted');

  console.log('Testing approval reuse...');
  rejected = false;
  try { await projectService.createProjectFromProposal(company.id, proposal.id, actor.id, goodProjReq.id); }
  catch (e: any) { rejected = e.message.includes('expected APPROVED') || e.message.includes('already consumed'); }
  if (!rejected) throw new Error('Failed to reject reused approval');
  console.log('PASS: Reused approval rejected');

  console.log('All regression tests passed!');
  await app.close();
  await prisma.$disconnect();
}

runTest().catch((e: any) => { console.error(e); process.exit(1); });
