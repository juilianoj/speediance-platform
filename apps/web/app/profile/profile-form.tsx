'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { saveProfile } from '@/lib/profile/actions';
import type { PrimaryGoal, ProfileSaveResult } from '@/lib/profile/schemas';

interface InitialValues {
  speedianceEmail: string;
  region: 'Global' | 'EU';
  deviceType: number;
  allowMonsterMoves: boolean;
  bodyweight?: number;
  gender?: 'male' | 'female';
  hideCardio?: boolean;
  unit: number;
  syncStartDate?: string;
  primaryGoal?: PrimaryGoal;
  sessionsPerWeek?: number;
  sessionMinutes?: number;
  equipmentConstraints?: string;
}

export function ProfileForm({
  initial,
  hasSpeedianceCreds,
}: {
  initial: InitialValues;
  hasSpeedianceCreds: boolean;
}) {
  const [result, action] = useFormState<ProfileSaveResult | null, FormData>(saveProfile, null);

  return (
    <form action={action} style={formStyle}>
      <section style={sectionStyle}>
        <h2 style={h2Style}>Speediance credentials</h2>
        <label style={labelStyle}>
          Speediance email
          <input
            name="speedianceEmail"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            defaultValue={initial.speedianceEmail}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Speediance password
          {hasSpeedianceCreds && (
            <span style={hintStyle}>Saved — leave blank to keep the current one</span>
          )}
          <input
            name="speediancePassword"
            type="password"
            autoComplete="new-password"
            placeholder={hasSpeedianceCreds ? '••••••••' : 'Enter your Speediance password'}
            maxLength={256}
            required={!hasSpeedianceCreds}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Region
          <select name="region" defaultValue={initial.region} style={inputStyle}>
            <option value="Global">Global (api2.speediance.com)</option>
            <option value="EU">EU (euapi.speediance.com)</option>
          </select>
        </label>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Device</h2>
        <label style={labelStyle}>
          Device type
          <select name="deviceType" defaultValue={initial.deviceType} style={inputStyle}>
            <option value="1">Pal / Gym Monster (deviceType 1)</option>
            <option value="2">Monster 2 (deviceType 2)</option>
          </select>
        </label>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            name="allowMonsterMoves"
            defaultChecked={initial.allowMonsterMoves}
          />
          Include Monster moves in my library
        </label>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>You</h2>
        <label style={labelStyle}>
          Bodyweight ({initial.unit === 1 ? 'lb' : 'kg'})
          <input
            name="bodyweight"
            type="number"
            step="0.1"
            min="0"
            max="2000"
            defaultValue={initial.bodyweight ?? ''}
            placeholder="optional"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Units
          <select name="unit" defaultValue={initial.unit} style={inputStyle}>
            <option value="1">Imperial (lb)</option>
            <option value="0">Metric (kg)</option>
          </select>
        </label>
        <label style={labelStyle}>
          Gender
          <select name="gender" defaultValue={initial.gender ?? ''} style={inputStyle}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <span style={hintStyle}>
            Used to render the silhouette on the Balance page. Traditional norms.
          </span>
        </label>
        <label style={labelStyle}>
          Sync history from
          <input
            name="syncStartDate"
            type="date"
            defaultValue={initial.syncStartDate}
            style={inputStyle}
          />
          <span style={hintStyle}>
            The sync worker pulls Speediance records from this date forward. Default is 30 days ago.
          </span>
        </label>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" name="hideCardio" defaultChecked={initial.hideCardio ?? false} />
          Hide the Cardio section
          <span style={{ ...hintStyle, marginLeft: '0.4rem' }}>
            (uncheck to re-enable once you&apos;ve connected Apple Health / Google Fit)
          </span>
        </label>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Coaching preferences</h2>
        <p style={hintStyle}>
          The AI Coach sees these on every chat. Leave blank to let the coach ask each time.
        </p>
        <label style={labelStyle}>
          Primary goal
          <select name="primaryGoal" defaultValue={initial.primaryGoal ?? ''} style={inputStyle}>
            <option value="">No preference</option>
            <option value="strength">Strength</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="general-fitness">General fitness</option>
            <option value="fat-loss">Fat loss</option>
            <option value="endurance">Endurance</option>
          </select>
        </label>
        <label style={labelStyle}>
          Sessions per week
          <input
            name="sessionsPerWeek"
            type="number"
            min="1"
            max="7"
            step="1"
            defaultValue={initial.sessionsPerWeek ?? ''}
            placeholder="e.g. 4"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Typical session length (minutes)
          <input
            name="sessionMinutes"
            type="number"
            min="15"
            max="120"
            step="5"
            defaultValue={initial.sessionMinutes ?? ''}
            placeholder="e.g. 45"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Equipment / movement constraints
          <input
            name="equipmentConstraints"
            type="text"
            maxLength={200}
            defaultValue={initial.equipmentConstraints ?? ''}
            placeholder="e.g. no overhead pressing — left shoulder"
            style={inputStyle}
          />
          <span style={hintStyle}>
            Free text. For longer-running context (recurring injuries, scheduling notes), tell the
            Coach directly — it&apos;ll save those as memories.
          </span>
        </label>
      </section>

      {result?.state === 'ok' && <p style={successStyle}>{result.message}</p>}
      {result?.state === 'invalidCreds' && <p style={errorStyle}>{result.message}</p>}
      {result?.state === 'error' && <p style={errorStyle}>{result.message}</p>}

      <SaveButton hasCreds={hasSpeedianceCreds} />
    </form>
  );
}

function SaveButton({ hasCreds }: { hasCreds: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={buttonStyle}>
      {pending
        ? hasCreds
          ? 'Saving…'
          : 'Verifying with Speediance…'
        : hasCreds
          ? 'Save changes'
          : 'Save and verify with Speediance'}
    </button>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  marginTop: '2rem',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1.25rem',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--bg-card)',
};

const h2Style: React.CSSProperties = {
  margin: '0 0 0.25rem 0',
  fontSize: '1.05rem',
  color: 'var(--text)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  fontSize: '0.95rem',
  color: 'var(--text)',
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  fontSize: '0.95rem',
  color: 'var(--text)',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
  fontWeight: 'normal',
};

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  fontSize: '1rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '6px',
  background: 'var(--bg-input)',
  color: 'var(--text)',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  fontSize: '1rem',
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const successStyle: React.CSSProperties = {
  color: 'var(--success)',
  fontSize: '0.95rem',
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  color: 'var(--danger)',
  fontSize: '0.9rem',
  margin: 0,
};
