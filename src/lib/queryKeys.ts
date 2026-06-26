export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    byList: (listId: number) => [...queryKeys.tasks.all, 'list', listId] as const,
    byTag: (tagId: number) => [...queryKeys.tasks.all, 'tag', tagId] as const,
    today: () => [...queryKeys.tasks.all, 'today'] as const,
  },
  lists: {
    all: ['lists'] as const,
  },
  tags: {
    all: ['tags'] as const,
  },
}
