# Contributing

Thanks for looking. Bug reports, fixes and translations are all welcome. For anything bigger, open an issue first so we can talk it through before you spend time on it.

## Getting it running

```bash
cp backend/.env.example backend/.env
./dev.sh --init
```

The web app is at <http://localhost:4200>, and the emails it sends show up in Mailpit at <http://localhost:8025>. After the first time, `./dev.sh` is enough.

## Checks

Run these before opening a pull request. CI runs them too.

```bash
cd backend && npm run lint && npm test && npm run test:e2e
cd frontend && npm run lint && npm test && npm run build
```

Browser tests: `cd frontend && npm run e2e`.

## How the code is laid out

- `backend/` is the NestJS API and the video worker: one package, two entry points.
- `frontend/` is the Angular app. Its API client is generated from `backend/openapi.json`, so after changing an endpoint run `npm run openapi:export` in `backend` and `npm run api:gen` in `frontend`.
- `infra/` holds the Docker Compose files and the Caddy config.

A few rules that keep things tidy:

- Every text a person reads goes through the dictionaries, in `frontend/public/i18n` and `backend/src/i18n`. Don't hard-code it.
- API errors have one shape. Throw `AppException` rather than Nest's own exceptions.
- Use the design tokens for colours and spacing. Things that look the same should be built the same.

## How your change gets in

This repository is synced automatically from the maintainers' working copy, so its history is a series of snapshots. When your pull request is accepted, it's applied there with your name on it and appears here with the next sync, and the pull request gets closed with a link to the commit.

## Sign your commits

Add a `Signed-off-by` line with `git commit -s`. It says you wrote the change, or have the right to submit it, under the project's license ([Developer Certificate of Origin](https://developercertificate.org/)).
