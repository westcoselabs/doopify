# Team Setup

Invite and manage team members with role-based access.

---

## Roles

| Role | Access |
|---|---|
| `OWNER` | Store operations, team management and read-only Developer diagnostics. |
| `ADMIN` | Store operations without Team or Developer access. |
| `STAFF` | Read and standard mutation access, including business settings. |

The last active owner cannot be disabled or demoted. Infrastructure credentials are never managed in the admin.

---

## Inviting a team member

1. Go to **System → Team** in the admin.
2. Click **Invite member**.
3. Enter the email address and select a role.
4. Click **Send invite**.

Share the single-use invite link returned by the panel with the invitee. It expires after seven days.

They accept at `/join?token=<token>` and set their password on first login.

---

## Managing existing users

From **System → Team**:

- **Change role** — OWNER can change any team member's role (except demoting the last owner).
- **Disable** — Immediately revokes all sessions. The user cannot log in.
- **Reactivate** — Restores access.
- **Revoke invite** — Cancels a pending invite before it is accepted.
- **Resend invite** — Generates a new invite link to share (expires the previous token).

---

## Password management

Users can change their own password at **My account**.

Owners can trigger a password reset for any user:

1. Go to **System → Team**.
2. Open the user's actions.
3. Click **Send password reset**.

Share the generated reset link with the user. It is valid for 24 hours. All sessions are revoked on acceptance.

---

## Session management

Users can revoke their other active sessions at **My account → Revoke other sessions**.

Owners can view and revoke sessions for any user via the Team panel.

---

## Recovery: locked out of owner account

Use the CLI recovery tool:

```bash
npm run doopify:reset-owner
```

Creates the first OWNER if none exists, or resets any existing OWNER password and revokes all sessions.

See [docs/ADMIN_USER_RECOVERY_GUIDE.md](../ADMIN_USER_RECOVERY_GUIDE.md) for full procedures.
