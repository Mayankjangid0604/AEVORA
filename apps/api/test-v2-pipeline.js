"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const prisma_service_1 = require("./src/prisma/prisma.service");
const sales_lead_service_1 = require("./src/sales/sales-lead.service");
const customer_service_1 = require("./src/crm/customer.service");
const sales_opportunity_service_1 = require("./src/sales/sales-opportunity.service");
const proposal_service_1 = require("./src/proposal/proposal.service");
const contract_service_1 = require("./src/crm/contract.service");
const project_service_1 = require("./src/project/project.service");
async function runTest() {
    console.log('Starting NestFactory.createApplicationContext...');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    console.log('Nest app loaded successfully');
    const prisma = app.get(prisma_service_1.PrismaService);
    const leadsService = app.get(sales_lead_service_1.SalesLeadService);
    const customerService = app.get(customer_service_1.CustomerService);
    const oppService = app.get(sales_opportunity_service_1.SalesOpportunityService);
    const proposalService = app.get(proposal_service_1.ProposalService);
    const contractService = app.get(contract_service_1.ContractService);
    const projectService = app.get(project_service_1.ProjectService);
    try {
        console.log('Finding company...');
        let company = await prisma.company.findFirst();
        if (!company)
            throw new Error('No company found in database.');
        console.log('Finding actor...');
        let actor = await prisma.employee.findFirst({ where: { companyId: company.id } });
        if (!actor)
            throw new Error('No actor found in database.');
        console.log('Finding account...');
        let account = await prisma.realMoneyAccount.findFirst({ where: { companyId: company.id } });
        if (!account) {
            account = await prisma.realMoneyAccount.create({ data: { company: { connect: { id: company.id } } } });
        }
        console.log(`Using Company: ${company.id}, Actor: ${actor.id}`);
        console.log('Creating lead...');
        const lead = await leadsService.createLead(company.id, actor.id, {
            name: 'Acme Corp V2',
            contactName: 'John V2',
        });
        console.log(`Lead created: ${lead.id}`);
        console.log('Advancing lead to CONTACTED...');
        await leadsService.advanceLeadStatus(company.id, actor.id, lead.id, 'CONTACTED');
        console.log('Advancing lead to QUALIFIED...');
        await leadsService.advanceLeadStatus(company.id, actor.id, lead.id, 'QUALIFIED');
        console.log('Creating client...');
        const client = await customerService.createLead(company.id, actor.id, 'Acme Corp V2');
        console.log('Converting lead to opportunity...');
        const conversion = await leadsService.convertLeadToOpportunity(company.id, actor.id, lead.id, {
            title: 'V2 Rewrite',
            clientId: client.id,
            estimatedValue: 1000000
        });
        const oppId = conversion.opportunity.id;
        console.log('Advancing opportunity stages...');
        await oppService.advanceSalesStage(company.id, actor.id, oppId, 'QUALIFICATION');
        await oppService.advanceSalesStage(company.id, actor.id, oppId, 'DISCOVERY');
        await oppService.advanceSalesStage(company.id, actor.id, oppId, 'SOLUTION');
        await oppService.advanceSalesStage(company.id, actor.id, oppId, 'PROPOSAL');
        console.log('Creating proposal...');
        const proposal = await proposalService.createProposal(oppId, {
            title: 'V2 Scope',
            unitPrice: 1000000,
            quantity: 1,
            tax: 0,
            discount: 0,
            total: 1000000,
            currency: 'INR'
        });
        console.log('Generating commercial hash...');
        const commercialHash = proposalService.generateCommercialHash({
            customerId: proposal.customerId, title: proposal.title, description: proposal.scope,
            lineItems: proposal.lineItems, quantity: proposal.quantity, unitPrice: proposal.unitPrice,
            currency: proposal.currency, discount: proposal.discount, tax: proposal.tax, total: proposal.total,
            paymentTerms: null, effectiveDate: null
        });
        console.log('Enabling production capabilities...');
        await prisma.company.update({ where: { id: company.id }, data: { productionState: 'ACTIVE' } });
        const capabilities = ['APPROVE_PROPOSAL', 'COMMIT_CONTRACT', 'CREATE_PROJECT'];
        for (const cap of capabilities) {
            await prisma.productionCapability.upsert({
                where: { companyId_capability_environment: { companyId: company.id, capability: cap, environment: 'PRODUCTION' } },
                create: { companyId: company.id, capability: cap, environment: 'PRODUCTION', isEnabled: true },
                update: { isEnabled: true }
            });
        }
        await prisma.productionAllowlist.upsert({
            where: { clientId: client.id },
            create: { clientId: client.id, companyId: company.id, addedBy: actor.id },
            update: {}
        });
        console.log('Approving proposal...');
        const appReq1 = await prisma.approvalRequest.create({ data: { company: { connect: { id: company.id } }, requesterId: actor.id, status: 'APPROVED', action: 'APPROVE_PROPOSAL', targetId: proposal.id, environment: 'PRODUCTION', proposedParams: { commercialHash, clientId: proposal.customerId } } });
        await proposalService.approveProposal(proposal.id, actor.id, company.id, appReq1.id);
        console.log(`Proposal approved`);
        console.log('Drafting contract...');
        const contract = await contractService.draftContract(company.id, client.id, 'Agreement', 'Content', { unitPrice: 1000000 }, [], new Date());
        await prisma.contract.update({ where: { id: contract.id }, data: { opportunityId: oppId } });
        console.log('Hashing contract params...');
        const { hashMaterialParams } = require('./src/approval/parameter-binding.util');
        const contentHash = hashMaterialParams({ title: contract.title, content: contract.content, commercialTerms: contract.commercialTerms, parties: contract.parties, effectiveDate: contract.effectiveDate });
        console.log('Committing contract...');
        const appReq2 = await prisma.approvalRequest.create({ data: { company: { connect: { id: company.id } }, requesterId: actor.id, status: 'APPROVED', action: 'COMMIT_CONTRACT', environment: 'PRODUCTION', targetId: contract.id, proposedParams: { contractId: contract.id, contractVersion: contract.version, contentHash, clientId: contract.clientId } } });
        await contractService.commitContract(company.id, actor.id, contract.id, appReq2.id);
        console.log(`Contract committed`);
        console.log('Creating project...');
        const appReq3 = await prisma.approvalRequest.create({ data: { company: { connect: { id: company.id } }, requesterId: actor.id, status: 'APPROVED', action: 'CREATE_PROJECT', environment: 'PRODUCTION', targetId: proposal.id, proposedParams: {} } });
        const project = await projectService.createProjectFromProposal(company.id, proposal.id, actor.id, appReq3.id);
        console.log(`Project created: ${project.id}`);
        console.log('SUCCESS: End-to-End V2 Pipeline Test Reached Project Creation!');
    }
    catch (err) {
        console.error('ERROR IN PIPELINE:', err.stack);
    }
    finally {
        console.log('Closing app...');
        await app.close();
        console.log('App closed.');
        process.exit(0);
    }
}
runTest();
//# sourceMappingURL=test-v2-pipeline.js.map