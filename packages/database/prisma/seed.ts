import { PrismaClient, CompanyStatus, DepartmentStatus, RoleStatus, EmployeeStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Phase 2B database...');
  // Only seed an empty database: never add demo data next to a real company.
  if (await prisma.chairman.count()) {
    console.log('Database already has a Chairman, skipping seed.');
    return;
  }

  // 1. Create Chairman
  const chairman = await prisma.chairman.create({
    data: {
      name: 'Initial Chairman',
      email: 'chairman@aevora.local',
    },
  });
  console.log(`Created Chairman: ${chairman.name}`);

  // 2. Create Company
  const company = await prisma.company.create({
    data: {
      name: 'AEVORA Technologies',
      legalName: 'AEVORA Technologies Inc.',
      description: 'The premier autonomous AI organization.',
      chairmanId: chairman.id,
      status: CompanyStatus.ACTIVE,
    },
  });
  console.log(`Created Company: ${company.name}`);

  // 3. Create Real Money Reserve
  await prisma.realMoneyAccount.create({
    data: {
      companyId: company.id,
      balance: 100000000,
    },
  });

  // 4. Create AC Treasury
  await prisma.aCWallet.create({
    data: {
      companyId: company.id,
      balance: 10000000,
    },
  });

  // 5. Create Departments
  const deptNames = ['Executive', 'Engineering', 'Research', 'Finance', 'HR', 'Sales'];
  const depts: Record<string, any> = {};
  for (const name of deptNames) {
    const dept = await prisma.department.create({
      data: {
        name,
        companyId: company.id,
        status: DepartmentStatus.ACTIVE,
      },
    });
    depts[name] = dept;
  }
  console.log(`Created Departments: ${Object.keys(depts).join(', ')}`);

  // 6. Create Global Roles
  const rolesData = [
    { title: 'Chairman', level: 10, permissions: ['MANAGE_COMPANY', 'MANAGE_FINANCIAL_DATA', 'MANAGE_EMPLOYEES', 'VIEW_CLIENTS', 'MANAGE_CLIENTS', 'VIEW_INQUIRIES', 'MANAGE_INQUIRIES', 'VIEW_OPPORTUNITIES', 'ASSESS_OPPORTUNITIES', 'MANAGE_OPPORTUNITIES', 'CREATE_PROPOSAL', 'SUBMIT_PROPOSAL', 'APPROVE_PROPOSAL', 'REJECT_PROPOSAL', 'CREATE_PROJECT', 'VIEW_COMPANY_METRICS', 'VIEW_DEPARTMENT_METRICS', 'VIEW_OPERATIONAL_ALERTS', 'MANAGE_TRAINING', 'MANAGE_PROMOTIONS', 'MANAGE_BONUSES', 'MANAGE_DISCIPLINE', 'MANAGE_HIRING', 'MANAGE_WORKLOAD'] },
    { title: 'CEO', level: 9, permissions: ['MANAGE_COMPANY', 'VIEW_FINANCIAL_DATA', 'MANAGE_EMPLOYEES', 'VIEW_CLIENTS', 'MANAGE_CLIENTS', 'VIEW_INQUIRIES', 'MANAGE_INQUIRIES', 'VIEW_OPPORTUNITIES', 'ASSESS_OPPORTUNITIES', 'MANAGE_OPPORTUNITIES', 'CREATE_PROPOSAL', 'SUBMIT_PROPOSAL', 'CREATE_PROJECT', 'VIEW_COMPANY_METRICS', 'VIEW_DEPARTMENT_METRICS', 'VIEW_OPERATIONAL_ALERTS', 'MANAGE_TRAINING', 'MANAGE_PROMOTIONS', 'MANAGE_BONUSES', 'MANAGE_DISCIPLINE', 'MANAGE_HIRING', 'MANAGE_WORKLOAD'] },
    { title: 'CTO', level: 8, permissions: ['MANAGE_DEPARTMENTS'] },
    { title: 'CFO', level: 8, permissions: ['MANAGE_FINANCIAL_DATA'] },
    { title: 'HR Manager', level: 7, permissions: ['HIRE_EMPLOYEE', 'TERMINATE_EMPLOYEE', 'CHANGE_ROLE'] },
    { title: 'Engineer', level: 5, permissions: [] },
    { title: 'Researcher', level: 5, permissions: [] },
    { title: 'Sales Executive', level: 5, permissions: ['VIEW_CLIENTS', 'MANAGE_CLIENTS', 'VIEW_INQUIRIES', 'MANAGE_INQUIRIES', 'VIEW_OPPORTUNITIES', 'CREATE_PROPOSAL'] },
    { title: 'Project Manager', level: 6, permissions: ['VIEW_PROJECT', 'MANAGE_PROJECT', 'MANAGE_PROJECT_PLAN', 'MANAGE_PROJECT_REQUIREMENTS', 'MANAGE_PROJECT_TASKS', 'MANAGE_PROJECT_TEAM', 'PROPOSE_PROJECT_STAFFING', 'APPROVE_PROJECT_STAFFING', 'REVIEW_PROJECT_TASK', 'APPROVE_PROJECT_DELIVERY'] },
  ];
  const roles: Record<string, any> = {};
  for (const r of rolesData) {
    const role = await prisma.role.create({
      data: {
        title: r.title,
        level: r.level,
        permissions: r.permissions,
        status: RoleStatus.ACTIVE,
      },
    });
    roles[r.title] = role;
  }
  console.log(`Created Global Roles.`);

  // 7. Create Demo Employees
  const employeesData = [
    { name: 'Alice', seed: 'alice-seed', dept: 'Executive', role: 'CEO', salary: 100000 },
    { name: 'Bob', seed: 'bob-seed', dept: 'Engineering', role: 'CTO', salary: 90000 },
    { name: 'Charlie', seed: 'charlie-seed', dept: 'Engineering', role: 'Project Manager', salary: 80000 },
    { name: 'Diana', seed: 'diana-seed', dept: 'HR', role: 'HR Manager', salary: 60000 },
  ];

  for (const empData of employeesData) {
    const emp = await prisma.employee.create({
      data: {
        name: empData.name,
        identitySeed: empData.seed,
        companyId: company.id,
        departmentId: depts[empData.dept].id,
        roleId: roles[empData.role].id,
        status: EmployeeStatus.ACTIVE,
        salary: empData.salary,
        performanceRecord: {
          create: {
            qualityScore: 75,
            productivityScore: 85
          }
        },
        experience: 5,
        skills: {
          create: [
            { name: 'General Intelligence', category: 'Cognitive', proficiency: 80, experience: 2 },
          ]
        },
        history: {
          create: [
            { eventType: 'HIRED', newValue: 'ACTIVE', actor: 'SYSTEM', reason: 'Initial Company Seed' }
          ]
        }
      },
    });

    await prisma.aCWallet.create({
      data: {
        employeeId: emp.id,
        balance: 50000,
      },
    });

    await prisma.companyEvent.create({
      data: {
        companyId: company.id,
        type: 'EMPLOYEE_HIRED',
        payload: { employeeId: emp.id, name: emp.name },
      }
    });

    if (emp.name === 'Alice' || emp.name === 'Bob' || emp.name === 'Charlie') {
      await prisma.agent.create({
        data: {
          employeeId: emp.id,
          autonomyLevel: 'CONTROLLED',
          budget: { maxExecutionsPerHour: 10 },
          configuration: {
            provider: 'local',
            model: 'local-stub',
            systemInstructions: 'You are an AI employee at AEVORA Technologies. Read company data and do your best.',
            maxActions: 5
          }
        }
      });
      
      if (emp.name === 'Alice') {
        const goal = await prisma.goal.create({
          data: {
            companyId: company.id,
            employeeId: emp.id,
            title: "Improve the company's internal API reliability",
            status: 'ACTIVE',
          }
        });
        const t1 = await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Review current API error handling',
            status: 'READY'
          }
        });
        const t2 = await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Identify reliability risks',
            status: 'BACKLOG',
            dependencies: {
              create: [ { dependsOnId: t1.id } ]
            }
          }
        });
        await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Propose improvements',
            status: 'BACKLOG',
            dependencies: {
              create: [ { dependsOnId: t2.id } ]
            }
          }
        });
      }

      if (emp.name === 'Bob') {
        const goal = await prisma.goal.create({
          data: {
            companyId: company.id,
            employeeId: emp.id,
            title: "Research AI model optimization",
            status: 'ACTIVE',
          }
        });
        const t1 = await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Review local model performance',
            status: 'READY'
          }
        });
        const t2 = await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Compare inference approaches',
            status: 'BACKLOG',
            dependencies: {
              create: [ { dependsOnId: t1.id } ]
            }
          }
        });
        await prisma.task.create({
          data: {
            companyId: company.id,
            goalId: goal.id,
            assignedEmployeeId: emp.id,
            createdBy: 'SYSTEM',
            title: 'Produce optimization notes',
            status: 'BACKLOG',
            dependencies: {
              create: [ { dependsOnId: t2.id } ]
            }
          }
        });
      }
    }
  }

  console.log(`Created Demo Employees with History, Skills, Tasks, Goals, and Agents.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
