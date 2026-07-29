const HIRING_PLACEHOLDER_PATTERN = /\{\{(first_name|last_name|email|contact_number|job_title)\}\}/g;

export function replaceHiringEmailPlaceholders(value, source = {}) {
  const replacements = {
    first_name: source.first_name ?? source.firstName,
    last_name: source.last_name ?? source.lastName,
    email: source.email,
    contact_number: source.contact_number ?? source.contactNumber,
    job_title: source.job_title ?? source.jobTitle ?? source.title
  };

  return String(value ?? '').replace(
    HIRING_PLACEHOLDER_PATTERN,
    (_, key) => String(replacements[key] ?? '')
  );
}
