import { UpdateBookClubInput } from '@stump/graphql'
import { createContext, useContext } from 'react'

import { PatchClubOptions, useBookClubContext } from '@/components/bookClub'

export type IBookClubManagementContext = {
	/**
	 * A function that issues a partial update to the club - see `patchClub` on
	 * `IBookClubContext`, which this delegates to.
	 */
	patch: (updates: UpdateBookClubInput, options?: PatchClubOptions) => void
}

export const BookClubManagementContext = createContext<IBookClubManagementContext | null>(null)

export const useBookClubManagement = () => {
	const clubCtx = useBookClubContext()
	const managementCtx = useContext(BookClubManagementContext)

	if (!managementCtx) {
		throw new Error('useBookClubManagement must be used within a BookClubManagementContext')
	}

	return {
		club: clubCtx.bookClub,
		...managementCtx,
	}
}
