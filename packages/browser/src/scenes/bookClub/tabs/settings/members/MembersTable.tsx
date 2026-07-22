import { useGraphQLMutation, useSDK, useSuspenseGraphQL } from '@stump/client'
import { Avatar, Button, Card, ToolTip } from '@stump/components'
import { BookClubMembersTableQuery, graphql, UserPermission } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'
import { ColumnDef, createColumnHelper } from '@tanstack/react-table'
import upperFirst from 'lodash/upperFirst'
import { UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Table } from '@/components/table'
import { useAppContext, useCheckPermission } from '@/context'

import { useBookClubManagement } from '../context'
import AddMemberDialog from './AddMemberDialog'
import MemberActionMenu from './MemberActionMenu'
import RemoveMemberConfirmation from './RemoveMemberConfirmation'

const query = graphql(`
	query BookClubMembersTable($id: ID!) {
		bookClubById(id: $id) {
			id
			members {
				id
				avatarUrl
				isCreator
				displayName
				role
				userId
			}
		}
	}
`)

const removeMutation = graphql(`
	mutation RemoveBookClubMember($bookClubId: ID!, $memberId: ID!) {
		removeBookClubMember(bookClubId: $bookClubId, memberId: $memberId) {
			id
		}
	}
`)

export default function MembersTable() {
	const { sdk } = useSDK()
	const { user } = useAppContext()
	const canReadUsers = useCheckPermission(UserPermission.ReadUsers)
	const {
		club: { id, roleSpec },
	} = useBookClubManagement()

	// TODO: implement backend pagination for better scalability
	const {
		data: {
			bookClubById: { members },
		},
		refetch,
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubById', [id, 'members']), { id })

	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
	const pageCount = useMemo(
		() => Math.ceil((members?.length ?? 0) / pagination.pageSize),
		[members, pagination.pageSize],
	)

	const [removingMember, setRemovingMember] = useState<Member | null>(null)
	const [isAddingMember, setIsAddingMember] = useState(false)

	const { mutate: removeMember } = useGraphQLMutation(removeMutation, {
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error('Error removing member:', error)
			toast.error('Failed to remove member')
		},
	})

	const columns = useMemo(
		() => [
			...createBaseColumns(roleSpec),
			columnHelper.display({
				id: 'actions',
				cell: ({ row: { original } }) => {
					if (original.userId === user?.id || original.isCreator) {
						return null
					}

					return <MemberActionMenu onSelectForRemoval={() => setRemovingMember(original)} />
				},
			}),
		],
		[roleSpec, user],
	)

	return (
		<>
			<RemoveMemberConfirmation
				isOpen={!!removingMember}
				onClose={(didConfirm) => {
					if (didConfirm && removingMember) {
						removeMember({
							bookClubId: id,
							memberId: removingMember.id,
						})
					}
					setRemovingMember(null)
				}}
			/>
			<AddMemberDialog
				isOpen={isAddingMember}
				bookClubId={id}
				roleSpec={roleSpec}
				excludedUserIds={members?.map(({ userId }) => userId) ?? []}
				onClose={() => setIsAddingMember(false)}
				onAdded={() => {
					setIsAddingMember(false)
					refetch()
				}}
			/>
			<div className="mb-4 flex justify-end">
				<ToolTip
					content='Requires the "Read users" server permission'
					isDisabled={canReadUsers}
					align="end"
				>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setIsAddingMember(true)}
						disabled={!canReadUsers}
					>
						<UserPlus className="mr-2 h-4 w-4" />
						Add member
					</Button>
				</ToolTip>
			</div>
			<Card>
				<Table
					sortable
					columns={columns}
					options={{
						manualPagination: true,
						onPaginationChange: setPagination,
						pageCount,
						state: {
							columnPinning: {
								right: ['actions'],
							},
							pagination,
						},
					}}
					data={members ?? []}
					fullWidth
					cellClassName="bg-background"
				/>
			</Card>
		</>
	)
}

type Member = BookClubMembersTableQuery['bookClubById']['members'][number]

const columnHelper = createColumnHelper<Member>()

const createBaseColumns = (spec: BookClubMemberRoleSpec) =>
	[
		columnHelper.accessor(({ displayName }) => displayName, {
			cell: ({
				row: {
					original: { avatarUrl, displayName },
				},
			}) => (
				<div className="flex items-center">
					<Avatar className="mr-2" src={avatarUrl ?? undefined} fallback={displayName} />
					<span>{displayName}</span>
				</div>
			),
			header: 'Member',
			id: 'display_name',
		}),
		columnHelper.accessor('role', {
			cell: ({ getValue }) => (
				<span>{spec[getValue()] || upperFirst(getValue().toLowerCase())}</span>
			),
			header: 'Role',
		}),
	] as ColumnDef<Member>[]
