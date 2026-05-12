/** ISO-week anchor: the Thursday of the week. Matches the roadmap's
 *  AGG#WEEK#{iso_thursday} key shape — Thursday is used because the ISO 8601
 *  week always contains its Thursday, so this date is unambiguous regardless
 *  of week-start convention. Format: `YYYY-MM-DD`. */
export type IsoThursday = string;

/** Muscle-group identifier used for AGG#MUSCLE# aggregates. The taxonomy
 *  comes from the Speediance API's category metadata. */
export type MuscleGroup = string;

/** Speediance program status — only the `active` slot drives the user's
 *  scheduled workouts. Drafts are reviewable by the user; approved are
 *  staged-but-not-running; active is pushed to the calendar. */
export type ProgramStatus = 'draft' | 'approved' | 'active' | 'archived';
