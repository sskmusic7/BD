# Convex Project Optimizations

This document outlines the optimizations applied to the BodyDouble Convex project.

## Schema Optimizations

### New Indexes Added

1. **`friendships.by_user_and_status`** - Composite index for filtering friends by user and status
   - Enables efficient queries like "get all accepted friends for user X"
   - Reduces query time for `listFriends` when filtering by status

2. **`inviteLinks.by_inviter`** - Index on `inviterUserId`
   - Enables efficient queries to list all invites created by a user
   - Useful for future features like "my sent invites"

## Query Optimizations

### `listFriends` Query
**Before:** 
- Fetched all friendships, then made N separate `db.get()` calls (N+1 problem)
- No status filtering

**After:**
- Uses `by_user_and_status` index to filter accepted friendships only
- Batches friend lookups using `Promise.all()` (Convex optimizes internally)
- Returns friend data with friendship metadata
- **Performance:** Reduces query time from O(N) sequential to O(1) parallel batch

### `getInvite` Query
**Before:**
- Fetched invite, then fetched inviter separately
- No early validation

**After:**
- Validates token format before querying
- Early returns for used/expired invites (saves DB call)
- Returns only necessary inviter fields (reduces payload size)
- Validates inviter exists

### `ensureUser` Mutation
**Before:**
- No input validation
- Redundant username checks

**After:**
- Validates username format (alphanumeric, underscores, hyphens)
- Validates username length (max 30 chars)
- Only checks username availability if username changed
- Trims whitespace from all string inputs
- Better error messages

### `addFriend` Mutation
**Before:**
- Sequential queries for existing/reverse friendships
- No validation that friend exists

**After:**
- Parallel queries using `Promise.all()` for existing/reverse checks
- Validates friend exists before creating friendship
- Better error messages

### `getByUsername` Query
**Before:**
- No input validation

**After:**
- Validates username is not empty
- Normalizes username before querying

## Performance Improvements

1. **Reduced Database Round Trips**
   - `listFriends`: From N+1 queries to 2 queries (friendships + batch get)
   - `addFriend`: From 2 sequential to 2 parallel queries
   - `getInvite`: Early returns prevent unnecessary DB calls

2. **Index Usage**
   - All queries now use appropriate indexes
   - Composite indexes enable efficient filtering

3. **Input Validation**
   - Prevents invalid data from entering the database
   - Reduces error handling overhead

## Error Handling Improvements

- More descriptive error messages
- Input validation prevents common errors
- Early validation reduces unnecessary processing

## Next Steps (Future Optimizations)

1. **Pagination** - Add pagination to `listFriends` for users with many friends
2. **Caching** - Consider adding query result caching for frequently accessed data
3. **Batch Operations** - Add mutations for bulk friend operations
4. **Analytics** - Add indexes for common analytics queries
5. **Soft Deletes** - Consider soft deletes for friendships instead of hard deletes

## Deployment

After making these changes, deploy to Convex:

```bash
npm run convex:deploy
```

Or for development:

```bash
npm run convex:dev
```

## Monitoring

Monitor query performance in the Convex dashboard:
- Check query execution times
- Monitor index usage
- Review error rates
