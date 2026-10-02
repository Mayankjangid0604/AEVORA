"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('SalesLead:', await prisma.salesLead.findMany({ where: { contactEmail: 'mayankjangid598@gmail.com' } }));
    console.log('Client:', await prisma.client.findMany({ where: { description: { contains: 'mayank' } } }));
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=test-db.js.map