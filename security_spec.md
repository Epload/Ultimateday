# Security Specification (Phase 0)

## Data Invariants
1. **First-User-Admin Bootstrap Lock (`/system/bootstrap`)**:
   - Can only be created once when `/system/bootstrap` does not yet exist.
   - `adminUid` must equal `request.auth.uid`, `claimedAt` must equal `request.time`, and `/users/{uid}` must be created atomically in the same transaction with `role == 'admin'`.
   - Once created, `/system/bootstrap` is strictly immutable (`update` and `delete` denied for everyone).
2. **User Profiles (`/users/{userId}`)**:
   - Every user profile belongs strictly to `uid == userId == request.auth.uid` on creation.
   - `role: 'admin'` on creation is ONLY permitted when `/system/bootstrap` does not exist yet and is claimed atomically by `request.auth.uid` in `/system/bootstrap`. All subsequent registrations MUST have `role == 'user'`.
   - PII (`email`) can only be read by the owner (`request.auth.uid == userId`) or an administrator (`isAdmin()`).
   - Normal users can only update `displayName`, `tutDone`, and `updatedAt`; they cannot alter `role`, `uid`, `email`, or `createdAt`.
   - Administrators (`isAdmin()`) can update `role` on user profiles, except `uid`, `email`, and `createdAt` remain immutable.
3. **Cloud Saves (`/saves/{userId}`)**:
   - Readable and writable only by the owning player (`request.auth.uid == userId`) or an administrator.
   - `userId` is immutable and must match `userId` path variable; `updatedAt` must equal `request.time`.
4. **Global Layout Config (`/config/layout`)**:
   - Readable (`get`) by authenticated players so everyone plays the admin-published bunker layout; writable ONLY by administrators (`isAdmin()`).

## Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read/write**: Any read or write with `request.auth == null`.
2. **Second user claiming admin on signup**: User B attempts `create /users/uidB` with `role: 'admin'` after `/system/bootstrap` already exists.
3. **Bootstrap hijack/overwrite**: User B attempts `create` or `update` on `/system/bootstrap` after it exists.
4. **Self-promotion via update**: Normal user A (`role: 'user'`) sends `update /users/uidA` with `{ role: 'admin', updatedAt: request.time }`.
5. **Ghost/shadow field injection**: User sends `create /users/uidA` with extra field `isSuperUser: true`.
6. **UID spoofing on profile create**: User B creates `/users/uidB` with `uid: 'uidA'`.
7. **PII leak via get**: Normal user B calls `get /users/uidA`.
8. **PII scrape via list**: Normal user B calls `list /users` without restricting to `uid == request.auth.uid`.
9. **Save cross-write**: User B attempts `set /saves/uidA` to overwrite User A's survival game.
10. **Non-admin layout overwrite**: Normal user B attempts `set /config/layout` to modify global bunker zones.
11. **Path ID poisoning**: Attacker attempts `create /users/bad..id$123` or a >128 char document ID.
12. **Timestamp tampering**: User sends `createdAt` or `updatedAt` forged in the past/future instead of `request.time`.
