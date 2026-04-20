# tally2

## Development

Start a local dev server:

```bash
make run
```

This serves the project on [http://localhost:3000](http://localhost:3000) using `npx serve`.

## Validation

Check JS syntax and lint HTML:

```bash
make validate
```

This replicates the CI checks run on pull requests:

- **JS syntax** — all `.js` files outside `node_modules` are checked with `node --check`, falling back to a Babel parser for JSX files
- **HTML linting** — all `.html` files are linted with `htmlhint`

Both `@babel/parser` and `htmlhint` are installed automatically as temporary dev dependencies when the command runs.