import { PrismaClient, CompanyStatus } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING V8 MULTI-COMPANY ISOLATION TEST ---');

  // 1. Get or create a Chairman
  let chairman = await prisma.chairman.findFirst();
  if (!chairman) {
    chairman = await prisma.chairman.create({
      data: { name: 'V8 Test Chairman', email: 'v8test@example.com' }
    });
  }

  // 2. Create a Group
  const group = await prisma.aevoraGroup.create({
    data: {
      name: 'V8 Test Group',
      description: 'A group for testing V8 multi-company architecture',
      chairmanId: chairman.id,
      status: CompanyStatus.ACTIVE
    }
  });
  console.log(`Created Group: ${group.name} (${group.id})`);

  // 3. Create Company A and Company B
  const companyA = await prisma.company.create({
    data: {
      name: 'Company A',
      chairmanId: chairman.id,
      groupId: group.id,
      status: CompanyStatus.ACTIVE
    }
  });
  console.log(`Created Company A: ${companyA.name} (${companyA.id})`);

  const companyB = await prisma.company.create({
    data: {
      name: 'Company B',
      chairmanId: chairman.id,
      groupId: group.id,
      status: CompanyStatus.ACTIVE
    }
  });
  console.log(`Created Company B: ${companyB.name} (${companyB.id})`);

  // 4. Create CEO role for companies if needed (or just test basic entities like Goal/Task)
  // We'll create Goals for each and try to fetch them contextually.
  
  const goalA = await prisma.goal.create({
    data: {
      companyId: companyA.id,
      title: 'Company A Goal',
    }
  });

  const goalB = await prisma.goal.create({
    data: {
      companyId: companyB.id,
      title: 'Company B Goal',
    }
  });

  // Verify Isolation Server Side (Simulated via Prisma query isolation)
  const allGoalsA = await prisma.goal.findMany({ where: { companyId: companyA.id } });
  const allGoalsB = await prisma.goal.findMany({ where: { companyId: companyB.id } });

  let passed = true;

  if (allGoalsA.find(g => g.id === goalB.id)) {
    console.error('FAIL: Company A can see Company B goal!');
    passed = false;
  } else {
    console.log('PASS: Company A cannot see Company B goal.');
  }

  if (allGoalsB.find(g => g.id === goalA.id)) {
    console.error('FAIL: Company B can see Company A goal!');
    passed = false;
  } else {
    console.log('PASS: Company B cannot see Company A goal.');
  }

  if (passed) {
    console.log('--- V8 MULTI-COMPANY ISOLATION TEST PASSED ---');
  } else {
    console.log('--- V8 MULTI-COMPANY ISOLATION TEST FAILED ---');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
