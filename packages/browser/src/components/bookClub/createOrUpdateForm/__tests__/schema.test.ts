import { FORBIDDEN_ENTITY_NAMES } from '@/utils/form'

import {
	buildSchema,
	type CreateOrUpdateBookClubSchema,
	defaultMemberSpec,
	formDefaults,
} from '../schema'

const translateFn = jest.fn((key: string) => key)

const existingClubs = [
	{
		name: 'existingClubName',
	} as any,
]

const createClub = (
	overrides: Partial<CreateOrUpdateBookClubSchema> = {},
): CreateOrUpdateBookClubSchema => ({
	creatorDisplayName: 'creatorDisplayName',
	creatorHideProgress: false,
	description: 'description',
	isPrivate: false,
	memberRoleSpec: defaultMemberSpec,
	name: 'newClubName',
	...overrides,
})

describe('createOrUpdateBookClubForm schema', () => {
	// NOTE: despite the name, these exercise buildSchema()'s parse-time defaulting, not the
	// formDefaults() function - see the `formDefaults()` describe block below for that
	describe('formDefaults', () => {
		it('should default creatorHideProgress to false when creating', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.parse(createClub({ creatorHideProgress: undefined })).creatorHideProgress).toBe(
				false,
			)
		})

		it('should default creatorHideProgress to undefined when updating', () => {
			const schema = buildSchema(translateFn, [], false)
			expect(schema.parse(createClub({ creatorHideProgress: undefined })).creatorHideProgress).toBe(
				undefined,
			)
		})

		it('should default isPrivate to false', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.parse(createClub({ isPrivate: undefined })).isPrivate).toBe(false)
		})

		it('should map existing club to form defaults', () => {
			const schema = buildSchema(translateFn, [], false)
			const club = createClub()
			expect(schema.parse(club)).toEqual(club)
		})
	})

	describe('formDefaults()', () => {
		const club = {
			description: 'An "Our Flag Means Death" fan club',
			emoji: '🏴‍☠️',
			isPrivate: true,
			name: 'Pirate Club',
			roleSpec: defaultMemberSpec,
		} as any

		it('preserves the club description instead of always resetting it to empty', () => {
			// Regression test: formDefaults() used to hardcode description to '', so saving the
			// Basics form for any reason (even just toggling privacy) would silently blank out an
			// existing club's description
			expect(formDefaults(club).description).toBe('An "Our Flag Means Death" fan club')
		})

		it('falls back to an empty description when the club has none', () => {
			expect(formDefaults({ ...club, description: null }).description).toBe('')
		})

		it('preserves the club emoji', () => {
			expect(formDefaults(club).emoji).toBe('🏴‍☠️')
		})

		it('falls back to undefined emoji when the club has none', () => {
			expect(formDefaults({ ...club, emoji: null }).emoji).toBeUndefined()
		})

		it('maps isPrivate and name from the club', () => {
			const defaults = formDefaults(club)
			expect(defaults.isPrivate).toBe(true)
			expect(defaults.name).toBe('Pirate Club')
		})

		it("maps the club's roleSpec to memberRoleSpec", () => {
			expect(formDefaults(club).memberRoleSpec).toEqual(defaultMemberSpec)
		})

		it('returns empty/falsy defaults when no club is provided (creating)', () => {
			expect(formDefaults(undefined)).toEqual({
				creatorDisplayName: '',
				description: '',
				emoji: undefined,
				isPrivate: false,
				memberRoleSpec: undefined,
				name: '',
			})
		})
	})

	describe('validation', () => {
		it('should successfully validate a valid club', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.safeParse(createClub()).success).toBe(true)
		})

		it('should not allow existing names', () => {
			const schema = buildSchema(
				translateFn,
				existingClubs.map(({ name }) => name),
				true,
			)
			expect(schema.safeParse(createClub({ name: 'existingClubName' })).success).toBe(false)
			expect(schema.safeParse(createClub({ name: 'newClubName' })).success).toBe(true)
		})

		it('should not allow forbidden names', () => {
			const schema = buildSchema(translateFn, [], true)
			for (const name of FORBIDDEN_ENTITY_NAMES) {
				expect(schema.safeParse(createClub({ name })).success).toBe(false)
			}
		})

		it('should require a name', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.safeParse(createClub({ name: '' })).success).toBe(false)
		})

		it('should not require a description', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.safeParse(createClub({ description: undefined })).success).toBe(true)
			expect(schema.safeParse(createClub({ description: '' })).success).toBe(true)
		})

		it('should not require a creatorDisplayName', () => {
			const schema = buildSchema(translateFn, [], true)
			expect(schema.safeParse(createClub({ creatorDisplayName: undefined })).success).toBe(true)
			expect(schema.safeParse(createClub({ creatorDisplayName: '' })).success).toBe(true)
		})
	})
})
