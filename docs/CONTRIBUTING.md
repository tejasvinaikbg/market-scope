# Contributing

The conventions the code follows. They are short because the code is meant to explain itself.

## Shape

- **Layers.** In the API: routes validate shape and hand off; services hold the rules, and exist only where there is a
  rule; queries hold the SQL and take the connection as their last argument, so a transaction can be passed in.
- **Providers behind interfaces.** Anything external is a factory function behind an interface, with a fixture twin
  that answers from a file. Tests and offline use run on the twins.
- **Functions and plain objects.** No classes anywhere.
- **Shared maths in `packages/shared`.** Anything the screen and the server must agree on lives there once.
- **Packages over hand-rolled code.** Throttling, retries, parsing, debouncing: a well-known package each.

## Files

- A header comment on every file: what it is for, and the one non-obvious decision in it.
- Every file with logic has a test. API tests use `node:test`; screens use Jest with React Testing Library; route tests
  hit a real database.
- Comments say why, not what. No task or phase numbers in code or in strings the user sees.

## Words

- Screens speak the user's words: "areas searched", "located from their address", never the system's.
- A control appears when its action is possible; the reason it is missing is said in plain words nearby.
- Errors carry a stable `code` for the client and a `message` for people.

## Working

- Write a migration, then run it. Ports other than the defaults go in the ignored `.env` only.
- Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:integration` before a commit; `npm run lint:fix`
  applies ESLint's fixes and Prettier's formatting (160 columns, single quotes, trailing commas). Commit messages are one
  plain line.
- Add every "for now" decision to the [register](production/upgrade-register.md) with the trigger that would revisit it.
