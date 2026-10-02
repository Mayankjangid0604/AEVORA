"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const project_execution_service_1 = require("./src/project-execution/project-execution.service");
const software_execution_service_1 = require("./src/project-execution/software-execution.service");
const prisma = new client_1.PrismaClient();
async function runTest() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const execService = app.get(project_execution_service_1.ProjectExecutionService);
    const softwareExecutionService = app.get(software_execution_service_1.SoftwareExecutionService);
    const actor = await prisma.employee.findFirst({ include: { company: true } });
    if (!actor) {
        throw new Error('No employee found in DB');
    }
    const company = actor.company;
    const clientId = 'test-exec-client-' + Date.now();
    await prisma.client.create({ data: { id: clientId, companyId: company.id, name: 'Exec Client', status: 'ACTIVE' } });
    const oppId = 'test-opp-' + Date.now();
    await prisma.opportunity.create({ data: { id: oppId, companyId: company.id, clientId, title: 'Opp', status: 'WON' } });
    const proposalId = 'test-prop-' + Date.now();
    await prisma.proposal.create({ data: { id: proposalId, opportunityId: oppId, status: 'ACCEPTED', scope: 'Dev scope', deliverables: 'Dev deliverables', proposedPrice: 50000 } });
    const projectId = 'test-proj-' + Date.now();
    await prisma.project.create({ data: { id: projectId, companyId: company.id, clientId, opportunityId: oppId, proposalId: proposalId, name: 'Test Project Execution', status: 'PLANNED', financialStatus: 'PAID' } });
    console.log('Testing Project Plan and Activation...');
    const plan = await execService.createPlan(projectId, { summary: 'Initial plan', estimatedDuration: 14 });
    console.log('PASS: Plan created');
    await execService.approvePlan(plan.id);
    const activatedProject = await execService.activateProject(projectId);
    if (activatedProject.status !== 'ACTIVE')
        throw new Error('Project not activated');
    console.log('PASS: Project activated');
    console.log('Testing Project Staffing...');
    const assignment = await execService.proposeStaffing(projectId, { employeeId: actor.id, role: 'Developer', allocation: 50 });
    await execService.activateAssignment(assignment.id);
    console.log('PASS: Staff assigned');
    console.log('Testing Milestones & Requirements...');
    await execService.createMilestone(projectId, { name: 'M1', description: 'Milestone 1' });
    await execService.createRequirement(projectId, { title: 'Req 1', description: 'Must have X' });
    console.log('PASS: Milestone and Requirement created');
    console.log('Testing Project Task and Review flow...');
    const task = await execService.createProjectTask(company.id, projectId, { title: 'Do X', description: 'Implement X', assignedEmployeeId: actor.id, priority: 'HIGH', estimatedEffort: 5 }, actor.id);
    console.log('PASS: Project task created');
    await prisma.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });
    await execService.submitTaskForReview(task.id, company.id);
    console.log('PASS: Task submitted for review');
    await execService.reviewTask(task.id, actor.id, 'APPROVED', 'Looks good', company.id);
    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
    if (updatedTask.status !== 'COMPLETED')
        throw new Error('Task not completed after approval');
    console.log('PASS: Task approved and completed');
    console.log('Testing Project Progress and Delivery...');
    const progress = await execService.getProjectProgress(projectId);
    console.log('Progress:', progress);
    if (progress.completedTasks !== 1)
        throw new Error('Progress does not reflect completed task');
    await softwareExecutionService.executeDevelopment(projectId, actor.id, task.id);
    const buildId = await softwareExecutionService.executeBuild(projectId);
    await softwareExecutionService.executeTest(projectId, buildId);
    const delivery = await execService.createDelivery(projectId, { summary: 'Delivery 1', deliverables: 'Code for X', buildId });
    console.log('PASS: Delivery created');
    await execService.markDelivered(delivery.id);
    await execService.clientAcceptDelivery(delivery.id, clientId);
    console.log('PASS: Delivery accepted by client');
    console.log('All V2 Project Execution tests passed!');
    await app.close();
    await prisma.$disconnect();
}
runTest().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=test-v2-execution.js.map