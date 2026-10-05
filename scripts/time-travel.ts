/**
 * Demo helper: moves time backwards for ONE lead or follow-up, so overdue / SLA cases can be shown
 * without waiting. The API itself never rewrites history; this only changes timestamps in the database.
 *
 *   npm run time-travel -- followup <followUpId> <minutesOverdue>   make a follow-up due N minutes ago
 *   npm run time-travel -- lead <leadId> <minutesAgo>               make the lead's activity N minutes older
 */
import 'dotenv/config';
import dataSource from '../src/database/data-source';

async function main() {
  const [kind, idArg, minutesArg] = process.argv.slice(2);
  const id = Number(idArg);
  const minutes = Number(minutesArg);
  if (!['lead', 'followup'].includes(kind) || !Number.isInteger(id) || !(minutes > 0)) {
    console.log('Usage: npm run time-travel -- <lead|followup> <id> <minutes>');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('time-travel is a demo tool and refuses to run in production');
  }
  await dataSource.initialize();
  if (kind === 'followup') {
    const [rows]: [unknown[], number] = await dataSource.query(
      `UPDATE follow_ups SET due_at = now() - ($2 * interval '1 minute') WHERE id = $1 RETURNING id`,
      [id, minutes],
    );
    console.log(rows.length ? `Follow-up ${id} is now due ${minutes} min ago.` : 'Not found.');
  } else {
    for (const table of ['assignment_history', 'lead_activities']) {
      await dataSource.query(
        `UPDATE ${table} SET created_at = created_at - ($2 * interval '1 minute') WHERE lead_id = $1`,
        [id, minutes],
      );
    }
    console.log(`Lead ${id}: assignment and activity moved ${minutes} min into the past.`);
  }
  await dataSource.destroy();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
