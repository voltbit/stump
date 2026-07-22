import { z } from 'zod'

/**
 * These shapes mirror the `config` JSON payloads validated server-side in
 * `crates/models/src/shared/book_club_schedule.rs`. Keep them in sync with that file.
 */

/** The unit of time an {@link IntervalSpec} counts in */
export const INTERVAL_UNITS = ['DAY', 'WEEK', 'MONTH'] as const
export type IntervalUnit = (typeof INTERVAL_UNITS)[number]

/** Config payload for an `UPCOMING_DISCUSSION` schedule */
export interface UpcomingDiscussionConfig {
	/** RFC3339 datetime of the upcoming discussion */
	startsAt: string
	/** An optional freeform/RRULE recurrence string, for later use */
	recurrence: string | null
}

/** How often books are assigned for an `INTERVAL_BOOKS` schedule */
export interface IntervalSpec {
	/** The number of `unit`s between assignments. Must be at least 1 */
	every: number
	unit: IntervalUnit
	/** The date (YYYY-MM-DD) the interval is anchored to */
	anchor: string
}

/** A book assigned to an interval, either a reference to a stored media entity or a manual entry */
export interface AssignedBook {
	bookEntityId?: string | null
	title?: string | null
	author?: string | null
	url?: string | null
}

/** A single book assigned to a date range within an {@link IntervalBooksConfig} */
export interface IntervalAssignment {
	/** Date (YYYY-MM-DD) */
	startsOn: string
	/** Date (YYYY-MM-DD) */
	endsOn: string
	book: AssignedBook
}

/** Config payload for an `INTERVAL_BOOKS` schedule */
export interface IntervalBooksConfig {
	interval: IntervalSpec
	assignments: IntervalAssignment[]
}

export const upcomingDiscussionConfigSchema = z.object({
	startsAt: z.string(),
	recurrence: z.string().nullable(),
}) satisfies z.ZodType<UpcomingDiscussionConfig>

export const intervalBooksConfigSchema = z.object({
	interval: z.object({
		every: z.number(),
		unit: z.enum(INTERVAL_UNITS),
		anchor: z.string(),
	}),
	assignments: z.array(
		z.object({
			startsOn: z.string(),
			endsOn: z.string(),
			book: z.object({
				bookEntityId: z.string().nullish(),
				title: z.string().nullish(),
				author: z.string().nullish(),
				url: z.string().nullish(),
			}),
		}),
	),
}) satisfies z.ZodType<IntervalBooksConfig>

/**
 * Safely parses a schedule's raw `config` JSON into its typed shape based on `kind`. Returns
 * `null` if the config doesn't match the expected shape for that kind.
 */
export function parseScheduleConfig(
	kind: 'UPCOMING_DISCUSSION',
	config: unknown,
): UpcomingDiscussionConfig | null
export function parseScheduleConfig(
	kind: 'INTERVAL_BOOKS',
	config: unknown,
): IntervalBooksConfig | null
export function parseScheduleConfig(
	kind: 'UPCOMING_DISCUSSION' | 'INTERVAL_BOOKS',
	config: unknown,
): UpcomingDiscussionConfig | IntervalBooksConfig | null {
	const schema =
		kind === 'UPCOMING_DISCUSSION' ? upcomingDiscussionConfigSchema : intervalBooksConfigSchema
	const result = schema.safeParse(config)
	if (result.success) {
		return result.data
	}
	console.error(`Failed to parse ${kind} schedule config`, result.error)
	return null
}
