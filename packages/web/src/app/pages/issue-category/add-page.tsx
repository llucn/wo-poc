import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, useApiFetch } from '../../auth/use-api-fetch';
import type { ConflictResponse, IssueCategoryDto } from './types';
import { useExistsCheck } from './use-exists-check';

export function IssueCategoryAddPage() {
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverDup, setServerDup] = useState<
    { field: 'name' | 'displayName'; value: string } | null
  >(null);

  const nameCheck = useExistsCheck('name', name);
  const displayNameCheck = useExistsCheck('displayName', displayName);

  const nameTrimmed = name.trim();
  const displayNameTrimmed = displayName.trim();
  const nameDup =
    nameCheck.exists === true ||
    (serverDup?.field === 'name' && serverDup.value === nameTrimmed);
  const displayNameDup =
    displayNameCheck.exists === true ||
    (serverDup?.field === 'displayName' && serverDup.value === displayNameTrimmed);

  const saveDisabled =
    submitting ||
    nameTrimmed === '' ||
    displayNameTrimmed === '' ||
    nameDup ||
    displayNameDup ||
    nameCheck.checking ||
    displayNameCheck.checking;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saveDisabled) return;
    setSubmitting(true);
    setSubmitError(null);
    setServerDup(null);
    try {
      const res = await apiFetch('/issue-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrimmed,
          displayName: displayNameTrimmed,
        }),
      });
      (await res.json()) as IssueCategoryDto;
      navigate('/settings/issue-category');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as Partial<ConflictResponse> | undefined;
        if (body?.field === 'name' || body?.field === 'displayName') {
          setServerDup({ field: body.field, value: body.value ?? '' });
        } else {
          setSubmitError('A category with that name or display name already exists.');
        }
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = () => navigate('/settings/issue-category');

  return (
    <section className="ic-page">
      <header className="ic-page-header">
        <h1 className="ic-page-title">Add Category</h1>
      </header>
      <form className="ic-form" onSubmit={onSubmit} noValidate>
        <div className="ic-field">
          <label className="ic-field-label" htmlFor="ic-name">
            Name
          </label>
          <input
            id="ic-name"
            type="text"
            className={`ic-input${nameDup ? ' has-error' : ''}`}
            value={name}
            maxLength={255}
            onChange={(e) => {
              setName(e.target.value);
              if (serverDup?.field === 'name') setServerDup(null);
            }}
            disabled={submitting}
            autoComplete="off"
          />
          {nameDup && (
            <p className="ic-field-error" role="alert">
              Already exists
            </p>
          )}
        </div>
        <div className="ic-field">
          <label className="ic-field-label" htmlFor="ic-display-name">
            Display Name
          </label>
          <input
            id="ic-display-name"
            type="text"
            className={`ic-input${displayNameDup ? ' has-error' : ''}`}
            value={displayName}
            maxLength={255}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (serverDup?.field === 'displayName') setServerDup(null);
            }}
            disabled={submitting}
            autoComplete="off"
          />
          {displayNameDup && (
            <p className="ic-field-error" role="alert">
              Already exists
            </p>
          )}
        </div>
        {submitError && (
          <p className="ic-error-block" role="alert">
            {submitError}
          </p>
        )}
        <div className="ic-form-actions">
          <button
            type="submit"
            className="ic-btn ic-btn-primary"
            disabled={saveDisabled}
          >
            Save
          </button>
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
