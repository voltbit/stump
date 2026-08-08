import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AspectRatio, Badge, Button, Card, cn, Link, Text } from '@stump/components'
import { FragmentType, graphql, useFragment } from '@stump/graphql'
import { Book, CheckCircle2, GripVertical } from 'lucide-react'

import { EntityImage } from '@/components/entity'
import paths from '@/paths'

export const readingListBookItemFragment = graphql(`
	fragment ReadingListBookItem on BookClubBook {
		id
		title
		author
		url
		imageUrl
		completedAt
		entity {
			id
			resolvedName
			metadata {
				writers
			}
			thumbnail {
				url
			}
		}
	}
`)

type Props = {
	data: FragmentType<typeof readingListBookItemFragment>
	position: number
	isCurrent: boolean
	/** Whether this row can be dragged to reorder. Completed books are never draggable */
	canDrag: boolean
	onComplete?: () => void
	completeDisabled?: boolean
}

export default function ReadingListBookItem({
	data,
	position,
	isCurrent,
	canDrag,
	onComplete,
	completeDisabled,
}: Props) {
	const book = useFragment(readingListBookItemFragment, data)

	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: book.id,
		disabled: !canDrag,
	})

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	const isExternal = !book.entity
	const title = book.entity?.resolvedName ?? book.title ?? 'Untitled'
	const author = book.entity ? book.entity.metadata?.writers?.join(', ') : book.author
	const imageUrl = book.entity?.thumbnail.url ?? book.imageUrl
	const link = book.entity ? paths.bookOverview(book.entity.id) : book.url

	const ImageComponent = book.entity ? EntityImage : 'img'

	return (
		<div ref={setNodeRef} style={style} className={cn({ 'z-10': isDragging })}>
			<Card className="gap-3 p-3 flex items-center">
				{canDrag && (
					<button
						type="button"
						{...attributes}
						{...listeners}
						aria-label="Reorder book"
						className={cn('p-1 shrink-0 touch-none rounded-sm text-muted-foreground', {
							'cursor-grabbing': isDragging,
							'cursor-grab': !isDragging,
						})}
					>
						<GripVertical className="h-4 w-4" />
					</button>
				)}

				<Text size="sm" variant="muted" className="w-5 shrink-0 text-center">
					{position}
				</Text>

				<div className="h-16 w-11 shrink-0">
					<AspectRatio ratio={2 / 3}>
						{imageUrl ? (
							<ImageComponent src={imageUrl} className="rounded-sm object-cover" />
						) : (
							<div className="flex h-full w-full items-center justify-center rounded-sm border border-border/80 bg-muted/50">
								<Book className="h-5 w-5 text-muted-foreground" />
							</div>
						)}
					</AspectRatio>
				</div>

				<div className="min-w-0 gap-0.5 flex flex-1 flex-col">
					<div className="gap-2 flex items-center">
						<Text size="sm" className="font-medium truncate">
							{title}
						</Text>
						{isCurrent && (
							<Badge size="xs" variant="primary" className="shrink-0">
								Current
							</Badge>
						)}
						{book.completedAt && (
							<Badge size="xs" className="shrink-0">
								Completed
							</Badge>
						)}
					</div>
					{author && (
						<Text size="xs" variant="muted" className="truncate">
							{author}
						</Text>
					)}
					{link && (
						<Link {...(isExternal ? { href: link } : { to: link })} className="text-xs">
							{isExternal ? 'External link' : 'View book'}
						</Link>
					)}
				</div>

				{onComplete && (
					<Button
						size="sm"
						variant="secondary"
						className="shrink-0"
						onClick={onComplete}
						disabled={completeDisabled}
					>
						<CheckCircle2 className="mr-1.5 h-4 w-4" />
						Mark complete
					</Button>
				)}
			</Card>
		</div>
	)
}
