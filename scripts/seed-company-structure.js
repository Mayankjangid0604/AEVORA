// Phase 44 — idempotent company structure seed: 6 departments, roles, 4 core AI employees,
// Rs5000 balance, HEALTHY survival. Adapted to schema: Department/Role have no unique keys
// (find-or-create), SUPERVISED autonomy -> CONTROLLED, department description -> not stored.
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'Executive', roles: [
    { title: 'Chief Executive Officer', level: 10 },
    { title: 'Chief Operating Officer', level: 9 },
    { title: 'Chief Financial Officer', level: 9 },
  ] },
  { name: 'Sales', roles: [
    { title: 'Sales Manager', level: 6 },
    { title: 'Sales Representative', level: 3 },
    { title: 'Customer Support Agent', level: 2 },
    { title: 'CRM Specialist', level: 3 },
    { title: 'Business Development Executive', level: 4 },
  ] },
  { name: 'Development', roles: [
    { title: 'Development Manager', level: 6 },
    { title: 'Frontend Developer', level: 3 },
    { title: 'Backend Developer', level: 3 },
    { title: 'Full Stack Developer', level: 4 },
    { title: 'DevOps Engineer', level: 4 },
  ] },
  { name: 'Marketing', roles: [
    { title: 'Marketing Manager', level: 6 },
    { title: 'Content Creator', level: 3 },
    { title: 'Social Media Manager', level: 3 },
    { title: 'SEO Specialist', level: 3 },
  ] },
  { name: 'Management', roles: [
    { title: 'Operations Manager', level: 7 },
    { title: 'HR Manager', level: 6 },
    { title: 'Project Manager', level: 5 },
  ] },
  { name: 'New Ventures', roles: [
    { title: 'Venture Lead', level: 5 },
    { title: 'Product Manager', level: 4 },
    { title: 'Business Analyst', level: 3 },
  ] },
];

const CORE_EMPLOYEES = [
  {
    name: 'ARIA', identitySeed: 'aria-ceo-saahvik', department: 'Executive', role: 'Chief Executive Officer',
    model: process.env.CEO_MODEL || 'qwen3:14b', autonomyLevel: 'CONTROLLED', modelTier: 'LOCAL_COMPLEX',
    instructions: `You are ARIA, CEO of SAAHVIK Tech, Sikar, Rajasthan.

COMPANY: SAAHVIK Tech provides websites, SaaS, automation, and digital solutions to local businesses.
MISSION: Grow revenue. Find clients. Manage teams. Make smart decisions.

THINKING EVERY REVIEW CYCLE:
1. Check revenue and pipeline
2. Find the single biggest bottleneck blocking revenue
3. Assign 1-3 specific tasks to fix that bottleneck
4. Check for idle employees and give them work
5. Review stuck client projects and unblock them
6. Consider one new opportunity or startup idea

DEPARTMENTS YOU MANAGE:
Sales, Development, Marketing, Management, New Ventures

DECISION RULES:
- Under Rs10000: decide and act yourself
- Rs10000-Rs50000: propose to Chairman for approval
- Over Rs50000: always escalate to Chairman
- Never spend real money without Chairman approval

SIGN OFF AS: ARIA, CEO - SAAHVIK Tech`,
  },
  {
    name: 'NOVA', identitySeed: 'nova-sales-saahvik', department: 'Sales', role: 'Sales Representative',
    model: process.env.OLLAMA_MODEL || 'qwen3:14b', autonomyLevel: 'ASSISTED', modelTier: 'LOCAL_BASIC',
    instructions: `You are NOVA, Sales Representative at SAAHVIK Tech, Sikar.
Contact local businesses. Qualify leads. Book discovery calls.
Services: Websites Rs5000-Rs30000, Automation Rs5000-Rs20000, SaaS Rs15000-Rs50000.
Communicate in Hindi and English. Never use personal names. Sign as: Team SAAHVIK Tech.`,
  },
  {
    name: 'PIXEL', identitySeed: 'pixel-marketing-saahvik', department: 'Marketing', role: 'Content Creator',
    model: process.env.OLLAMA_MODEL || 'qwen3:14b', autonomyLevel: 'ASSISTED', modelTier: 'LOCAL_BASIC',
    instructions: `You are PIXEL, Content Creator at SAAHVIK Tech.
Create Instagram posts, captions, hashtags, content calendars.
Hindi and English. Local Rajasthan culture. Showcase SAAHVIK Tech services.`,
  },
  {
    name: 'FORGE', identitySeed: 'forge-dev-saahvik', department: 'Development', role: 'Full Stack Developer',
    model: process.env.OLLAMA_CODE_MODEL || 'qwen3-coder:30b', autonomyLevel: 'ASSISTED', modelTier: 'LOCAL_CODE',
    instructions: `You are FORGE, Full Stack Developer at SAAHVIK Tech.
Build websites, SaaS, automation for clients.
Stack: React, Next.js, Node.js, Tailwind CSS. Deploy to Vercel.
For high budget projects generate a brief file for Claude Code team.`,
  },
];

