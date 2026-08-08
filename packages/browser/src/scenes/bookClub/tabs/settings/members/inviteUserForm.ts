import { BookClubMemberRole } from '@stump/graphql'
import { z } from 'zod'

// Invitations, like direct member additions, can only be sent for one of these roles -
// CREATOR is implicit to the club creator and can never be invited into. The picker itself,
// and its role options, are identical to AddMemberDialog's, so we reuse those builders rather
// than duplicating them.
export { buildRoleOptions, buildUserOptions } from './addMemberForm'

export const inviteUserFormSchema = z.object({
	role: z.nativeEnum(BookClubMemberRole),
	userId: z.string().min(1, 'Pick a user to invite'),
})
export type InviteUserFormValues = z.infer<typeof inviteUserFormSchema>

export const emptyInviteUserFormValues: InviteUserFormValues = {
	role: BookClubMemberRole.Member,
	userId: '',
}

/**
 * Builds the `BookClubInvitationInput` payload from validated form values. Unlike a direct
 * member addition, an invitation carries no display name: accepting never collects one either
 * (see `MyBookClubInvitations.tsx`), so the resulting member's `display_name` is left `None`.
 * That's fine because `BookClubMember.username` (which every renderer should select instead of
 * the raw, possibly-null `displayName`) falls back to the invited user's account username on
 * the server when no display name was ever set.
 */
export const buildCreateInvitationInput = (values: InviteUserFormValues) => ({
	role: values.role,
	userId: values.userId,
})
