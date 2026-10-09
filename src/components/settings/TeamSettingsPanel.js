"use client";

import { useCallback, useEffect, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminDropdown from '../admin/ui/AdminDropdown';
import AdminField from '../admin/ui/AdminField';
import AdminInput from '../admin/ui/AdminInput';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import SettingsPageSkeleton from './SettingsSkeletons';
import styles from './SettingsWorkspace.module.css';
import { getTeamAccessNotice, isKnownNonOwnerRole, isOwnerRole } from './team-settings.helpers';

const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'VIEWER', label: 'Viewer' },
];

const ROLE_DESCRIPTIONS = {
  OWNER: 'Full access including environment diagnostics, team management, and store settings.',
  ADMIN: 'Products, orders, customers, discounts, media, shipping, and email templates.',
  STAFF: 'Orders, fulfillment, customers, and notes. Limited product view.',
  VIEWER: 'Read-only access to the admin.',
};

function roleChipTone(role) {
  if (role === 'OWNER') return 'success';
  if (role === 'ADMIN') return 'neutral';
  if (role === 'STAFF') return 'neutral';
  return 'neutral';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return `${new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} UTC`;
  } catch {
    return '—';
  }
}

function getUserDisplayName(user) {
  return user.firstName || user.lastName
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : user.email;
}

function initialsFromText(text) {
  if (!text) return '?';
  const parts = text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0][0].toUpperCase();
}

function getUserInitials(user) {
  return initialsFromText(getUserDisplayName(user));
}

function getInviteInitials(email) {
  return initialsFromText(email);
}

function parseTeamApiError(response, payload, fallbackMessage) {
  const apiError = typeof payload?.error === 'string' ? payload.error.trim() : '';
  if (apiError) return apiError;

  if (response.status === 403) {
    return 'Team management is owner-only in private beta. Sign in as an OWNER to create users or change roles.';
  }

  return `${fallbackMessage} (HTTP ${response.status})`;
}

