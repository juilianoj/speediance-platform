import { redirect } from 'next/navigation';

import { cardStyle, mutedStyle, PageShell } from '@/app/(authed)/page-shell';
import { verifyIdTokenFromCookies } from '@/lib/auth/session';
import { loadExercises } from '@/lib/data/load-exercises';
import { loadWorkoutGroups } from '@/lib/data/load-workouts';

import { LiftLogTable } from './lift-log-table';
import { WorkoutGroupsList } from './workout-groups-list';

export const metadata = { title: 'Lift log — speediance-platform' };

export default async function LiftLogPage() {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) redirect('/login');

  const [exercises, groups] = await Promise.all([
    loadExercises(claims.sub),
    loadWorkoutGroups(claims.sub),
  ]);

  return (
    <PageShell current="liftlog" userLabel={String(claims.email ?? claims.sub)} title="Lift log">
      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
          Workouts you&rsquo;ve done
        </h2>
        <p style={mutedStyle}>Click any workout to see every session and per-lift progression.</p>
        <WorkoutGroupsList groups={groups} />
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
          Exercises
        </h2>
        <p style={mutedStyle}>
          Lifetime best, last working weight, headroom to PR. Filter by name or sort by any column.
        </p>
        <LiftLogTable exercises={exercises} />
      </section>
    </PageShell>
  );
}
