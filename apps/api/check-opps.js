"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const opps = await prisma.opportunity.findMany({ include: { client: true } });
    console.log(JSON.stringify(opps, null, 2));
}
main().finally(() => process.exit(0));
//# sourceMappingURL=check-opps.js.map