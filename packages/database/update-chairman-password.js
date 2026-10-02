const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const chairman = await prisma.chairman.findFirst();
  const password = 'password';
  const salt = crypto.randomBytes(16).toString('hex');
  const workFactor = 600000;
  const digest = 'sha512';
  const hash = crypto.pbkdf2Sync(password, salt, workFactor, 64, digest).toString('hex');

  await prisma.chairman.update({
    where: { id: chairman.id },
    data: {
      credentialHash: hash,
      credentialSalt: salt,
      hashAlgorithm: 'PBKDF2-SHA512',
      workFactor: workFactor
    }
  });
  console.log('Password set to "password" for', chairman.email);
}
main().finally(() => prisma.$disconnect());
