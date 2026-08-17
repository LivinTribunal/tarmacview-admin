import { asc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm'
import {
  device,
  person,
  training,
  trainingDevice,
  trainingType,
  type Training,
} from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts,
// scoped-people.ts or scoped-training-types.ts: `training_tenant_isolation` and
// `training_device_tenant_isolation` scope these reads, so another operator's training is
// not hidden by a WHERE clause somebody could forget - it does not exist as far as the
// connection is concerned. docs/specs/03-data-model.md §"Trainings in the rebuild".

export type TrainingEntry = Training & {
  // doc 04's `Typ`, `Pilot` and `Zariadenia`. each is null where the session cannot read
  // the row behind it, which is a gap and never a pass - an unclassified training must not
  // render as a classified one.
  trainingTypeName: string | null
  pilotName: string | null
  airframes: string[] | null
}

// every join is a left join, and each one is load-bearing. a training with no type, a
// training whose pilot the session cannot read, and a training covering no airframe must
// all still render, or the register hides the records that most need looking at.
//
// only the pivot chain is to-many, so this needs none of scoped-organizations.ts's
// `distinct` guarding against two joins multiplying each other out.
//
// the same alignment scoped-people.ts records applies here, and is worth stating in its own
// terms: the `Zariadenia` cell is only safe because `training_device_tenant_isolation` and
// `device_tenant_isolation` key off the *same* app_acting_organizations() set. a readable
// pivot row whose airframe is not readable would drop a null into the aggregate beside the
// airframes that did resolve, and the cell would understate what the training covered with
// nothing failing. narrowing either policy without the other is what breaks it.
//
// the airframe reads `name ?? serial_number`, which is what the airframe register shows.
//
// one query body for both reads below, so the register and the report cannot drift apart
// unnoticed - the shape scoped-people.ts's `listMembers` already uses. the scope is the only
// thing that differs between them.
function listTrainingRows(tx: TenantTransaction, scope?: SQL): Promise<TrainingEntry[]> {
  return tx
    .select({
      ...getTableColumns(training),
      trainingTypeName: trainingType.name,
      pilotName: person.name,
      airframes: sql<
        string[] | null
      >`array_agg(coalesce(${device.name}, ${device.serialNumber}) order by ${trainingDevice.id}) filter (where ${trainingDevice.id} is not null)`,
    })
    .from(training)
    .leftJoin(trainingType, eq(trainingType.id, training.trainingTypeId))
    .leftJoin(person, eq(person.id, training.pilotId))
    .leftJoin(trainingDevice, eq(trainingDevice.trainingId, training.id))
    .leftJoin(device, eq(device.id, trainingDevice.deviceId))
    .where(scope)
    .groupBy(training.id, trainingType.id, person.id)
    .orderBy(asc(training.id))
}

// doc 04's register: every training the acting session may read, deployment-wide.
export function listTrainings(tx: TenantTransaction): Promise<TrainingEntry[]> {
  return listTrainingRows(tx)
}

// doc 06's operator report reads every training the organisation holds - **all-time** and
// never period-filtered, because a pilot's qualification does not stop existing because the
// reader picked last month. the period-filtered half of a pilot's row is their flights, and
// those come from rows the payload already has.
//
// `where organization_id` is a **selection and never a boundary**, the line the header
// comment above draws: `training_tenant_isolation` and `training_device_tenant_isolation`
// decide which rows the session may see at all, and this clause decides which of them the
// report is looking at. tests/tenancy/report-data-isolation.test.ts asserts the difference.
export function listOrganizationTrainings(
  tx: TenantTransaction,
  organizationId: number,
): Promise<TrainingEntry[]> {
  return listTrainingRows(tx, eq(training.organizationId, organizationId))
}

// a cross-tenant id yields no rows, so the caller renders not-found. refusing would confirm
// the record is real, which is exactly what the boundary is for.
export async function findTraining(tx: TenantTransaction, id: number): Promise<Training | null> {
  const [row] = await tx.select().from(training).where(eq(training.id, id)).limit(1)
  return row ?? null
}
