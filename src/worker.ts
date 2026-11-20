import { NativeConnection, Worker } from '@temporalio/worker';
import { env } from './config/env';
import * as activities from './activities';
import { redis } from './redis/store';

async function main() {
  await redis.connect();
  const connection = await NativeConnection.connect({ address: env.temporalAddress });
  const worker = await Worker.create({
    connection,
    namespace: env.temporalNamespace,
    taskQueue: env.taskQueue,
    workflowsPath: require.resolve('./temporal/workflows'),
    activities,
  });
  console.log(`Temporal worker polling ${env.taskQueue}`);
  try { await worker.run(); }
  finally { await redis.quit(); await connection.close(); }
}

main().catch((error) => { console.error('Worker failed:', error); process.exit(1); });
