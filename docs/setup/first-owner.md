# First-owner setup

Create the initial owner account for a fresh Doopify installation.

---

## Bootstrap rules

`/create-owner` and `POST /api/bootstrap/owner` are available only while no active `OWNER` exists.

Token behavior:

- If `SETUP_TOKEN` is set, the submitted token must match.
- In production (`NODE_ENV=production`), `SETUP_TOKEN` must be set.
- In local development, `SETUP_TOKEN` is optional.

After the first active owner is created, bootstrap closes permanently and returns `409 Conflict`.

---

## Local development

1. Start the app.
2. Open `http://localhost:3000/create-owner`.
3. Create the owner account.

If you set `SETUP_TOKEN` locally, enter that value on the form.

---

## Production (Vercel or any host)

1. Set `SETUP_TOKEN` before deploy:

```bash
SETUP_TOKEN=some-random-32-char-token
```

2. Open `https://<your-domain>/create-owner`.
3. Create the owner account with the token.
4. Revoke the token (remove or rotate `SETUP_TOKEN`) and redeploy.

---

## After owner creation

1. Log in at `/login`.
2. Configure Stripe in **System -> Developer**.
3. Configure shipping in **Settings -> Shipping & delivery**.
4. Create products in **Products**.
5. Run a paid test checkout.

Email transport is configured in deployment environment variables. See [email setup](email.md); customer message content is edited in Settings → Customer emails.

---

## Recovery

If owner access is lost:

```bash
npm run doopify:reset-owner
```

This connects via `DATABASE_URL`, creates a first owner if none exists, or resets an existing owner password and revokes sessions.

See [docs/ADMIN_USER_RECOVERY_GUIDE.md](../ADMIN_USER_RECOVERY_GUIDE.md) for full recovery procedures.
