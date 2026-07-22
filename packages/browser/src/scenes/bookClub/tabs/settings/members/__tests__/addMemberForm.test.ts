import { BookClubMemberRole } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'

import {
	addMemberFormSchema,
	buildCreateMemberInput,
	buildRoleOptions,
	buildUserOptions,
} from '../addMemberForm'

const roleSpec: BookClubMemberRoleSpec = {
	ADMIN: 'Admin',
	CREATOR: 'Creator',
	MEMBER: 'Member',
	MODERATOR: 'Moderator',
}

describe('buildUserOptions', () => {
	const users = [
		{ id: 'user-1', username: 'alice' },
		{ id: 'user-2', username: 'bob' },
		{ id: 'user-3', username: 'carol' },
	]

	it('excludes users who are already members of the club', () => {
		const options = buildUserOptions(users, ['user-2'])
		expect(options.map((option) => option.value)).toEqual(['user-1', 'user-3'])
	})

	it('returns every user when none are excluded', () => {
		const options = buildUserOptions(users, [])
		expect(options).toHaveLength(3)
	})

	it('returns no options when every user is already a member', () => {
		const options = buildUserOptions(users, ['user-1', 'user-2', 'user-3'])
		expect(options).toEqual([])
	})

	it('labels each option with the username', () => {
		const [option] = buildUserOptions(users, ['user-2', 'user-3'])
		expect(option).toEqual({ label: 'alice', value: 'user-1' })
	})
})

describe('buildRoleOptions', () => {
	it('offers member, moderator, and admin, but never creator', () => {
		const options = buildRoleOptions(roleSpec)
		expect(options.map((option) => option.value)).toEqual([
			BookClubMemberRole.Member,
			BookClubMemberRole.Moderator,
			BookClubMemberRole.Admin,
		])
	})

	it('uses the role spec labels', () => {
		const options = buildRoleOptions(roleSpec)
		expect(options.find((option) => option.value === BookClubMemberRole.Admin)?.label).toBe('Admin')
	})

	it('falls back to a title-cased role name when the spec is missing a label', () => {
		const sparseSpec = { ...roleSpec, MODERATOR: '' }
		const options = buildRoleOptions(sparseSpec)
		expect(options.find((option) => option.value === BookClubMemberRole.Moderator)?.label).toBe(
			'Moderator',
		)
	})
})

describe('buildCreateMemberInput', () => {
	it('omits an empty display name in favor of undefined', () => {
		const input = buildCreateMemberInput({
			displayName: '',
			role: BookClubMemberRole.Member,
			userId: 'user-1',
		})
		expect(input).toEqual({
			displayName: undefined,
			role: BookClubMemberRole.Member,
			userId: 'user-1',
		})
	})

	it('passes through a provided display name', () => {
		const input = buildCreateMemberInput({
			displayName: 'Ally',
			role: BookClubMemberRole.Admin,
			userId: 'user-1',
		})
		expect(input.displayName).toBe('Ally')
	})
})

describe('addMemberFormSchema', () => {
	it('requires a userId', () => {
		const result = addMemberFormSchema.safeParse({
			displayName: '',
			role: BookClubMemberRole.Member,
			userId: '',
		})
		expect(result.success).toBe(false)
	})

	it('accepts a valid payload', () => {
		const result = addMemberFormSchema.safeParse({
			displayName: 'Ally',
			role: BookClubMemberRole.Moderator,
			userId: 'user-1',
		})
		expect(result.success).toBe(true)
	})
})
