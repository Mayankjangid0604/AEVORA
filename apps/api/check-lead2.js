"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const opps = await prisma.opportunity.findMany({
        where: { client: { name: { contains: 'Mayank (Hotel Owner)' } } },
        include: { client: true }
    });
    console.log('Opps:', opps);
}
main().finally(() => process.exit(0));
//# sourceMappingURL=check-lead2.js.map