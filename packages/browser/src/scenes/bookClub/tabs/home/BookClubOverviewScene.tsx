import { BookClubBooks } from '@/components/bookClub'

import UpcomingDiscussionBanner from './UpcomingDiscussionBanner'

export default function BookClubHomeScene() {
	return (
		<div className="flex flex-col">
			<UpcomingDiscussionBanner />
			<BookClubBooks />
		</div>
	)
}
