import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
    },
  });
  console.log('✅ Created organization:', org.name);

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'alice@acme.com',
      name: 'Alice (Initiator)',
      hashedPassword,
    },
  });

  const bob = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'bob@acme.com',
      name: 'Bob (Approver)',
      hashedPassword,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'charlie@acme.com',
      name: 'Charlie (Signer)',
      hashedPassword,
    },
  });

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'admin@acme.com',
      name: 'Admin User',
      hashedPassword,
    },
  });

  console.log('✅ Created users');

  // Assign roles
  await prisma.userRoleAssignment.createMany({
    data: [
      { userId: alice.id, role: 'INITIATOR', assignedBy: admin.id },
      { userId: bob.id, role: 'APPROVER', assignedBy: admin.id },
      { userId: charlie.id, role: 'SIGNER', assignedBy: admin.id },
      { userId: admin.id, role: 'ADMIN', assignedBy: admin.id },
    ],
  });
  console.log('✅ Assigned roles');

  // Create a vault (mock for now - we'll add real Turnkey later)
  const vault = await prisma.vault.create({
    data: {
      orgId: org.id,
      chain: 'EVM',
      chainName: 'sepolia', // Using Sepolia testnet
      address: '0xE90B90409Db70Ce39aB9eBae4Aacdd743Bc55073',
      turnkeyWalletId: 'mock-wallet-id',
      name: 'Main Treasury',
    },
  });
  console.log('✅ Created vault:', vault.address);

  console.log('\n🎉 Seed completed!');
  console.log('\nTest credentials:');
  console.log('  alice@acme.com (INITIATOR)');
  console.log('  bob@acme.com (APPROVER)');
  console.log('  charlie@acme.com (SIGNER)');
  console.log('  admin@acme.com (ADMIN)');
  console.log('  Password for all: password123');
  console.log('\n📝 Note: Create payees through the UI - they will require approval!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });