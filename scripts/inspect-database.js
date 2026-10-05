const path = require('path');
const { PrismaClient } = require('@prisma/client');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}

const prisma = new PrismaClient();

async function inspect() {
  console.log('=== DATABASE RECORD INSPECTION ===');
  
  const chairmen = await prisma.chairman.findMany();
  console.log(`Chairmen: ${chairmen.length}`);
  for (const c of chairmen) {
    console.log(`  - [${c.id}] ${c.name} (${c.email})`);
  }

  const groups = await prisma.aevoraGroup.findMany();
  console.log(`Groups: ${groups.length}`);
  for (const g of groups) {
    console.log(`  - [${g.id}] ${g.name}`);
  }

  const companies = await prisma.company.findMany();
  console.log(`Companies: ${companies.length}`);
  for (const comp of companies) {
    console.log(`  - [${comp.id}] ${comp.name} (Status: ${comp.status})`);
  }

  const depts = await prisma.department.findMany();
  console.log(`Departments: ${depts.length}`);
  for (const d of depts) {
    console.log(`  - [${d.id}] ${d.name} (Company: ${d.companyId})`);
  }

  const employees = await prisma.employee.findMany({
    include: { role: true, department: true }
  });
  console.log(`Employees: ${employees.length}`);
  for (const e of employees) {
    console.log(`  - [${e.id}] ${e.name} | Role: ${e.role?.title || 'None'} | Dept: ${e.department?.name || 'None'} | Status: ${e.status} | Activity: ${e.activity}`);
  }

  const projects = await prisma.project.findMany();
  console.log(`Projects: ${projects.length}`);
  for (const p of projects) {
    console.log(`  - [${p.id}] ${p.name} (Status: ${p.status})`);
  }

  const tasks = await prisma.task.findMany();
  console.log(`Tasks: ${tasks.length}`);
  for (const t of tasks.slice(0, 10)) {
    console.log(`  - [${t.id}] ${t.title} (Status: ${t.status})`);
  }

  const meetings = await prisma.meeting.findMany();
  console.log(`Meetings: ${meetings.length}`);
  for (const m of meetings) {
    console.log(`  - [${m.id}] ${m.title} (Status: ${m.status})`);
  }

  // V12 Spatial structures
  const sites = await prisma.v12SpatialSite.findMany();
  console.log(`V12 Spatial Sites: ${sites.length}`);
  for (const s of sites) {
    console.log(`  - Site: [${s.id}] ${s.name} (Active: ${s.isActive})`);
  }

  const buildings = await prisma.v12SpatialBuilding.findMany();
  console.log(`V12 Buildings: ${buildings.length}`);
  for (const b of buildings) {
    console.log(`  - Building: [${b.id}] ${b.name}`);
  }

  const rooms = await prisma.v12SpatialRoom.findMany();
  console.log(`V12 Rooms: ${rooms.length}`);
  for (const r of rooms) {
    console.log(`  - Room: [${r.id}] ${r.name} (${r.type})`);
  }

  const workspaces = await prisma.v12SpatialWorkspace.findMany();
  console.log(`V12 Workspaces: ${workspaces.length}`);

  const vehicles = await prisma.v12SpatialVehicle.findMany();
  console.log(`V12 Vehicles: ${vehicles.length}`);
  for (const v of vehicles) {
    console.log(`  - Vehicle: [${v.id}] ${v.name} (${v.vehicleClass})`);
  }

  const movementStates = await prisma.v12SpatialMovementState.findMany();
  console.log(`V12 Movement States: ${movementStates.length}`);

  const proposals = await prisma.improvementProposal.findMany();
  console.log(`V10 Improvement Proposals: ${proposals.length}`);

  const automations = await prisma.automationPipeline.findMany();
  console.log(`V11 Automation Pipelines: ${automations.length}`);
  
  console.log('=== END INSPECTION ===');
}

inspect().catch(console.error).finally(() => prisma.$disconnect());
