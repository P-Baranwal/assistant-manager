// Local-only is the default for a checkout or development server. Cloud mode
// must be opted into explicitly so a local/offline build cannot accidentally
// initialize authentication, billing, or remote storage.
const localOnlyValue = import.meta.env.VITE_LOCAL_ONLY;

export const LOCAL_ONLY = localOnlyValue === undefined
    || localOnlyValue === ''
    || ['true', '1', 'yes'].includes(String(localOnlyValue).toLowerCase());

export const CLOUD_ENABLED = !LOCAL_ONLY;