export default function TeamSettingsPanel({ currentUserRole, currentUserId, initialUsers = null, initialInvites = null }) {
  const isOwner = isOwnerRole(currentUserRole);
  const isKnownNonOwner = isKnownNonOwnerRole(currentUserRole);

  const [users, setUsers] = useState(initialUsers || []);
  const [invites, setInvites] = useState(initialInvites || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessNotice, setAccessNotice] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('invite'); // invite | create
  const [drawerForm, setDrawerForm] = useState({
    email: '',
    role: 'STAFF',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [drawerNotice, setDrawerNotice] = useState('');

  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});
  const [actionNotice, setActionNotice] = useState({});
  const [editRoleUserId, setEditRoleUserId] = useState('');
  const [editRoleValue, setEditRoleValue] = useState('STAFF');
  const [editProfileUserId, setEditProfileUserId] = useState('');
  const [editProfileForm, setEditProfileForm] = useState({ firstName: '', lastName: '' });
  const [openUserMenuId, setOpenUserMenuId] = useState('');
  const [openInviteMenuId, setOpenInviteMenuId] = useState('');

  const loadTeam = useCallback(async () => {
    if (!currentUserRole) {
      setUsers([]);
      setInvites([]);
      setError('');
      setAccessNotice('');
      return;
    }

    if (!isOwner) {
      setUsers([]);
      setInvites([]);
      setError('');
      setAccessNotice(getTeamAccessNotice(currentUserRole));
      return;
    }

    setLoading(true);
    setError('');
    setAccessNotice('');
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch('/api/team/users', { cache: 'no-store' }),
        fetch('/api/team/invites', { cache: 'no-store' }),
      ]);
      const usersPayload = await usersRes.json().catch(() => ({}));
      const invitesPayload = await invitesRes.json().catch(() => ({}));

      if (usersRes.status === 403 || invitesRes.status === 403) {
        setUsers([]);
        setInvites([]);
        setAccessNotice('Team management is owner-only in private beta. Ask an owner to manage invites, roles, and account status.');
        return;
      }

      if (!usersRes.ok || !invitesRes.ok) {
        const message = usersPayload?.error || invitesPayload?.error || 'Failed to load team data.';
        throw new Error(message);
      }

      setUsers(usersPayload?.data?.users || []);
      setInvites(invitesPayload?.data?.invites || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load team data.');
    } finally {
      setLoading(false);
    }
  }, [currentUserRole, isOwner]);

  useEffect(() => {
    if (initialUsers && initialInvites) return;
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    loadTeam();
  }, [loadTeam, initialUsers, initialInvites]);

  const openInviteDrawer = () => {
    setDrawerMode('invite');
    setDrawerForm({ email: '', role: 'STAFF', firstName: '', lastName: '', password: '', confirmPassword: '' });
    setDrawerError('');
    setDrawerNotice('');
    setDrawerOpen(true);
  };

  const openCreateDrawer = () => {
    setDrawerMode('create');
    setDrawerForm({ email: '', role: 'STAFF', firstName: '', lastName: '', password: '', confirmPassword: '' });
    setDrawerError('');
    setDrawerNotice('');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (drawerLoading) return;
    setDrawerOpen(false);
  };

  const setDrawerField = (key, value) => {
    setDrawerForm((f) => ({ ...f, [key]: value }));
    if (drawerError) setDrawerError('');
  };

  const handleDrawerSubmit = async () => {
    if (drawerLoading) return;
    setDrawerError('');
    setDrawerNotice('');
    setDrawerLoading(true);

    try {
      if (drawerMode === 'invite') {
        const res = await fetch('/api/team/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: drawerForm.email, role: drawerForm.role }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDrawerError(parseTeamApiError(res, payload, 'Failed to send invite.'));
          return;
        }
        const token = payload?.data?.inviteToken;
        const inviteUrl = `${window.location.origin}/join?token=${token}`;
        setDrawerNotice(`Invite created. Share this link with ${drawerForm.email}:\n${inviteUrl}`);
        await loadTeam();
      } else {
        if (drawerForm.password !== drawerForm.confirmPassword) {
          setDrawerError('Passwords do not match.');
          return;
        }
        const res = await fetch('/api/team/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: drawerForm.email,
            role: drawerForm.role,
            firstName: drawerForm.firstName || undefined,
            lastName: drawerForm.lastName || undefined,
            password: drawerForm.password,
            confirmPassword: drawerForm.confirmPassword,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDrawerError(parseTeamApiError(res, payload, 'Failed to create user.'));
          return;
        }
        setDrawerOpen(false);
        await loadTeam();
      }
    } catch {
      setDrawerError('An error occurred. Please try again.');
    } finally {
      setDrawerLoading(false);
    }
  };

  const patchUser = async (userId, action, extra = {}) => {
    setActionLoading((s) => ({ ...s, [userId]: true }));
    setActionError((s) => ({ ...s, [userId]: '' }));
    setActionNotice((s) => ({ ...s, [userId]: '' }));
    try {
      const res = await fetch(`/api/team/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [userId]: parseTeamApiError(res, payload, 'Role or status update failed.'),
        }));
        return;
      }
      setEditRoleUserId('');
      setEditProfileUserId('');
      setOpenUserMenuId('');
      await loadTeam();
    } catch {
      setActionError((s) => ({ ...s, [userId]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [userId]: false }));
    }
  };

  const openProfileEditor = (user) => {
    setEditProfileUserId(user.id);
    setEditProfileForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
    setActionError((s) => ({ ...s, [user.id]: '' }));
  };

  const deleteDisabledUserAccount = async (user) => {
    if (user.isActive) return;

    const proceed = window.confirm('Delete this disabled user permanently? This cannot be undone.');
    if (!proceed) return;

    const typed = window.prompt(
      `Type ${user.email} or DELETE to confirm permanent deletion.`,
      ''
    );
    if (typed == null) return;

    const normalizedTyped = typed.trim();
    if (normalizedTyped !== user.email && normalizedTyped.toUpperCase() !== 'DELETE') {
      setActionError((s) => ({
        ...s,
        [user.id]: 'Confirmation did not match. Type the user email or DELETE to confirm.',
      }));
      return;
    }

    setActionLoading((s) => ({ ...s, [user.id]: true }));
    setActionError((s) => ({ ...s, [user.id]: '' }));
    setActionNotice((s) => ({ ...s, [user.id]: '' }));
    try {
      const res = await fetch(`/api/team/users/${user.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [user.id]: parseTeamApiError(res, payload, 'Failed to delete user account.'),
        }));
        return;
      }

      setOpenUserMenuId('');
      setEditProfileUserId('');
      setEditRoleUserId('');
      await loadTeam();
    } catch {
      setActionError((s) => ({ ...s, [user.id]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [user.id]: false }));
    }
  };

  const requestPasswordResetLink = async (userId, email) => {
    setActionLoading((s) => ({ ...s, [userId]: true }));
    setActionError((s) => ({ ...s, [userId]: '' }));
    setActionNotice((s) => ({ ...s, [userId]: '' }));
    try {
      const res = await fetch(`/api/team/users/${userId}/reset-password`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [userId]: parseTeamApiError(res, payload, 'Failed to generate password reset link.'),
        }));
        return;
      }

      const token = payload?.data?.resetToken;
      const resetUrl = `${window.location.origin}/reset-password?token=${token}`;
      setActionNotice((s) => ({ ...s, [userId]: `Password reset link for ${email}:\n${resetUrl}` }));
    } catch {
      setActionError((s) => ({ ...s, [userId]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [userId]: false }));
    }
  };

  const revokeUserSessionsAction = async (userId, email) => {
    if (!window.confirm(`Revoke all active sessions for ${email}?`)) return;

    setActionLoading((s) => ({ ...s, [userId]: true }));
    setActionError((s) => ({ ...s, [userId]: '' }));
    setActionNotice((s) => ({ ...s, [userId]: '' }));
    try {
      const res = await fetch(`/api/team/users/${userId}/sessions`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [userId]: parseTeamApiError(res, payload, 'Failed to revoke sessions.'),
        }));
        return;
      }

      const revokedCount = Number(payload?.data?.revoked || 0);
      setActionNotice((s) => ({
        ...s,
        [userId]: revokedCount > 0
          ? `Revoked ${revokedCount} session(s) for ${email}.`
          : `No active sessions found for ${email}.`,
      }));
    } catch {
      setActionError((s) => ({ ...s, [userId]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [userId]: false }));
    }
  };

  const revokeInvite = async (inviteId, email) => {
    if (!window.confirm(`Revoke invite for ${email}?`)) return;

    setActionLoading((s) => ({ ...s, [inviteId]: true }));
    setActionError((s) => ({ ...s, [inviteId]: '' }));
    setActionNotice((s) => ({ ...s, [inviteId]: '' }));
    try {
      const res = await fetch(`/api/team/invites/${inviteId}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [inviteId]: parseTeamApiError(res, payload, 'Failed to revoke invite.'),
        }));
        return;
      }

      setOpenInviteMenuId('');
      await loadTeam();
    } catch {
      setActionError((s) => ({ ...s, [inviteId]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [inviteId]: false }));
    }
  };

  const resendInvite = async (inviteId, email) => {
    setActionLoading((s) => ({ ...s, [inviteId]: true }));
    setActionError((s) => ({ ...s, [inviteId]: '' }));
    setActionNotice((s) => ({ ...s, [inviteId]: '' }));
    try {
      const res = await fetch(`/api/team/invites/${inviteId}/resend`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((s) => ({
          ...s,
          [inviteId]: parseTeamApiError(res, payload, 'Failed to resend invite.'),
        }));
        return;
      }

      const token = payload?.data?.inviteToken;
      const inviteUrl = `${window.location.origin}/join?token=${token}`;
      setActionNotice((s) => ({ ...s, [inviteId]: `New invite link for ${email}:\n${inviteUrl}` }));
      setOpenInviteMenuId('');
      await loadTeam();
    } catch {
      setActionError((s) => ({ ...s, [inviteId]: 'An error occurred.' }));
    } finally {
      setActionLoading((s) => ({ ...s, [inviteId]: false }));
    }
  };

  const activeOwnerCount = users.filter((user) => user.role === 'OWNER' && user.isActive).length;
  const ownerCount = users.filter((user) => user.role === 'OWNER').length;

  return (
    <div className={styles.configStack}>
      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <h3>Team</h3>
          <p className={styles.cardSubtext}>
            Manage who has access to your Doopify admin. Only the Owner can manage team accounts.
          </p>
        </div>

        <AdminCard variant="inset" className={styles.compactSettingsCard} as="section">
          <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
            <h4>Roles &amp; permissions</h4>
          </div>
          <div className={styles.compactDrawerGrid}>
            {ROLE_OPTIONS.map((r) => (
              <p key={r.value} className={styles.compactMeta}>
                <strong>{r.label}:</strong> {ROLE_DESCRIPTIONS[r.value]}
              </p>
            ))}
          </div>
        </AdminCard>
      </section>

      {isKnownNonOwner ? (
        <AdminCard variant="card" className={styles.compactSettingsCard}>
          <p className={styles.statusText}>
            Team access is restricted for your role. Owners can manage invites, role changes, and account status.
          </p>
        </AdminCard>
      ) : null}

      {accessNotice ? (
        <AdminCard variant="card" className={styles.compactSettingsCard}>
          <p className={styles.statusText}>{accessNotice}</p>
        </AdminCard>
      ) : null}

      {loading ? <SettingsPageSkeleton section="team" /> : null}

      {error ? (
        <AdminCard variant="card" className={styles.compactSettingsCard}>
          <p className={`${styles.statusText} ${styles.teamRowError}`}>{error}</p>
        </AdminCard>
      ) : null}

      {!loading && !error ? (
        <>
          <section className={styles.configSection}>
            <div className={styles.sectionHeading}>
              <h3>Team members</h3>
              {isOwner ? (
                <div className={styles.teamHeaderActions}>
                  <AdminButton size="sm" variant="secondary" onClick={openInviteDrawer}>Invite member</AdminButton>
                  <AdminButton size="sm" variant="ghost" onClick={openCreateDrawer}>Create directly</AdminButton>
                </div>
              ) : null}
            </div>

            {users.length === 0 ? (
              <AdminCard variant="card" className={styles.compactSettingsCard}>
                <p className={styles.statusText}>
                  No team members yet. Invite your first teammate to share access and keep ownership recovery-safe.
                </p>
              </AdminCard>
            ) : (
              users.map((user) => {
                const isOnlyActiveOwner = user.role === 'OWNER' && user.isActive && activeOwnerCount <= 1;
                const isOnlyOwnerAccount = user.role === 'OWNER' && ownerCount <= 1;
                const canDeleteDisabledUser =
                  !user.isActive &&
                  user.id !== currentUserId &&
                  !isOnlyOwnerAccount;

                return (
                  <AdminCard key={user.id} variant="inset" className={`${styles.brandRow} ${styles.teamRowCard}`} spotlight>
                    <div className={styles.teamRowLayout}>
                      <div className={styles.teamAvatar} aria-hidden="true">{getUserInitials(user)}</div>

                      <div className={styles.teamRowContent}>
                        <div className={styles.teamNameLine}>
                          <h4 className={styles.teamName}>{getUserDisplayName(user)}</h4>
                          <div className={styles.teamChipRow}>
                            <AdminStatusChip tone={roleChipTone(user.role)}>{user.role}</AdminStatusChip>
                            {!user.isActive ? <AdminStatusChip tone="danger">Disabled</AdminStatusChip> : null}
                          </div>
                        </div>
                        <p className={styles.compactMeta}>{user.email}</p>
                        <p className={styles.compactMeta}>Last login: {formatDate(user.lastLoginAt)}</p>
                        {!user.isActive ? (
                          <p className={styles.teamDisabledHelperText}>
                            Disabled users cannot sign in. Delete is available after disable if you want to remove the account.
                          </p>
                        ) : null}
                        {isOnlyActiveOwner ? (
                          <p className={styles.teamOwnerGuardHint}>Add another active owner before disabling this account.</p>
                        ) : null}
                        {actionError[user.id] ? <p className={styles.teamRowError}>{actionError[user.id]}</p> : null}
                        {actionNotice[user.id] ? <p className={styles.teamRowNotice}>{actionNotice[user.id]}</p> : null}
                      </div>

                      {isOwner ? (
                        <div className={styles.teamRowActions}>
                          <AdminDropdown
                            align="end"
                            open={openUserMenuId === user.id}
                            onOpenChange={(open) => setOpenUserMenuId(open ? user.id : '')}
                            trigger={(
                              <AdminButton
                                size="sm"
                                variant="secondary"
                                aria-label={`Manage ${user.email}`}
                                disabled={actionLoading[user.id]}
                              >
                                Manage
                              </AdminButton>
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => openProfileEditor(user)}
                            >
                              Edit name
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditRoleUserId(user.id);
                                setEditRoleValue(user.role);
                                setActionError((s) => ({ ...s, [user.id]: '' }));
                              }}
                            >
                              Change role
                            </button>
                            {user.isActive ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => requestPasswordResetLink(user.id, user.email)}
                                  disabled={actionLoading[user.id]}
                                >
                                  {actionLoading[user.id] ? 'Generating reset link...' : 'Reset password'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => revokeUserSessionsAction(user.id, user.email)}
                                  disabled={actionLoading[user.id]}
                                >
                                  {actionLoading[user.id] ? 'Revoking sessions...' : 'Revoke sessions'}
                                </button>
                                <button
                                  type="button"
                                  className={isOnlyActiveOwner ? styles.teamMenuItemDisabled : styles.teamMenuItemDanger}
                                  disabled={isOnlyActiveOwner || actionLoading[user.id]}
                                  onClick={() => {
                                    if (!window.confirm(`Disable ${user.email}? They will be signed out immediately.`)) return;
                                    patchUser(user.id, 'disable');
                                  }}
                                >
                                  {actionLoading[user.id] ? 'Disabling...' : 'Disable user'}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => patchUser(user.id, 'reactivate')}
                                  disabled={actionLoading[user.id]}
                                >
                                  {actionLoading[user.id] ? 'Reactivating...' : 'Reactivate user'}
                                </button>
                                {user.id !== currentUserId ? (
                                  <button
                                    type="button"
                                    className={canDeleteDisabledUser ? styles.teamMenuItemDanger : styles.teamMenuItemDisabled}
                                    onClick={() => deleteDisabledUserAccount(user)}
                                    disabled={!canDeleteDisabledUser || actionLoading[user.id]}
                                  >
                                    {actionLoading[user.id] ? 'Deleting...' : 'Delete account'}
                                  </button>
                                ) : null}
                              </>
                            )}
                          </AdminDropdown>
                        </div>
                      ) : null}
                    </div>

                    {isOwner && editRoleUserId === user.id ? (
                      <div className={styles.teamRoleEditor}>
                        <p className={styles.teamRoleEditorTitle}>Change role</p>
                        <p className={styles.compactMeta}>Current role: {user.role}</p>
                        <div className={styles.teamRoleEditorControls}>
                          <AdminSelect
                            value={editRoleValue}
                            onChange={(value) => setEditRoleValue(value)}
                            options={ROLE_OPTIONS}
                          />
                          <AdminButton
                            size="sm"
                            variant="primary"
                            disabled={actionLoading[user.id]}
                            onClick={() => patchUser(user.id, 'set_role', { role: editRoleValue })}
                          >
                            Save
                          </AdminButton>
                          <AdminButton
                            size="sm"
                            variant="ghost"
                            disabled={actionLoading[user.id]}
                            onClick={() => setEditRoleUserId('')}
                          >
                            Cancel
                          </AdminButton>
                        </div>
                      </div>
                    ) : null}

                    {isOwner && editProfileUserId === user.id ? (
                      <div className={styles.teamProfileEditor}>
                        <p className={styles.teamProfileEditorTitle}>Edit name</p>
                        <div className={styles.teamProfileEditorGrid}>
                          <AdminField label="First name">
                            <AdminInput
                              value={editProfileForm.firstName}
                              onChange={(event) =>
                                setEditProfileForm((current) => ({ ...current, firstName: event.target.value }))
                              }
                              placeholder="First name"
                            />
                          </AdminField>
                          <AdminField label="Last name">
                            <AdminInput
                              value={editProfileForm.lastName}
                              onChange={(event) =>
                                setEditProfileForm((current) => ({ ...current, lastName: event.target.value }))
                              }
                              placeholder="Last name"
                            />
                          </AdminField>
                        </div>
                        <div className={styles.teamRoleEditorControls}>
                          <AdminButton
                            size="sm"
                            variant="primary"
                            disabled={actionLoading[user.id]}
                            onClick={() =>
                              patchUser(user.id, 'update_profile', {
                                firstName: editProfileForm.firstName,
                                lastName: editProfileForm.lastName,
                              })
                            }
                          >
                            {actionLoading[user.id] ? 'Saving...' : 'Save'}
                          </AdminButton>
                          <AdminButton
                            size="sm"
                            variant="ghost"
                            disabled={actionLoading[user.id]}
                            onClick={() => setEditProfileUserId('')}
                          >
                            Cancel
                          </AdminButton>
                        </div>
                      </div>
                    ) : null}
                  </AdminCard>
                );
              })
            )}
          </section>

          {isOwner ? (
            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Pending invites</h3>
              </div>
              {invites.length === 0 ? (
                <AdminCard variant="card" className={styles.compactSettingsCard}>
                  <p className={styles.statusText}>
                    No pending invites. Use Invite member to create a single-use join link.
                  </p>
                </AdminCard>
              ) : (
                invites.map((invite) => (
                  <AdminCard key={invite.id} variant="inset" className={`${styles.brandRow} ${styles.teamRowCard}`} spotlight>
                    <div className={styles.teamRowLayout}>
                      <div className={styles.teamAvatar} aria-hidden="true">{getInviteInitials(invite.email)}</div>
                      <div className={styles.teamRowContent}>
                        <div className={styles.teamNameLine}>
                          <h4 className={styles.teamName}>{invite.email}</h4>
                          <div className={styles.teamChipRow}>
                            <AdminStatusChip tone={roleChipTone(invite.role)}>{invite.role}</AdminStatusChip>
                          </div>
                        </div>
                        <p className={styles.compactMeta}>Expires: {formatDate(invite.expiresAt)}</p>
                        {actionError[invite.id] ? <p className={styles.teamRowError}>{actionError[invite.id]}</p> : null}
                        {actionNotice[invite.id] ? <p className={styles.teamRowNotice}>{actionNotice[invite.id]}</p> : null}
                      </div>
                      <div className={styles.teamRowActions}>
                        <AdminDropdown
                          align="end"
                          open={openInviteMenuId === invite.id}
                          onOpenChange={(open) => setOpenInviteMenuId(open ? invite.id : '')}
                          trigger={(
                            <AdminButton
                              size="sm"
                              variant="secondary"
                              aria-label={`Manage invite ${invite.email}`}
                              disabled={actionLoading[invite.id]}
                            >
                              Manage
                            </AdminButton>
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => resendInvite(invite.id, invite.email)}
                            disabled={actionLoading[invite.id]}
                          >
                            {actionLoading[invite.id] ? 'Resending...' : 'Resend'}
                          </button>
                          <button
                            type="button"
                            className={styles.teamMenuItemDanger}
                            onClick={() => revokeInvite(invite.id, invite.email)}
                            disabled={actionLoading[invite.id]}
                          >
                            Revoke
                          </button>
                        </AdminDropdown>
                      </div>
                    </div>
                  </AdminCard>
                ))
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <AdminDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'invite' ? 'Invite team member' : 'Create team member'}
        subtitle={drawerMode === 'invite' ? 'Send an invite link via email.' : 'Create an account directly and share credentials securely.'}
      >
        <div className={styles.drawerStack}>
          <AdminCard variant="card" className={styles.compactDrawerCard} as="section">
            <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
              <h4>Account details</h4>
            </div>

            <div className={styles.fieldStack}>
              <AdminField label="Email">
                <AdminInput
                  value={drawerForm.email}
                  onChange={(e) => setDrawerField('email', e.target.value)}
                  placeholder="team@example.com"
                  type="email"
                />
              </AdminField>

              <AdminField label="Role">
                <AdminSelect
                  value={drawerForm.role}
                  onChange={(value) => setDrawerField('role', value)}
                  options={ROLE_OPTIONS}
                />
                <p className={`${styles.compactMeta} ${styles.teamHintTop}`}>
                  {ROLE_DESCRIPTIONS[drawerForm.role]}
                </p>
              </AdminField>

              {drawerMode === 'create' ? (
                <>
                  <AdminField label="First name (optional)">
                    <AdminInput
                      value={drawerForm.firstName}
                      onChange={(e) => setDrawerField('firstName', e.target.value)}
                      placeholder="First name"
                    />
                  </AdminField>
                  <AdminField label="Last name (optional)">
                    <AdminInput
                      value={drawerForm.lastName}
                      onChange={(e) => setDrawerField('lastName', e.target.value)}
                      placeholder="Last name"
                    />
                  </AdminField>
                  <AdminField label="Password">
                    <AdminInput
                      value={drawerForm.password}
                      onChange={(e) => setDrawerField('password', e.target.value)}
                      placeholder="Min 8 characters"
                      type="password"
                    />
                  </AdminField>
                  <AdminField label="Confirm password">
                    <AdminInput
                      value={drawerForm.confirmPassword}
                      onChange={(e) => setDrawerField('confirmPassword', e.target.value)}
                      placeholder="Confirm password"
                      type="password"
                    />
                  </AdminField>
                </>
              ) : null}
            </div>

            {drawerError ? (
              <p className={styles.teamDrawerError}>{drawerError}</p>
            ) : null}

            {drawerNotice ? (
              <p className={styles.teamDrawerNotice}>{drawerNotice}</p>
            ) : null}

            <div className={`${styles.compactActionRow} ${styles.teamDrawerActions}`}>
              <AdminButton
                variant="primary"
                disabled={drawerLoading || !drawerForm.email}
                onClick={handleDrawerSubmit}
              >
                {drawerLoading
                  ? drawerMode === 'invite' ? 'Sending...' : 'Creating...'
                  : drawerMode === 'invite' ? 'Send invite' : 'Create account'}
              </AdminButton>
              <AdminButton variant="ghost" disabled={drawerLoading} onClick={closeDrawer}>
                Cancel
              </AdminButton>
            </div>
          </AdminCard>

          {drawerMode === 'invite' ? (
            <div className={styles.compactInfoStrip}>
              <p className={styles.compactInfoStripTitle}>About invite links</p>
              <p>Invite links are single-use, expire after 7 days, and are stored hashed. Share the generated link securely with the invitee - it is not sent by email automatically.</p>
            </div>
          ) : (
            <div className={styles.compactInfoStrip}>
              <p className={styles.compactInfoStripTitle}>About direct creation</p>
              <p>Share credentials with the new team member securely. Advise them to change their password on first login.</p>
            </div>
          )}
        </div>
      </AdminDrawer>
    </div>
  );
}
