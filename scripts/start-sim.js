const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'desc' } });
  const sim = await prisma.simulationState.findFirst({ where: { companyId: company.id } });
  console.log('Simulation:', sim);
  if (sim.status !== 'RUNNING') {
    await prisma.simulationState.update({
      where: { id: sim.id },
      data: { status: 'RUNNING' }
    });
    console.log('Updated simulation to RUNNING');
  }
}
main().finally(() => prisma.$disconnect());
