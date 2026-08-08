import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { useBookClubContext } from '@/components/bookClub'

import { BookClubManagementContext } from './context'

const BasicSettingsScene = lazy(() => import('./basics'))
const MemberManagementScene = lazy(() => import('./members'))
const RoleManagementScene = lazy(() => import('./roles'))
const DeletionScene = lazy(() => import('./danger'))
const BookClubSchedulerScene = lazy(() => import('./scheduler'))

export default function BookClubSettingsRouter() {
	const { patchClub } = useBookClubContext()

	return (
		<Suspense>
			<BookClubManagementContext.Provider value={{ patch: patchClub }}>
				<Routes>
					<Route path="" element={<Navigate to="basics" replace />} />
					<Route path="basics" element={<BasicSettingsScene />} />
					<Route path="members" element={<MemberManagementScene />} />
					<Route path="roles" element={<RoleManagementScene />} />
					<Route path="scheduler" element={<BookClubSchedulerScene />} />
					<Route path="delete" element={<DeletionScene />} />
				</Routes>
			</BookClubManagementContext.Provider>
		</Suspense>
	)
}
