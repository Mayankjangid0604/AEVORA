"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function main() {
    const prisma = new client_1.PrismaClient();
    const msgs = await prisma.inboundMessage.findMany({
        where: { fromAddress: 'mayankjangid598@gmail.com' }
    });
    console.log(JSON.stringify(msgs, null, 2));
}
main().finally(() => process.exit(0));
//# sourceMappingURL=test-check-msgs.js.map