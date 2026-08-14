# Build-Time Generation Guardrails

These rules apply to every script that generates committed HTML, PDFs, images,
feeds, manifests, reports, or other deployable files from database or external
service data.

## Core invariant

A generator must never replace valid generated output with incomplete,
unbranded, empty, or fallback content merely because its build-time credentials
or source data are unavailable.

## Environment and credential handling

1. Identify every required environment variable before starting database or
   network work.
2. Separate public/runtime credentials from privileged build-only credentials.
   Never serialize a privileged credential into generated output, client-side
   JavaScript, logs, or error messages.
3. Production and CI builds must fail closed when a credential required for
   accurate or tenant-scoped output is missing.
4. A local build without the required privileged credential must exit
   successfully **without rewriting generated files**. It must print an
   actionable message explaining which configuration is missing and how to load
   the approved local environment.
   Build scripts must load the repository's ignored local environment file
   (normally `.env.local`) before the shared `.env` file so pulled development
   variables are actually available to the generator.
5. Never silently fall back from a privileged tenant-scoped query to an
   anonymous query when that fallback can return an empty or incomplete result.
   An empty result caused by RLS is not valid source data.

## Preserve output until source data is verified

Use a two-phase generation process:

1. Fetch and validate all required source records.
2. Render into memory or a temporary directory.
3. Validate the rendered artifact.
4. Replace the existing output only after every required step succeeds.

Do not truncate, overwrite, or bulk-regenerate committed output before source
queries and validation have completed. On any failure, leave existing files
untouched.

## Duplicate and partial database rows

Generators must not assume a related table contains exactly one row unless the
live schema enforces that invariant with a unique constraint.

- Inspect the live schema before relying on uniqueness.
- When duplicate rows are possible, merge only populated values or choose the
  authoritative row using an explicit, deterministic rule.
- A blank duplicate must never erase populated data.
- Log a safe warning containing record identifiers, not secrets or private
  values.
- Add or repair a database uniqueness constraint separately when approved; do
  not delete duplicate production data as an incidental build step.

## Generated branding and tenant data

Tenant logo, company name, colors, feature labels, and other tenant-specific
content are required output—not optional decoration.

- Fetch them with an authenticated build-only client.
- Treat missing tenant branding as a generation failure in production.
- Do not replace tenant branding with global/default branding because RLS hid
  the tenant record.
- Local builds without sufficient access must preserve the last valid generated
  pages rather than writing defaults.

## Required implementation pattern

```javascript
const isDeploymentBuild =
  ['production', 'preview'].includes(
    String(process.env.VERCEL_ENV || '').toLowerCase()
  ) || Boolean(process.env.CI);

if (!requiredPublicConfig) {
  throw new Error('Required public build configuration is missing.');
}

if (!requiredPrivilegedCredential) {
  if (isDeploymentBuild) {
    throw new Error('Required production build credential is missing.');
  }

  console.warn(
    'Skipping local regeneration because the build credential is not configured. ' +
    'Existing generated files were preserved.'
  );
  process.exit(0);
}

// Fetch and validate first. Write output only after all required data succeeds.
```

Do not use the generic `VERCEL` flag to distinguish deployment from local
development. `vercel dev` also sets that flag. Use `VERCEL_ENV` and treat only
`production` and `preview` as Vercel deployment builds; local development must
remain on the safe preservation path.

## Tests required for every generator

Add regression coverage proving that:

1. Production/CI fails when a required privileged credential is missing.
2. Local execution without that credential succeeds without modifying output.
3. The privileged credential is never embedded in generated files.
4. Anonymous fallback is not used for protected tenant data.
5. Blank duplicate rows cannot overwrite populated records.
6. A source-query failure leaves existing output unchanged.
7. Generated output contains the expected tenant branding and substantive data.
8. The deployed build environment contains the required variables.

After changing a generator, run its build command, targeted tests, linting, and
an artifact-level or browser verification. Confirm both the local missing-secret
path and the production credentialed path before deployment.

## Prohibited approaches

- Making a new privileged key mandatory locally without a safe preservation
  path.
- Catching source errors and continuing with empty arrays or default branding.
- Writing output incrementally while remote queries are still running.
- Treating an RLS-filtered empty response as proof that tenant data does not
  exist.
- Rebuilding every generated file to repair one artifact before the source
  loader is known to be complete.
- Printing secrets, complete environment objects, tokens, or credential values
  during debugging.
