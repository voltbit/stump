import '@/__mocks__/matchMedia'

import { useGraphQL } from '@stump/client'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { BookClubContext, IBookClubContext } from '../../context'
import BookClubBooks from '../BookClubBooks'

jest.mock('@stump/client', () => ({
	...jest.requireActual('@stump/client'),
	useGraphQL: jest.fn(),
}))

// Not under test here, and it pulls in a large chunk of the app (entity cards -> sidebar -> home)
jest.mock('../BookClubBookItem', () => ({
	__esModule: true,
	default: () => null,
}))

const CLUB_ID = '15652392-ceee-410a-91d2-f70437dab6aa'
const CLUB_SLUG = 'repro-club-404'

const createClub = () =>
	({
		id: CLUB_ID,
		slug: CLUB_SLUG,
		name: 'Repro Club 404',
		currentBook: null,
	}) as unknown as IBookClubContext['bookClub']

const renderBooks = ({ viewerCanManage = true } = {}) =>
	render(
		<MemoryRouter>
			<BookClubContext.Provider
				value={
					{
						bookClub: createClub(),
						viewerCanManage,
						viewerIsMember: true,
						patchClub: jest.fn(),
					} as IBookClubContext
				}
			>
				<BookClubBooks />
			</BookClubContext.Provider>
		</MemoryRouter>,
	)

describe('BookClubBooks', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		jest.mocked(useGraphQL).mockReturnValue({
			data: { bookClubById: { id: CLUB_ID, previousBooks: [] } },
		} as any)
	})

	it('should link "Create a schedule" to the slug-based scheduler route', () => {
		renderBooks()

		const link = screen.getByRole('link', { name: /create a schedule/i })

		// The club layout resolves the `:slug` route param via `bookClubBySlug`, so the URL must
		// carry the club's slug. Linking with the club's ID resolves to no club and redirects to /404.
		expect(link).toHaveAttribute('href', `/clubs/${CLUB_SLUG}/settings/scheduler`)
		expect(link.getAttribute('href')).not.toContain(CLUB_ID)
	})

	it('should not render the schedule affordance for members who cannot manage the club', () => {
		renderBooks({ viewerCanManage: false })

		expect(screen.queryByRole('link', { name: /create a schedule/i })).not.toBeInTheDocument()
	})
})
