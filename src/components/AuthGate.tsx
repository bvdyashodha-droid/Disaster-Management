import React, { useEffect, useState } from 'react';
import {
  Shield,
  Lock,
  WifiOff,
  Database,
  Globe,
  Mail,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Info,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
} from 'lucide-react';
import type { AuthUser, Language, UserRole } from '../types/dmis';
import type { HealthStatus } from '../lib/apiClient';
import { apiClient, setAuthToken } from '../lib/apiClient';
import {
  getOrCreateDeviceId,
  hasAnyOfflineCredential,
  saveOfflineCredential,
  setLocalOfflineOfficer,
  verifyOfflineCredential,
} from '../lib/offlineDb';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthGateProps {
  lang: Language;
  setLang: (lang: Language) => void;
  health: HealthStatus | null;
  isOnline: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

type ServerAuthView = 'signin' | 'forgot_password';
type OfflineAuthView = 'login' | 'setup_device';

export const AuthGate: React.FC<AuthGateProps> = ({
  lang,
  setLang,
  health,
  isOnline,
  onAuthenticated,
}) => {
  const isServerReady = Boolean(
    isOnline && health?.supabaseConfigured && health?.connected && health?.schemaReady
  );
  const needsServerBootstrap = isServerReady && !health?.hasOfficers;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [bootstrapPasscode, setBootstrapPasscode] = useState('');
  const [localRole, setLocalRole] = useState<UserRole>('gn_officer');
  const [offlinePassword, setOfflinePassword] = useState('');
  const [offlineConfirmPassword, setOfflineConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasOfflineAccount, setHasOfflineAccount] = useState<boolean>(true);
  const [offlineView, setOfflineView] = useState<OfflineAuthView>('login');

  useEffect(() => {
    let active = true;
    hasAnyOfflineCredential()
      .then((exists) => {
        if (!active) return;
        setHasOfflineAccount(exists);
      })
      .catch(() => {
        if (active) setHasOfflineAccount(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // First-run Super Admin email OTP challenge state (active when SMTP is configured)
  const [bootstrapChallenge, setBootstrapChallenge] = useState<{
    challengeId: string;
    email: string;
  } | null>(null);
  const [bootstrapOtpCode, setBootstrapOtpCode] = useState('');

  // Forgot Password flow state
  const [authView, setAuthView] = useState<ServerAuthView>('signin');
  const [resetUsername, setResetUsername] = useState('');
  const [forgotContactAdminMsg, setForgotContactAdminMsg] = useState<string | null>(null);
  const [forgotEmailChallenge, setForgotEmailChallenge] = useState<{
    challengeId: string;
    maskedEmail: string;
  } | null>(null);
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const submitBootstrapRequest = async (verification?: { challengeId: string; code: string }) => {
    const res = await apiClient.bootstrapAdmin({
      username,
      full_name: fullName,
      email,
      password,
      designation,
      phone,
      bootstrap_passcode: bootstrapPasscode || undefined,
      verification_challenge_id: verification?.challengeId,
      verification_code: verification?.code,
    });

    if (res.verificationRequired && res.challengeId) {
      setBootstrapChallenge({
        challengeId: res.challengeId,
        email: res.email || email,
      });
      setBootstrapOtpCode('');
      return;
    }

    if (res.token && res.user) {
      setAuthToken(res.token);
      await saveOfflineCredential(res.user, password).catch(() => undefined);
      onAuthenticated(res.user);
      return;
    }

    throw new Error('Unexpected server response during Super Admin setup.');
  };

  const handleServerAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    setSubmitting(true);
    try {
      if (needsServerBootstrap) {
        if (!email.trim()) {
          throw new Error(
            lang === 'si'
              ? 'ප්‍රධාන පරිපාලක ගිණුම සඳහා වලංගු විද්‍යුත් තැපෑලක් අවශ්‍ය වේ.'
              : 'A valid official email address is required for Super Admin registration.'
          );
        }
        await submitBootstrapRequest();
      } else {
        const res = await apiClient.login(username, password);
        setAuthToken(res.token);
        await saveOfflineCredential(res.user, password).catch(() => undefined);
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bootstrapChallenge) return;
    setError(null);
    const cleaned = bootstrapOtpCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) {
      setError(
        lang === 'si'
          ? 'කරුණාකර ඔබේ විද්‍යුත් තැපෑලට ලැබුණු ඉලක්කම් 6 කේතය ඇතුළත් කරන්න.'
          : 'Please enter the 6-digit verification code sent to your email.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await submitBootstrapRequest({
        challengeId: bootstrapChallenge.challengeId,
        code: cleaned,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapResendOtp = async () => {
    setError(null);
    setSuccessNotice(null);
    setSubmitting(true);
    try {
      await submitBootstrapRequest();
      setSuccessNotice(
        lang === 'si'
          ? 'නව තහවුරු කිරීමේ කේතයක් ඔබගේ විද්‍යුත් තැපෑලට යවන ලදී.'
          : 'A new 6-digit verification code has been sent to your email.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code');
    } finally {
      setSubmitting(false);
    }
  };

  const openForgotPassword = () => {
    setError(null);
    setSuccessNotice(null);
    setForgotContactAdminMsg(null);
    setForgotEmailChallenge(null);
    setResetOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetUsername(username.trim());
    setAuthView('forgot_password');
  };

  const backToSignIn = () => {
    setError(null);
    setForgotContactAdminMsg(null);
    setForgotEmailChallenge(null);
    setResetOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setAuthView('signin');
  };

  const handleForgotPasswordRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    setForgotContactAdminMsg(null);

    const targetUsername = resetUsername.trim();
    if (!targetUsername) {
      setError(
        lang === 'si'
          ? 'කරුණාකර ඔබගේ පරිශීලක නාමය ඇතුළත් කරන්න.'
          : 'Please enter your username.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.requestForgotPassword(targetUsername);
      if (res.flow === 'contact_admin') {
        setForgotContactAdminMsg(res.message);
        setForgotEmailChallenge(null);
      } else {
        setForgotEmailChallenge({
          challengeId: res.challengeId,
          maskedEmail: res.maskedEmail,
        });
        setResetOtpCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process password reset request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPasswordVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmailChallenge) return;
    setError(null);

    const cleanedCode = resetOtpCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanedCode)) {
      setError(
        lang === 'si'
          ? 'කරුණාකර ඉලක්කම් 6 තහවුරු කිරීමේ කේතය ඇතුළත් කරන්න.'
          : 'Please enter the 6-digit verification code sent to your email.'
      );
      return;
    }
    if (newPassword.length < 8) {
      setError(
        lang === 'si'
          ? 'නව මුරපදය අවම වශයෙන් අක්ෂර 8ක් විය යුතුය.'
          : 'New password must be at least 8 characters long.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(
        lang === 'si'
          ? 'මුරපද දෙක නොගැලපේ. කරුණාකර නැවත පරීක්ෂා කරන්න.'
          : 'Passwords do not match.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.verifyForgotPasswordReset({
        challengeId: forgotEmailChallenge.challengeId,
        code: cleanedCode,
        newPassword,
      });
      setUsername(resetUsername.trim());
      setPassword('');
      setForgotEmailChallenge(null);
      setForgotContactAdminMsg(null);
      setResetOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setAuthView('signin');
      setSuccessNotice(
        lang === 'si'
          ? 'මුරපදය සාර්ථකව යාවත්කාලීන කරන ලදී. නව මුරපදය සමඟ පිවිසෙන්න.'
          : 'Password updated successfully. You can now sign in with your new password.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfflineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!username.trim() || !password) {
      setError(
        lang === 'si'
          ? 'කරුණාකර පරිශීලක නාමය සහ මුරපදය ඇතුළත් කරන්න.'
          : 'Please enter your username and password.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const verified = await verifyOfflineCredential(username, password);
      if (!verified) {
        setError(
          hasOfflineAccount
            ? lang === 'si'
              ? 'වැරදි පරිශීලක නාමයක් හෝ මුරපදයකි. (නොබැඳි පිවිසුම සඳහා පෙර සුරකින ලද ගිණුම භාවිතා කරන්න.)'
              : 'Invalid username or password for offline device login.'
            : lang === 'si'
              ? 'මෙම උපාංගයේ තවම නොබැඳි පිවිසුම් ගිණුමක් සුරැකී නොමැත. පළමුව පහතින් නොබැඳි උපාංග ගිණුමක් සකසන්න හෝ Supabase සම්බන්ධ කරන්න.'
              : 'No cached officer login exists on this device yet. Set up an offline device login below or connect Supabase.'
        );
        return;
      }
      await setLocalOfflineOfficer(verified);
      onAuthenticated(verified);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfflineDeviceSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    if (!username.trim() || !fullName.trim()) {
      setError(
        lang === 'si'
          ? 'නිලධාරී නාමය සහ පරිශීලක නාමය ඇතුළත් කරන්න.'
          : 'Please enter your officer username and full name.'
      );
      return;
    }
    if (offlinePassword.length < 6) {
      setError(
        lang === 'si'
          ? 'උපාංග මුරපදය අවම වශයෙන් අකුරු 6ක් විය යුතුය.'
          : 'Device login password must be at least 6 characters.'
      );
      return;
    }
    if (offlinePassword !== offlineConfirmPassword) {
      setError(
        lang === 'si'
          ? 'මුරපද දෙක නොගැලපේ.'
          : 'Passwords do not match.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const offlineUser: AuthUser = {
        id: crypto.randomUUID(),
        username: username.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: localRole,
        designation: designation.trim() || `Field Officer (${deviceId})`,
        auth_mode: 'offline_local',
      };
      await saveOfflineCredential(offlineUser, offlinePassword);
      await setLocalOfflineOfficer(offlineUser);
      setHasOfflineAccount(true);
      onAuthenticated(offlineUser);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F294A] text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900">
              {lang === 'si' ? 'ආපදා කළමනාකරණ පද්ධතිය (DMIS)' : 'Disaster Management Information System'}
            </p>
            <p className="text-xs text-slate-500">
              {lang === 'si'
                ? 'දිස්ත්‍රික් හා ප්‍රාදේශීය ලේකම් කාර්යාල මෙහෙයුම් පද්ධතිය'
                : 'Government District & Divisional Relief Operations Portal'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton lang={lang} />
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'si' : 'en')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Globe className="h-4 w-4 text-[#0F294A]" />
            <span>{lang === 'en' ? 'සිංහල' : 'English'}</span>
          </button>
        </div>
      </div>

      <main className="mx-auto my-8 grid w-full max-w-5xl gap-8 lg:grid-cols-12 items-start">
        <section className="lg:col-span-5 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F294A]">
            <Lock className="h-3.5 w-3.5" />
            <span>
              {isServerReady
                ? lang === 'si'
                  ? 'DMIS ආරක්ෂිත පිවිසුම'
                  : 'DMIS Secure Portal Login'
                : lang === 'si'
                  ? 'නොබැඳි / දේශීය පිවිසුම'
                  : 'Offline / Device Login'}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            {needsServerBootstrap
              ? lang === 'si'
                ? 'ප්‍රධාන පරිපාලක ගිණුම සකසන්න'
                : 'Initialize System Administrator'
              : isServerReady && authView === 'forgot_password'
                ? lang === 'si'
                  ? 'මුරපදය නැවත සැකසීම'
                  : 'Password Recovery'
                : lang === 'si'
                  ? 'නිලධාරී පිවිසුම (Login)'
                  : 'Authorized Officer Login'}
          </h1>

          <p className="text-sm leading-relaxed text-slate-600">
            {isServerReady
              ? lang === 'si'
                ? 'Supabase PostgreSQL දත්ත ගබඩාව සම්බන්ධිතයි. ඔබගේ පරිශීලක නාමය සහ මුරපදය ඇතුළත් කර පිවිසෙන්න. නව ගිණුම් නිර්මාණය Admin සහ Super Admin ලාට පමණක් සීමා කර ඇත.'
                : 'Supabase PostgreSQL is connected and verified. Sign in with your officer username and password. Creating new accounts is restricted exclusively to Administrators and Super Administrators.'
              : lang === 'si'
                ? 'Supabase සේවාදායකය සම්බන්ධ කර නොමැති විට හෝ අන්තර්ජාලය නොමැති විට ඔබේ දේශීය ගිණුමෙන් පිවිස ක්ෂේත්‍ර දත්ත ඇතුළත් කළ හැක.'
                : 'Sign in with your officer credentials. If Supabase is not yet connected or this device is offline, you can unlock your cached field account or set up a password-protected local device login.'}
          </p>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start gap-3">
              {isServerReady ? (
                <Database className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" />
              ) : (
                <WifiOff className="mt-0.5 h-5 w-5 text-amber-700 shrink-0" />
              )}
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-900">
                  {isServerReady
                    ? 'Supabase PostgreSQL Active'
                    : health?.supabaseConfigured && !health?.schemaReady
                      ? 'Supabase Connected — Migrations Required'
                      : 'Offline-Capable Device Authentication'}
                </p>
                <p>
                  {isServerReady
                    ? 'All reads/writes authenticate over Bearer tokens and enforce role-based access control on the server.'
                    : health?.supabaseConfigured && !health?.schemaReady
                      ? 'Run supabase/migrations/0001 through 0006 in Supabase SQL Editor, then refresh.'
                      : 'Local logins use salted PBKDF2 verification in IndexedDB and sync safely once Supabase is configured.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            {error && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {successNotice && (
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successNotice}</span>
              </div>
            )}

            {isServerReady ? (
              needsServerBootstrap && bootstrapChallenge ? (
                <form onSubmit={handleBootstrapOtpSubmit} className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[#0F294A]" />
                      <h2 className="text-base font-semibold text-slate-900">
                        {lang === 'si' ? 'විද්‍යුත් තැපැල් කේතය තහවුරු කරන්න' : 'Verify Super Admin Email'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBootstrapChallenge(null);
                        setBootstrapOtpCode('');
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {lang === 'si' ? 'ආපසු' : 'Edit Details'}
                    </button>
                  </div>

                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
                    {lang === 'si'
                      ? `${bootstrapChallenge.email} වෙත ඉලක්කම් 6 තහවුරු කිරීමේ කේතයක් යවා ඇත.`
                      : `A 6-digit verification code has been sent to ${bootstrapChallenge.email}. Enter it below to activate the Super Admin account.`}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'ඉලක්කම් 6 තහවුරු කිරීමේ කේතය' : '6-Digit Verification Code'} *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={bootstrapOtpCode}
                      onChange={(e) => setBootstrapOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-center text-lg font-mono tracking-[0.35em] focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleBootstrapResendOtp}
                      className="text-xs font-semibold text-[#0F294A] hover:underline disabled:opacity-60"
                    >
                      {lang === 'si' ? 'කේතය නැවත යවන්න' : 'Resend verification code'}
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="min-h-[44px] rounded-lg bg-[#0F294A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                    >
                      {submitting
                        ? lang === 'si'
                          ? 'තහවුරු කරමින්...'
                          : 'Verifying...'
                        : lang === 'si'
                          ? 'තහවුරු කර පිවිසෙන්න'
                          : 'Verify & Create Super Admin'}
                    </button>
                  </div>
                </form>
              ) : !needsServerBootstrap && authView === 'forgot_password' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-[#0F294A]" />
                      <h2 className="text-base font-semibold text-slate-900">
                        {lang === 'si' ? 'මුරපදය අමතක වූවාද?' : 'Reset Password'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={backToSignIn}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {lang === 'si' ? 'පිවිසුමට ආපසු' : 'Back to Login'}
                    </button>
                  </div>

                  {forgotContactAdminMsg ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
                        <div className="flex items-center gap-2 font-semibold">
                          <Info className="h-4 w-4 shrink-0" />
                          <span>
                            {lang === 'si'
                              ? 'පරිපාලකවරයෙකු අමතන්න'
                              : 'Please Contact Your Administrator'}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-amber-800">{forgotContactAdminMsg}</p>
                        <p className="text-xs leading-relaxed text-amber-800">
                          {lang === 'si'
                            ? 'ක්ෂේත්‍ර නිලධාරීන්ගේ මුරපද නැවත සැකසීම Admin හෝ Super Admin මගින් පමණක් සිදු කළ හැක.'
                            : 'Self-service email password recovery is enabled exclusively for Admin and Super Admin accounts. All other officers must contact an Admin or Super Admin to reset their password.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={backToSignIn}
                        className="w-full min-h-[42px] rounded-lg bg-[#0F294A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1A3B66]"
                      >
                        {lang === 'si' ? 'පිවිසුම් තිරයට යන්න' : 'Return to Login'}
                      </button>
                    </div>
                  ) : forgotEmailChallenge ? (
                    <form onSubmit={handleForgotPasswordVerify} className="space-y-4">
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
                        {lang === 'si'
                          ? `${forgotEmailChallenge.maskedEmail} වෙත ඉලක්කම් 6 තහවුරු කිරීමේ කේතයක් යවා ඇත.`
                          : `A 6-digit verification code has been sent to ${forgotEmailChallenge.maskedEmail}. Enter the code and choose a new password.`}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {lang === 'si' ? 'ඉලක්කම් 6 කේතය' : '6-Digit Email Code'} *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          value={resetOtpCode}
                          onChange={(e) => setResetOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                          placeholder="123456"
                          className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-center text-lg font-mono tracking-[0.35em] focus:border-[#0F294A] focus:outline-none"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'නව මුරපදය' : 'New Password'} *
                          </label>
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Minimum 8 characters"
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'මුරපදය තහවුරු කරන්න' : 'Confirm Password'} *
                          </label>
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleForgotPasswordRequest()}
                          className="text-xs font-semibold text-[#0F294A] hover:underline disabled:opacity-60"
                        >
                          {lang === 'si' ? 'කේතය නැවත යවන්න' : 'Resend verification code'}
                        </button>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="min-h-[44px] rounded-lg bg-[#0F294A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                        >
                          {submitting
                            ? lang === 'si'
                              ? 'යාවත්කාලීන වෙමින්...'
                              : 'Updating...'
                            : lang === 'si'
                              ? 'මුරපදය යාවත්කාලීන කරන්න'
                              : 'Verify Code & Reset Password'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                      <p className="text-xs leading-relaxed text-slate-600">
                        {lang === 'si'
                          ? 'ඔබගේ පරිශීලක නාමය ඇතුළත් කරන්න. Admin සහ Super Admin ගිණුම් සඳහා විද්‍යුත් තැපෑලට තහවුරු කිරීමේ කේතයක් එවනු ලැබේ. අනෙකුත් නිලධාරීන් තම Admin හෝ Super Admin වෙත සම්බන්ධ විය යුතුය.'
                          : 'Enter your username. Admin and Super Admin accounts will receive a 6-digit verification code by email. Other officer accounts must contact an Admin or Super Admin for password resets.'}
                      </p>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {lang === 'si' ? 'පරිශීලක නාමය' : 'Username'} *
                        </label>
                        <input
                          type="text"
                          required
                          value={resetUsername}
                          onChange={(e) => setResetUsername(e.target.value)}
                          placeholder="officer.username"
                          className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full min-h-[44px] rounded-lg bg-[#0F294A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                      >
                        {submitting
                          ? lang === 'si'
                            ? 'පරීක්ෂා කරමින්...'
                            : 'Checking...'
                          : lang === 'si'
                            ? 'ඉදිරියට යන්න'
                            : 'Continue'}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleServerAuth} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Lock className="h-4 w-4 text-[#0F294A]" />
                    <h2 className="text-base font-semibold text-slate-900">
                      {needsServerBootstrap
                        ? lang === 'si'
                          ? 'පළමු පරිපාලක ගිණුම'
                          : 'First-Run Super Admin Registration'
                        : lang === 'si'
                          ? 'නිලධාරී පිවිසුම'
                          : 'Officer Login'}
                    </h2>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {lang === 'si' ? 'පරිශීලක නාමය' : 'Username'} *
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="officer.admin"
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {lang === 'si' ? 'මුරපදය' : 'Password'} *
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete={needsServerBootstrap ? 'new-password' : 'current-password'}
                          minLength={needsServerBootstrap ? 8 : 1}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={needsServerBootstrap ? 'Minimum 8 characters' : '••••••••'}
                          className="w-full min-h-[42px] rounded-lg border border-slate-300 pl-3 pr-10 text-sm focus:border-[#0F294A] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {needsServerBootstrap && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'සම්පූර්ණ නම' : 'Full Name'} *
                          </label>
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'තනතුර' : 'Designation'}
                          </label>
                          <input
                            type="text"
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            placeholder="District Disaster Management Coordinator"
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'විද්‍යුත් තැපෑල (අනිවාර්යයි)' : 'Official Email'} *
                          </label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="superadmin@dmis.gov.lk"
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'දුරකථන අංකය' : 'Phone'}
                          </label>
                          <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                      </div>

                      {health?.smtpConfigured && (
                        <p className="text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                          {lang === 'si'
                            ? 'ඉදිරියට යාමේදී ඉහත විද්‍යුත් තැපැල් ලිපිනයට ඉලක්කම් 6ක තහවුරු කිරීමේ කේතයක් යවනු ලැබේ.'
                            : 'A 6-digit verification code will be sent to this email address before activating the Super Admin account.'}
                        </p>
                      )}

                      {health?.bootstrapPasscodeRequired && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Admin Bootstrap Passcode *
                          </label>
                          <input
                            type="password"
                            required
                            value={bootstrapPasscode}
                            onChange={(e) => setBootstrapPasscode(e.target.value)}
                            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {!needsServerBootstrap && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">
                        {lang === 'si'
                          ? 'නව ගිණුම් Admin / Super Admin විසින් පමණක් සාදනු ලැබේ.'
                          : 'New accounts can only be created by an Admin or Super Admin.'}
                      </span>
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="font-semibold text-[#0F294A] hover:underline"
                      >
                        {lang === 'si' ? 'මුරපදය අමතකද?' : 'Forgot Password?'}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>
                      {submitting
                        ? lang === 'si'
                          ? 'සැකසෙමින් පවතී...'
                          : 'Signing In...'
                        : needsServerBootstrap
                          ? lang === 'si'
                            ? 'ප්‍රධාන පරිපාලක සාදන්න'
                            : 'Create Super Admin & Sign In'
                          : lang === 'si'
                            ? 'පිවිසෙන්න'
                            : 'Sign In to DMIS'}
                    </span>
                  </button>
                </form>
              )
            ) : offlineView === 'setup_device' ? (
              <form onSubmit={handleOfflineDeviceSetup} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-[#0F294A]" />
                    <h2 className="text-base font-semibold text-slate-900">
                      {lang === 'si'
                        ? 'නොබැඳි උපාංග පිවිසුම් ගිණුම සකසන්න'
                        : 'Set Up Offline Device Login'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setOfflineView('login');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {lang === 'si' ? 'පිවිසුමට ආපසු' : 'Back to Login'}
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                  {lang === 'si'
                    ? 'ස්ථිර පද්ධති ගිණුම් නිර්මාණය කළ හැක්කේ Supabase සමඟ සම්බන්ධ වී සිටින විට Admin හෝ Super Admin වරයෙකුට පමණි. මෙම උපාංගයේ නොබැඳි වැඩ සඳහා ආරක්ෂිත මුරපදයක් සකසන්න.'
                    : 'Permanent DMIS user accounts are created by an Admin / Super Admin in Supabase. Set up a password-protected local session below to use this device offline.'}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'පරිශීලක නාමය' : 'Officer Username'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="gn.colombo.01"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'සම්පූර්ණ නම' : 'Officer Full Name'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="K. Perera"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'භූමිකාව' : 'Operational Role'}
                    </label>
                    <select
                      value={localRole}
                      onChange={(e) => setLocalRole(e.target.value as UserRole)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    >
                      <option value="super_admin">Super Administrator</option>
                      <option value="admin">Administrator</option>
                      <option value="district_officer">District Officer</option>
                      <option value="ds_officer">Divisional Secretariat Officer</option>
                      <option value="gn_officer">Grama Niladhari Officer</option>
                      <option value="auditor_viewer">Auditor (Read-Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'තනතුර' : 'Designation'}
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="Grama Niladhari / Field Officer"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'උපාංග මුරපදය (අවම අකුරු 6)' : 'Device Password (min 6 chars)'} *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={offlinePassword}
                      onChange={(e) => setOfflinePassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'මුරපදය තහවුරු කරන්න' : 'Confirm Password'} *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={offlineConfirmPassword}
                      onChange={(e) => setOfflineConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] rounded-lg bg-[#0F294A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                >
                  {lang === 'si' ? 'සුරැක පිවිසෙන්න' : 'Save Offline Login & Enter'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOfflineLogin} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-[#0F294A]" />
                    <h2 className="text-base font-semibold text-slate-900">
                      {lang === 'si' ? 'නිලධාරී පිවිසුම (Officer Login)' : 'Officer Login'}
                    </h2>
                  </div>
                  <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {lang === 'si' ? 'නොබැඳි ප්‍රකාරය' : 'Offline Mode'}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'පරිශීලක නාමය' : 'Username'} *
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="officer.username"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'si' ? 'මුරපදය' : 'Password'} *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 pl-3 pr-10 text-sm focus:border-[#0F294A] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    {lang === 'si'
                      ? 'නව ගිණුම් Admin / Super Admin විසින් පමණක් සාදනු ලැබේ.'
                      : 'Permanent accounts are managed by Admin / Super Admin.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessNotice(
                        lang === 'si'
                          ? 'මුරපදය අමතක නම් කරුණාකර අන්තර්ජාලය හරහා Supabase වෙත සම්බන්ධ වන්න හෝ ඔබේ Admin / Super Admin අමතන්න.'
                          : 'To reset a forgotten password, connect to Supabase and contact your Administrator or Super Administrator.'
                      );
                    }}
                    className="font-semibold text-[#0F294A] hover:underline"
                  >
                    {lang === 'si' ? 'මුරපදය අමතකද?' : 'Forgot Password?'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1A3B66] disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  <span>
                    {submitting
                      ? lang === 'si'
                        ? 'පරීක්ෂා කරමින්...'
                        : 'Verifying...'
                      : lang === 'si'
                        ? 'පිවිසෙන්න'
                        : 'Sign In to DMIS'}
                  </span>
                </button>

                <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    {hasOfflineAccount
                      ? lang === 'si'
                        ? 'වෙනත් නොබැඳි උපාංග පැතිකඩක් එක් කිරීමටද?'
                        : 'Need to configure a local offline session on this device?'
                      : lang === 'si'
                        ? 'Supabase සම්බන්ධ කර නැතිද? පළමු නොබැඳි උපාංග පිවිසුම සකසන්න:'
                        : 'First time launching offline before Supabase is connected?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessNotice(null);
                      setOfflineView('setup_device');
                    }}
                    className="font-semibold text-[#0F294A] hover:underline"
                  >
                    {lang === 'si' ? 'නොබැඳි උපාංග පිවිසුම සකසන්න' : 'Set up offline device login'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl border-t border-slate-200 pt-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>Disaster Management Information System (DMIS)</span>
        <span>Offline-capable PWA · Supabase PostgreSQL Ready</span>
      </footer>
    </div>
  );
};

