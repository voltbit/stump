import { useSDK, useSuspenseGraphQL } from '@stump/client'
import { Alert, AlertDescription, AlertTitle } from '@stump/components'
import { BookClubScheduleKind, graphql } from '@stump/graphql'
import { format, parseISO } from 'date-fns'
import { CalendarCheck } from 'lucide-react'
import { useMemo } from 'react'

import { useBookClubContext } from '@/components/bookClub'

import { parseScheduleConfig } from '../settings/scheduler/types'

const query = graphql(`
	query UpcomingDiscussionBanner($id: ID!) {
		bookClubById(id: $id) {
			id
			schedules {
				id
				kind
				config
			}
		}
	}
`)

/**
 * Surfaces the soonest upcoming "Upcoming discussion" schedule for the club, if one exists,
 * on the club's home/overview scene.
 */
export default function UpcomingDiscussionBanner() {
	const { sdk } = useSDK()
	const { bookClub } = useBookClubContext()

	const {
		data: {
			bookClubById: { schedules },
		},
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubById', [bookClub.id, 'upcomingDiscussion']), {
		id: bookClub.id,
	})

	const nextDiscussion = useMemo(() => {
		const now = new Date()

		return schedules
			.filter((schedule) => schedule.kind === BookClubScheduleKind.UpcomingDiscussion)
			.map((schedule) => parseScheduleConfig('UPCOMING_DISCUSSION', schedule.config))
			.filter((config): config is NonNullable<typeof config> => !!config)
			.map((config) => parseISO(config.startsAt))
			.filter((date) => !Number.isNaN(date.getTime()) && date >= now)
			.sort((a, b) => a.getTime() - b.getTime())
			.at(0)
	}, [schedules])

	if (!nextDiscussion) {
		return null
	}

	return (
		<Alert variant="info" className="mb-4">
			<CalendarCheck className="h-4 w-4" />
			<AlertTitle>Next discussion</AlertTitle>
			<AlertDescription>{format(nextDiscussion, 'PPPp')}</AlertDescription>
		</Alert>
	)
}
