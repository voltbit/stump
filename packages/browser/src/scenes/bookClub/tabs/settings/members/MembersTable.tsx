import { useGraphQL, useGraphQLMutation, useSDK } from '@stump/client'
import { Avatar, Button, Card, ToolTip } from '@stump/components'
import { BookClubMembersTableQuery, graphql, UserPermission } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'
import { keepPreviousData } from '@tanstack/react-query'
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
	query BookClubMembersTable($id: ID!, $pagination: Pagination!) {
		bookClubById(id: $id) {
			id
			members(pagination: $pagination) {
				nodes {
					id
					avatarUrl
					isCreator
					username
					role
					userId
				}
				pageInfo {
					__typename
					... on OffsetPaginationInfo {
						totalPages
						currentPage
						pageSize
						pageOffset
						zeroBased
					}
				}
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

	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

	const { data, refetch } = useGraphQL(
		query,
		sdk.cacheKey('bookClubById', [id, 'members', pagination]),
		{
			id,
			pagination: {
				offset: {
					page: pagination.pageIndex + 1, // Offset pagination is 1-based
					pageSize: pagination.pageSize,
				},
			},
		},
		{ placeholderData: keepPreviousData },
	)

	const members = data?.bookClubById.members.nodes ?? []
	const pageInfo = data?.bookClubById.members.pageInfo

	if (!!pageInfo && pageInfo.__typename !== 'OffsetPaginationInfo') {
		throw new Error('Invalid pagination type, expected OffsetPaginationInfo')
	}

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
						pageCount: pageInfo?.totalPages,
						state: {
							columnPinning: {
								right: ['actions'],
							},
							pagination,
						},
					}}
					data={members}
					fullWidth
					cellClassName="bg-background"
				/>
			</Card>
		</>
	)
}

type Member = BookClubMembersTableQuery['bookClubById']['members']['nodes'][number]

const columnHelper = createColumnHelper<Member>()

const createBaseColumns = (spec: BookClubMemberRoleSpec) =>
	[
		columnHelper.accessor(({ username }) => username, {
			cell: ({
				row: {
					original: { avatarUrl, username },
				},
			}) => (
				<div className="flex items-center">
					<Avatar className="mr-2" src={avatarUrl ?? undefined} fallback={username} />
					<span>{username}</span>
				</div>
			),
			header: 'Member',
			id: 'username',
		}),
		columnHelper.accessor('role', {
			cell: ({ getValue }) => (
				<span>{spec[getValue()] || upperFirst(getValue().toLowerCase())}</span>
			),
			header: 'Role',
		}),
	] as ColumnDef<Member>[]