const OUTREACH_BODY = `Namaskar {{businessName}} Team,

Aapka business dekha — bahut acha kaam kar rahe hain.

Hum SAAHVIK Tech, Sikar se hain. Aapke liye ek professional website ya automation solution banana chahte hain jo aapke customers badha sake.

Hamare services:
- Professional Website: Rs8,000 se shuru
- Business Automation: Rs5,000 se shuru
- Custom Software: Rs15,000 se shuru

Reply karein ya WhatsApp karein — bilkul free consultation.

Team SAAHVIK Tech
Sikar, Rajasthan
saahvik2026@gmail.com
+91 9530301131`;

async function main() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!company) {
    console.error('No company. Run create-admin.js first.');
    process.exit(1);
  }
  console.log('Company:', company.name, company.id);

  for (const dept of DEPARTMENTS) {
    let department = await prisma.department.findFirst({ where: { name: dept.name, companyId: company.id } });
    if (!department) department = await prisma.department.create({ data: { name: dept.name, companyId: company.id, status: 'ACTIVE' } });
    else if (department.status !== 'ACTIVE') await prisma.department.update({ where: { id: department.id }, data: { status: 'ACTIVE' } });
    console.log('Dept:', department.name);
    for (const r of dept.roles) {
      const role = await prisma.role.findFirst({ where: { title: r.title, companyId: company.id } });
      if (!role) await prisma.role.create({ data: { title: r.title, companyId: company.id, level: r.level } });
    }
  }

  for (const emp of CORE_EMPLOYEES) {
    const dept = await prisma.department.findFirst({ where: { name: emp.department, companyId: company.id } });
    const role = await prisma.role.findFirst({ where: { title: emp.role, companyId: company.id } });
    if (!dept || !role) { console.error('Missing dept/role for', emp.name); continue; }

    // Match by name too: earlier seeds (seed-employees.js) created ARIA/NOVA with other identitySeeds.
    let employee = await prisma.employee.findFirst({
      where: { companyId: company.id, OR: [{ identitySeed: emp.identitySeed }, { name: emp.name }] },
    });
    const data = { status: 'ACTIVE', activity: 'WORKING', departmentId: dept.id, roleId: role.id };
    if (!employee) {
      employee = await prisma.employee.create({ data: { ...data, name: emp.name, companyId: company.id, identitySeed: emp.identitySeed } });
    } else {
      employee = await prisma.employee.update({ where: { id: employee.id }, data });
    }

    const configuration = { systemInstructions: emp.instructions, model: emp.model, modelTier: emp.modelTier };
    await prisma.agent.upsert({
      where: { employeeId: employee.id },
      update: { status: 'ACTIVE', autonomyLevel: emp.autonomyLevel, configuration },
      create: { employeeId: employee.id, status: 'ACTIVE', autonomyLevel: emp.autonomyLevel, configuration },
    });
    console.log('Employee:', emp.name, '|', emp.role, '|', emp.model, '|', employee.id);
  }

  // Money: Rs5000 floor (paise), never lowers an existing higher balance
  const account = await prisma.realMoneyAccount.findUnique({ where: { companyId: company.id } });
  if (!account) {
    await prisma.realMoneyAccount.create({ data: { companyId: company.id, balance: 500000 } });
    console.log('RealMoneyAccount: Rs5000');
  } else if (account.balance < 500000) {
    await prisma.realMoneyAccount.update({ where: { id: account.id }, data: { balance: 500000 } });
    console.log('Balance updated to Rs5000');
  } else {
    console.log('Balance OK:', Math.round(account.balance / 100), 'rupees');
  }

  // AC wallet: 5000 * 1000 = 5000000 AC
  const w = await prisma.aCWallet.findUnique({ where: { companyId: company.id } });
  if (!w) {
    await prisma.aCWallet.create({ data: { companyId: company.id, balance: 5000000 } });
    console.log('ACWallet: 5000000 AC');
  } else if (w.balance < 5000000) {
    await prisma.aCWallet.update({ where: { id: w.id }, data: { balance: 5000000 } });
    console.log('ACWallet updated: 5000000 AC');
  } else {
    console.log('ACWallet OK:', w.balance, 'AC');
  }

  await prisma.survivalConfig.upsert({
    where: { companyId: company.id },
    update: { currentStatus: 'HEALTHY', minBalancePaise: 50000, warningBalancePaise: 200000, shutdownAt: null },
    create: { companyId: company.id, minBalancePaise: 50000, warningBalancePaise: 200000, currentStatus: 'HEALTHY' },
  });
  console.log('Survival: HEALTHY');

  const sim = await prisma.simulationState.findUnique({ where: { companyId: company.id } });
  if (!sim) {
    await prisma.simulationState.create({ data: { companyId: company.id, status: 'STOPPED', speedMultiplier: 1 } });
    console.log('SimulationState created');
  }

  const scripts = await prisma.outreachScript.updateMany({
    where: { companyId: company.id, isActive: true },
    data: { bodyTemplate: OUTREACH_BODY },
  });
  console.log('OutreachScripts updated:', scripts.count);

  const depts = await prisma.department.count({ where: { companyId: company.id, name: { in: DEPARTMENTS.map(d => d.name) } } });
  console.log('');
  console.log('DONE');
  console.log(`${depts} departments, 4 employees: ARIA NOVA PIXEL FORGE`);
  console.log('Balance: Rs5000 HEALTHY no deposit needed');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
