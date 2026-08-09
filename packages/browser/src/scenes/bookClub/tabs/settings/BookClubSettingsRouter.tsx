import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'

import { useBookClubContext } from '@/components/bookClub'

import { BookClubManagementContext } from './context'

const BasicSettingsScene = lazy(() => import('./basics'))
const MemberManagementScene = lazy(() => import('./members'))
const RoleManagementScene = lazy(() => import('./roles'))
const ReadingListScene = lazy(() => import('./readingList'))
const DeletionScene = lazy(() => import('./danger'))
const BookClubSchedulerScene = lazy(() => import('./scheduler'))

export default function BookClubSettingsRouter() {
	const { patchClub, viewerCanManage } = useBookClubContext()
	const navigate = useNavigate()

	// Settings is Admin/Creator-only (see BookClubNavigation, which already hides the tab from
	// plain members). A deep link straight to /settings still needs to be caught here, though -
	// redirect back to the club home rather than rendering a blank page.
	useEffect(() => {
		if (!viewerCanManage) {
			navigate('..', { replace: true })
		}
	}, [viewerCanManage, navigate])

	if (!viewerCanManage) {
		return null
	}

	return (
		<Suspense>
			<BookClubManagementContext.Provider value={{ patch: patchClub }}>
				<Routes>
					<Route path="" element={<Navigate to="basics" replace />} />
					<Route path="basics" element={<BasicSettingsScene />} />
					<Route path="members" element={<MemberManagementScene />} />
					<Route path="roles" element={<RoleManagementScene />} />
					<Route path="reading-list" element={<ReadingListScene />} />
					<Route path="scheduler" element={<BookClubSchedulerScene />} />
					<Route path="delete" element={<DeletionScene />} />
				</Routes>
			</BookClubManagementContext.Provider>
		</Suspense>
	)
}
