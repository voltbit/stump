import { UserPermission } from '@stump/graphql'
import { lazy, useEffect, useMemo } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'

import { useAppContext } from '../../context'
import BookClubHomeLayout from './BookClubLayout.tsx'
import BookClubSettingsRouter from './tabs/settings'

const CreateBookClubScene = lazy(() => import('./createClub'))
const UserBookClubsScene = lazy(() => import('./UserBookClubsScene.tsx'))
const BookClubExplorerScene = lazy(() => import('./explore/BookClubExploreScene.tsx'))

// club-specific routes
const BookClubHomeScene = lazy(() => import('./tabs/home'))
const BookClubSuggestionsScene = lazy(() => import('./tabs/suggestions'))
const BookClubMembersScene = lazy(() => import('./tabs/members'))

export default function BookClubRouter() {
	const { checkPermission } = useAppContext()

	const navigate = useNavigate()
	const canAccess = checkPermission(UserPermission.AccessBookClub)
	useEffect(() => {
		if (!canAccess) {
			navigate('..', { replace: true })
		}
	}, [canAccess, navigate])

	const canCreate = useMemo(() => checkPermission(UserPermission.CreateBookClub), [checkPermission])

	if (!canAccess) {
		return null
	}

	return (
		<Routes>
			<Route path="" element={<UserBookClubsScene />} />
			<Route path="explore" element={<BookClubExplorerScene />} />
			{canCreate && <Route path="create" element={<CreateBookClubScene />} />}
			<Route path=":slug/*" element={<BookClubHomeLayout />}>
				<Route path="" element={<BookClubHomeScene />} />
				<Route path="home" element={<Navigate to=".." replace />} />
				<Route path="suggestions" element={<BookClubSuggestionsScene />} />
				<Route path="members" element={<BookClubMembersScene />} />
				<Route path="settings/*" element={<BookClubSettingsRouter />} />
			</Route>
			<Route path="*" element={<Navigate to="/404" />} />
		</Routes>
	)
}
