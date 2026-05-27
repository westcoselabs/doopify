"use client";

import { useState } from 'react';
import { useEffect } from 'react';
import { useCallback } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminField from '../admin/ui/AdminField';
import AdminInput from '../admin/ui/AdminInput';
import { SettingsCardSkeleton } from './SettingsSkeletons';
import styles from './SettingsWorkspace.module.css';

export default function AccountSettingsPanel({ currentUser }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionResult, setSessionResult] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEnrollment, setMfaEnrollment] = useState(null);
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState([]);
  const [mfaActionLoading, setMfaActionLoading] = useState(false);

  const isOwner = currentUser?.role === 'OWNER';

  const loadMfaStatus = useCallback(async () => {
    if (!isOwner) return;
    setMfaLoading(true);
    setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to load MFA status');
      setMfaStatus(payload?.data || null);
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Failed to load MFA status');
    } finally {
      setMfaLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    loadMfaStatus();
  }, [loadMfaStatus]);

  const setField = (key, value) => {
    setPasswordForm((f) => ({ ...f, [key]: value }));
    if (passwordError) setPasswordError('');
    if (passwordSuccess) setPasswordSuccess(false);
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (passwordLoading) return;

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordError('');
    setPasswordSuccess(false);
    setPasswordLoading(true);

    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPasswordError(payload?.error || 'Failed to change password.');
        return;
      }

      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    } catch {
      setPasswordError('Unable to reach the server. Try again in a moment.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeOthers = async () => {
    if (sessionLoading) return;
    if (!window.confirm('Sign out of all other sessions? This cannot be undone.')) return;

    setSessionError('');
    setSessionResult('');
    setSessionLoading(true);

    try {
      const res = await fetch('/api/auth/sessions/revoke-others', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSessionError(payload?.error || 'Failed to revoke sessions.');
        return;
      }

      const count = payload?.data?.revoked ?? 0;
      setSessionResult(count === 0 ? 'No other sessions to revoke.' : `${count} other session(s) signed out.`);
    } catch {
      setSessionError('Unable to reach the server.');
    } finally {
      setSessionLoading(false);
    }
  };

  const startMfaEnrollment = async () => {
    if (mfaActionLoading) return;
    setMfaActionLoading(true);
    setMfaError('');
    setMfaRecoveryCodes([]);
    try {
      const res = await fetch('/api/auth/mfa/enroll/start', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to start MFA enrollment');
      setMfaEnrollment(payload?.data || null);
      setMfaCode('');
      await loadMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Failed to start MFA enrollment');
    } finally {
      setMfaActionLoading(false);
    }
  };

  const verifyMfaEnrollment = async () => {
    if (mfaActionLoading || !mfaCode.trim()) return;
    setMfaActionLoading(true);
    setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to verify MFA enrollment');
      setMfaRecoveryCodes(payload?.data?.recoveryCodes || []);
      setMfaEnrollment(null);
      setMfaCode('');
      await loadMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Failed to verify MFA enrollment');
    } finally {
      setMfaActionLoading(false);
    }
  };

  const regenerateRecoveryCodes = async () => {
    if (mfaActionLoading) return;
    if (!window.confirm('Regenerate recovery codes? Existing codes will stop working immediately.')) return;
    setMfaActionLoading(true);
    setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa/recovery/regenerate', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to regenerate recovery codes');
      setMfaRecoveryCodes(payload?.data?.recoveryCodes || []);
      await loadMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Failed to regenerate recovery codes');
    } finally {
      setMfaActionLoading(false);
    }
  };

  const disableMfa = async () => {
    if (mfaActionLoading) return;
    if (!window.confirm('Disable owner MFA? This lowers account security.')) return;
    setMfaActionLoading(true);
    setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa/disable', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to disable MFA');
      setMfaEnrollment(null);
      setMfaRecoveryCodes([]);
      setMfaCode('');
      await loadMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Failed to disable MFA');
    } finally {
      setMfaActionLoading(false);
    }
  };

  return (
    <div className={styles.configStack}>
      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <h3>Account</h3>
          <p className={styles.cardSubtext}>
            Manage your own password and active sessions.
          </p>
        </div>

        {currentUser ? (
          <AdminCard variant="inset" className={styles.compactSettingsCard} as="section">
            <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
              <h4>Signed in as</h4>
            </div>
            <p className={styles.compactMeta}>
              <strong>{currentUser.email}</strong> &middot; {currentUser.role}
              {currentUser.firstName ? ` · ${currentUser.firstName}${currentUser.lastName ? ` ${currentUser.lastName}` : ''}` : ''}
            </p>
          </AdminCard>
        ) : null}
      </section>

      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <h3>Change password</h3>
        </div>

        <AdminCard variant="inset" className={styles.compactSettingsCard} as="section">
          <form onSubmit={handleChangePassword}>
            <div className={styles.fieldStack}>
              <AdminField label="Current password">
                <AdminInput
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setField('currentPassword', e.target.value)}
                  placeholder="Your current password"
                  autoComplete="current-password"
                />
              </AdminField>
              <AdminField label="New password">
                <AdminInput
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setField('newPassword', e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </AdminField>
              <AdminField label="Confirm new password">
                <AdminInput
                  type="password"
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) => setField('confirmNewPassword', e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
              </AdminField>
            </div>

            {passwordError ? (
              <p style={{ color: 'var(--color-danger, #e55)', fontSize: 13, marginTop: 8 }}>{passwordError}</p>
            ) : null}
            {passwordSuccess ? (
              <p style={{ color: 'var(--color-success, #4c8)', fontSize: 13, marginTop: 8 }}>
                Password updated. Other sessions have been signed out.
              </p>
            ) : null}

            <div className={styles.compactActionRow} style={{ marginTop: 16 }}>
              <AdminButton
                type="submit"
                variant="primary"
                disabled={passwordLoading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmNewPassword}
              >
                {passwordLoading ? 'Updating…' : 'Update password'}
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      </section>

      <section className={styles.configSection}>
        <div className={styles.sectionHeading}>
          <h3>Sessions</h3>
        </div>

        <AdminCard variant="inset" className={styles.compactSettingsCard} as="section">
          <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
            <h4>Sign out of other sessions</h4>
          </div>
          <p className={styles.statusText}>
            If you believe your account has been accessed from another device, you can sign out of all other active sessions. Your current session will remain active.
          </p>

          {sessionError ? (
            <p style={{ color: 'var(--color-danger, #e55)', fontSize: 13, marginTop: 8 }}>{sessionError}</p>
          ) : null}
          {sessionResult ? (
            <p style={{ color: 'var(--color-success, #4c8)', fontSize: 13, marginTop: 8 }}>{sessionResult}</p>
          ) : null}

          <div className={styles.compactActionRow} style={{ marginTop: 12 }}>
            <AdminButton variant="secondary" disabled={sessionLoading} onClick={handleRevokeOthers}>
              {sessionLoading ? 'Signing out…' : 'Sign out other sessions'}
            </AdminButton>
          </div>
        </AdminCard>
      </section>

      {isOwner ? (
        <section className={styles.configSection}>
          <div className={styles.sectionHeading}>
            <h3>Owner MFA</h3>
          </div>

          <AdminCard variant="inset" className={styles.compactSettingsCard} as="section">
            {mfaLoading ? <SettingsCardSkeleton fields={1} includeTitle={false} actions={0} /> : null}
            {!mfaLoading && mfaStatus ? (
              <p className={styles.statusText}>
                {mfaStatus.enabled
                  ? `MFA enabled. Recovery codes remaining: ${mfaStatus.recoveryCodesRemaining}.`
                  : `MFA not enabled.${mfaStatus.gracePeriodEndsAt ? ` Grace ends ${new Date(mfaStatus.gracePeriodEndsAt).toLocaleString()}.` : ''}`}
              </p>
            ) : null}

            {mfaEnrollment ? (
              <div className={styles.fieldStack}>
                <AdminField label="Manual setup key">
                  <AdminInput readOnly value={mfaEnrollment.secret || ''} />
                </AdminField>
                <AdminField label="OTPAuth URI">
                  <AdminInput readOnly value={mfaEnrollment.otpAuthUri || ''} />
                </AdminField>
                <AdminField label="Verification code">
                  <AdminInput
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="6-digit authenticator code"
                  />
                </AdminField>
                <div className={styles.compactActionRow}>
                  <AdminButton variant="primary" size="sm" disabled={mfaActionLoading || !mfaCode.trim()} onClick={verifyMfaEnrollment}>
                    {mfaActionLoading ? 'Verifying...' : 'Verify and enable MFA'}
                  </AdminButton>
                </div>
              </div>
            ) : null}

            {mfaRecoveryCodes.length ? (
              <div style={{ marginTop: 12 }}>
                <p className={styles.statusText}>
                  Recovery codes are shown once. Save them in your secure password manager.
                </p>
                <div className={styles.warningTagList}>
                  {mfaRecoveryCodes.map((code) => (
                    <span key={code} className={styles.codeToken}>
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {mfaError ? <p style={{ color: 'var(--color-danger, #e55)', fontSize: 13, marginTop: 8 }}>{mfaError}</p> : null}

            <div className={styles.compactActionRow} style={{ marginTop: 12 }}>
              <AdminButton variant="secondary" size="sm" disabled={mfaActionLoading} onClick={startMfaEnrollment}>
                {mfaActionLoading ? 'Working...' : mfaStatus?.enabled ? 'Rotate authenticator setup' : 'Start MFA enrollment'}
              </AdminButton>
              <AdminButton variant="secondary" size="sm" disabled={mfaActionLoading || !mfaStatus?.enabled} onClick={regenerateRecoveryCodes}>
                Regenerate recovery codes
              </AdminButton>
              <AdminButton variant="danger" size="sm" disabled={mfaActionLoading || !mfaStatus?.enabled} onClick={disableMfa}>
                Disable MFA
              </AdminButton>
            </div>
          </AdminCard>
        </section>
      ) : null}
    </div>
  );
}
