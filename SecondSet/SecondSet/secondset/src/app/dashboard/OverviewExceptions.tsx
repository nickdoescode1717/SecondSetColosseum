import { prisma } from '@/lib/db';
import { resolveVaultChain } from '@/lib/chains/utils';
import ExceptionsClient, { SerializableIssue } from './ExceptionsClient';

// Configurable stuck-transaction thresholds
const EVM_STUCK_MS = 20 * 60 * 1000; //  20 minutes
const SOL_STUCK_MS =  2 * 60 * 1000; //   2 minutes

interface Props {
  orgId: string;
}

export default async function OverviewExceptions({ orgId }: Props) {
  const now = Date.now();

  const [failedRaw, broadcastedRaw] = await Promise.all([
    prisma.paymentRequest.findMany({
      where: { orgId, status: { in: ['FAILED_BROADCAST', 'FAILED_CONFIRM'] } },
      include: {
        payee: { select: { name: true } },
        vault: { select: { address: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.paymentRequest.findMany({
      where: { orgId, status: 'BROADCASTED', broadcastedAt: { not: null } },
      include: {
        payee: { select: { name: true } },
        vault: { select: { address: true } },
      },
      orderBy: { broadcastedAt: 'asc' },
    }),
  ]);

  const failedIssues: SerializableIssue[] = failedRaw.map((r) => ({
    kind: r.status as SerializableIssue['kind'],
    requestId: r.id,
    payeeName: r.payee.name,
    asset: r.asset,
    amountMinor: r.amountMinor,
    occurredAt: r.updatedAt.getTime(),
    errorMessage: r.errorMessage,
  }));

  const stuckIssues: SerializableIssue[] = broadcastedRaw
    .filter((r) => {
      if (!r.broadcastedAt) return false;
      const chain = resolveVaultChain(r.chain, r.vault.address);
      const threshold = chain === 'EVM' ? EVM_STUCK_MS : SOL_STUCK_MS;
      return now - r.broadcastedAt.getTime() > threshold;
    })
    .map((r) => ({
      kind: 'STUCK' as const,
      requestId: r.id,
      payeeName: r.payee.name,
      asset: r.asset,
      amountMinor: r.amountMinor,
      occurredAt: r.broadcastedAt!.getTime(),
      errorMessage: null,
    }));

  const allIssues = [...failedIssues, ...stuckIssues].sort(
    (a, b) => b.occurredAt - a.occurredAt
  );

  return (
    <div className="card-modern p-6 rounded-modern-lg">
      <ExceptionsClient issues={allIssues} />
    </div>
  );
}
