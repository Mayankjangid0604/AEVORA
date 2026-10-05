const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const email = 'test.chairman@example.com';
  const name = 'Test Chairman Duplicate';
  const password = 'password';
  const salt = crypto.randomBytes(16).toString('hex');
  const workFactor = 600000;
  const digest = 'sha512';
  const hash = crypto.pbkdf2Sync(password, salt, workFactor, 64, digest).toString('hex');

  // Check if exists
  let chairman = await prisma.chairman.findFirst({ where: { email } });
  if (!chairman) {
    chairman = await prisma.chairman.create({
      data: {
        name,
        email,
        credentialHash: hash,
        credentialSalt: salt,
        hashAlgorithm: 'PBKDF2-SHA512',
        workFactor: workFactor
      }
    });
    console.log('Created test chairman duplicate:', email);
  } else {
    await prisma.chairman.update({
      where: { id: chairman.id },
      data: {
        credentialHash: hash,
        credentialSalt: salt,
        hashAlgorithm: 'PBKDF2-SHA512',
        workFactor: workFactor
      }
    });
    console.log('Updated existing test chairman duplicate:', email);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
