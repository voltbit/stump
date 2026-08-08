import MembersTable from './MembersTable'
import PendingInvitations from './PendingInvitations'

export default function ManageMembersScene() {
	return (
		<div className="gap-12 flex flex-col">
			<MembersTable />
			<PendingInvitations />
		</div>
	)
}
