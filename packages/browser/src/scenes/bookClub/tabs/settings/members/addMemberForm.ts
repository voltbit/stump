import { BookClubMemberRole } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'
import upperFirst from 'lodash/upperFirst'
import { z } from 'zod'

// Members can only be added with one of these roles - CREATOR is implicit to the club creator
export const ADDABLE_ROLES = [
	BookClubMemberRole.Member,
	BookClubMemberRole.Moderator,
	BookClubMemberRole.Admin,
] as const

export const addMemberFormSchema = z.object({
	displayName: z.string().optional(),
	role: z.nativeEnum(BookClubMemberRole),
	userId: z.string().min(1, 'Pick a user to add'),
})
export type AddMemberFormValues = z.infer<typeof addMemberFormSchema>

export const emptyAddMemberFormValues: AddMemberFormValues = {
	displayName: '',
	role: BookClubMemberRole.Member,
	userId: '',
}

export type SelectableUser = {
	id: string
	username: string
}

export type Option = { label: string; value: string }

/**
 * Builds the list of pickable options for the user combobox: every server user that isn't
 * already a member of the club
 */
export const buildUserOptions = (users: SelectableUser[], excludedUserIds: string[]): Option[] => {
	const excluded = new Set(excludedUserIds)
	return users
		.filter((user) => !excluded.has(user.id))
		.map((user) => ({
			label: user.username,
			value: user.id,
		}))
}

/**
 * Builds the list of pickable role options, using the club's role spec for display labels
 * when available and falling back to a title-cased version of the role otherwise
 */
export const buildRoleOptions = (roleSpec: BookClubMemberRoleSpec): Option[] =>
	ADDABLE_ROLES.map((role) => ({
		label: roleSpec[role] || upperFirst(role.toLowerCase()),
		value: role,
	}))

/**
 * Builds the `CreateBookClubMemberInput` payload from validated form values
 */
export const buildCreateMemberInput = (values: AddMemberFormValues) => ({
	displayName: values.displayName || undefined,
	role: values.role,
	userId: values.userId,
})
