import { BookClubMemberRole } from '@stump/graphql'

import { buildCreateInvitationInput, inviteUserFormSchema } from '../inviteUserForm'

describe('buildCreateInvitationInput', () => {
	it('carries the selected user and role, and never a display name', () => {
		const input = buildCreateInvitationInput({
			role: BookClubMemberRole.Moderator,
			userId: 'user-1',
		})
		expect(input).toEqual({
			role: BookClubMemberRole.Moderator,
			userId: 'user-1',
		})
	})
})

describe('inviteUserFormSchema', () => {
	it('requires a userId', () => {
		const result = inviteUserFormSchema.safeParse({
			role: BookClubMemberRole.Member,
			userId: '',
		})
		expect(result.success).toBe(false)
	})

	it('accepts a valid payload', () => {
		const result = inviteUserFormSchema.safeParse({
			role: BookClubMemberRole.Admin,
			userId: 'user-1',
		})
		expect(result.success).toBe(true)
	})
})
