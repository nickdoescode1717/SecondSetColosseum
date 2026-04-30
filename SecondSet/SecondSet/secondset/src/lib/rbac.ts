import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { UserRole } from '@prisma/client';
import { prisma } from './db';

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  return session.user as any;
}

export async function requireRoles(allowedRoles: UserRole[]) {
  const user = await requireAuth();
  
  const hasRole = user.roles?.some((role: UserRole) => 
    allowedRoles.includes(role)
  );
  
  if (!hasRole) {
    throw new Error(`Forbidden: requires one of ${allowedRoles.join(', ')}`);
  }
  
  return user;
}

export async function checkSelfApproval(requestId: string, userId: string) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
  });
  
  if (request?.createdBy === userId) {
    throw new Error('Cannot approve own request');
  }
}

export async function checkSignerConflict(requestId: string, userId: string) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
  });
  
  if (request?.createdBy === userId || request?.approvedBy === userId) {
    throw new Error('Signer cannot be creator or approver');
  }
}
